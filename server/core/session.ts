import { scryptSync, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import type { AdminGuest, GuestStat, LedgerEntry, Me, PublicGuest } from '../../shared/protocol.ts';
import type { AvatarParams } from '../../shared/avatar.ts';
import { JsonFile } from './jsonFile.ts';
import { DATA_DIR } from './paths.ts';
import { HbError, cleanName, sessionCode, uid } from './util.ts';

export interface Guest {
  id: string;
  name: string;
  token: string;
  /**
   * 4-digit PIN chosen by the guest, to log back in from another phone.
   * Kept readable so the guest can see it in their profile (they are told not to reuse a real PIN).
   * Older sessions stored a hash instead: still accepted to log in, but cannot be shown.
   */
  pin?: string | { salt: string; hash: string };
  color: string;
  /** Selfie: public picture, private original (to edit again) and how it was made */
  avatar?: { url: string; file: string; original: string; params: AvatarParams };
  balance: number;
  earned: number;
  spent: number;
  /** What they did this session, for the TV leaderboards */
  stats?: Partial<Record<GuestStat, number>>;
  /** Best scores by board (Rhythm Rain: one per song, difficulty and number of colors) */
  bests?: Record<string, number>;
  joinedAt: number;
  lastSeen: number;
  /** Seconds online since the last passive payout */
  onlineAccum: number;
  /** Number of open sockets (not persisted) */
  sockets: number;
}

interface SessionData {
  id: string;
  code: string;
  startedAt: number;
  guests: Guest[];
  ledger: LedgerEntry[];
  ledgerSeq: number;
}

const GUEST_COLORS = [
  '#ff6b6b', '#f7b267', '#ffd93d', '#6bcb77', '#4ecdc4', '#4d96ff',
  '#9b72f2', '#f15bb5', '#00bbf9', '#fee440', '#c77dff', '#ff9e00',
];

const LEDGER_SIZE = 500;
const PIN_PATTERN = /^\d{4}$/;
/** Wrong PINs allowed before a name is locked for a while (a 4-digit PIN is quick to guess otherwise) */
const PIN_TRIES = 10;
const PIN_LOCK_MS = 60_000;

function checkPin(pin: string, stored: NonNullable<Guest['pin']>): boolean {
  const [a, b] =
    typeof stored === 'string'
      ? [Buffer.from(pin), Buffer.from(stored)]
      : [scryptSync(pin, stored.salt, 32), Buffer.from(stored.hash, 'base64')];
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validPin(pin: unknown): string {
  const p = String(pin ?? '').trim();
  if (!PIN_PATTERN.test(p)) throw new HbError('The PIN must be 4 digits');
  return p;
}

function freshSession(): SessionData {
  return { id: uid(6), code: sessionCode(), startedAt: Date.now(), guests: [], ledger: [], ledgerSeq: 0 };
}

/**
 * The current party session: guests, balances and the ledger.
 * Reset by the admin with "New session"; persisted so a server restart keeps it.
 *
 * Events: 'guest-changed' (guest), 'guests-changed' (), 'guest-removed' (guest), 'reset' (),
 * 'guest-online' (guest, awayMs): a guest with no open page opened one
 */
export class Session extends EventEmitter {
  private file = new JsonFile<SessionData>(join(DATA_DIR, 'session.json'), freshSession());
  guests = new Map<string, Guest>();
  private bootAt = Date.now();
  /** Wrong PINs by guest id, not persisted */
  private pinFails = new Map<string, { count: number; until: number }>();

  constructor() {
    super();
    for (const g of this.file.data.guests ?? []) {
      const { rejoinKey: _old, ...guest } = g as Guest & { rejoinKey?: string };
      this.guests.set(g.id, { ...guest, sockets: 0 });
    }
    this.file.save();
  }

  get id() { return this.file.data.id; }
  get code() { return this.file.data.code; }
  get startedAt() { return this.file.data.startedAt; }
  get ledger() { return this.file.data.ledger; }

  reset(): void {
    this.file.data = freshSession();
    this.guests.clear();
    this.pinFails.clear();
    this.save();
    this.emit('reset');
    this.emit('guests-changed');
  }

  newCode(): void {
    this.file.data.code = sessionCode();
    this.save();
  }

  byToken(token: unknown): Guest | undefined {
    if (typeof token !== 'string') return;
    for (const g of this.guests.values()) if (g.token === token) return g;
  }

  byId(id: unknown): Guest {
    const g = this.guests.get(String(id));
    if (!g) throw new HbError('Unknown guest');
    return g;
  }

  byName(name: string): Guest | undefined {
    const n = name.toLowerCase();
    for (const g of this.guests.values()) if (g.name.toLowerCase() === n) return g;
  }

  /**
   * New name: creates the account with this PIN.
   * Existing name: logs back into it when the PIN matches.
   */
  join(rawName: unknown, rawPin: unknown): { guest: Guest; returning: boolean } {
    const name = cleanName(rawName);
    if (name.length < 2) throw new HbError('Please enter a name (at least 2 characters)');
    const pin = validPin(rawPin);
    const existing = this.byName(name);
    if (existing) return { guest: this.login(existing, pin), returning: true };
    const now = Date.now();
    const guest: Guest = {
      id: uid(6),
      name,
      token: uid(18),
      pin,
      color: GUEST_COLORS[this.guests.size % GUEST_COLORS.length],
      balance: 0,
      earned: 0,
      spent: 0,
      joinedAt: now,
      lastSeen: now,
      onlineAccum: 0,
      sockets: 0,
    };
    this.guests.set(guest.id, guest);
    this.changed(guest);
    this.emit('guests-changed');
    return { guest, returning: false };
  }

  private login(guest: Guest, pin: string): Guest {
    const fails = this.pinFails.get(guest.id);
    if (fails && fails.until > Date.now()) {
      throw new HbError(`Too many wrong PINs for ${guest.name}. Wait a minute and try again.`);
    }
    if (guest.pin && checkPin(pin, guest.pin)) {
      this.pinFails.delete(guest.id);
    } else {
      if (guest.pin) {
        const count = (fails?.count ?? 0) + 1;
        // Each lock after the first lasts longer
        const locks = Math.floor(count / PIN_TRIES);
        this.pinFails.set(guest.id, { count, until: count % PIN_TRIES === 0 ? Date.now() + PIN_LOCK_MS * locks : 0 });
      }
      throw new HbError(
        guest.pin
          ? `${guest.name} is already here. If it is you, check your PIN. Otherwise pick another name.`
          : `${guest.name} is already here. Pick another name, or ask the host to set a PIN for you.`,
      );
    }
    // The token stays the same, so the first phone stays logged in too
    return guest;
  }

  setPin(guest: Guest, rawPin: unknown): void {
    guest.pin = validPin(rawPin);
    this.pinFails.delete(guest.id);
    this.changed(guest);
  }

  rename(guest: Guest, rawName: unknown): void {
    const name = cleanName(rawName);
    if (name.length < 2) throw new HbError('Name too short');
    const other = this.byName(name);
    if (other && other !== guest) throw new HbError('That name is already taken');
    guest.name = name;
    this.changed(guest);
    this.emit('guests-changed');
  }

  remove(guest: Guest): void {
    this.guests.delete(guest.id);
    this.pinFails.delete(guest.id);
    this.save();
    this.emit('guest-removed', guest);
    this.emit('guests-changed');
  }

  setOnline(guest: Guest, delta: 1 | -1): void {
    const wasOnline = guest.sockets > 0;
    const now = Date.now();
    // Time the server was off does not count as away
    const awayMs = wasOnline ? 0 : now - Math.max(guest.lastSeen, this.bootAt);
    guest.sockets = Math.max(0, guest.sockets + delta);
    guest.lastSeen = now;
    if (!wasOnline && guest.sockets > 0) this.emit('guest-online', guest, awayMs);
    this.emit('guests-changed');
  }

  /**
   * Low-level balance change. Use Economy for anything user-facing.
   * countStats false: the balance moves but earned/spent (the leaderboard) do not.
   * 'refund': money given back, so it was never really spent (and is not earned either).
   */
  applyAmount(guest: Guest, amount: number, reason: string, countStats: boolean | 'refund' = true): LedgerEntry {
    guest.balance += amount;
    if (countStats === 'refund') guest.spent = Math.max(0, guest.spent - amount);
    else if (countStats && amount > 0) guest.earned += amount;
    else if (countStats) guest.spent += -amount;
    const entry: LedgerEntry = {
      id: ++this.file.data.ledgerSeq,
      at: Date.now(),
      guestId: guest.id,
      guestName: guest.name,
      amount,
      reason,
    };
    const ledger = this.file.data.ledger;
    ledger.push(entry);
    if (ledger.length > LEDGER_SIZE) ledger.splice(0, ledger.length - LEDGER_SIZE);
    this.changed(guest);
    return entry;
  }

  /** Count something the guest did (pixels painted, stickers sent...) */
  count(guest: Guest, stat: GuestStat, n = 1): void {
    if (n <= 0) return;
    guest.stats = { ...guest.stats, [stat]: (guest.stats?.[stat] ?? 0) + n };
    this.changed(guest);
  }

  /** Undo a count: the thing was removed by the host (a song taken out of the queue, a photo deleted) */
  uncount(guest: Guest, stat: GuestStat, n = 1): void {
    const had = guest.stats?.[stat] ?? 0;
    if (n <= 0 || !had || !this.guests.has(guest.id)) return;
    guest.stats = { ...guest.stats, [stat]: Math.max(0, had - n) };
    this.changed(guest);
  }

  /** Keep a score when it beats the guest's best on that board */
  best(guest: Guest, board: string, score: number): void {
    if (score <= (guest.bests?.[board] ?? -Infinity)) return;
    guest.bests = { ...guest.bests, [board]: score };
    this.changed(guest);
  }

  changed(guest: Guest): void {
    this.save();
    this.emit('guest-changed', guest);
  }

  save(): void {
    this.file.data.guests = [...this.guests.values()].map((g) => ({ ...g, sockets: 0 }));
    this.file.save();
  }

  flush(): void {
    this.save();
    this.file.saveNow();
  }

  me(g: Guest): Me {
    return { id: g.id, name: g.name, color: g.color, balance: g.balance, earned: g.earned, spent: g.spent, hasPin: !!g.pin, pin: typeof g.pin === 'string' ? g.pin : null, avatar: g.avatar?.url, avatarParams: g.avatar?.params, passiveSince: Date.now() - g.onlineAccum * 1000 };
  }

  publicGuest(g: Guest): PublicGuest {
    return { id: g.id, name: g.name, color: g.color, avatar: g.avatar?.url, balance: g.balance, spent: g.spent, earned: g.earned, online: g.sockets > 0 };
  }

  adminGuest(g: Guest): AdminGuest {
    return { ...this.publicGuest(g), hasPin: !!g.pin, joinedAt: g.joinedAt, lastSeen: g.lastSeen };
  }
}
