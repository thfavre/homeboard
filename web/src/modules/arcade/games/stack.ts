import Phaser from 'phaser';
import { ArcadeScene, H, INK, PX, W, hex } from '../engine/base.ts';

const BH = 34;
const BASE_Y = 640;
const START_W = 220;
/** The tower starts this many floors high (they score nothing) */
const BASE_FLOORS = 4;
/** A drop this close (units) to the floor below counts as perfect: nothing is cut */
const PERFECT = 6;
/** How far a floor slides each way from the middle */
const REACH = 200;
/** Where the top of the tower stays on the screen once it is high */
const TOP_ON_SCREEN = 400;

interface Block {
  g: Phaser.GameObjects.Graphics;
  x: number;
  w: number;
}

/**
 * Tower Stack: a skyscraper rising into the night. A floor slides over the tower; a tap drops it.
 * What hangs over the edge is cut off and falls, so the tower gets thinner; a perfect drop cuts
 * nothing and scores double, and three in a row widen the floor again. Missing the tower costs a
 * life (the floor comes again). Each floor slides a little faster.
 */
export class StackScene extends ArcadeScene {
  private tower: Block[] = [];
  private moving: Block | null = null;
  private dir = 1;
  private speed = 0;
  private perfects = 0;
  private hue = 0;
  private camY = H / 2;
  private bg!: Phaser.GameObjects.Image;
  private stars: Phaser.GameObjects.Rectangle[] = [];
  private skyline!: Phaser.GameObjects.TileSprite;
  private moon!: Phaser.GameObjects.Image;

  build(): void {
    this.bg = this.backdrop('stack-sky', ['#060816', '#0b1030', '#121a48', '#1b2560', '#28306e']);
    this.hue = this.rand() * 360;
    // Stars far away (slower than the tower when the camera rises), the moon, the city behind
    for (let i = 0; i < 60; i++) {
      const s = this.add.rectangle(Math.round(this.rand() * W), this.rand() * H * 4 - H * 3, PX, PX, 0xffffff, 0.2 + this.rand() * 0.6);
      s.setDepth(-90);
      this.stars.push(s);
    }
    this.pix('stack-moon', 26, 26, (p) => {
      p.disc('#fff4d0', 13, 13, 12);
      p.disc('#e8dcb0', 9, 15, 3);
      p.disc('#e8dcb0', 17, 9, 2);
      p.disc('#e8dcb0', 16, 18, 2);
    });
    this.pix('stack-city', 100, 50, (p) => {
      let x = 0;
      for (const [w, h] of [
        [12, 30],
        [8, 42],
        [14, 24],
        [10, 36],
        [16, 28],
        [9, 46],
        [13, 32],
        [18, 22],
      ]) {
        p.rect('#141a3c', x, 50 - h, w, h);
        for (let wy = 50 - h + 3; wy < 48; wy += 4) for (let wx = x + 2; wx < x + w - 1; wx += 3) if ((wx * 13 + wy * 7) % 9 < 3) p.rect('#ffd27a', wx, wy, 1, 2);
        x += w;
      }
    });
    this.moon = this.sprite(310, 150, 'stack-moon').setDepth(-89);
    this.skyline = this.add.tileSprite(W / 2, BASE_Y - 30, W / PX, 50, 'stack-city').setScale(PX).setDepth(-80);
    // The street and the first floors
    const ground = this.add.graphics();
    ground.fillStyle(0x0d0f22, 1).fillRect(-50, BASE_Y + BH / 2, W + 100, 400);
    ground.fillStyle(0x2a2f55, 1).fillRect(-50, BASE_Y + BH / 2, W + 100, PX * 2);
    for (let x = -40; x < W + 40; x += 40) ground.fillStyle(0xffd23d, 0.7).fillRect(x, BASE_Y + BH / 2 + 30, 20, PX * 2);
    for (let i = 0; i < BASE_FLOORS; i++) this.tower.push(this.block(W / 2, this.floorY(i), START_W, i));

    this.follow(1);
  }

  private color(floor: number): Phaser.Display.Color {
    return Phaser.Display.Color.HSVToRGB(((this.hue + floor * 11) % 360) / 360, 0.45, 0.85, new Phaser.Display.Color()) as Phaser.Display.Color;
  }

  /** A floor drawn at (x, y): its wall, a ledge on top, a row of windows */
  private block(x: number, y: number, w: number, floor: number): Block {
    const g = this.add.graphics({ x, y });
    this.drawBlock(g, w, floor);
    return { g, x, w };
  }

  private drawBlock(g: Phaser.GameObjects.Graphics, w: number, floor: number): void {
    const c = this.color(floor);
    const main = c.color;
    const light = c.clone().lighten(16).color;
    const dark = c.clone().darken(25).color;
    const x0 = -w / 2;
    const y0 = -BH / 2;
    g.clear();
    g.fillStyle(hex(INK.line), 1).fillRect(x0, y0, w, BH);
    g.fillStyle(main, 1).fillRect(x0 + PX, y0, w - PX * 2, BH - PX);
    g.fillStyle(light, 1).fillRect(x0, y0, w, PX * 3);
    g.fillStyle(dark, 1).fillRect(x0 + PX, y0 + PX * 3, w - PX * 2, PX);
    g.fillStyle(dark, 1).fillRect(x0 + w - PX * 3, y0 + PX * 3, PX * 2, BH - PX * 4);
    // Windows, some lit (the same each time this floor is drawn)
    let k = floor * 7 + 3;
    for (let wx = x0 + PX * 4; wx + PX * 4 < x0 + w - PX * 3; wx += PX * 7) {
      k = (k * 31 + 17) % 97;
      const lit = k % 3 !== 0;
      g.fillStyle(lit ? 0xffd77a : 0x1a1f40, 1).fillRect(wx, y0 + PX * 6, PX * 4, PX * 6);
      if (lit) g.fillStyle(0xfff3c4, 1).fillRect(wx, y0 + PX * 6, PX * 4, PX * 2);
    }
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
    this.moving.g.setDepth(40);
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
    m.g.setDepth(0);

    if (Math.abs(dx) <= PERFECT) {
      // Perfect: right on it, and three in a row grow the floor back
      this.perfects++;
      m.x = top.x;
      m.g.x = top.x;
      if (this.perfects >= 3 && m.w < START_W) {
        m.w = Math.min(START_W, m.w + 14);
        this.drawBlock(m.g, m.w, floor);
      }
      this.tower.push(m);
      this.ring(m.x, y, m.w);
      this.sfx('perfect', 0.8 + Math.min(0.4, this.perfects * 0.08));
      this.buzz(15);
      const got = this.addScore(2);
      this.good(true);
      this.pop(m.x, y - 60, this.perfects > 1 ? `PERFECT X${this.perfects} +${got}` : `PERFECT +${got}`, INK.gold, 3);
      this.spawn();
      return;
    }

    this.perfects = 0;
    const overlap = m.w - Math.abs(dx);
    if (overlap <= 0) {
      // Missed the tower: it falls, and the same floor comes again
      this.fall(m.g, m.x, y, dx > 0 ? 1 : -1);
      this.shake(240, 0.015);
      if (this.miss()) this.time.delayedCall(350, () => this.running && !this.moving && this.spawn());
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
    this.burst(dx > 0 ? right : left, y, this.color(floor).color, 6, 160, 600);
    this.addScore(1);
    if (overlap / m.w > 0.8) this.good();
    this.spawn();
  }

  /** A piece falling off, turning */
  private fall(g: Phaser.GameObjects.Graphics, x: number, y: number, side: number): void {
    this.tweens.add({ targets: g, x: x + side * 60, y: y + 700, rotation: side * 2.2, alpha: 0.2, duration: 1100, ease: 'Quad.In', onComplete: () => g.destroy() });
  }

  /** A ring spreading out from a perfect drop */
  private ring(x: number, y: number, w: number): void {
    const r = this.add.rectangle(x, y, w + 4, BH + 4).setStrokeStyle(PX * 2, 0xffffff, 0.9);
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

  /** The camera rises with the tower; the sky stays put, the stars and the city drift slower */
  private follow(dt: number): void {
    const topY = this.floorY(this.tower.length);
    const want = Math.min(H / 2, topY - TOP_ON_SCREEN + H / 2);
    const before = this.camY;
    this.camY += (want - this.camY) * Math.min(1, dt * 5);
    const cam = this.cameras.main;
    cam.centerOn(W / 2, this.camY);
    this.bg.y = this.camY;
    const moved = this.camY - before;
    for (const s of this.stars) s.y += moved * 0.85;
    this.skyline.y += moved * 0.6;
    this.moon.y += moved * 0.95;
  }

  finished(why: 'out' | 'time'): void {
    this.input.removeAllListeners();
    if (this.moving && why === 'time') {
      this.moving.g.destroy();
      this.moving = null;
    }
  }
}
