import type { PirateSoundId } from '$shared/games.ts';
import { audioContext } from '../../soundboard/player.ts';

/**
 * Pirate Race sounds. Each one is made on the fly (no file to load, timed to the millisecond with the
 * audio clock), unless the host picked a MyInstants sound for it: then that file is decoded once and
 * played the same way. `when`: audio clock time to play it at (default: now).
 */
const buffers = new Map<string, Promise<AudioBuffer | null>>();

export function loadPirateSound(url: string): Promise<AudioBuffer | null> {
  let job = buffers.get(url);
  if (!job) {
    job = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => audioContext().decodeAudioData(data))
      .catch(() => null);
    buffers.set(url, job);
  }
  return job;
}

/** A decoded file, or null while it loads (or when it cannot be) */
const ready = new Map<string, AudioBuffer | null>();
function bufferNow(url: string): AudioBuffer | null {
  if (!ready.has(url)) {
    ready.set(url, null);
    void loadPirateSound(url).then((b) => ready.set(url, b));
  }
  return ready.get(url) ?? null;
}

export interface PirateSoundOptions {
  /** A picked file instead of the built-in sound */
  url?: string | null;
  when?: number;
  volume?: number;
  /** Drum: a count-in beat (a little brighter) */
  accent?: boolean;
  /** Longest a picked file plays (seconds) */
  maxSec?: number;
}

export function pirateSound(kind: PirateSoundId, o: PirateSoundOptions = {}): void {
  const ac = audioContext();
  if (ac.state !== 'running') void ac.resume().catch(() => {});
  const t = Math.max(ac.currentTime + 0.005, o.when ?? 0);
  const out = ac.createGain();
  out.gain.value = o.volume ?? 0.8;
  out.connect(ac.destination);
  const file = o.url ? bufferNow(o.url) : null;
  if (file) {
    const src = ac.createBufferSource();
    src.buffer = file;
    src.connect(out);
    src.start(t);
    const max = o.maxSec ?? (kind === 'drum' || kind === 'oar' ? 1.2 : 6);
    if (file.duration > max) {
      out.gain.setValueAtTime(out.gain.value, t + max - 0.15);
      out.gain.linearRampToValueAtTime(0.0001, t + max);
      src.stop(t + max + 0.02);
    }
    src.onended = () => out.disconnect();
    return;
  }
  BUILT_IN[kind](ac, out, t, !!o.accent);
  setTimeout(() => out.disconnect(), (t - ac.currentTime + 3) * 1000);
}

// ------------------------------------------------------------ built-in sounds

type Synth = (ac: AudioContext, out: AudioNode, t: number, accent: boolean) => void;

let noiseBuffer: AudioBuffer | null = null;
function noise(ac: AudioContext): AudioBufferSourceNode {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

const env = (ac: AudioContext, t: number, attack: number, peak: number, decay: number) => {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
};

const tone = (ac: AudioContext, out: AudioNode, type: OscillatorType, hz: number, t: number, attack: number, peak: number, decay: number, slideTo?: number) => {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + attack + decay);
  const g = env(ac, t, attack, peak, decay);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
  return osc;
};

const burst = (ac: AudioContext, out: AudioNode, t: number, filter: BiquadFilterType, hz: number, q: number, attack: number, peak: number, decay: number, sweepTo?: number) => {
  const src = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(hz, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
  f.Q.value = q;
  const g = env(ac, t, attack, peak, decay);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + attack + decay + 0.05);
};

const BUILT_IN: Record<PirateSoundId, Synth> = {
  /** A big war drum: a deep skin that drops in pitch, the thud of the mallet, and the boom of the barrel */
  drum(ac, out, t, accent) {
    tone(ac, out, 'sine', accent ? 120 : 98, t, 0.004, 1, 0.55, 46);
    tone(ac, out, 'sine', 58, t, 0.006, 0.7, 0.75, 38);
    tone(ac, out, 'triangle', accent ? 240 : 190, t, 0.002, 0.35, 0.09, 90);
    burst(ac, out, t, 'lowpass', 900, 0.8, 0.002, accent ? 0.55 : 0.4, 0.08, 200);
    burst(ac, out, t, 'bandpass', 160, 1.5, 0.01, 0.35, 0.4);
  },
  /** The oar going in: a wooden knock, then water splashing off the blade */
  oar(ac, out, t) {
    tone(ac, out, 'triangle', 210, t, 0.002, 0.3, 0.06, 120);
    burst(ac, out, t + 0.02, 'bandpass', 2600, 0.9, 0.012, 0.55, 0.32, 700);
    burst(ac, out, t + 0.05, 'highpass', 4000, 0.7, 0.02, 0.18, 0.25);
  },
  /** The crew roars as the race starts: a crowd of low voices sliding up, over a crash */
  roar(ac, out, t) {
    const voices = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1400, t + 0.35);
    lp.frequency.linearRampToValueAtTime(600, t + 1.4);
    voices.connect(lp).connect(out);
    for (const hz of [92, 104, 118, 131, 147, 163]) {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      const f = hz * (0.97 + Math.random() * 0.06);
      osc.frequency.setValueAtTime(f * 0.8, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, t + 0.3);
      osc.frequency.exponentialRampToValueAtTime(f * 0.92, t + 1.4);
      // A shaky voice
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      lfo.frequency.value = 5 + Math.random() * 3;
      depth.gain.value = f * 0.03;
      lfo.connect(depth).connect(osc.frequency);
      const g = env(ac, t + Math.random() * 0.06, 0.12, 0.13, 1.3);
      osc.connect(g).connect(voices);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 1.6);
      lfo.stop(t + 1.6);
    }
    burst(ac, out, t, 'bandpass', 700, 0.6, 0.15, 0.22, 1.2);
    burst(ac, out, t, 'highpass', 5000, 0.5, 0.003, 0.4, 1.4);
    tone(ac, out, 'sine', 70, t, 0.005, 0.8, 0.6, 40);
  },
  /** Speed boost: a whoosh rising fast, with a shimmer on top */
  boost(ac, out, t) {
    burst(ac, out, t, 'bandpass', 300, 2, 0.25, 0.7, 0.45, 5000);
    tone(ac, out, 'sawtooth', 220, t, 0.05, 0.12, 0.6, 1400);
    tone(ac, out, 'square', 440, t + 0.12, 0.03, 0.06, 0.5, 2200);
    for (let i = 0; i < 4; i++) tone(ac, out, 'sine', 1568 * 2 ** (i / 4), t + 0.25 + i * 0.06, 0.005, 0.18, 0.25);
  },
  /** The treasure: a brass fanfare up to a held chord, gold coins sparkling */
  finish(ac, out, t) {
    const brass = ac.createBiquadFilter();
    brass.type = 'lowpass';
    brass.frequency.value = 2200;
    brass.connect(out);
    const notes: [number, number, number][] = [
      [392, 0, 0.16],
      [523.25, 0.18, 0.16],
      [659.25, 0.36, 0.16],
      [783.99, 0.54, 1.4],
    ];
    for (const [hz, at, len] of notes) {
      tone(ac, brass, 'sawtooth', hz, t + at, 0.03, 0.22, len);
      tone(ac, brass, 'square', hz / 2, t + at, 0.03, 0.08, len);
    }
    // The held chord under the last note
    for (const hz of [523.25, 659.25, 1046.5]) tone(ac, brass, 'sawtooth', hz, t + 0.54, 0.05, 0.1, 1.4);
    tone(ac, out, 'sine', 65, t + 0.54, 0.005, 0.8, 0.8, 40);
    burst(ac, out, t + 0.54, 'highpass', 6000, 0.5, 0.003, 0.35, 1.3);
    for (let i = 0; i < 9; i++) tone(ac, out, 'sine', 2093 + Math.random() * 1500, t + 0.6 + i * 0.09, 0.003, 0.12, 0.18);
  },
};
