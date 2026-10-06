import { RECORD_SPEED } from '$shared/games.ts';
import { audioContext } from '../../soundboard/player.ts';

/** The record at this speed plays the sound at normal speed */
export const NORMAL_SPEED = RECORD_SPEED;
const LOOP_SEC = 2.4;

/**
 * The sample on the record: a sung "ahh... fresh" made of harmonics shaped by the formants of
 * the vowel, with a few syllables, so moving it back and forth sounds like a DJ scratch.
 */
function sample(rate: number): Float32Array {
  const n = Math.floor(rate * LOOP_SEC);
  const out = new Float32Array(n);
  const formants = [
    [730, 90, 1],
    [1090, 110, 0.5],
    [2440, 160, 0.25],
  ];
  const f0 = 165;
  const harmonics: [number, number][] = [];
  for (let k = 1; k * f0 < 4000; k++) {
    const f = k * f0;
    const amp = formants.reduce((s, [fc, bw, g]) => s + g * Math.exp(-(((f - fc) / bw) ** 2)), 0) + 0.02 / k;
    harmonics.push([f, amp]);
  }
  // Syllables: "ah", "ah", "aaah"
  const syllables = [
    [0.05, 0.35],
    [0.5, 0.8],
    [1.0, 2.2],
  ];
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = syllables.reduce((e, [a, b]) => (t >= a && t <= b ? Math.max(e, Math.min(1, (t - a) / 0.02, (b - t) / 0.08)) : e), 0);
    if (env <= 0) continue;
    const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t);
    let v = 0;
    for (const [f, amp] of harmonics) v += amp * Math.sin(2 * Math.PI * f * vibrato * t);
    out[i] = env * (v * 0.45 + noise() * 0.04);
  }
  return out;
}

/**
 * Plays the record live: the position in the sample follows the record angle, forwards and
 * backwards, like a needle in the groove. Silent while nobody holds the record.
 */
export class Scratcher {
  /** Where the record should be (radians); the sound glides there */
  target = 0;
  touching = false;
  private current = 0;
  private gain = 0;
  private readonly node: ScriptProcessorNode;
  private readonly out: GainNode;

  constructor() {
    const ac = audioContext();
    const buf = sample(ac.sampleRate);
    const perRadian = ac.sampleRate / NORMAL_SPEED;
    // Glide time to the target: smooths the 25 updates a second from the phone
    const follow = 1 - Math.exp(-1 / (0.035 * ac.sampleRate));
    this.out = ac.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(ac.destination);
    // Not an AudioWorklet: the logic is tiny and must reach the record angle every block
    this.node = ac.createScriptProcessor(512, 1, 1);
    this.node.onaudioprocess = (e) => {
      const data = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        this.current += (this.target - this.current) * follow;
        const pos = (((this.current * perRadian) % buf.length) + buf.length) % buf.length;
        const j = Math.floor(pos);
        const frac = pos - j;
        const s = buf[j] * (1 - frac) + buf[(j + 1) % buf.length] * frac;
        data[i] = s * this.gain;
        // The faster the hand, the louder; nothing when the record stands still
        const speed = Math.abs(this.target - this.current) * ac.sampleRate * follow;
        const want = this.touching ? Math.min(1, speed / (NORMAL_SPEED * 0.2)) : 0;
        this.gain += (want - this.gain) * 0.004;
      }
    };
    this.node.connect(this.out);
  }

  stop(): void {
    this.node.disconnect();
    this.node.onaudioprocess = null;
    this.out.disconnect();
  }
}
