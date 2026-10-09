import { RHYTHM_COLORS, type RhythmColor } from '../../../shared/games.ts';

const FPS = 60;
/** A shot climbs to its height in this long, slowing down near the top */
const CLIMB_MS = 750;
/** Then it bursts: a flash, and sparks that fly out and fall back, fading */
const BURST_MS = 1300;
const SPARKS = 7;
/** Pull on the sparks, in strip lengths a second squared */
const GRAVITY = 0.07;
/** Shots kept at once (a fast thumb cannot fill the strip with more) */
const MAX_SHOTS = 24;

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
};
const LED = Object.fromEntries(RHYTHM_COLORS.map((c) => [c.id, rgbOf(c.led)])) as Record<RhythmColor, [number, number, number]>;

interface Shot {
  at: number;
  rgb: [number, number, number];
  /** Where it bursts, 0 (bottom) to 1 (top) */
  height: number;
  /** Each spark: its speed, in strip lengths a second (up > 0, down < 0) */
  sparks: number[];
}

/**
 * The Rhythm Rain winner's prize on the game's strip: every key they tap shoots a note of its color up
 * from the bottom; it bursts into a small firework at a random height, the sparks falling back as they fade.
 * Between shots the bottom of the strip glows in the winner's color.
 */
export class Fireworks {
  private shots: Shot[] = [];
  private timer: NodeJS.Timeout;
  private readonly own: [number, number, number];

  constructor(
    private readonly leds: number,
    color: string,
    private readonly reverse: boolean,
    private readonly send: (rgb: Uint8Array) => void,
  ) {
    this.own = rgbOf(color);
    this.timer = setInterval(() => this.send(this.render(Date.now())), 1000 / FPS);
  }

  shoot(color: RhythmColor): void {
    const rgb = LED[color];
    if (!rgb) return;
    if (this.shots.length >= MAX_SHOTS) this.shots.shift();
    const sparks = Array.from({ length: SPARKS }, (_, i) => (i % 2 ? 1 : -1) * (0.03 + Math.random() * 0.09));
    this.shots.push({ at: Date.now(), rgb, height: 0.5 + Math.random() * 0.42, sparks });
  }

  stop(): void {
    clearInterval(this.timer);
    this.send(new Uint8Array(this.leds * 3));
  }

  private render(now: number): Uint8Array {
    const n = this.leds;
    // Effects are drawn for a 60 pixel strip and scaled: a dense strip shows them as big, only smoother
    const u = Math.max(1, n / 60);
    const px = new Float32Array(n * 3);
    const add = (i: number, rgb: readonly number[], k: number) => {
      if (i < 0 || i >= n || k <= 0) return;
      for (let c = 0; c < 3; c++) px[i * 3 + c] += rgb[c] * k;
    };
    // A dot of light at a position between pixels, shared by the two pixels it covers
    const dot = (pos: number, rgb: readonly number[], k: number, width = 1) => {
      for (let i = Math.floor(pos - width); i <= Math.ceil(pos + width); i++) add(i, rgb, k * Math.max(0, 1 - Math.abs(i + 0.5 - pos) / width));
    };

    // The winner's glow at the bottom, breathing slowly
    const breath = 0.5 + 0.5 * Math.sin(now / 900);
    for (let i = 0; i < Math.min(n, 6 * u); i++) add(i, this.own, (0.06 + 0.05 * breath) * (1 - i / (6 * u)));

    this.shots = this.shots.filter((s) => now - s.at < CLIMB_MS + BURST_MS);
    for (const s of this.shots) {
      const t = now - s.at;
      const top = s.height * (n - 1);
      if (t < CLIMB_MS) {
        // Climbing, slowing near the top, with a short trail of embers
        const p = t / CLIMB_MS;
        const pos = top * (1 - (1 - p) ** 2);
        const speed = 2 * (1 - p);
        dot(pos, s.rgb, 1, 0.8 * u);
        dot(pos, [255, 255, 255], 0.35, 0.4 * u);
        const trail = (2 + 8 * speed) * u;
        for (let d = 1; d < trail; d++) add(Math.round(pos - d), s.rgb, 0.35 * (1 - d / trail) * (Math.random() < 0.8 ? 1 : 0.3));
        continue;
      }
      // Burst: a white flash, then sparks flying out, slowing and falling back as they fade
      const b = (t - CLIMB_MS) / BURST_MS;
      const flash = Math.max(0, 1 - b * 6);
      dot(top, [255, 255, 255], flash, 2 * u);
      dot(top, s.rgb, flash, 3 * u);
      const sec = (t - CLIMB_MS) / 1000;
      for (const v of s.sparks) {
        // Gravity pulls every spark back down a little
        const pos = top + (v * sec - GRAVITY * sec * sec) * n;
        const k = (1 - b) ** 1.5 * (Math.random() < 0.15 ? 0.4 : 1);
        dot(pos, s.rgb, 0.8 * k, 0.6 * u);
      }
    }

    const out = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = (this.reverse ? n - 1 - i : i) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = Math.min(255, Math.round(px[i * 3 + c]));
    }
    return out;
  }
}
