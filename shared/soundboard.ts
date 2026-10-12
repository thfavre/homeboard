export interface Sound {
  id: string;
  name: string;
  src: string;
  /** Added from MyInstants (admin view only) */
  myinstants?: boolean;
  /** Length in seconds, when known */
  duration?: number;
}

/** A sound's length for a button: "2.4s", "12s", "1:05" */
export function formatDuration(sec: number): string {
  if (sec < 9.95) return `${Math.max(0.1, Math.round(sec * 10) / 10)}s`;
  if (sec < 59.5) return `${Math.round(sec)}s`;
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A sound found on MyInstants (`mp3` is its file name on myinstants.com) or on Freesound (`mp3` starts with "fs--") */
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
  /** Set when MyInstants is down and the results come from Freesound */
  source?: 'freesound';
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
