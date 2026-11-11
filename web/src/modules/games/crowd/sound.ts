import { audioContext } from '../../soundboard/player.ts';

/**
 * Sounds of Crowd Race and Spy Hunt, made on the fly with Web Audio: nothing to load, nothing to license.
 * The volume is the host's setting (0 to 100, 0: off). The music is Spotify's, at the volume the host picked.
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
