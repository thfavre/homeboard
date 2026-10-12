import { RECORD_SPEED } from '../../../shared/games.ts';
import { FRAME_MS } from './engine.ts';

const GOLD: [number, number, number] = [255, 170, 40];

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [180, 120, 255];
}

/**
 * The Perfect Circle record on a light strip: a needle of light runs round the strip at the record's
 * angle, so it follows every scratch back and forth, with a tail behind it. Gold going forwards,
 * the winner's color going backwards, brighter the faster the hand. Left alone it turns slowly.
 */
export class Turntable {
  private angle = 0;
  private offset = 0;
  private touching = false;
  private speed = 0;
  private timer: NodeJS.Timeout;

  constructor(
    private readonly leds: number,
    color: string,
    private readonly send: (rgb: Uint8Array) => void,
  ) {
    const own = rgbOf(color);
    const base = own.map((c) => Math.round(c * 0.06)) as [number, number, number];
    let last = Date.now();
    let before = 0;
    this.timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.max(0.001, (now - last) / 1000);
      last = now;
      if (!this.touching) this.angle += RECORD_SPEED * dt;
      // Smoothed speed (radians a second, signed): 35% of the way every 30th of a second, whatever the frame rate
      this.speed += ((this.angle - before) / dt - this.speed) * (1 - 0.65 ** (dt * 30));
      before = this.angle;
      this.send(this.render(base, own));
    }, FRAME_MS);
  }

  /** A scratch move from the phone (its own angle: kept where it is when a hand lands on it) */
  move(phoneAngle: number, touching: boolean): void {
    if (touching && !this.touching) this.offset = this.angle - phoneAngle;
    if (touching) this.angle = phoneAngle + this.offset;
    this.touching = touching;
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private render(base: [number, number, number], own: [number, number, number]): Uint8Array {
    const n = this.leds;
    const out = new Uint8Array(n * 3);
    const turn = this.angle / (2 * Math.PI);
    const head = (((turn % 1) + 1) % 1) * n;
    const forward = this.speed >= 0;
    const pace = Math.min(4, Math.abs(this.speed) / RECORD_SPEED);
    const color = forward ? GOLD : own;
    const tail = 2 + pace * 5;
    const glow = this.touching ? 0.45 + 0.55 * Math.min(1, pace / 1.5) : 0.35;
    for (let i = 0; i < n; i++) {
      // How far behind the needle, in its direction of travel
      const behind = forward ? (((head - i) % n) + n) % n : (((i - head) % n) + n) % n;
      const k = behind < tail ? (1 - behind / tail) ** 1.6 * glow : 0;
      for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.min(255, Math.round(base[c] * (1 - k) + color[c] * k));
    }
    return out;
  }
}
