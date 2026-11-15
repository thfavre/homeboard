import { ZZFX, zzfx } from 'zzfx';

/**
 * The Arcade's sounds, made on the fly by ZzFX (no sound files): a few numbers each, shaped by ear.
 * See https://killedbyapixel.github.io/ZzFX/ to hear or change one.
 */
const SOUNDS = {
  throw: [0.5, 0.05, 520, 0, 0.02, 0.06, 1, 1.8, -24],
  thunk: [1.1, 0.05, 130, 0, 0.02, 0.12, 4, 2, -6, 0, 0, 0, 0, 0.7],
  clang: [1.1, 0.05, 950, 0, 0.04, 0.32, 2, 0.5, 0, 0, 0, 0, 0.05, 0, 40],
  point: [0.7, 0.02, 880, 0, 0.04, 0.12, 0, 1.6, 0, 0, 300, 0.04],
  perfect: [0.9, 0.02, 660, 0, 0.06, 0.25, 0, 1.5, 0, 0, 440, 0.06],
  level: [0.8, 0.02, 520, 0.02, 0.1, 0.3, 0, 1.4, 0, 0, 260, 0.08, 0.08],
  flap: [0.45, 0.1, 280, 0.01, 0.02, 0.06, 0, 2, 70],
  crash: [1.3, 0.05, 80, 0.01, 0.1, 0.5, 4, 1, -10, 0, 0, 0, 0, 1.2],
  slice: [0.6, 0.3, 1300, 0, 0.01, 0.08, 4, 3, -40, 0, 0, 0, 0, 0.5],
  bomb: [1.5, 0.1, 60, 0.02, 0.2, 0.8, 4, 0.6, -5, 0, 0, 0, 0, 2],
  right: [0.8, 0.01, 700, 0, 0.05, 0.15, 1, 1.5, 0, 0, 350, 0.05],
  wrong: [0.8, 0.05, 180, 0, 0.08, 0.2, 2, 1, -30],
  turn: [0.35, 0.05, 560, 0, 0.01, 0.04, 0, 2],
  beep: [0.5, 0, 440, 0, 0.08, 0.05, 1],
  go: [0.7, 0, 880, 0, 0.15, 0.1, 1],
  win: [0.9, 0, 520, 0.02, 0.2, 0.4, 0, 1, 0, 0, 260, 0.1, 0.12],
} satisfies Record<string, number[]>;

export type SoundId = keyof typeof SOUNDS;

let on = true;
export function soundsOn(value: boolean): void {
  on = value;
}

/** The phone only lets a page make sound after a tap: call it from one (the Ready button) */
export function wakeSound(): void {
  void ZZFX.audioContext.resume().catch(() => {});
}

export function play(id: SoundId, volume = 1): void {
  if (!on || ZZFX.audioContext.state !== 'running') return;
  const p = [...SOUNDS[id]];
  p[0] *= volume;
  try {
    zzfx(...p);
  } catch {
    // A sound that cannot be played is not worth stopping the game for
  }
}

/** A short vibration (Android; iPhones ignore it) */
export function buzz(pattern: number | number[]): void {
  if (on) navigator.vibrate?.(pattern);
}
