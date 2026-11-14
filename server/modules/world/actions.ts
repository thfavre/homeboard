import { randomUUID } from 'node:crypto';
import type { ModuleContext } from '../../core/module.ts';
import { HbError, num } from '../../core/util.ts';
import { minuteOf, minutesFrom, realAt, townMinutes, type AvatarChoices, type SheetInfo, type TownClock } from '../../../shared/world.ts';
import {
  BASIC_FIREWORK,
  letterText,
  paperPrice,
  MAX_ROCKETS,
  MAX_TOGETHER,
  PAPERS,
  SEALS,
  fireworkCost,
  riseMs,
  shellTimes,
  showMs,
  validDesign,
  type ActionSettingsView,
  type ActionsInfo,
  type FwDesign,
  type FwShell,
  type FwShow,
  type Letter,
  type Mailbox,
} from '../../../shared/worldActions.ts';
import type { Outfit } from '../../../shared/wardrobe.ts';
import { choicesHash } from './compose.ts';
import type { TownSim } from './sim.ts';

/**
 * What guests make happen in the town from their phone (the avatar panel's Actions tab): a
 * courier who walks a letter, and a little money, over to another guest's character; and
 * fireworks they design themselves, launched over the town at night, one show after the other.
 * Set up by the world module (index.ts), which hands over what these share with the rest of the
 * town: its money, its sim and its clock.
 */

/**
 * The host's options: guests can send each other a letter by courier, for a fee, with up to so
 * much money in it; and launch fireworks at night, for a base price plus so much per point of
 * craziness, with at most so many shells a show and so many shows kept each
 */
export type ActionSettings = ActionSettingsView;

export const ACTION_DEFAULTS: ActionSettings = {
  courier: true,
  courierFee: 5,
  courierMaxCoins: 200,
  courierPaperTinted: 2,
  courierPaperFancy: 5,
  courierPaperLuxe: 15,
  fireworks: true,
  fireworkBase: 10,
  fireworkPerPoint: 3,
  fireworkShells: 12,
  fireworkSaved: 8,
};

/** The stored part (in world.json) */
export interface ActionsData {
  letters?: Letter[];
  /** Fireworks per guest, the basic one first */
  fireworks?: Record<string, FwDesign[]>;
}

interface Deps<S extends ActionSettings> {
  ctx: ModuleContext<S>;
  data: ActionsData;
  save(): void;
  wallets: Record<string, number>;
  sendWallet(guestId: string): void;
  hasAvatar(guestId: string): boolean;
  sim: TownSim;
  /** The town's time now (it can run faster than real time), how many times faster, and its clock */
  townNow(): number;
  speed(): number;
  townClock(): TownClock;
  /** When night falls on the town's clock ("HH:MM"; null: the town has no night) */
  dusk(): string | null;
  /** What the town's money is called */
  currency(): string;
  /** Make sure a look's sheet is on disk (the courier's), and its address for the TV */
  composite(choices: AvatarChoices, outfit: Outfit): Promise<SheetInfo>;
  sheetUrlOf(choices: AvatarChoices, outfit: Outfit): string;
}

/** Fireworks go up from this darkness on (0 day, 1 night) */
export const FIREWORK_DARK = 0.5;
/** The letters kept (the oldest are forgotten) */
const LETTERS_KEPT = 600;
/**
 * A show goes up this long after its rockets are ready, and this long after the one before ends
 * (ms). Its launcher still not ready after this long (stuck, or gone): it goes up anyway.
 */
const SHOW_LEAD_MS = 900;
const SHOW_GAP_MS = 1200;
const SETUP_GIVE_UP_MS = 45_000;
/** Letters a guest can have on the way at once */
const LETTERS_ON_THE_WAY = 3;

/** The courier's look: a postman in a navy cap and jacket with a red tie */
const COURIER_LOOK: { choices: AvatarChoices; outfit: Outfit } = {
  choices: { body: 'male', skin: 'amber', hair: 'plain', hairColor: 'chestnut', beard: 'mustache', eyes: 'brown' },
  outfit: {
    hat: { id: 'leather_cap', color: 'navy' },
    top: { id: 'longsleeve', color: 'navy' },
    bottom: { id: 'pants', color: 'charcoal' },
    feet: { id: 'shoes', color: 'brown' },
    neck: { id: 'necktie', color: 'red' },
  },
};

export function setupActions<S extends ActionSettings>(d: Deps<S>) {
  const { ctx, wallets } = d;
  const letters = (d.data.letters ??= []);
  const designs = (d.data.fireworks ??= {});
  /** The shows waiting or on, in the order they go up */
  let shows: FwShow[] = [];
  let courierSheet: { url: string; sheet: SheetInfo } | null = null;

  // The courier's sheet, built once (then found on disk)
  void d.composite(COURIER_LOOK.choices, COURIER_LOOK.outfit).then(
    (sheet) => {
      courierSheet = { url: d.sheetUrlOf(COURIER_LOOK.choices, COURIER_LOOK.outfit), sheet };
      ctx.publish();
    },
    (err) => ctx.log.warn('Courier look failed:', err),
  );

  // Letters still on the way when the server stopped: the courier is gone with the town, they are handed over now
  for (const l of letters) if (l.deliveredAt === null) deliver(l.id);

  const nameOf = (id: string) => ctx.session.guests.get(id)?.name ?? 'Someone';

  /** The courier handed a letter over: the money in it goes to its new owner, and their phone shows it */
  function deliver(id: string) {
    const l = letters.find((x) => x.id === id);
    if (!l || l.deliveredAt !== null) return;
    l.deliveredAt = Date.now();
    if (l.coins) wallets[l.to] = (wallets[l.to] ?? 0) + l.coins;
    d.save();
    const to = ctx.session.guests.get(l.to);
    const from = ctx.session.guests.get(l.from);
    if (l.coins) d.sendWallet(l.to);
    ctx.emit({ guest: l.to }, 'letter', l);
    if (to) ctx.toast(to, { text: `The courier brought you a letter from ${l.fromName}`, kind: 'success' });
    if (from) ctx.toast(from, { text: `Your letter reached ${l.toName}`, kind: 'info' });
    ctx.publish();
  }

  /** What the papers that are not plain cost on top of the courier */
  const paperPrices = () => {
    const s = ctx.settings.get();
    return { tinted: Math.max(0, s.courierPaperTinted), fancy: Math.max(0, s.courierPaperFancy), luxe: Math.max(0, s.courierPaperLuxe) };
  };

  const mailbox = (guestId: string): Mailbox => ({
    inbox: letters.filter((l) => l.to === guestId && l.deliveredAt !== null).sort((a, b) => b.deliveredAt! - a.deliveredAt!),
    sent: letters.filter((l) => l.from === guestId).sort((a, b) => b.sentAt - a.sentAt),
  });

  ctx.onGuest('mail', (_args, guest) => mailbox(guest.id));

  ctx.onGuest('send', (args, guest) => {
    const s = ctx.settings.get();
    if (!s.courier) throw new HbError('The courier is off for now');
    if (!d.hasAvatar(guest.id)) throw new HbError('Make your look first');
    const to = ctx.session.guests.get(String(args?.to ?? ''));
    if (!to || !d.hasAvatar(to.id)) throw new HbError('Pick who the letter is for');
    if (to.id === guest.id) throw new HbError('The courier does not take letters to yourself');
    const text = letterText(args?.text);
    if (!text) throw new HbError('Write something in the letter');
    const coins = Math.round(num(args?.coins, 0));
    if (coins < 0) throw new HbError('Put money in, not out');
    if (coins > s.courierMaxCoins) throw new HbError(`At most ${s.courierMaxCoins} ${d.currency()} in a letter`);
    if (letters.filter((l) => l.from === guest.id && l.deliveredAt === null).length >= LETTERS_ON_THE_WAY) throw new HbError('The courier is still out with your other letters');
    const paper = PAPERS.find((p) => p.id === args?.paper)?.id ?? 'parchment';
    const seal = SEALS.find((x) => x.id === args?.seal)?.id ?? 'crimson';
    const cost = Math.max(0, Math.round(s.courierFee)) + paperPrice(paper, paperPrices()) + coins;
    const balance = wallets[guest.id] ?? 0;
    const money = d.currency();
    if (balance < cost) throw new HbError(`Not enough ${money}: this costs ${cost}, you have ${balance}`, 'NO_MONEY');
    wallets[guest.id] = balance - cost;
    const letter: Letter = {
      id: randomUUID().slice(0, 12),
      from: guest.id,
      fromName: guest.name,
      fromColor: guest.color,
      to: to.id,
      toName: to.name,
      text,
      coins,
      paper,
      seal,
      sentAt: Date.now(),
      deliveredAt: null,
      readAt: null,
    };
    letters.push(letter);
    letters.splice(0, Math.max(0, letters.length - LETTERS_KEPT));
    d.save();
    d.sendWallet(guest.id);
    ctx.activity(`{name} sent a letter to ${to.name} by courier`, { guest });
    d.sim.sendCourier(letter.id, to.id);
    ctx.publish();
    return { letter, balance: wallets[guest.id] };
  });

  ctx.onGuest('readLetter', (args, guest) => {
    const l = letters.find((x) => x.id === args?.id && x.to === guest.id);
    if (l && l.readAt === null) {
      l.readAt = Date.now();
      d.save();
    }
    return mailbox(guest.id);
  });

  // ------------------------------------------------------------ fireworks

  /** A guest's fireworks: the basic one is there from the start */
  const mine = (guestId: string): FwDesign[] => {
    let list = designs[guestId];
    if (!list?.length) list = designs[guestId] = [{ id: randomUUID().slice(0, 8), ...structuredClone(BASIC_FIREWORK) }];
    // (a show saved in an older form is read as today's: whatever no longer exists is dropped)
    for (const [i, d] of list.entries()) if (d.shells.some((s) => !Array.isArray(s.strokes) || !s.particles)) list[i] = { id: d.id, ...(validDesign(d, 30) ?? structuredClone(BASIC_FIREWORK)) };
    return list;
  };

  const prices = () => {
    const s = ctx.settings.get();
    return { base: Math.max(0, s.fireworkBase), perPoint: Math.max(0, s.fireworkPerPoint) };
  };

  ctx.onGuest('fwList', (_args, guest) => mine(guest.id));

  ctx.onGuest('fwSave', (args, guest) => {
    const s = ctx.settings.get();
    const clean = validDesign(args?.design, s.fireworkShells);
    if (!clean) throw new HbError('That firework cannot be made');
    const list = mine(guest.id);
    const id = String(args?.design?.id ?? '');
    const old = list.find((x) => x.id === id);
    if (old) Object.assign(old, clean);
    else {
      if (list.length >= Math.max(1, s.fireworkSaved)) throw new HbError(`You can keep ${s.fireworkSaved} fireworks: delete one first`);
      list.push({ id: randomUUID().slice(0, 8), ...clean });
    }
    d.save();
    return { list, id: old?.id ?? list.at(-1)!.id };
  });

  ctx.onGuest('fwDelete', (args, guest) => {
    const list = mine(guest.id);
    if (list.length <= 1) throw new HbError('Keep at least one');
    designs[guest.id] = list.filter((x) => x.id !== args?.id);
    d.save();
    return designs[guest.id];
  });

  /** It is dark enough in the town for fireworks */
  const night = () => d.sim.darkness >= FIREWORK_DARK;

  /** When night falls next (server time; null: it is night now, or the town has no night) */
  const nightAt = (): number | null => {
    const at = d.dusk();
    if (at === null || night()) return null;
    const t = d.townNow();
    const m = townMinutes(t, d.townClock());
    const dusk = m + minutesFrom(((m % 1440) + 1440) % 1440, minuteOf(at));
    return Date.now() + (realAt(dusk, d.townClock()) - t) / d.speed();
  };

  ctx.onGuest('fwLaunch', (args, guest) => {
    const s = ctx.settings.get();
    if (!s.fireworks) throw new HbError('Fireworks are off for now');
    if (!d.hasAvatar(guest.id)) throw new HbError('Make your look first');
    // In the day it waits for the night (a town without night never gets one)
    if (!night() && nightAt() === null) throw new HbError('Fireworks only go up at night, and the town has no night now');
    // One show, or several picked together (in that order, the same one more than once if wanted): they go up one after the other
    const ids: unknown[] = Array.isArray(args?.ids) ? args.ids : [args?.id];
    if (!ids.length || ids.length > MAX_TOGETHER) throw new HbError(`Pick 1 to ${MAX_TOGETHER} shows`);
    const designs = ids.map((id) => mine(guest.id).find((x) => x.id === id));
    if (designs.some((x) => !x)) throw new HbError('That firework is gone');
    const now = Date.now();
    shows = shows.filter(waiting);
    if (shows.some((x) => x.by === guest.id && (x.at === 0 || x.at > now))) throw new HbError('Your last fireworks have not gone up yet');
    const cost = designs.reduce((n, x) => n + fireworkCost(x!, prices()), 0);
    const balance = wallets[guest.id] ?? 0;
    const money = d.currency();
    // (the phone saw a price: one that went up meanwhile is not paid without seeing it)
    if (args?.price !== undefined && Math.round(num(args.price, cost)) < cost) throw new HbError(`The price changed: this now costs ${cost}`);
    if (balance < cost) throw new HbError(`Not enough ${money}: this costs ${cost}, you have ${balance}`, 'NO_MONEY');
    wallets[guest.id] = balance - cost;
    d.save();
    d.sendWallet(guest.id);
    // Several picked: one show of them all, each going up in turn, left and right of the launch spot
    const design = designs.length === 1 ? structuredClone(designs[0]!) : combine(designs as FwDesign[]);
    const show: FwShow = { id: randomUUID().slice(0, 8), at: 0, ends: 0, by: guest.id, byName: guest.name, design, pad: null };
    shows.push(show);
    if (night()) setUp(show);
    else show.forNight = true;
    ctx.publish();
    return { balance: wallets[guest.id] };
  });

  /**
   * Shows launched together as one: each one's rockets after the one before (a short pause
   * between), the first a little left of the launch spot, the next a little right, then further
   * out on each side
   */
  function combine(list: FwDesign[]): FwDesign {
    const shells: FwShell[] = [];
    list.forEach((d, k) => {
      const shift = k === 0 && list.length % 2 ? 0 : (k % 2 ? 1 : -1) * (14 + 12 * Math.floor(k / 2));
      d.shells.forEach((s, i) => shells.push({ ...structuredClone(s), x: Math.max(0, Math.min(100, s.x + shift)), delay: i === 0 && k > 0 ? Math.max(s.delay, 900) : s.delay }));
    });
    // (named after them all, the same one in a row counted once: "Comet x2 + Rain")
    const names: { name: string; n: number }[] = [];
    for (const d of list) {
      const last = names.at(-1);
      if (last?.name === d.name) last.n++;
      else names.push({ name: d.name, n: 1 });
    }
    return { id: list.map((d) => d.id).join('+'), name: names.map((x) => (x.n > 1 ? `${x.name} x${x.n}` : x.name)).join(' + '), shells };
  }

  /**
   * The character goes and plants the rockets first (one per shell, a few at most); the show goes
   * up once they stand back. A character that cannot (busy, not in the town) has it go up at once.
   */
  function setUp(show: FwShow) {
    delete show.forNight;
    const prep = d.sim.prepareLaunch(show.id, show.by, Math.min(MAX_ROCKETS, show.design.shells.length));
    show.pad = prep.pad;
    if (prep.walking) setTimeout(() => fire(show.id), SETUP_GIVE_UP_MS);
    else fire(show.id);
    ctx.publish();
  }

  // Shows launched in the day are set up as night falls, one after the other (a few seconds apart, so the launchers do not all set off at once)
  let nextSetUp = 0;
  setInterval(() => {
    if (!night() || Date.now() < nextSetUp) return;
    const next = shows.find((x) => x.forNight);
    if (!next) return;
    nextSetUp = Date.now() + 4000;
    setUp(next);
  }, 1000);

  /** A show waiting to be set up, waiting its turn, or on */
  const waiting = (x: FwShow) => x.at === 0 || x.ends > Date.now();

  /** A show's rockets are ready: it goes up after the shows before it (once) */
  function fire(id: string) {
    const show = shows.find((x) => x.id === id);
    if (!show || show.at) return;
    const now = Date.now();
    const at = Math.max(now + SHOW_LEAD_MS, ...shows.filter((x) => x.at).map((x) => x.ends + SHOW_GAP_MS));
    show.at = at;
    show.ends = at + showMs(show.design);
    // The town watches (on its own time, which can run faster) and cheers at the first burst
    const t = d.townNow();
    const town = (real: number) => t + (real - now) * d.speed();
    const first = show.design.shells[0];
    d.sim.firing(show.id, town(at), town(show.ends), town(at + shellTimes(show.design)[0] + riseMs(first)));
    const guest = ctx.session.guests.get(show.by);
    if (guest) setTimeout(() => ctx.activity(`{name} lit up the sky with ${show.design.name}`, { guest }), at - now);
    // Gone from the state once over
    setTimeout(() => ctx.publish(), show.ends - now + 200);
    ctx.publish();
  }

  return {
    /** What every phone and the TV see of the actions */
    info(): ActionsInfo {
      const s = ctx.settings.get();
      const now = Date.now();
      const live = shows.filter(waiting);
      // (one being set up counts for about as long as that takes)
      const busyUntil = Math.max(0, ...live.filter((x) => !x.forNight).map((x) => (x.at ? x.ends : now + 15_000)));
      return {
        courier: { on: s.courier, fee: Math.max(0, s.courierFee), maxCoins: Math.max(0, s.courierMaxCoins), papers: paperPrices() },
        fireworks: { on: s.fireworks, ...prices(), maxShells: s.fireworkShells, night: night(), nightAt: nightAt(), busyUntil },
      };
    },
    /** The shows being set up, waiting or on (the TV draws the ones with a time) */
    shows(): FwShow[] {
      return (shows = shows.filter(waiting));
    },
    /** A launcher stands back from the rockets: the show can go up */
    padReady: (id: string) => fire(id),
    /** The courier's look for the TV (null until its sheet is built), and the name of its sheet (kept when unused sheets are cleaned) */
    courier: () => courierSheet,
    courierHash: choicesHash(COURIER_LOOK.choices, COURIER_LOOK.outfit),
    delivered: (id: string) => deliver(id),
    /** A new party: no letters, no fireworks */
    reset() {
      letters.length = 0;
      for (const k of Object.keys(designs)) delete designs[k];
      shows = [];
    },
    /** The host's options for the actions, from the admin page (only the ones given) */
    options(args: Record<string, unknown>): Partial<ActionSettings> {
      const s = ctx.settings.get();
      const amount = (v: unknown, old: number) => Math.max(0, Math.min(1_000_000, Math.round(num(v, old))));
      return {
        courier: typeof args.courier === 'boolean' ? args.courier : s.courier,
        courierFee: amount(args.courierFee, s.courierFee),
        courierMaxCoins: amount(args.courierMaxCoins, s.courierMaxCoins),
        courierPaperTinted: amount(args.courierPaperTinted, s.courierPaperTinted),
        courierPaperFancy: amount(args.courierPaperFancy, s.courierPaperFancy),
        courierPaperLuxe: amount(args.courierPaperLuxe, s.courierPaperLuxe),
        fireworks: typeof args.fireworks === 'boolean' ? args.fireworks : s.fireworks,
        fireworkBase: amount(args.fireworkBase, s.fireworkBase),
        fireworkPerPoint: amount(args.fireworkPerPoint, s.fireworkPerPoint),
        fireworkShells: Math.max(1, Math.min(30, Math.round(num(args.fireworkShells, s.fireworkShells)))),
        fireworkSaved: Math.max(1, Math.min(30, Math.round(num(args.fireworkSaved, s.fireworkSaved)))),
      };
    },
  };
}
