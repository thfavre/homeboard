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
}

export interface SoundboardState {
  sounds: Sound[];
  volume: number;
  cooldownUntil: number;
  cooldownSec: number;
  /** Admin only: every built-in, including disabled ones */
  builtins?: { id: string; name: string; enabled: boolean }[];
}

export interface PlayEvent {
  sound: Sound;
  volume: number;
  by: string;
}
