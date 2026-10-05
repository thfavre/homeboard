import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import type { AdminGuest, LedgerEntry, Me, PublicGuest } from '../../shared/protocol.ts';
import { JsonFile } from './jsonFile.ts';
import { DATA_DIR } from './paths.ts';
import { HbError, cleanName, rejoinKey, sessionCode, uid } from './util.ts';

export interface Guest {
  id: string;
  name: string;
  token: string;
  rejoinKey: string;
  color: string;
  balance: number;
  earned: number;
  spent: number;
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

function freshSession(): SessionData {
  return { id: uid(6), code: sessionCode(), startedAt: Date.now(), guests: [], ledger: [], ledgerSeq: 0 };
}

/**
 * The current party session: guests, balances and the ledger.
 * Reset by the admin with "New session"; persisted so a server restart keeps it.
 *
 * Events: 'guest-changed' (guest), 'guests-changed' (), 'reset' ()
 */
export class Session extends EventEmitter {
  private file = new JsonFile<SessionData>(join(DATA_DIR, 'session.json'), freshSession());
  guests = new Map<string, Guest>();

  constructor() {
    super();
    for (const g of this.file.data.guests ?? []) this.guests.set(g.id, { ...g, sockets: 0 });
    this.file.save();
  }

  get id() { return this.file.data.id; }
  get code() { return this.file.data.code; }
  get startedAt() { return this.file.data.startedAt; }
  get ledger() { return this.file.data.ledger; }

  reset(): void {
    this.file.data = freshSession();
    this.guests.clear();
    this.save();
    this.emit('reset');
    this.emit('guests-changed');
  }

  /** Set the join code, or pick a random one */
  newCode(code?: string): void {
    this.file.data.code = code ?? sessionCode();
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

  join(rawName: unknown): Guest {
    const name = cleanName(rawName);
    if (name.length < 2) throw new HbError('Please enter a name (at least 2 characters)');
    if (this.byName(name)) throw new HbError('NAME_TAKEN');
    const now = Date.now();
    const guest: Guest = {
      id: uid(6),
      name,
      token: uid(18),
      rejoinKey: rejoinKey(),
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
    return guest;
  }

  /** Reclaim an existing account from another device using its rejoin key */
  rejoin(rawName: unknown, key: unknown): Guest {
    const guest = this.byName(cleanName(rawName));
    if (!guest || String(key ?? '').trim().toUpperCase() !== guest.rejoinKey) {
      throw new HbError('Name and rejoin key do not match');
    }
    guest.token = uid(18);
    this.changed(guest);
    return guest;
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
    this.save();
    this.emit('guests-changed');
  }

  setOnline(guest: Guest, delta: 1 | -1): void {
    guest.sockets = Math.max(0, guest.sockets + delta);
    guest.lastSeen = Date.now();
    this.emit('guests-changed');
  }

  /** Low-level balance change. Use Economy for anything user-facing. */
  applyAmount(guest: Guest, amount: number, reason: string): LedgerEntry {
    guest.balance += amount;
    if (amount > 0) guest.earned += amount;
    else guest.spent += -amount;
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
    return { id: g.id, name: g.name, color: g.color, balance: g.balance, earned: g.earned, spent: g.spent, rejoinKey: g.rejoinKey };
  }

  publicGuest(g: Guest): PublicGuest {
    return { id: g.id, name: g.name, color: g.color, balance: g.balance, spent: g.spent, earned: g.earned, online: g.sockets > 0 };
  }

  adminGuest(g: Guest): AdminGuest {
    return { ...this.publicGuest(g), rejoinKey: g.rejoinKey, joinedAt: g.joinedAt, lastSeen: g.lastSeen };
  }
}
