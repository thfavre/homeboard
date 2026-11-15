import Phaser from 'phaser';
import { ArcadeScene, H, W } from '../engine/base.ts';

const BH = 34;
const BASE_Y = 640;
const START_W = 220;
/** The tower starts this many floors high (they score nothing) */
const BASE_FLOORS = 5;
/** A drop this close (units) to the block below counts as perfect: nothing is cut */
const PERFECT = 6;
/** How far a block slides each way from the middle */
const REACH = 200;
/** Where the top of the tower stays on the screen once it is high */
const TOP_ON_SCREEN = 330;

interface Block {
  g: Phaser.GameObjects.Graphics;
  x: number;
  w: number;
}

/**
 * Tower Stack: a block slides over the tower; a tap drops it. What hangs over the edge is cut off
 * and falls, so the tower gets thinner; a perfect drop cuts nothing, and three in a row widen the
 * block again. Missing the tower ends the run. Each floor slides a little faster.
 */
export class StackScene extends ArcadeScene {
  private tower: Block[] = [];
  private moving: Block | null = null;
  private dir = 1;
  private speed = 0;
  private combo = 0;
  private hue = 0;
  private camY = H / 2;
  private bg!: Phaser.GameObjects.Image;
  private stars: Phaser.GameObjects.Arc[] = [];

  build(): void {
    this.bg = this.backdrop('stack-bg', '#0e2a4a', '#0a1020');
    this.hue = this.rand() * 360;
    // Little lights far away, slower than the tower when the camera rises
    for (let i = 0; i < 40; i++) {
      const s = this.add.circle(this.rand() * W, this.rand() * H * 3 - H * 2, 0.8 + this.rand() * 1.6, 0xffffff, 0.15 + this.rand() * 0.4);
      s.setDepth(-90);
      this.stars.push(s);
    }
    // The ground and the first floors
    const ground = this.add.graphics();
    ground.fillStyle(0x07101c, 1).fillRect(-50, BASE_Y + BH / 2, W + 100, 400);
    ground.fillStyle(0x1b3550, 1).fillRect(-50, BASE_Y + BH / 2, W + 100, 4);
    for (let i = 0; i < BASE_FLOORS; i++) this.tower.push(this.block(W / 2, this.floorY(i), START_W, i));
    this.follow(1);
  }

  private color(floor: number): Phaser.Display.Color {
    return Phaser.Display.Color.HSVToRGB(((this.hue + floor * 13) % 360) / 360, 0.55, 0.95, new Phaser.Display.Color()) as Phaser.Display.Color;
  }

  /** A block drawn at (x, y): a face, a lit top, a shaded bottom */
  private block(x: number, y: number, w: number, floor: number): Block {
    const g = this.add.graphics({ x, y });
    this.drawBlock(g, w, floor);
    return { g, x, w };
  }

  private drawBlock(g: Phaser.GameObjects.Graphics, w: number, floor: number): void {
    const c = this.color(floor);
    const main = c.color;
    const light = c.clone().lighten(18).color;
    const dark = c.clone().darken(22).color;
    g.clear();
    g.fillStyle(main, 1).fillRoundedRect(-w / 2, -BH / 2, w, BH, 5);
    g.fillStyle(light, 1).fillRoundedRect(-w / 2, -BH / 2, w, 8, { tl: 5, tr: 5, bl: 0, br: 0 });
    g.fillStyle(dark, 1).fillRect(-w / 2 + 3, BH / 2 - 5, w - 6, 5);
  }

  private floorY(i: number): number {
    return BASE_Y - i * BH;
  }

  private spawn(): void {
    const floor = this.tower.length;
    const top = this.tower[this.tower.length - 1];
    this.dir = floor % 2 ? 1 : -1;
    // A touch faster each floor, each a little different (the same for both players)
    this.speed = Math.min(560, 200 + (floor - BASE_FLOORS) * 10) * (0.92 + this.rand() * 0.16);
    const x = W / 2 - this.dir * REACH;
    this.moving = this.block(x, this.floorY(floor), top.w, floor);
  }

  started(): void {
    this.spawn();
    this.input.on('pointerdown', () => this.drop());
  }

  private drop(): void {
    const m = this.moving;
    if (!this.running || !m) return;
    const top = this.tower[this.tower.length - 1];
    const floor = this.tower.length;
    const y = this.floorY(floor);
    const dx = m.x - top.x;
    this.moving = null;

    if (Math.abs(dx) <= PERFECT) {
      // Perfect: right on it, and three in a row grow the block back
      this.combo++;
      m.x = top.x;
      m.g.x = top.x;
      if (this.combo >= 3 && m.w < START_W) {
        m.w = Math.min(START_W, m.w + 12);
        this.drawBlock(m.g, m.w, floor);
      }
      this.tower.push(m);
      this.ring(m.x, y, m.w);
      this.sfx('perfect', 0.8 + Math.min(0.4, this.combo * 0.08));
      this.buzz(15);
      this.pop(m.x, y - 40, this.combo > 1 ? `PERFECT x${this.combo}` : 'PERFECT', '#ffffff', 26);
      this.addScore(1);
      this.spawn();
      return;
    }

    this.combo = 0;
    const overlap = m.w - Math.abs(dx);
    if (overlap <= 0) {
      // Missed the tower: it falls
      this.fall(m.g, m.x, y, dx > 0 ? 1 : -1);
      this.sfx('crash');
      this.buzz([60, 40, 120]);
      this.shake(240, 0.015);
      this.out();
      return;
    }
    // Cut: the part over the tower stays, the rest falls
    const left = Math.max(m.x - m.w / 2, top.x - top.w / 2);
    const right = Math.min(m.x + m.w / 2, top.x + top.w / 2);
    const keepX = (left + right) / 2;
    const cutW = m.w - overlap;
    const cutX = dx > 0 ? right + cutW / 2 : left - cutW / 2;
    m.g.destroy();
    const kept = this.block(keepX, y, overlap, floor);
    this.tower.push(kept);
    const cut = this.add.graphics({ x: cutX, y });
    this.drawBlock(cut, cutW, floor);
    this.fall(cut, cutX, y, dx > 0 ? 1 : -1);
    this.sfx('thunk', 0.8);
    this.buzz(10);
    this.burst(dx > 0 ? right : left, y, this.color(floor).color, 6, 160, 'chip', 600);
    this.addScore(1);
    this.spawn();
  }

  /** A piece falling off, turning */
  private fall(g: Phaser.GameObjects.Graphics, x: number, y: number, side: number): void {
    this.tweens.add({ targets: g, x: x + side * 60, y: y + 700, rotation: side * 2.2, alpha: 0.2, duration: 1100, ease: 'Quad.In', onComplete: () => g.destroy() });
  }

  /** A ring spreading out from a perfect drop */
  private ring(x: number, y: number, w: number): void {
    const r = this.add.rectangle(x, y, w + 4, BH + 4).setStrokeStyle(3, 0xffffff, 0.9);
    this.tweens.add({ targets: r, scaleX: 1.25, scaleY: 1.8, alpha: 0, duration: 420, ease: 'Cubic.Out', onComplete: () => r.destroy() });
  }

  tick(dt: number): void {
    const m = this.moving;
    if (m) {
      m.x += this.dir * this.speed * dt;
      if (m.x > W / 2 + REACH) {
        m.x = W / 2 + REACH;
        this.dir = -1;
      } else if (m.x < W / 2 - REACH) {
        m.x = W / 2 - REACH;
        this.dir = 1;
      }
      m.g.x = m.x;
    }
    this.follow(dt);
  }

  idle(dt: number): void {
    this.follow(dt);
  }

  /** The camera rises with the tower; the background stays put, the far lights drift slower */
  private follow(dt: number): void {
    const topY = this.floorY(this.tower.length);
    const want = Math.min(H / 2, topY - TOP_ON_SCREEN + H / 2);
    const before = this.camY;
    this.camY += (want - this.camY) * Math.min(1, dt * 5);
    const cam = this.cameras.main;
    cam.centerOn(W / 2, this.camY);
    this.bg.y = this.camY;
    const moved = this.camY - before;
    for (const s of this.stars) s.y += moved * 0.8;
  }

  finished(why: 'out' | 'time'): void {
    this.input.removeAllListeners();
    if (why === 'time') this.pop(W / 2, this.camY, 'TIME', '#ffffff', 46);
  }
}
