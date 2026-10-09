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

export type Rgb = [number, number, number];

export const rgbOf = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
};

/** Colors of a show that fires by itself: warm golds, reds, greens, blues and violets, like real fireworks */
const SHOW_COLORS: Rgb[] = ['#ffb627', '#ff3b30', '#ff2d95', '#34ff6e', '#2f8bff', '#b45cff', '#fff4d6', '#00e5ff'].map(rgbOf);

interface Shot {
  at: number;
  rgb: Rgb;
  /** Where it bursts, 0 (bottom) to 1 (top) */
  height: number;
  /** Each spark: its speed, in strip lengths a second (up > 0, down < 0), and its color */
  sparks: { v: number; rgb: Rgb }[];
}

/**
 * Fireworks on a strip: each shot climbs from the bottom and bursts into a small firework at a random
 * height, the sparks falling back as they fade. Used for the Rhythm Rain winner's prize (every key they
 * tap shoots a note of its color, the bottom glowing in their color between shots) and as a light effect
 * that fires by itself, each light with its own show.
 */
export class Fireworks {
  private shots: Shot[] = [];
  private timer: NodeJS.Timeout;
  private next = 0;

  constructor(
    private readonly leds: number,
    /** Glow at the bottom between shots (null: none) */
    private readonly own: Rgb | null,
    private readonly reverse: boolean,
    private readonly send: (rgb: Uint8Array) => void,
    /** Fires by itself, in random colors */
    private readonly show = false,
  ) {
    this.timer = setInterval(() => {
      const now = Date.now();
      if (this.show && now >= this.next) this.fire(now);
      this.send(this.render(now));
    }, 1000 / FPS);
  }

  shoot(rgb: Rgb, rgb2 = rgb): void {
    if (this.shots.length >= MAX_SHOTS) this.shots.shift();
    const sparks = Array.from({ length: SPARKS }, (_, i) => ({ v: (i % 2 ? 1 : -1) * (0.03 + Math.random() * 0.09), rgb: i % 3 === 2 ? rgb2 : rgb }));
    this.shots.push({ at: Date.now(), rgb, height: 0.5 + Math.random() * 0.42, sparks });
  }

  /** The show's next shot, sometimes a salvo; long strips fire more often, so they are as busy */
  private fire(now: number): void {
    const pick = () => SHOW_COLORS[Math.floor(Math.random() * SHOW_COLORS.length)];
    const salvo = Math.random() < 0.15 ? 3 : 1;
    for (let i = 0; i < salvo; i++) {
      const rgb = pick();
      this.shoot(rgb, Math.random() < 0.4 ? pick() : rgb);
    }
    const busy = Math.min(3, Math.max(1, this.leds / 120));
    this.next = now + (salvo > 1 ? 1600 : 350 + Math.random() * 1100) / busy;
  }

  /** `blank`: a last dark frame */
  stop(blank = true): void {
    clearInterval(this.timer);
    if (blank) this.send(new Uint8Array(this.leds * 3));
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
    if (this.own) for (let i = 0; i < Math.min(n, 6 * u); i++) add(i, this.own, (0.06 + 0.05 * breath) * (1 - i / (6 * u)));

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
      for (const { v, rgb } of s.sparks) {
        // Gravity pulls every spark back down a little
        const pos = top + (v * sec - GRAVITY * sec * sec) * n;
        const k = (1 - b) ** 1.5 * (Math.random() < 0.15 ? 0.4 : 1);
        dot(pos, rgb, 0.8 * k, 0.6 * u);
        // A show's dying sparks crackle white
        if (this.show && b > 0.55 && Math.random() < 0.12) dot(pos, [255, 240, 210], 0.5 * (1 - b), 0.4 * u);
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
