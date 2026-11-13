import { HbError } from '../../core/util.ts';
import {
  LOT,
  applyJob,
  blockById,
  cellIndex,
  jobCells,
  jobProblem,
  jobTier,
  propAt,
  propById,
  type LotGrid,
  type LotInfo,
  type LotJob,
  type LotMine,
  type LotPending,
  type LotSettings,
  type LotTier,
} from '../../../shared/worldBuild.ts';

export const LOT_DEFAULTS: LotSettings = {
  lot: true,
  lotFreePerDay: 30,
  lotBlock: 1,
  lotFancy: 4,
  lotSmall: 5,
  lotBig: 15,
  lotGrand: 40,
  lotQueueMax: 30,
  lotBuildSec: 1.5,
  lotAdmirePct: 5,
  lotClearOnNew: true,
};

const TIER_KEY: Record<LotTier, 'lotBlock' | 'lotFancy' | 'lotSmall' | 'lotBig' | 'lotGrand'> = {
  block: 'lotBlock',
  fancy: 'lotFancy',
  small: 'lotSmall',
  big: 'lotBig',
  grand: 'lotGrand',
};

/** A piece on its way, kept with whose it is and the town day its free share came from */
interface StoredJob extends LotPending {
  guest: string;
  day: number;
}

/** What the lot keeps in world.json */
export interface LotData {
  grid: LotGrid;
  nextId: number;
  jobs: StoredJob[];
  /** What each guest built for free, and on which town day */
  free: Record<string, { day: number; used: number }>;
}

export const emptyLot = (): LotData => ({ grid: { blocks: {}, props: [] }, nextId: 1, jobs: [], free: {} });

/** How long the feed waits before telling of the same guest building again (ms) */
const FEED_AGAIN_MS = 10 * 60_000;

/**
 * The build lot's keeper: the pieces on the lot and the ones on their way. A guest asks for a piece
 * on the phone and pays at once (the day's free share first); the character walks to the lot and
 * puts it up (see TownSim's build), or it goes up at once when the character is not in the town. A
 * piece that no longer fits when its turn comes (someone built there first) is paid back.
 */
export function lotKeeper(deps: {
  data: LotData;
  settings(): LotSettings;
  /** The town's day now (days counted on its own clock) */
  townDay(): number;
  wallets: Record<string, number>;
  /** A guest's balance changed */
  sendWallet(guestId: string): void;
  /** A guest's own side of the lot changed */
  sendMine(guestId: string, mine: LotMine): void;
  save(): void;
  publish(): void;
  /** The feed hears of someone building */
  feed(guestId: string): void;
  /** A guest's piece could not be put up (and was paid back) */
  failed(guestId: string, why: string): void;
}) {
  const { data, wallets } = deps;
  const lastFeed = new Map<string, number>();

  const priceOf = (tier: LotTier | null) => (tier ? Math.max(0, Math.round(deps.settings()[TIER_KEY[tier]])) : 0);

  const freeLeft = (guestId: string): number => {
    const per = Math.max(0, Math.round(deps.settings().lotFreePerDay));
    const f = data.free[guestId];
    return f && f.day === deps.townDay() ? Math.max(0, per - f.used) : per;
  };

  const mine = (guestId: string): LotMine => ({
    pending: data.jobs.filter((j) => j.guest === guestId).map(({ id, job, free, paid }) => ({ id, job, free, paid })),
    freeLeft: freeLeft(guestId),
    balance: wallets[guestId] ?? 0,
  });

  const changed = (guestId: string) => {
    deps.sendMine(guestId, mine(guestId));
    deps.save();
  };

  /** Give back what a piece cost (the free share only on the day it came from) */
  const refund = (j: StoredJob) => {
    if (j.paid) {
      wallets[j.guest] = (wallets[j.guest] ?? 0) + j.paid;
      deps.sendWallet(j.guest);
    }
    const f = data.free[j.guest];
    if (j.free && f && f.day === j.day) f.used = Math.max(0, f.used - j.free);
  };

  /** The lot as it will stand once everything on its way is up (what a new piece is checked against) */
  const planned = (): LotGrid => {
    const grid: LotGrid = { blocks: Object.fromEntries(Object.entries(data.grid.blocks).map(([k, v]) => [k, [...v]])), props: [...data.grid.props] };
    let id = -1;
    for (const j of data.jobs) if (!jobProblem(grid, j.job)) applyJob(grid, j.job, () => id--);
    return grid;
  };

  /** Put a piece up now, or pay it back when it no longer fits; true when it went up */
  const build = (j: StoredJob): boolean => {
    data.jobs = data.jobs.filter((x) => x !== j);
    const why = jobProblem(data.grid, j.job);
    if (why) {
      refund(j);
      if (j.free || j.paid) deps.failed(j.guest, why);
      return false;
    }
    applyJob(data.grid, j.job, () => data.nextId++);
    const now = Date.now();
    if (now - (lastFeed.get(j.guest) ?? 0) > FEED_AGAIN_MS) {
      lastFeed.set(j.guest, now);
      deps.feed(j.guest);
    }
    return true;
  };

  /** Check what a phone sent: a job of a known kind on the lot's grid */
  const validJob = (v: unknown): LotJob => {
    const o = (v ?? {}) as Record<string, unknown>;
    const c = Number(o.c);
    const r = Number(o.r);
    if (!Number.isInteger(c) || !Number.isInteger(r) || c < 0 || r < 0 || c >= LOT.cols || r >= LOT.rows) throw new HbError('That is outside the lot');
    if (o.kind === 'remove') return { kind: 'remove', c, r };
    if (o.kind === 'block' && typeof o.what === 'string' && blockById(o.what)) return { kind: 'block', c, r, what: o.what };
    if (o.kind === 'prop' && typeof o.what === 'string' && propById(o.what)) return { kind: 'prop', c, r, what: o.what, v: Math.round(Number(o.v) || 0) };
    throw new HbError('Unknown piece');
  };

  return {
    info(): LotInfo {
      const s = deps.settings();
      return {
        on: s.lot,
        grid: data.grid,
        prices: { block: priceOf('block'), fancy: priceOf('fancy'), small: priceOf('small'), big: priceOf('big'), grand: priceOf('grand') },
        freePerDay: Math.max(0, Math.round(s.lotFreePerDay)),
        queueMax: Math.max(1, Math.round(s.lotQueueMax)),
      };
    },

    mine,

    /** A guest asks for a piece: checked against the lot as it will stand, paid, and on its way */
    place(guestId: string, raw: unknown): LotMine {
      const s = deps.settings();
      if (!s.lot) throw new HbError('The build lot is closed');
      const job = validJob(raw);
      if (data.jobs.filter((j) => j.guest === guestId).length >= Math.max(1, Math.round(s.lotQueueMax))) {
        throw new HbError('Your character has enough to build for now: wait until a few pieces are up');
      }
      const why = jobProblem(planned(), job);
      if (why) throw new HbError(why);
      const cost = priceOf(jobTier(job));
      const free = Math.min(cost, freeLeft(guestId));
      const paid = cost - free;
      if ((wallets[guestId] ?? 0) < paid) throw new HbError('Not enough money for that piece');
      if (paid) {
        wallets[guestId] = (wallets[guestId] ?? 0) - paid;
        deps.sendWallet(guestId);
      }
      const day = deps.townDay();
      if (free) {
        const f = data.free[guestId];
        data.free[guestId] = f && f.day === day ? { day, used: f.used + free } : { day, used: free };
      }
      data.jobs.push({ id: data.nextId++, guest: guestId, job, free, paid, day });
      changed(guestId);
      return mine(guestId);
    },

    /** Take back pieces still on their way (all of them without an id), paid back */
    cancel(guestId: string, id?: number): LotMine {
      for (const j of data.jobs.filter((j) => j.guest === guestId && (id === undefined || j.id === id))) {
        data.jobs = data.jobs.filter((x) => x !== j);
        refund(j);
      }
      changed(guestId);
      return mine(guestId);
    },

    /** The host empties the lot (what is on its way stays on its way) */
    clear(): void {
      data.grid = { blocks: {}, props: [] };
      deps.save();
      deps.publish();
    },

    /** A new session: nobody's pieces are on their way any more, and maybe the lot starts empty */
    reset(): void {
      data.jobs = [];
      data.free = {};
      lastFeed.clear();
      if (deps.settings().lotClearOnNew) data.grid = { blocks: {}, props: [] };
      deps.save();
    },

    /** Pieces wait to be put up by this guest's character */
    hasJobs: (guestId: string) => data.jobs.some((j) => j.guest === guestId),

    /** What the town needs from the lot (see TownHooks) */
    hooks: {
      /** The guest's next piece that still fits (one that does not is paid back on the way) */
      lotJob(guestId: string): { id: number; c: number; r: number; w: number; d: number } | null {
        for (const j of data.jobs.filter((j) => j.guest === guestId)) {
          const why = jobProblem(data.grid, j.job);
          if (!why) return { id: j.id, ...jobCells(j.job) };
          data.jobs = data.jobs.filter((x) => x !== j);
          refund(j);
          if (j.free || j.paid) deps.failed(guestId, why);
          changed(guestId);
        }
        return null;
      },
      lotDone(guestId: string, id: number): void {
        const j = data.jobs.find((x) => x.id === id && x.guest === guestId);
        if (!j) return;
        build(j);
        changed(guestId);
        deps.publish();
      },
      lotSolid(c: number, r: number): boolean {
        return !!data.grid.blocks[cellIndex(c, r)]?.length || !!propAt(data.grid, c, r);
      },
      lotFlush(guestId: string): void {
        const list = data.jobs.filter((j) => j.guest === guestId);
        if (!list.length) return;
        for (const j of list) build(j);
        changed(guestId);
        deps.publish();
      },
    },
  };
}
