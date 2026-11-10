import { audioContext } from '../../soundboard/player.ts';

/**
 * Sounds and music of Crowd Race and Spy Hunt, made on the fly with Web Audio: nothing to load, nothing to
 * license. Volumes are the host's settings (0 to 100, 0: off).
 */

export type CrowdSound = 'shot' | 'hit' | 'empty' | 'go' | 'beep' | 'win' | 'flashbang' | 'smoke' | 'case' | 'round' | 'fall';

let noiseBuffer: AudioBuffer | null = null;
function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ac.sampleRate) return noiseBuffer;
  const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuffer = b;
  return b;
}

function ready(): AudioContext {
  const ac = audioContext();
  if (ac.state !== 'running') void ac.resume().catch(() => {});
  return ac;
}

/** A burst of noise through a filter, with a quick attack and a decay */
function burst(ac: AudioContext, out: AudioNode, t: number, o: { type: BiquadFilterType; freq: number; q?: number; gain: number; decay: number; sweepTo?: number }) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.decay);
  f.Q.value = o.q ?? 0.8;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.decay);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.decay + 0.05);
}

/** A tone with an envelope */
function tone(ac: AudioContext, out: AudioNode, t: number, o: { type?: OscillatorType; freq: number; to?: number; gain: number; attack?: number; decay: number; delay?: number }) {
  const at = t + (o.delay ?? 0);
  const osc = ac.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + o.decay);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.gain, at + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.decay);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + o.decay + 0.05);
}

/** Play a sound effect at `volume` (0 to 100) */
export function crowdSound(kind: CrowdSound, volume: number): void {
  if (volume <= 0) return;
  const ac = ready();
  const out = ac.createGain();
  out.gain.value = (volume / 100) * 0.9;
  out.connect(ac.destination);
  const t = ac.currentTime + 0.01;
  switch (kind) {
    case 'shot':
      // A crack, a thump and a long rolling tail, like a rifle far off
      burst(ac, out, t, { type: 'highpass', freq: 1800, gain: 0.9, decay: 0.09 });
      burst(ac, out, t, { type: 'lowpass', freq: 2200, sweepTo: 180, gain: 0.8, decay: 0.55 });
      tone(ac, out, t, { type: 'sine', freq: 140, to: 40, gain: 0.9, decay: 0.25 });
      burst(ac, out, t + 0.08, { type: 'bandpass', freq: 600, q: 0.6, gain: 0.18, decay: 1.4, sweepTo: 150 });
      break;
    case 'hit':
      tone(ac, out, t, { type: 'triangle', freq: 220, to: 55, gain: 0.6, decay: 0.35 });
      tone(ac, out, t, { type: 'sawtooth', freq: 110, to: 70, gain: 0.25, decay: 0.9, delay: 0.05 });
      break;
    case 'fall':
      burst(ac, out, t + 0.35, { type: 'lowpass', freq: 400, gain: 0.5, decay: 0.25 });
      tone(ac, out, t + 0.35, { freq: 90, to: 45, gain: 0.5, decay: 0.2 });
      break;
    case 'empty':
      burst(ac, out, t, { type: 'bandpass', freq: 3500, q: 4, gain: 0.4, decay: 0.03 });
      burst(ac, out, t + 0.07, { type: 'bandpass', freq: 2500, q: 4, gain: 0.3, decay: 0.03 });
      break;
    case 'beep':
      tone(ac, out, t, { type: 'square', freq: 660, gain: 0.18, decay: 0.16 });
      break;
    case 'go':
      tone(ac, out, t, { type: 'square', freq: 990, gain: 0.2, decay: 0.45 });
      tone(ac, out, t, { type: 'square', freq: 1320, gain: 0.12, decay: 0.45 });
      break;
    case 'win':
      // A short brass-like fanfare
      [523, 659, 784, 1047].forEach((f, k) => tone(ac, out, t, { type: 'sawtooth', freq: f, gain: 0.13, attack: 0.02, decay: k === 3 ? 0.9 : 0.22, delay: k * 0.12 }));
      [523, 659, 784].forEach((f) => tone(ac, out, t, { type: 'triangle', freq: f, gain: 0.12, attack: 0.03, decay: 1.1, delay: 0.48 }));
      break;
    case 'round':
      [392, 311, 262].forEach((f, k) => tone(ac, out, t, { type: 'triangle', freq: f, gain: 0.2, decay: 0.5, delay: k * 0.16 }));
      break;
    case 'flashbang':
      // The bang, then the ringing in the ears that fades away
      burst(ac, out, t, { type: 'lowpass', freq: 6000, sweepTo: 200, gain: 1, decay: 0.9 });
      tone(ac, out, t, { freq: 90, to: 30, gain: 1, decay: 0.5 });
      tone(ac, out, t, { freq: 3700, gain: 0.07, attack: 0.15, decay: 3.2, delay: 0.1 });
      tone(ac, out, t, { freq: 3720, gain: 0.05, attack: 0.15, decay: 3.0, delay: 0.1 });
      break;
    case 'smoke':
      // A canister popping, then the hiss of the smoke
      burst(ac, out, t, { type: 'bandpass', freq: 1200, q: 2, gain: 0.5, decay: 0.08 });
      burst(ac, out, t + 0.08, { type: 'highpass', freq: 2500, gain: 0.28, decay: 2.4, sweepTo: 900 });
      break;
    case 'case':
      // A soft chime
      [1319, 1760].forEach((f, k) => tone(ac, out, t, { freq: f, gain: 0.14, decay: 1.2, delay: k * 0.1 }));
      break;
  }
  setTimeout(() => out.disconnect(), 5000);
}

// ------------------------------------------------------------ music

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

interface Mood {
  bpm: number;
  swing: number;
  /** Bass notes of the loop, one per eighth (MIDI numbers, 0: rest) */
  bass: number[];
  /** Chords, one per bar */
  chords: number[][];
  /** Kick on these sixteenths of a bar, hats on these */
  kick: number[];
  hat: number[];
  snare: number[];
  /** A lead line: [sixteenth of the loop, note, length in sixteenths] */
  lead: [number, number, number][];
  bassType: OscillatorType;
  bassCut: number;
}

const MOODS: Record<'race' | 'spy', Mood> = {
  // Upbeat, driving: A minor, F, C, G
  race: {
    bpm: 128,
    swing: 0,
    bass: [45, 57, 45, 57, 45, 57, 45, 57, 41, 53, 41, 53, 41, 53, 41, 53, 48, 60, 48, 60, 48, 60, 48, 60, 43, 55, 43, 55, 43, 55, 47, 55],
    chords: [
      [69, 72, 76],
      [65, 69, 72],
      [67, 72, 76],
      [67, 71, 74],
    ],
    kick: [0, 4, 8, 12],
    hat: [2, 6, 10, 14],
    snare: [4, 12],
    lead: [
      [0, 76, 2], [3, 79, 1], [4, 81, 2], [8, 79, 2], [10, 76, 2], [12, 74, 4],
      [16, 77, 2], [19, 76, 1], [20, 74, 2], [24, 72, 4], [28, 69, 4],
      [32, 76, 2], [35, 79, 1], [36, 84, 2], [40, 83, 2], [42, 79, 2], [44, 76, 4],
      [48, 74, 2], [51, 76, 1], [52, 79, 2], [56, 74, 6],
    ],
    bassType: 'sawtooth',
    bassCut: 900,
  },
  // A sneaky spy walk: E minor, swinging, a low walking bass
  spy: {
    bpm: 100,
    swing: 0.16,
    bass: [40, 0, 47, 40, 50, 0, 47, 46, 40, 0, 47, 40, 52, 50, 47, 43, 36, 0, 43, 36, 45, 0, 43, 40, 35, 0, 42, 35, 45, 44, 43, 42],
    chords: [
      [64, 67, 71],
      [64, 67, 71, 74],
      [60, 64, 67, 71],
      [59, 63, 66, 69],
    ],
    kick: [0, 10],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    snare: [4, 12],
    lead: [
      [0, 76, 3], [3, 79, 1], [4, 78, 2], [6, 76, 2], [8, 75, 6],
      [32, 76, 3], [35, 79, 1], [36, 81, 2], [38, 79, 2], [40, 78, 4], [44, 75, 4], [48, 71, 8],
    ],
    bassType: 'triangle',
    bassCut: 700,
  },
};

/**
 * A loop played with the audio clock: notes are scheduled a little ahead, so the timing holds even when the
 * page is busy drawing. One at a time.
 */
class Music {
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private mood: Mood | null = null;
  private name: string | null = null;
  private next = 0;
  private step = 0;

  play(mood: 'race' | 'spy', volume: number): void {
    if (volume <= 0) return this.stop();
    if (this.name === mood && this.out) {
      this.volume(volume);
      return;
    }
    this.stop();
    const ac = ready();
    this.ac = ac;
    this.out = ac.createGain();
    this.out.gain.value = 0.0001;
    this.out.gain.exponentialRampToValueAtTime(this.level(volume), ac.currentTime + 1.5);
    this.out.connect(ac.destination);
    this.mood = MOODS[mood];
    this.name = mood;
    this.next = ac.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  private level(volume: number) {
    return Math.max(0.0001, (volume / 100) * 0.32);
  }

  volume(volume: number): void {
    if (!this.out || !this.ac) return;
    if (volume <= 0) return this.stop();
    this.out.gain.setTargetAtTime(this.level(volume), this.ac.currentTime, 0.2);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const out = this.out;
    const ac = this.ac;
    if (out && ac) {
      out.gain.setTargetAtTime(0.0001, ac.currentTime, 0.25);
      setTimeout(() => out.disconnect(), 1500);
    }
    this.out = null;
    this.mood = null;
    this.name = null;
  }

  private schedule(): void {
    const ac = this.ac;
    const mood = this.mood;
    const out = this.out;
    if (!ac || !mood || !out) return;
    const sixteenth = 60 / mood.bpm / 4;
    while (this.next < ac.currentTime + 0.25) {
      const s = this.step;
      // Swing: every second sixteenth a little late
      const t = this.next + (s % 2 === 1 ? sixteenth * mood.swing : 0);
      this.note(mood, out, ac, s, t, sixteenth);
      this.next += sixteenth;
      this.step = (s + 1) % 64;
    }
  }

  private note(mood: Mood, out: GainNode, ac: AudioContext, s: number, t: number, len: number): void {
    const inBar = s % 16;
    const bar = Math.floor(s / 16) % mood.chords.length;
    if (mood.kick.includes(inBar)) tone(ac, out, t, { freq: 120, to: 42, gain: 0.7, decay: 0.22 });
    if (mood.snare.includes(inBar)) burst(ac, out, t, { type: 'bandpass', freq: mood.bpm > 110 ? 1800 : 2600, q: 0.7, gain: mood.bpm > 110 ? 0.35 : 0.16, decay: mood.bpm > 110 ? 0.16 : 0.09 });
    if (mood.hat.includes(inBar)) burst(ac, out, t, { type: 'highpass', freq: 7000, gain: inBar % 4 === 2 ? 0.14 : 0.07, decay: 0.045 });
    // Bass on the eighths
    if (s % 2 === 0) {
      const n = mood.bass[(s / 2) % mood.bass.length];
      if (n) {
        const osc = ac.createOscillator();
        osc.type = mood.bassType;
        osc.frequency.value = NOTE(n);
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = mood.bassCut;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len * 1.9);
        osc.connect(f).connect(g).connect(out);
        osc.start(t);
        osc.stop(t + len * 2);
      }
    }
    // A soft chord at the start of each bar
    if (inBar === 0) for (const n of mood.chords[bar]) tone(ac, out, t, { type: 'triangle', freq: NOTE(n - 12), gain: 0.035, attack: 0.08, decay: len * 15 });
    // The lead
    for (const [at, n, l] of mood.lead) if (at === s) tone(ac, out, t, { type: mood.bpm > 110 ? 'square' : 'sine', freq: NOTE(n), gain: mood.bpm > 110 ? 0.04 : 0.09, attack: 0.02, decay: len * l * 1.2 });
  }
}

export const crowdMusic = new Music();
