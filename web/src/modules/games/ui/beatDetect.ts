/**
 * Finds the beats of a song in the browser, from the decoded audio. An onset curve (how fast the loudness
 * rises, every 10 ms) gives the main tempo by autocorrelation. Then two answers are compared: a steady
 * grid (a song made to a click: the beats stay exact for minutes), and a beat tracker (dynamic programming,
 * as in Ellis 2007) that follows singers who slow down or hurry. The grid is kept when it fits about as
 * well, since it has no jitter at all.
 */

const HOP = 0.01;

/** How much the loudness rises in each 10 ms frame (the beats are where it jumps) */
function onsets(buffer: AudioBuffer): Float32Array {
  const rate = buffer.sampleRate;
  const hop = Math.round(rate * HOP);
  const frames = Math.floor(buffer.length / hop);
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      let x = 0;
      for (const ch of chans) x += ch[i];
      sum += x * x;
    }
    energy[f] = Math.log(1e-6 + sum / hop);
  }
  const raw = new Float32Array(frames);
  for (let f = 1; f < frames; f++) raw[f] = Math.max(0, energy[f] - energy[f - 1]);
  // Take away the slow trend, so loud parts do not outweigh quiet ones, then scale to unit spread
  const out = new Float32Array(frames);
  const win = 50;
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += raw[f];
    if (f >= win) acc -= raw[f - win];
    out[f] = Math.max(0, raw[f] - acc / Math.min(f + 1, win));
  }
  let sq = 0;
  for (const v of out) sq += v * v;
  const sd = Math.sqrt(sq / Math.max(1, frames)) || 1;
  for (let f = 0; f < frames; f++) out[f] /= sd;
  return out;
}

/** The onset curve read between two frames */
const at = (env: Float32Array, x: number) => {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= env.length) return 0;
  const k = x - i;
  return env[i] * (1 - k) + env[i + 1] * k;
};
/** The strongest onset within a frame of x */
const near = (env: Float32Array, x: number) => Math.max(at(env, x - 1), at(env, x), at(env, x + 1));

/** The main tempo, between 70 and 150 beats a minute (in frames per beat) */
function mainPeriod(env: Float32Array): number {
  let best = { period: 60, r: -1 };
  for (let bpm = 70; bpm <= 150; bpm += 0.25) {
    const l = 60 / bpm / HOP;
    let r = 0;
    for (let f = 0; f + 2 * l + 1 < env.length; f++) r += env[f] * (at(env, f + l) + 0.5 * at(env, f + 2 * l));
    if (r > best.r) best = { period: l, r };
  }
  return best.period;
}

/** A steady grid: the tempo near `period` and the phase whose beats line up best over the whole song */
function grid(env: Float32Array, period: number): number[] {
  const fit = (p: number, phase: number) => {
    let s = 0;
    for (let x = phase; x < env.length - 1; x += p) s += near(env, x);
    return s;
  };
  let best = { p: period, phase: 0, s: -1 };
  for (let p = period * 0.99; p <= period * 1.01; p += period * 0.0005) {
    for (let phase = 0; phase < p; phase += 0.5) {
      const s = fit(p, phase);
      if (s > best.s) best = { p, phase, s };
    }
  }
  const out: number[] = [];
  for (let x = best.phase; x < env.length - 1; x += best.p) out.push(x);
  return out;
}

/** The beats: each one on an onset, each gap close to the main tempo (`tight`: how strictly) */
function track(env: Float32Array, period: number, tight: number): number[] {
  const n = env.length;
  const score = new Float32Array(n);
  const from = new Int32Array(n).fill(-1);
  const lo = Math.round(period * 0.5);
  const hi = Math.round(period * 2);
  for (let t = 0; t < n; t++) {
    let best = 0;
    let arg = -1;
    for (let p = t - hi; p <= t - lo; p++) {
      if (p < 0) continue;
      const d = Math.log((t - p) / period);
      const s = score[p] - tight * d * d;
      if (arg < 0 || s > best) {
        best = s;
        arg = p;
      }
    }
    score[t] = env[t] + (arg >= 0 ? Math.max(0, best) : 0);
    from[t] = arg >= 0 && best > 0 ? arg : -1;
  }
  let end = n - 1;
  for (let t = Math.max(0, n - Math.round(period)); t < n; t++) if (score[t] > score[end]) end = t;
  const beats: number[] = [];
  for (let t = end; t >= 0; t = from[t]) beats.push(t);
  return beats.reverse();
}

/** How clearly beats sit on onsets: onsets on the beats against onsets halfway between them */
function clarity(env: Float32Array, frames: number[]): number {
  let on = 0;
  let off = 0;
  for (let i = 0; i + 1 < frames.length; i++) {
    on += near(env, frames[i]);
    off += near(env, (frames[i] + frames[i + 1]) / 2);
  }
  return on / Math.max(off, 1e-9);
}

export interface BeatMap {
  /** Times of the beats in the file, seconds, from the first beat once the singing has started */
  beats: number[];
  /** The main tempo, beats a minute */
  bpm: number;
  /** Whether the song keeps a steady tempo (made to a click) */
  steady: boolean;
}

export function detectBeats(buffer: AudioBuffer): BeatMap {
  const env = onsets(buffer);
  const period = mainPeriod(env);
  const steadyFrames = grid(env, period);
  const tracked = track(env, period, 400);
  const steady = clarity(env, steadyFrames) >= 0.85 * clarity(env, tracked);
  let frames = steady ? steadyFrames : tracked;
  // Leave out the beats before the song starts (the first onset of some strength)
  let max = 0;
  for (const v of env) max = Math.max(max, v);
  let start = 0;
  while (start < env.length && env[start] < max * 0.25) start++;
  frames = frames.filter((f) => f >= start - 3);
  const beats = frames.map((f) => Math.round(f * HOP * 1000) / 1000);
  const gaps = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)] || period * HOP;
  return { beats, bpm: Math.round((60 / median) * 10) / 10, steady };
}
