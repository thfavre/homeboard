/**
 * Built-in sound effects, generated with WebAudio (no audio files needed).
 * Each function schedules its sound on `out` starting at `t` and returns its length in seconds.
 */

type Synth = (ctx: AudioContext, out: AudioNode, t: number) => number;

let noiseBuffer: AudioBuffer | null = null;

function noise(ctx: AudioContext): AudioBufferSourceNode {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  return src;
}

function env(ctx: AudioContext, out: AudioNode, t: number, attack: number, hold: number, release: number, peak = 1): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  g.connect(out);
  return g;
}

function tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, peak = 0.3, attack = 0.005): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.connect(env(ctx, out, t, attack, Math.max(0, dur - attack - 0.05), 0.05 + dur * 0.2, peak));
  o.start(t);
  o.stop(t + dur * 1.3 + 0.1);
  return o;
}

function hit(ctx: AudioContext, out: AudioNode, t: number, from: number, to: number, dur: number, peak = 0.8) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  o.connect(env(ctx, out, t, 0.002, 0.01, dur, peak));
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noiseBurst(ctx: AudioContext, out: AudioNode, t: number, dur: number, filter: BiquadFilterType, freq: number, peak = 0.4, q = 1) {
  const n = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  n.connect(f);
  f.connect(env(ctx, out, t, 0.002, 0.005, dur, peak));
  n.start(t, Math.random());
  n.stop(t + dur + 0.05);
}

const airhorn: Synth = (ctx, out, t) => {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  lp.connect(out);
  const blasts: [number, number][] = [
    [0, 0.22],
    [0.3, 0.14],
    [0.5, 0.9],
  ];
  for (const [start, dur] of blasts) {
    for (const [f, detune] of [
      [466, 0],
      [470, 8],
      [932, -6],
      [698, 4],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.92, t + start);
      o.frequency.exponentialRampToValueAtTime(f, t + start + 0.06);
      o.detune.value = detune;
      o.connect(env(ctx, lp, t + start, 0.02, dur, 0.08, 0.12));
      o.start(t + start);
      o.stop(t + start + dur + 0.2);
    }
  }
  return 1.6;
};

const tada: Synth = (ctx, out, t) => {
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((f, i) => tone(ctx, out, 'triangle', f, t + i * 0.09, 0.18, 0.25));
  for (const f of [1046.5, 1318.5, 1568, 523.25]) {
    const o = tone(ctx, out, 'triangle', f, t + 0.3, 1.1, 0.16, 0.01);
    o.frequency.setValueAtTime(f, t + 0.3);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = f * 0.006;
    lfo.connect(depth);
    depth.connect(o.frequency);
    lfo.start(t + 0.3);
    lfo.stop(t + 1.8);
  }
  return 1.8;
};

const drumroll: Synth = (ctx, out, t) => {
  const len = 1.8;
  for (let x = 0; x < len; x += 0.045) {
    const peak = 0.08 + (x / len) * 0.35;
    noiseBurst(ctx, out, t + x, 0.05, 'bandpass', 1800, peak, 0.8);
    hit(ctx, out, t + x, 220, 160, 0.05, peak * 0.4);
  }
  // Crash
  noiseBurst(ctx, out, t + len, 1.6, 'highpass', 5000, 0.5);
  hit(ctx, out, t + len, 120, 50, 0.4, 0.9);
  return len + 1.8;
};

const applause: Synth = (ctx, out, t) => {
  const len = 3;
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * len;
    const swell = Math.sin((x / len) * Math.PI);
    noiseBurst(ctx, out, t + x, 0.03 + Math.random() * 0.03, 'bandpass', 900 + Math.random() * 2200, 0.05 + swell * 0.2, 1.5);
  }
  return len + 0.2;
};

const rimshot: Synth = (ctx, out, t) => {
  hit(ctx, out, t, 180, 90, 0.18, 0.9);
  hit(ctx, out, t + 0.2, 140, 70, 0.22, 0.9);
  noiseBurst(ctx, out, t + 0.42, 1.2, 'highpass', 7000, 0.45);
  hit(ctx, out, t + 0.42, 80, 45, 0.3, 0.8);
  return 1.8;
};

const buzzer: Synth = (ctx, out, t) => {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1200;
  lp.connect(out);
  tone(ctx, lp, 'square', 110, t, 0.9, 0.18);
  tone(ctx, lp, 'square', 116, t, 0.9, 0.18);
  return 1.1;
};

const chime: Synth = (ctx, out, t) => {
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(env(ctx, out, t + i * 0.14, 0.004, 0.02, 1.4, 0.25));
    o.start(t + i * 0.14);
    o.stop(t + i * 0.14 + 1.6);
  });
  return 2.2;
};

const laser: Synth = (ctx, out, t) => {
  for (let i = 0; i < 3; i++) {
    const s = t + i * 0.22;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(2200, s);
    o.frequency.exponentialRampToValueAtTime(180, s + 0.2);
    o.connect(env(ctx, out, s, 0.003, 0.05, 0.15, 0.18));
    o.start(s);
    o.stop(s + 0.3);
  }
  return 0.8;
};

const bassdrop: Synth = (ctx, out, t) => {
  // Riser
  const n = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 2;
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(8000, t + 1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.02, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 1.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
  n.connect(f);
  f.connect(g);
  g.connect(out);
  n.start(t);
  n.stop(t + 1.5);
  // Drop
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t + 1.45);
  o.frequency.exponentialRampToValueAtTime(32, t + 2.6);
  o.connect(env(ctx, out, t + 1.45, 0.005, 0.6, 0.8, 1));
  o.start(t + 1.45);
  o.stop(t + 3);
  return 3;
};

const crickets: Synth = (ctx, out, t) => {
  for (let chirp = 0; chirp < 6; chirp++) {
    const s = t + chirp * 0.45 + Math.random() * 0.05;
    for (let p = 0; p < 3; p++) tone(ctx, out, 'sine', 4400 + Math.random() * 200, s + p * 0.045, 0.03, 0.08, 0.002);
  }
  return 3;
};

export const SYNTHS: Record<string, Synth> = { airhorn, tada, drumroll, applause, rimshot, buzzer, chime, laser, bassdrop, crickets };
