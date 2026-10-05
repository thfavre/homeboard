// Types shared between the server and the web clients.
// Money amounts are always integers in hundredths of the currency unit (1.5 => 150).

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
  balance: number;
  spent: number;
  earned: number;
  online: boolean;
}

export interface AdminGuest extends PublicGuest {
  rejoinKey: string;
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
  rejoinKey: string;
}

export interface ActivityItem {
  id: number;
  at: number;
  module: string;
  text: string;
  guest?: { name: string; color: string };
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

export type LeaderboardMode = 'balance' | 'spent' | 'earned';

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
}
