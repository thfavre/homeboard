export interface Track {
  uri: string;
  title: string;
  artists: string;
  album: string;
  image: string | null;
  durationMs: number;
  explicit: boolean;
  requestedBy?: { name: string; color: string };
  /** Set on songs Homeboard still holds: the admin can move or remove them */
  qid?: string;
}

export interface NowPlaying extends Track {
  progressMs: number;
  isPlaying: boolean;
  /** Server time when progressMs was measured */
  at: number;
}

/** What can lower the music while it plays */
export type DuckSource = 'soundboard' | 'tts';

export interface DuckSetting {
  on: boolean;
  /** Music volume while the source plays, in % of the normal volume */
  percent: number;
}

export interface SpotifyState {
  connected: boolean;
  now: NowPlaying | null;
  queue: Track[];
  /** How many songs are queued in all (the public queue is cut short) */
  queueLength: number;
  allowSkip: boolean;
  /** Admin only */
  admin?: {
    clientId: string;
    redirectUri: string;
    account: string | null;
    device: string | null;
    volume: number | null;
    allowExplicit: boolean;
    ducking: Record<DuckSource, DuckSetting>;
    error: string | null;
    /** The whole queue in play order (the public one is cut short) */
    queue: Track[];
  };
}
