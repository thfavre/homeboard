// Types shared between the server and the web clients.
// Money amounts are always integers in hundredths of the currency unit (1.5 => 150).

import type { AvatarParams } from './avatar.ts';

export type Role = 'guest' | 'tv' | 'admin';

export interface Currency {
  /** Display name, e.g. "Sparks" */
  name: string;
  /** Short symbol, e.g. "SP" */
  symbol: string;
}

export interface FeatureInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface PriceInfo {
  key: string;
  module: string;
  label: string;
  unit?: string;
  amount: number;
  /** False when a module setting makes this price unused right now */
  active?: boolean;
}

export interface EarnRuleInfo {
  key: string;
  module: string;
  label: string;
  description: string;
  amount: number;
}

export interface PublicGuest {
  id: string;
  name: string;
  color: string;
  /** Selfie avatar URL, when the guest made one */
  avatar?: string;
  balance: number;
  spent: number;
  earned: number;
  online: boolean;
}

export interface AdminGuest extends PublicGuest {
  hasPin: boolean;
  joinedAt: number;
  lastSeen: number;
}

export interface Me {
  id: string;
  name: string;
  color: string;
  balance: number;
  earned: number;
  spent: number;
  hasPin: boolean;
  /** Only sent to the guest themselves. Null when unknown (set before PINs were readable). */
  pin: string | null;
  avatar?: string;
  /** How the avatar was made, to edit it again */
  avatarParams?: AvatarParams;
  /** Server time the passive income timer started counting towards the next payout */
  passiveSince: number;
}

export interface ActivityItem {
  id: number;
  at: number;
  module: string;
  text: string;
  guest?: { id: string; name: string; color: string };
  amount?: number;
}

export interface LedgerEntry {
  id: number;
  at: number;
  guestId: string;
  guestName: string;
  amount: number;
  reason: string;
}

export type LeaderboardMode = 'balance' | 'spent' | 'earned' | 'off';

/** What guests did during the session, counted for the TV leaderboards */
export type GuestStat = 'pixels' | 'stickers' | 'photos' | 'songs' | 'sounds' | 'games' | 'wins';

/** The boards the TV leaderboard takes turns with, besides the money one */
export const STAT_BOARDS: { stat: GuestStat; title: string; unit: string; one: string }[] = [
  { stat: 'pixels', title: 'Pixel artists', unit: 'pixels', one: 'pixel' },
  { stat: 'stickers', title: 'Sticker spammers', unit: 'stickers', one: 'sticker' },
  { stat: 'games', title: 'Most games played', unit: 'games', one: 'game' },
  { stat: 'wins', title: 'Game champions', unit: 'wins', one: 'win' },
  { stat: 'songs', title: 'Party DJs', unit: 'songs', one: 'song' },
  { stat: 'sounds', title: 'Soundboard heroes', unit: 'sounds', one: 'sound' },
  { stat: 'photos', title: 'Paparazzi', unit: 'photos', one: 'photo' },
];

/** Every kind of board the TV leaderboard can show */
export type BoardKind = 'balance' | 'spent' | 'earned' | GuestStat | 'rhythm';
/** one: always the same board. rotate: the chosen boards take turns. off: no leaderboard. */
export type BoardMode = 'one' | 'rotate' | 'off';

export const BOARD_KINDS: { kind: BoardKind; title: string; hint: string; group: 'Money' | 'Party' | 'Games' }[] = [
  { kind: 'balance', title: 'Richest', hint: 'Who has the most money right now', group: 'Money' },
  { kind: 'spent', title: 'Big spenders', hint: 'Who spent the most this party', group: 'Money' },
  { kind: 'earned', title: 'Top earners', hint: 'Who earned the most this party', group: 'Money' },
  { kind: 'pixels', title: 'Pixel artists', hint: 'Most pixels painted on the canvas', group: 'Party' },
  { kind: 'stickers', title: 'Sticker spammers', hint: 'Most stickers sent', group: 'Party' },
  { kind: 'photos', title: 'Paparazzi', hint: 'Most photos shared', group: 'Party' },
  { kind: 'songs', title: 'Party DJs', hint: 'Most songs queued', group: 'Party' },
  { kind: 'sounds', title: 'Soundboard heroes', hint: 'Most sounds played', group: 'Party' },
  { kind: 'games', title: 'Most games played', hint: 'Duels, room games and solo games', group: 'Games' },
  { kind: 'wins', title: 'Game champions', hint: 'Most games won', group: 'Games' },
  { kind: 'rhythm', title: 'Rhythm Rain songs', hint: 'Best scores on a song, one board per song, difficulty and number of colors', group: 'Games' },
];
export const isMoneyBoard = (k: BoardKind): k is 'balance' | 'spent' | 'earned' => k === 'balance' || k === 'spent' || k === 'earned';

export interface BoardRow {
  id: string;
  name: string;
  color: string;
  value: number;
}

/**
 * One leaderboard the TV can show. money: amounts, count: a stat (`unit`), score: Rhythm Rain points
 * on one song at one difficulty and number of colors (`song`).
 */
export interface Board {
  id: string;
  /** Which setting it comes from */
  of: BoardKind;
  title: string;
  kind: 'money' | 'count' | 'score';
  unit?: string;
  one?: string;
  rows: BoardRow[];
  song?: { title: string; artist: string; cover?: string; chart: string; colors: number; players: number };
}

/** What the TV (and guest phones) may show about who did what. The host always sees everything. */
export interface PrivacySettings {
  /** Activity feed at the bottom of the TV */
  activity: 'names' | 'anonymous' | 'off';
  photoNames: boolean;
  stickerNames: boolean;
  /** "Requested by" on songs */
  songNames: boolean;
  /** Who started a light effect or a sound */
  effectNames: boolean;
}

export interface CoreState {
  appName: string;
  theme: string;
  currency: Currency;
  economyEnabled: boolean;
  features: FeatureInfo[];
  prices: Record<string, PriceInfo>;
  earn: EarnRuleInfo[];
  /** Time between passive income payouts (0 = off) */
  passiveMs: number;
  /** The money ranking guests see their place in ('off' when the TV shows no money board) */
  leaderboardMode: LeaderboardMode;
  leaderboard: PublicGuest[];
  /** TV only: the boards the leaderboard shows (taking turns when more than one), and seconds per board */
  boards?: Board[];
  boardSeconds?: number;
  privacy: PrivacySettings;
  /** Avatar URL of every guest who has one, by guest id */
  avatars: Record<string, string>;
  guestsOnline: number;
  takeover: string | null;
  activity: ActivityItem[];
  /** TV and admin only */
  join?: { url: string; code: string; qrSvg: string; codeRequired: boolean };
  /** Admin only */
  admin?: CoreAdminState;
}

export interface CoreAdminState {
  guests: AdminGuest[];
  ledger: LedgerEntry[];
  publicUrl: string | null;
  lanUrl: string;
  tunnel: 'off' | 'starting' | 'up' | 'error';
  sessionStartedAt: number;
  passiveMinutes: number;
  passiveAwayMinutes: number;
  boardMode: BoardMode;
  boardOne: BoardKind;
  boardRotate: BoardKind[];
  /** Kinds that have something to show right now */
  boardsLive: BoardKind[];
  boardSeconds: number;
  songBoardPlayers: number;
  qrIncludesCode: boolean;
  requireCode: boolean;
  prices: PriceInfo[];
  earnRules: EarnRuleInfo[];
  modules: { id: string; name: string; toggleable: boolean }[];
}

/** State sent to a socket that has not joined the session yet */
export interface VisitorState {
  appName: string;
  theme: string;
  currency: Currency;
}

export interface RpcRequest {
  module: string;
  method: string;
  args?: unknown;
}

/** NO_MONEY: the guest cannot afford the action */
export type RpcErrorCode = 'NO_MONEY';

export type RpcResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: RpcErrorCode };

export interface StateMessage {
  module: string;
  data: unknown;
}

export interface EventMessage {
  module: string;
  name: string;
  data: unknown;
}

/** Sent to a guest who comes back after a while: what passive income paid meanwhile */
export interface WelcomeBack {
  awayMs: number;
  /** Part of the time away that was paid (capped by the host) */
  paidMs: number;
  amount: number;
}

/** Sent to a guest when passive income pays them */
export interface PassivePaid {
  amount: number;
}

export interface ToastMessage {
  text: string;
  amount?: number;
  kind?: 'info' | 'success' | 'error';
}

/** Before the PIN step: is this name new, or someone coming back? */
export interface NameCheck {
  returning: boolean;
  /** The name as stored (case of the first time) */
  name: string;
  color?: string;
  avatar?: string;
}

export interface JoinResult {
  token: string;
  me: Me;
  /** True when an existing account was opened with its PIN */
  returning: boolean;
}
