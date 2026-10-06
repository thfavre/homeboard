export interface Sound {
  id: string;
  name: string;
  src: string;
  /** Added from MyInstants (admin view only) */
  myinstants?: boolean;
}

/** A sound found on MyInstants. `mp3` is its file name on myinstants.com. */
export interface MiSound {
  id: string;
  title: string;
  mp3: string;
  /** Length in seconds, when known */
  duration?: number;
}

export interface MiPage {
  items: MiSound[];
  page: number;
  hasNext: boolean;
}

export interface SoundboardState {
  sounds: Sound[];
  volume: number;
  cooldownUntil: number;
  cooldownSec: number;
  /** Guests can search MyInstants and play any sound from it */
  guestSearch: boolean;
  /** Guests only find sounds up to this many seconds, and the TV cuts longer ones (0 = no limit) */
  searchMaxSec: number;
}

export interface PlayEvent {
  id: string;
  sound: Sound;
  volume: number;
  by: string;
  /** Stop the sound after this many seconds */
  maxSec?: number;
}
