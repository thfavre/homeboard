import { randomUUID } from 'node:crypto';
import type { ModuleContext } from '../../core/module.ts';
import { HbError, num } from '../../core/util.ts';
import { minuteOf, minutesFrom, realAt, townMinutes, type AvatarChoices, type SheetInfo, type TownClock } from '../../../shared/world.ts';
import {
  BASIC_FIREWORK,
  LETTER_MAX,
  PAPERS,
  SEALS,
  fireworkCost,
  showMs,
  validDesign,
  type ActionSettingsView,
  type ActionsInfo,
  type FwDesign,
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
/** A show waits this long before it goes up, and the next one this long after the last ends (ms) */
const SHOW_LEAD_MS = 1500;
const SHOW_GAP_MS = 1200;
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
    const text = typeof args?.text === 'string' ? args.text.trim().slice(0, LETTER_MAX) : '';
    if (!text) throw new HbError('Write something in the letter');
    const coins = Math.round(num(args?.coins, 0));
    if (coins < 0) throw new HbError('Put money in, not out');
    if (coins > s.courierMaxCoins) throw new HbError(`At most ${s.courierMaxCoins} ${d.currency()} in a letter`);
    if (letters.filter((l) => l.from === guest.id && l.deliveredAt === null).length >= LETTERS_ON_THE_WAY) throw new HbError('The courier is still out with your other letters');
    const paper = PAPERS.find((p) => p.id === args?.paper)?.id ?? 'parchment';
    const seal = SEALS.find((x) => x.id === args?.seal)?.id ?? 'crimson';
    const cost = Math.max(0, Math.round(s.courierFee)) + coins;
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
    if (!night()) throw new HbError('Fireworks only go up at night');
    const design = mine(guest.id).find((x) => x.id === args?.id);
    if (!design) throw new HbError('That firework is gone');
    const now = Date.now();
    shows = shows.filter((x) => x.ends > now);
    if (shows.some((x) => x.by === guest.id && x.at > now)) throw new HbError('Your last show has not gone up yet');
    const cost = fireworkCost(design, prices());
    const balance = wallets[guest.id] ?? 0;
    const money = d.currency();
    // (the phone saw a price: one that went up meanwhile is not paid without seeing it)
    if (args?.price !== undefined && Math.round(num(args.price, cost)) < cost) throw new HbError(`The price changed: this show now costs ${cost}`);
    if (balance < cost) throw new HbError(`Not enough ${money}: this show costs ${cost}, you have ${balance}`, 'NO_MONEY');
    wallets[guest.id] = balance - cost;
    d.save();
    d.sendWallet(guest.id);
    const at = Math.max(now + SHOW_LEAD_MS, (shows.at(-1)?.ends ?? 0) + SHOW_GAP_MS);
    const ends = at + showMs(design);
    const show: FwShow = { id: randomUUID().slice(0, 8), at, ends, by: guest.id, byName: guest.name, design: structuredClone(design) };
    shows.push(show);
    // The town watches (on its own time, which can run faster)
    const t = d.townNow();
    d.sim.watchSky(t + (at - now) * d.speed(), t + (ends - now) * d.speed());
    setTimeout(() => ctx.activity(`{name} lit up the sky with ${design.name}`, { guest }), at - now);
    // Gone from the state once over
    setTimeout(() => ctx.publish(), ends - now + 200);
    ctx.publish();
    return { at, balance: wallets[guest.id] };
  });

  return {
    /** What every phone and the TV see of the actions */
    info(): ActionsInfo {
      const s = ctx.settings.get();
      const now = Date.now();
      const live = shows.filter((x) => x.ends > now);
      return {
        courier: { on: s.courier, fee: Math.max(0, s.courierFee), maxCoins: Math.max(0, s.courierMaxCoins) },
        fireworks: { on: s.fireworks, ...prices(), maxShells: s.fireworkShells, night: night(), nightAt: nightAt(), busyUntil: live.at(-1)?.ends ?? 0 },
      };
    },
    /** The shows waiting or on (the TV draws them) */
    shows(): FwShow[] {
      const now = Date.now();
      return (shows = shows.filter((x) => x.ends > now));
    },
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
        fireworks: typeof args.fireworks === 'boolean' ? args.fireworks : s.fireworks,
        fireworkBase: amount(args.fireworkBase, s.fireworkBase),
        fireworkPerPoint: amount(args.fireworkPerPoint, s.fireworkPerPoint),
        fireworkShells: Math.max(1, Math.min(30, Math.round(num(args.fireworkShells, s.fireworkShells)))),
        fireworkSaved: Math.max(1, Math.min(30, Math.round(num(args.fireworkSaved, s.fireworkSaved)))),
      };
    },
  };
}
