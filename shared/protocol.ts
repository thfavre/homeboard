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
  leaderboardMode: LeaderboardMode;
  leaderboard: PublicGuest[];
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

export type RpcResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export interface StateMessage {
  module: string;
  data: unknown;
}

export interface EventMessage {
  module: string;
  name: string;
  data: unknown;
}

export interface ToastMessage {
  text: string;
  amount?: number;
  kind?: 'info' | 'success' | 'error';
}

export interface JoinResult {
  token: string;
  me: Me;
  /** True when an existing account was opened with its PIN */
  returning: boolean;
}
