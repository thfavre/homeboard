/** Built-in sounds, synthesized on the TV by web/src/modules/soundboard/synth.ts */
export const SYNTH_SOUNDS = [
  { id: 'airhorn', name: 'Air horn' },
  { id: 'tada', name: 'Ta-da' },
  { id: 'drumroll', name: 'Drum roll' },
  { id: 'applause', name: 'Applause' },
  { id: 'rimshot', name: 'Ba dum tss' },
  { id: 'buzzer', name: 'Wrong buzzer' },
  { id: 'chime', name: 'Chime' },
  { id: 'laser', name: 'Laser' },
  { id: 'bassdrop', name: 'Bass drop' },
  { id: 'crickets', name: 'Crickets' },
] as const;

export interface Sound {
  id: string;
  name: string;
  kind: 'synth' | 'file';
  src?: string;
  /** Added from MyInstants (admin view only) */
  myinstants?: boolean;
}

/** A sound found on MyInstants. `mp3` is its file name on myinstants.com. */
export interface MiSound {
  id: string;
  title: string;
  mp3: string;
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
  /** Searched sounds are cut after this many seconds (0 = no limit) */
  searchMaxSec: number;
  /** Admin only: every built-in, including disabled ones */
  builtins?: { id: string; name: string; enabled: boolean }[];
}

export interface PlayEvent {
  id: string;
  sound: Sound;
  volume: number;
  by: string;
  /** Stop the sound after this many seconds */
  maxSec?: number;
}
