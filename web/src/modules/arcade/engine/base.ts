import Phaser from 'phaser';
import { arcadeRandom, type ArcadeGameId } from '$shared/arcade.ts';
import { buzz, play, type SoundId } from './sfx.ts';

/** Every game is laid out on this portrait board; the phone shows it as big as it fits */
export const W = 400;
export const H = 720;
/** The canvas is drawn this many device pixels per board unit, so it stays sharp on a phone */
export const R = Math.min(3, Math.max(1, Math.round((window.devicePixelRatio || 1) * 4) / 4));
/** The scale that shows a texture painted at R (see paint) at its board size */
export const K = 1 / R;

export interface RunOptions {
  game: ArcadeGameId;
  seed: number;
  /** The run's length (the most it lasts for a game of one life) */
  seconds: number;
  oneLife: boolean;
  onScore(score: number): void;
  /** The run is over: a mistake ('out') or the time is up */
  onOver(score: number, why: 'out' | 'time'): void;
  /** Time left (ms), a few times a second */
  onTime(left: number): void;
}

export const FONT = (() => {
  const css = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
  return css || 'system-ui, sans-serif';
})();

/** A hex color as a number for Phaser (#ff8800 -> 0xff8800) */
export const hex = (c: string) => parseInt(c.replace('#', ''), 16);

/**
 * What every Arcade game shares: the seeded random numbers (both phones draw the same), the clock
 * of the run, the score sent to the phone's screen, and the juice (pop-up texts, bursts, shakes,
 * flashes, sounds, vibration).
 *
 * A game draws in board units (W x H). It builds its world in `build`, which shows before the
 * countdown ends, and moves it in `tick` once the run has started (`begin`). It calls `addScore`
 * and `out()`; the run also ends by itself when the time is up.
 */
export abstract class ArcadeScene extends Phaser.Scene {
  opts!: RunOptions;
  rand: () => number = Math.random;
  score = 0;
  /** Between the end of the countdown and the end of the run */
  running = false;
  ended = false;
  /** Time played (ms), and time taken off by mistakes (Quick Maths) */
  played = 0;
  penalty = 0;
  private told = 0;

  init(opts: RunOptions): void {
    this.opts = opts;
    this.rand = arcadeRandom(opts.seed);
    this.score = 0;
    this.running = false;
    this.ended = false;
    this.played = 0;
    this.penalty = 0;
  }

  create(): void {
    const cam = this.cameras.main;
    cam.setZoom(R);
    cam.centerOn(W / 2, H / 2);
    this.paint('dot', 16, 16, (g) => {
      const r = g.createRadialGradient(8, 8, 0, 8, 8, 8);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 16, 16);
    });
    this.paint('chip', 6, 6, (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 6, 6);
    });
    this.build();
    this.opts.onTime(this.left());
  }

  /** The board as it is before the start */
  abstract build(): void;
  /** One frame of the run (dt in seconds) */
  abstract tick(dt: number): void;
  /** Before the start, and after the end: things that move anyway (a bird hovering, clouds) */
  idle(_dt: number): void {}
  /** The run has started */
  started(): void {}
  /** The run is over (out or time up): the game shows it */
  finished(_why: 'out' | 'time'): void {}

  /** The countdown is over */
  begin(): void {
    if (this.running || this.ended) return;
    this.running = true;
    this.started();
  }

  left(): number {
    return Math.max(0, this.opts.seconds * 1000 - this.played - this.penalty);
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    if (!this.running) {
      this.idle(dt);
      return;
    }
    this.played += delta;
    const left = this.left();
    if (this.played - this.told > 100 || left <= 0) {
      this.told = this.played;
      this.opts.onTime(left);
    }
    if (left <= 0) {
      this.stop('time');
      return;
    }
    this.tick(dt);
  }

  addScore(n = 1): void {
    if (!this.running) return;
    this.score = Math.max(0, this.score + n);
    this.opts.onScore(this.score);
  }

  /** A mistake that ends the run */
  out(): void {
    this.stop('out');
  }

  private stop(why: 'out' | 'time'): void {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    this.opts.onTime(this.left());
    this.opts.onOver(this.score, why);
    this.finished(why);
  }

  // ------------------------------------------------------------ art

  /**
   * A texture painted with the canvas API at R pixels per unit (w x h units). Show it with `art`,
   * which scales it back to its size.
   */
  paint(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    const t = this.textures.createCanvas(key, Math.ceil(w * R), Math.ceil(h * R))!;
    const g = t.getContext();
    g.scale(R, R);
    draw(g);
    t.refresh();
  }

  /** An image of a painted texture at its size (its scale is K: tween from there) */
  art(x: number, y: number, key: string): Phaser.GameObjects.Image {
    return this.add.image(x, y, key).setScale(K);
  }

  text(x: number, y: number, s: string, size: number, color = '#ffffff', weight = 800): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: String(weight), color, resolution: R, align: 'center' })
      .setOrigin(0.5);
  }

  /** A full-board background: a vertical gradient (follows the camera when it moves) */
  backdrop(key: string, top: string, bottom: string): Phaser.GameObjects.Image {
    this.paint(key, W, H, (g) => {
      const l = g.createLinearGradient(0, 0, 0, H);
      l.addColorStop(0, top);
      l.addColorStop(1, bottom);
      g.fillStyle = l;
      g.fillRect(0, 0, W, H);
    });
    return this.art(W / 2, H / 2, key).setDepth(-100);
  }

  /** The board point under a pointer */
  at(p: Phaser.Input.Pointer): { x: number; y: number } {
    const v = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: v.x, y: v.y };
  }

  // ------------------------------------------------------------ juice

  /** A text that pops up and floats away (+1, PERFECT...) */
  pop(x: number, y: number, s: string, color = '#ffffff', size = 34): void {
    const t = this.text(x, y, s, size, color, 900).setStroke('#00000066', 6).setDepth(50).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.Out' });
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, delay: 260, duration: 520, ease: 'Cubic.In', onComplete: () => t.destroy() });
  }

  /** Bits flying out of a point */
  burst(x: number, y: number, color: string | number, count = 14, speed = 260, key: 'dot' | 'chip' = 'dot', gravity = 500): void {
    const e = this.add.particles(x, y, key, {
      speed: { min: speed * 0.4, max: speed },
      angle: { min: 0, max: 360 },
      lifespan: { min: 350, max: 750 },
      scale: { start: K * (key === 'dot' ? 1.1 : 1.4), end: 0 },
      rotate: key === 'chip' ? { min: 0, max: 360 } : 0,
      gravityY: gravity,
      tint: typeof color === 'string' ? hex(color) : color,
      emitting: false,
    });
    e.setDepth(40);
    e.explode(count);
    this.time.delayedCall(900, () => e.destroy());
  }

  shake(ms = 180, strength = 0.012): void {
    this.cameras.main.shake(ms, strength);
  }

  flash(color = '#ffffff', ms = 160): void {
    const c = Phaser.Display.Color.HexStringToColor(color);
    this.cameras.main.flash(ms, c.red, c.green, c.blue);
  }

  sfx(id: SoundId, volume = 1): void {
    play(id, volume);
  }

  buzz(pattern: number | number[]): void {
    buzz(pattern);
  }
}
