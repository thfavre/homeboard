export interface Track {
  uri: string;
  title: string;
  artists: string;
  album: string;
  image: string | null;
  durationMs: number;
  explicit: boolean;
  requestedBy?: { name: string; color: string };
}

export interface NowPlaying extends Track {
  progressMs: number;
  isPlaying: boolean;
  /** Server time when progressMs was measured */
  at: number;
}

export interface SpotifyState {
  connected: boolean;
  now: NowPlaying | null;
  queue: Track[];
  allowSkip: boolean;
  /** Admin only */
  admin?: {
    clientId: string;
    redirectUri: string;
    account: string | null;
    device: string | null;
    volume: number | null;
    allowExplicit: boolean;
    duck: boolean;
    /** Music volume while a sound plays, in % of the normal volume */
    duckPercent: number;
    error: string | null;
  };
}
