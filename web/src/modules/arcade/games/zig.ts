import Phaser from 'phaser';
import { ArcadeScene, H, K, W } from '../engine/base.ts';

/** A tile's top (a diamond) and how thick the block is */
const TW = 56;
const TH = 32;
const DEPTH = 20;
/** Where the ball sits on the screen: low, the path climbs ahead of it */
const BALL_ON_SCREEN = 520;

interface Tile {
  img: Phaser.GameObjects.Image;
  seg: number;
  /** Its place along the path */
  n: number;
}

const key = (i: number, j: number) => `${i},${j}`;

/**
 * Zig: a ball runs along a zigzag path of blocks that climbs up the screen; a tap turns it the
 * other way. Turn too early or too late and it rolls off the path and falls. Each corner turned is
 * a point, and the ball speeds up. The path is drawn from the seed: the same for both players.
 */
export class ZigScene extends ArcadeScene {
  private tiles = new Map<string, Tile>();
  /** The path being laid ahead: its last tile, its direction, tiles left in this stretch */
  private end = { i: 0, j: 0, dir: 0, left: 5, seg: 0, n: 0 };
  /** The ball in path coordinates (i: up right, j: up left) and its direction (0: i, 1: j) */
  private u = 0;
  private v = 0;
  private dir = 0;
  private seg = 0;
  private ball!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private bg!: Phaser.GameObjects.Image;
  private hue = 0;
  private cam = { x: W / 2, y: H / 2 };
  private falling = false;
  private bob = 0;

  build(): void {
    this.bg = this.backdrop('zig-bg', '#2a0f45', '#0d0618');
    this.hue = this.rand();
    // One block, lit from the top left: the top light, the left face mid, the right face dark (tinted per stretch)
    this.paint('ztile', TW, TH + DEPTH, (g) => {
      g.fillStyle = '#9a9a9a';
      g.beginPath();
      g.moveTo(0, TH / 2);
      g.lineTo(TW / 2, TH);
      g.lineTo(TW / 2, TH + DEPTH);
      g.lineTo(0, TH / 2 + DEPTH);
      g.closePath();
      g.fill();
      g.fillStyle = '#6a6a6a';
      g.beginPath();
      g.moveTo(TW, TH / 2);
      g.lineTo(TW / 2, TH);
      g.lineTo(TW / 2, TH + DEPTH);
      g.lineTo(TW, TH / 2 + DEPTH);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(TW / 2, 0);
      g.lineTo(TW, TH / 2);
      g.lineTo(TW / 2, TH);
      g.lineTo(0, TH / 2);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 1;
      g.stroke();
    });
    this.paint('zball', 26, 26, (g) => {
      const r = g.createRadialGradient(9, 8, 2, 13, 13, 13);
      r.addColorStop(0, '#ffffff');
      r.addColorStop(0.4, '#ffe9f6');
      r.addColorStop(1, '#ff4fa3');
      g.fillStyle = r;
      g.beginPath();
      g.arc(13, 13, 12, 0, Math.PI * 2);
      g.fill();
    });
    this.lay(48);
    this.shadow = this.add.ellipse(0, 0, 22, 10, 0x000000, 0.3).setDepth(9);
    this.ball = this.art(0, 0, 'zball').setDepth(10);
    this.place();
    const p = this.screen(0, 0);
    this.cam = { x: p.x, y: p.y - (BALL_ON_SCREEN - H / 2) };
    this.cameras.main.centerOn(this.cam.x, this.cam.y);
  }

  /** Screen position of a point of the path (the middle of a tile's top) */
  private screen(i: number, j: number): { x: number; y: number } {
    return { x: (i - j) * (TW / 2), y: -(i + j) * (TH / 2) };
  }

  private color(seg: number): number {
    const c = Phaser.Display.Color.HSVToRGB((this.hue + Math.floor(seg / 8) * 0.13) % 1, 0.6, 1, new Phaser.Display.Color()) as Phaser.Display.Color;
    return c.color;
  }

  /** Lay `count` more tiles at the end of the path */
  private lay(count: number): void {
    const e = this.end;
    for (let k = 0; k < count; k++) {
      const p = this.screen(e.i, e.j);
      const img = this.add
        .image(p.x, p.y + DEPTH / 2, 'ztile')
        .setScale(K)
        .setTint(this.color(e.seg))
        .setDepth(-1 - (e.i + e.j) / 10000);
      // New tiles drop in from above
      if (e.n > 10) {
        img.y -= 40;
        img.alpha = 0;
        this.tweens.add({ targets: img, y: p.y + DEPTH / 2, alpha: 1, duration: 260, ease: 'Quad.Out' });
      }
      this.tiles.set(key(e.i, e.j), { img, seg: e.seg, n: e.n });
      e.n++;
      e.left--;
      if (e.left <= 0) {
        // A corner: the next stretch goes the other way, 1 to 4 tiles long (longer at the start)
        e.dir = 1 - e.dir;
        e.seg++;
        e.left = e.seg < 4 ? 2 + Math.floor(this.rand() * 3) : 1 + Math.floor(this.rand() * 4);
      }
      if (e.dir === 0) e.i++;
      else e.j++;
    }
  }

  private place(): void {
    const p = this.screen(this.u, this.v);
    const y = p.y - 10 + (this.running ? 0 : Math.sin(this.bob * 5) * 3);
    this.ball.setPosition(p.x, y);
    this.shadow.setPosition(p.x, p.y + 2);
  }

  started(): void {
    this.input.on('pointerdown', () => this.turn());
  }

  private turn(): void {
    if (!this.running) return;
    this.dir = 1 - this.dir;
    this.sfx('turn');
    this.buzz(6);
  }

  private speed(): number {
    return Math.min(6.6, 3.1 + this.seg * 0.075);
  }

  tick(dt: number): void {
    const step = this.speed() * dt;
    if (this.dir === 0) this.u += step;
    else this.v += step;
    const here = this.tiles.get(key(Math.round(this.u), Math.round(this.v)));
    if (!here) {
      this.fall();
      return;
    }
    if (here.seg > this.seg) {
      // Round a corner
      this.seg = here.seg;
      this.addScore(1);
      if (this.seg % 8 === 0) {
        this.sfx('level');
        this.pop(this.ball.x, this.ball.y - 50, 'FASTER', '#ffd6f0', 26);
      } else this.sfx('point', 0.6);
    }
    // Lay ahead, drop the tiles left behind
    if (this.end.n - here.n < 40) this.lay(10);
    for (const [k, t] of this.tiles) {
      if (t.n < here.n - 3) {
        this.tiles.delete(k);
        this.tweens.add({ targets: t.img, y: t.img.y + 260, alpha: 0, duration: 700, ease: 'Quad.In', onComplete: () => t.img.destroy() });
      }
    }
    this.place();
    this.follow(dt);
  }

  private follow(dt: number): void {
    const want = { x: this.ball.x, y: this.ball.y + 10 - (BALL_ON_SCREEN - H / 2) };
    const k = Math.min(1, dt * 4);
    this.cam.x += (want.x - this.cam.x) * k;
    this.cam.y += (want.y - this.cam.y) * k;
    this.cameras.main.centerOn(this.cam.x, this.cam.y);
    this.bg.setPosition(this.cam.x, this.cam.y);
  }

  private fall(): void {
    this.falling = true;
    this.shadow.setVisible(false);
    // Behind the path's edge, down into the dark
    this.ball.setDepth(-50);
    this.tweens.add({ targets: this.ball, y: this.ball.y + 320, scale: K * 0.5, alpha: 0, duration: 900, ease: 'Quad.In' });
    this.sfx('crash');
    this.buzz([60, 40, 120]);
    this.shake(220, 0.012);
    this.out();
  }

  idle(dt: number): void {
    this.bob += dt;
    if (!this.ended) this.place();
    if (!this.falling) this.follow(dt);
  }

  finished(why: 'out' | 'time'): void {
    this.input.removeAllListeners();
    if (why === 'time') this.pop(this.cam.x, this.cam.y, 'TIME', '#ffffff', 46);
  }
}
