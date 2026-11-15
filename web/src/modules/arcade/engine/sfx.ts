import { ZZFX, zzfx } from 'zzfx';

/**
 * The Arcade's sounds: retro sound effects by Juhani Junkala (CC0, web/public/arcade/sfx, see
 * web/public/arcade/CREDITS.txt), loaded once and played through the audio context ZzFX already
 * uses. Until a file is there (and for the cat, which the pack has none of), a sound made on the
 * fly by ZzFX plays instead: a few numbers each, see https://killedbyapixel.github.io/ZzFX/.
 */
const MADE = {
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
  fever: [1, 0, 330, 0.02, 0.35, 0.4, 0, 1.2, 0, 0, 330, 0.07, 0.07, 0, 0, 0, 0.05],
  life: [1, 0.05, 300, 0.01, 0.12, 0.35, 2, 1.5, -12, 0, 0, 0, 0, 0.3],
  coin: [0.6, 0, 1200, 0, 0.03, 0.12, 1, 1.4, 0, 0, 600, 0.04],
  gem: [0.8, 0, 900, 0, 0.06, 0.3, 0, 1.6, 0, 0, 450, 0.05, 0.06],
  bonk: [0.9, 0.05, 220, 0, 0.02, 0.1, 3, 1.5, -18, 0, 0, 0, 0, 0.2],
  meow: [0.7, 0.05, 620, 0.04, 0.08, 0.2, 0, 1.2, -6, 3, 0, 0, 0, 0, 8],
  grow: [0.25, 0, 180, 0, 0.05, 0.02, 2, 1, 4],
  land: [0.9, 0.05, 160, 0, 0.03, 0.15, 3, 1.4, -4, 0, 0, 0, 0, 0.4],
  combo: [0.7, 0, 760, 0, 0.05, 0.18, 0, 1.4, 0, 0, 380, 0.04, 0.05],
} satisfies Record<string, number[]>;

export type SoundId = keyof typeof MADE;

/** The sounds that have a file in web/public/arcade/sfx (named after them), and how loud they play */
const FILES: Partial<Record<SoundId, number>> = {
  throw: 0.8,
  thunk: 1,
  clang: 1,
  point: 0.8,
  perfect: 0.9,
  level: 0.9,
  flap: 0.7,
  crash: 1,
  slice: 0.8,
  bomb: 1,
  right: 0.8,
  wrong: 0.9,
  turn: 0.6,
  beep: 0.8,
  go: 0.9,
  win: 1,
  fever: 1,
  life: 1,
  coin: 0.7,
  gem: 0.9,
  bonk: 1,
  grow: 0.5,
  land: 1,
  combo: 0.9,
};

const buffers = new Map<SoundId, AudioBuffer>();
let loading: Promise<void> | null = null;

/** Fetches and decodes the sound files (once; a file that fails keeps its ZzFX sound) */
export function loadSounds(): Promise<void> {
  loading ??= Promise.all(
    (Object.keys(FILES) as SoundId[]).map(async (id) => {
      try {
        const res = await fetch(`/arcade/sfx/${id}.wav`);
        if (!res.ok) return;
        buffers.set(id, await ZZFX.audioContext.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // The made-up sound plays instead
      }
    }),
  ).then(() => {});
  return loading;
}

let on = true;
export function soundsOn(value: boolean): void {
  on = value;
}

/** The phone only lets a page make sound after a tap: call it from one (the Ready button) */
export function wakeSound(): void {
  void ZZFX.audioContext.resume().catch(() => {});
}

/** Plays a sound (`volume` 0 to about 1.5; `rate` above 1 plays it faster and higher) */
export function play(id: SoundId, volume = 1, rate = 1): void {
  if (!on || ZZFX.audioContext.state !== 'running') return;
  try {
    const buffer = buffers.get(id);
    if (buffer) {
      const ctx = ZZFX.audioContext;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1.5, volume * (FILES[id] ?? 1)) * 0.6;
      src.connect(gain).connect(ctx.destination);
      src.start();
      return;
    }
    const p = [...MADE[id]];
    p[0] *= volume;
    p[2] *= rate;
    zzfx(...p);
  } catch {
    // A sound that cannot be played is not worth stopping the game for
  }
}

/** A short vibration (Android; iPhones ignore it) */
export function buzz(pattern: number | number[]): void {
  if (on) navigator.vibrate?.(pattern);
}
