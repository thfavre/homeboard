import Phaser from 'phaser';
import { ArcadeScene, H, INK, PX, W, hex, type Pen } from '../engine/base.ts';

const GRAVITY = 950;
const BOMB_COST = 3;
const GOLD_POINTS = 5;
/** A fruit's texture, in pixels a side */
const S = 30;

/** The fruit: its color (the juice) and how it is painted */
const FRUIT = [
  { id: 'apple', juice: '#ff4d5e' },
  { id: 'orange', juice: '#ffa53d' },
  { id: 'melon', juice: '#ff5f7a' },
  { id: 'lemon', juice: '#ffe54d' },
  { id: 'plum', juice: '#b26bff' },
] as const;

type Kind = number | 'bomb' | 'gold';

interface Thing {
  img: Phaser.GameObjects.Image;
  kind: Kind;
  r: number;
  vx: number;
  vy: number;
  spin: number;
  spark?: Phaser.GameObjects.Image;
}

interface Half {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

/**
 * Slicer: fruit is thrown up in front of the dojo's wall, now and then a bomb with it, and rarely a
 * golden fruit worth a lot. A swipe across fruit slices it (three or more in one swipe fill the
 * fever bar fast); a sliced bomb costs points. Lasts a fixed time; the throws are drawn from the
 * seed, the same for both players.
 */
export class SlicerScene extends ArcadeScene {
  private things: Thing[] = [];
  private halves: Half[] = [];
  private nextWave = 0.6;
  private t = 0;
  private trail: { x: number; y: number; at: number }[] = [];
  private blade!: Phaser.GameObjects.Graphics;
  private down = false;
  /** Fruit sliced in the swipe going on */
  private swipe = 0;

  build(): void {
    this.paintArt();
    this.sprite(W / 2, H / 2, 'slicer-wall').setDepth(-100);
    this.blade = this.add.graphics().setDepth(60);
  }

  private paintArt(): void {
    // The dojo: paper screens in a dark wooden frame, a wooden floor
    this.pix('slicer-wall', W / PX, H / PX, (p) => {
      const w = W / PX;
      const h = H / PX;
      p.rect('#2a1420', 0, 0, w, h);
      for (let x = 6; x < w - 6; x += 48) {
        p.rect('#f3e3c6', x, 20, 42, 230);
        p.dither('#e3cfa8', x, 20, 42, 230);
        for (let gx = x; gx <= x + 42; gx += 14) p.rect('#5a2e1e', gx, 20, 2, 230);
        for (let gy = 20; gy <= 250; gy += 23) p.rect('#5a2e1e', x, gy, 44, 2);
      }
      p.rect('#3a1c14', 0, 252, w, 10);
      p.rect('#6a3a24', 0, 252, w, 2);
      for (let y = 262; y < h; y += 10) {
        p.rect('#4a2618', 0, y, w, 10);
        p.rect('#5e321e', 0, y, w, 1);
        for (let x = (y * 7) % 60; x < w; x += 60) p.rect('#2e160e', x, y, 1, 10);
      }
      p.dither('#000000', 0, 0, w, 14);
    });
    const ball = (p: Pen, dark: string, mid: string, light: string, rx = 13, ry = 13) => {
      p.disc(INK.line, S / 2, S / 2 + 1, rx + 1, ry + 1);
      p.disc(dark, S / 2, S / 2 + 1, rx, ry);
      p.disc(mid, S / 2 - 1, S / 2, rx - 2, ry - 2);
      p.disc(light, S / 2 - 4, S / 2 - 4, 3, 2);
    };
    const leaf = (p: Pen) => {
      p.rect('#5b3a1e', 15, 1, 1, 4);
      p.rect(INK.line, 16, 1, 6, 3);
      p.rect('#3d8b2f', 17, 2, 4, 1);
    };
    this.pix('f-apple', S, S, (p) => {
      ball(p, '#a8102a', '#e0263e', '#ff8a96');
      leaf(p);
    });
    this.pix('f-orange', S, S, (p) => {
      ball(p, '#c05208', '#f47a14', '#ffd08a');
      for (let i = 0; i < 14; i++) p.rect('#c86210', 8 + ((i * 7) % 15), 9 + ((i * 5) % 14), 1, 1);
    });
    this.pix('f-melon', S, S, (p) => {
      ball(p, '#1e5e20', '#3c9a34', '#9be37a', 14, 12);
      for (const x of [9, 14, 19]) for (let y = 6; y < 26; y++) if (Math.abs(y - 16) < 10 - Math.abs(x - 15) / 2) p.rect('#1e5e20', x + Math.round(Math.sin(y / 3)), y, 1, 1);
    });
    this.pix('f-lemon', S, S, (p) => {
      p.rect(INK.line, 1, 14, 3, 4);
      p.rect(INK.line, 26, 14, 3, 4);
      p.rect('#e8b80a', 2, 15, 2, 2);
      p.rect('#e8b80a', 26, 15, 2, 2);
      ball(p, '#d8a008', '#ffe23d', '#fff8b0', 12, 10);
    });
    this.pix('f-plum', S, S, (p) => {
      ball(p, '#4a1282', '#7a2ac4', '#d9a3ff', 12, 13);
      leaf(p);
    });
    this.pix('f-gold', S, S, (p) => {
      ball(p, '#b07800', '#ffc81a', '#fff6c0');
      leaf(p);
      p.rect('#ffffff', 22, 7, 1, 3);
      p.rect('#ffffff', 21, 8, 3, 1);
    });
    this.pix('f-bomb', S, S, (p) => {
      p.disc(INK.line, 15, 17, 12);
      p.disc('#24243a', 15, 17, 11);
      p.disc('#4a4a64', 12, 14, 4);
      p.rect('#8a8aa8', 10, 12, 2, 1);
      p.rect(INK.line, 12, 3, 7, 4);
      p.rect('#3a3a50', 13, 4, 5, 2);
      p.rect('#c9a36a', 17, 1, 2, 2);
      p.rect('#c9a36a', 19, 0, 2, 1);
      // A red mark: do not touch
      for (let i = 0; i < 9; i++) {
        p.rect(INK.red, 11 + i, 13 + i, 2, 1);
        p.rect(INK.red, 19 - i, 13 + i, 2, 1);
      }
    });
    this.pix('splat', 24, 24, (p) => {
      p.disc('#ffffff', 12, 12, 8);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        p.disc('#ffffff', 12 + Math.cos(a) * 9, 12 + Math.sin(a) * 9, 2);
      }
    });
    this.pix('spark', 3, 3, (p) => {
      p.rect('#ffd23d', 0, 1, 3, 1);
      p.rect('#ffd23d', 1, 0, 1, 3);
      p.rect('#ffffff', 1, 1, 1, 1);
    });
  }

  started(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.down = true;
      this.swipe = 0;
      const pt = this.at(p);
      this.trail = [{ ...pt, at: this.t }];
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.down || !p.isDown) return;
      const pt = this.at(p);
      const last = this.trail[this.trail.length - 1];
      this.trail.push({ ...pt, at: this.t });
      if (last) this.cut(last.x, last.y, pt.x, pt.y);
    });
    const up = () => {
      this.down = false;
      this.swipe = 0;
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  /** A wave of throws: one to four things, now and then a bomb or a golden fruit among them */
  private wave(): void {
    const late = Math.min(1, this.t / this.opts.seconds);
    const count = 1 + Math.floor(this.rand() * (2.4 + late * 1.8));
    for (let i = 0; i < count; i++) {
      const roll = this.rand();
      const kind: Kind = roll < 0.1 + late * 0.1 ? 'bomb' : roll > 0.965 ? 'gold' : Math.floor(this.rand() * FRUIT.length);
      const x = 60 + this.rand() * (W - 120);
      const key = kind === 'bomb' ? 'f-bomb' : kind === 'gold' ? 'f-gold' : `f-${FRUIT[kind].id}`;
      const img = this.sprite(x, H + 40, key).setDepth(20);
      const thing: Thing = {
        img,
        kind,
        r: 30,
        vx: (W / 2 - x) * (0.4 + this.rand() * 0.6) + (this.rand() - 0.5) * 80,
        vy: -(820 + this.rand() * 200),
        spin: (this.rand() - 0.5) * 6,
      };
      if (kind === 'bomb') thing.spark = this.sprite(x, H, 'spark', PX * 2).setDepth(21);
      // A beat apart within the wave
      img.y += i * 30;
      this.things.push(thing);
    }
    this.nextWave = this.t + Math.max(0.55, 1.15 - late * 0.5) + this.rand() * 0.45;
  }

  /** The blade went from (x0, y0) to (x1, y1): what it crossed is sliced */
  private cut(x0: number, y0: number, x1: number, y1: number): void {
    if (!this.running) return;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    if (len2 < 4) return;
    for (const th of [...this.things]) {
      const t = Phaser.Math.Clamp(((th.img.x - x0) * dx + (th.img.y - y0) * dy) / len2, 0, 1);
      const d = Math.hypot(th.img.x - x0 - t * dx, th.img.y - y0 - t * dy);
      if (d > th.r) continue;
      this.things.splice(this.things.indexOf(th), 1);
      if (th.kind === 'bomb') this.boom(th);
      else this.slice(th, Math.atan2(dy, dx));
    }
  }

  private slice(th: Thing, angle: number): void {
    const gold = th.kind === 'gold';
    const juice = gold ? INK.gold : FRUIT[th.kind as number].juice;
    this.swipe++;
    const combo = this.swipe >= 3;
    const got = this.addScore(gold ? GOLD_POINTS : 1 + (combo ? 1 : 0));
    this.good(gold || combo);
    this.sfx(gold ? 'gem' : 'slice', 0.8 + Math.min(0.5, this.swipe * 0.1));
    this.buzz(8);
    this.burst(th.img.x, th.img.y, juice, 14, 280);
    if (gold) this.pop(th.img.x, th.img.y - 40, `GOLD +${got}`, INK.gold, 4);
    else if (combo) this.pop(th.img.x, th.img.y - 40, `COMBO X${this.swipe}`, '#ffe9a0', 3);
    else if (got > 1) this.pop(th.img.x, th.img.y - 40, `+${got}`, INK.gold, 3);
    // A splash left on the wall
    const splat = this.sprite(th.img.x, th.img.y, 'splat', PX * (1.6 + Math.random())).setTint(hex(juice)).setAlpha(0.35).setDepth(-80).setRotation(Math.random() * 6);
    this.tweens.add({ targets: splat, alpha: 0, duration: 1600, onComplete: () => splat.destroy() });
    // Two halves flying apart, across the cut
    const n = angle + Math.PI / 2;
    for (const side of [-1, 1]) {
      const img = this.sprite(th.img.x, th.img.y, th.img.texture.key).setDepth(19).setRotation(angle);
      img.setCrop(0, side < 0 ? 0 : S / 2, S, S / 2);
      this.halves.push({ img, vx: th.vx * 0.5 + Math.cos(n) * side * 140, vy: Math.min(th.vy, -120) * 0.5 + Math.sin(n) * side * 140, spin: side * (2 + Math.random() * 3) });
    }
    th.img.destroy();
  }

  private boom(th: Thing): void {
    this.addScore(-BOMB_COST);
    this.miss();
    this.sfx('bomb');
    this.buzz([80, 40, 160]);
    this.shake(320, 0.025);
    this.flash('#ffffff', 220);
    this.burst(th.img.x, th.img.y, '#ffb03d', 24, 420);
    this.burst(th.img.x, th.img.y, '#3a3a48', 16, 300, 500, 3);
    this.pop(th.img.x, th.img.y - 40, `-${BOMB_COST}`, '#ff6b7d', 4);
    th.img.destroy();
    th.spark?.destroy();
  }

  tick(dt: number): void {
    this.t += dt;
    if (this.t >= this.nextWave) this.wave();
    this.move(dt);
  }

  private move(dt: number): void {
    for (const th of this.things) {
      th.vy += GRAVITY * dt;
      th.img.x += th.vx * dt;
      th.img.y += th.vy * dt;
      th.img.rotation += th.spin * dt;
      if (th.spark) {
        // The fuse's tip, turning with the bomb, flickering
        const a = th.img.rotation - Math.PI / 2 + 0.45;
        th.spark.setPosition(th.img.x + Math.cos(a) * 30, th.img.y + Math.sin(a) * 30).setScale(PX * (1.2 + Math.random() * 1.2));
      }
    }
    this.things = this.things.filter((th) => {
      if (th.vy < 0 || th.img.y < H + 80) return true;
      th.img.destroy();
      th.spark?.destroy();
      return false;
    });
    for (const h of this.halves) {
      h.vy += GRAVITY * dt;
      h.img.x += h.vx * dt;
      h.img.y += h.vy * dt;
      h.img.rotation += h.spin * dt;
    }
    this.halves = this.halves.filter((h) => {
      if (h.img.y < H + 80) return true;
      h.img.destroy();
      return false;
    });
    this.drawBlade();
  }

  /** The blade's trail: square pixels, bright at the tip, thinning toward the tail */
  private drawBlade(): void {
    this.trail = this.trail.filter((p) => this.t - p.at < 0.14);
    const g = this.blade;
    g.clear();
    const pts = this.trail;
    for (let i = 1; i < pts.length; i++) {
      const k = i / pts.length;
      const size = Math.max(PX, Math.round((1 + k * 4) * PX));
      const a = pts[i - 1];
      const b = pts[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / PX));
      g.fillStyle(k > 0.7 ? 0xffffff : 0xcfe8ff, 0.3 + k * 0.7);
      for (let s = 0; s <= steps; s++) {
        const x = a.x + ((b.x - a.x) * s) / steps;
        const y = a.y + ((b.y - a.y) * s) / steps;
        g.fillRect(Math.round(x / PX) * PX - size / 2, Math.round(y / PX) * PX - size / 2, size, size);
      }
    }
  }

  idle(dt: number): void {
    // What is still in the air finishes its flight after the end
    this.t += dt;
    this.move(dt);
  }

  finished(): void {
    this.input.removeAllListeners();
  }
}
