import Phaser from 'phaser';
import { ArcadeScene, H, K, R, W } from '../engine/base.ts';

const GRAVITY = 950;
const BOMB_COST = 3;

/** The fruit: its color (the juice) and how it is painted */
const FRUIT = [
  { id: 'apple', juice: '#ff4d5e' },
  { id: 'orange', juice: '#ffa53d' },
  { id: 'melon', juice: '#ff5f7a' },
  { id: 'lemon', juice: '#ffe54d' },
  { id: 'plum', juice: '#b26bff' },
] as const;

interface Thing {
  img: Phaser.GameObjects.Image;
  kind: number | 'bomb';
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
 * Slicer: fruit is thrown up from the bottom, now and then a bomb with it. A swipe across fruit
 * slices it (three or more in one swipe score extra); a sliced bomb costs points. Lasts a fixed
 * time; the throws are drawn from the seed, the same for both players.
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
    this.backdrop('slicer-bg', '#3a1a2e', '#120a14');
    // Wooden boards on the wall
    const wall = this.add.graphics().setDepth(-90);
    for (let x = 0; x < W; x += 80) {
      wall.fillStyle(0x4a2638, 0.35).fillRect(x, 0, 78, H);
      wall.fillStyle(0x000000, 0.25).fillRect(x + 78, 0, 2, H);
    }
    this.paintFruit();
    this.blade = this.add.graphics().setDepth(60);
  }

  private paintFruit(): void {
    const S = 64;
    const ball = (g: CanvasRenderingContext2D, light: string, dark: string, rx = 28, ry = 28) => {
      const r = g.createRadialGradient(24, 22, 4, 32, 32, 32);
      r.addColorStop(0, light);
      r.addColorStop(1, dark);
      g.fillStyle = r;
      g.beginPath();
      g.ellipse(32, 33, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.ellipse(22, 22, 7, 4, -0.6, 0, Math.PI * 2);
      g.fill();
    };
    const leaf = (g: CanvasRenderingContext2D) => {
      g.fillStyle = '#3d8b2f';
      g.beginPath();
      g.ellipse(38, 7, 8, 4, -0.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#5b3a1e';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(32, 10);
      g.lineTo(31, 3);
      g.stroke();
    };
    this.paint('f-apple', S, S, (g) => {
      ball(g, '#ff8a8a', '#c4122e');
      leaf(g);
    });
    this.paint('f-orange', S, S, (g) => {
      ball(g, '#ffd08a', '#e86a0a');
      g.fillStyle = 'rgba(150,60,0,0.25)';
      for (let i = 0; i < 18; i++) g.fillRect(14 + ((i * 17) % 36), 16 + ((i * 11) % 34), 2, 2);
    });
    this.paint('f-melon', S, S, (g) => {
      ball(g, '#9be37a', '#2c7a2a', 30, 26);
      g.strokeStyle = 'rgba(20,70,20,0.55)';
      g.lineWidth = 4;
      for (const x of [16, 28, 40, 52]) {
        g.beginPath();
        g.ellipse(32, 33, Math.abs(32 - x) + 2, 25, 0, -Math.PI / 2, Math.PI / 2, x < 32);
        g.stroke();
      }
    });
    this.paint('f-lemon', S, S, (g) => {
      ball(g, '#fff6a0', '#e8b80a', 28, 22);
      g.fillStyle = '#e8b80a';
      g.beginPath();
      g.ellipse(4, 33, 4, 3, 0, 0, Math.PI * 2);
      g.ellipse(60, 33, 4, 3, 0, 0, Math.PI * 2);
      g.fill();
    });
    this.paint('f-plum', S, S, (g) => {
      ball(g, '#d9a3ff', '#5a1a9a', 26, 28);
      leaf(g);
    });
    this.paint('f-bomb', S, S, (g) => {
      const r = g.createRadialGradient(24, 24, 3, 32, 34, 30);
      r.addColorStop(0, '#6a6a80');
      r.addColorStop(1, '#101018');
      g.fillStyle = r;
      g.beginPath();
      g.arc(32, 36, 26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a2a38';
      g.fillRect(25, 6, 14, 8);
      g.strokeStyle = '#c9a36a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(32, 6);
      g.quadraticCurveTo(36, -2, 44, 2);
      g.stroke();
      // A red mark: do not touch
      g.strokeStyle = '#ff4d5e';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(24, 28);
      g.lineTo(40, 44);
      g.moveTo(40, 28);
      g.lineTo(24, 44);
      g.stroke();
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

  /** A wave of throws: one to four things, now and then a bomb among them */
  private wave(): void {
    const late = Math.min(1, this.t / this.opts.seconds);
    const count = 1 + Math.floor(this.rand() * (2.4 + late * 1.8));
    for (let i = 0; i < count; i++) {
      const bomb = this.rand() < 0.1 + late * 0.1;
      const kind = bomb ? 'bomb' : Math.floor(this.rand() * FRUIT.length);
      const x = 60 + this.rand() * (W - 120);
      const img = this.art(x, H + 40, bomb ? 'f-bomb' : `f-${FRUIT[kind as number].id}`).setDepth(20);
      const thing: Thing = {
        img,
        kind,
        r: 30,
        vx: (W / 2 - x) * (0.4 + this.rand() * 0.6) + (this.rand() - 0.5) * 80,
        vy: -(820 + this.rand() * 200),
        spin: (this.rand() - 0.5) * 6,
      };
      if (bomb) {
        thing.spark = this.art(x, H, 'dot').setDepth(21).setTint(0xffb03d);
      }
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
    const fruit = FRUIT[th.kind as number];
    this.swipe++;
    const extra = this.swipe >= 3 ? 1 : 0;
    this.addScore(1 + extra);
    this.sfx('slice', 0.8 + Math.min(0.5, this.swipe * 0.1));
    this.buzz(8);
    this.burst(th.img.x, th.img.y, fruit.juice, 14, 280);
    if (this.swipe >= 3) this.pop(th.img.x, th.img.y - 40, `COMBO x${this.swipe}`, '#ffe9a0', 28);
    // A splash left on the wall
    const splat = this.add.circle(th.img.x, th.img.y, 26 + this.rand() * 14, Phaser.Display.Color.HexStringToColor(fruit.juice).color, 0.28).setDepth(-80);
    this.tweens.add({ targets: splat, alpha: 0, scale: 1.3, duration: 1600, onComplete: () => splat.destroy() });
    // Two halves flying apart, across the cut
    const S = 64 * R;
    const n = angle + Math.PI / 2;
    for (const side of [-1, 1]) {
      const img = this.add.image(th.img.x, th.img.y, th.img.texture.key).setScale(K).setDepth(19).setRotation(angle);
      img.setCrop(0, side < 0 ? 0 : S / 2, S, S / 2);
      this.halves.push({ img, vx: th.vx * 0.5 + Math.cos(n) * side * 140, vy: Math.min(th.vy, -120) * 0.5 + Math.sin(n) * side * 140, spin: side * (2 + this.rand() * 3) });
    }
    th.img.destroy();
  }

  private boom(th: Thing): void {
    this.addScore(-BOMB_COST);
    this.sfx('bomb');
    this.buzz([80, 40, 160]);
    this.shake(320, 0.025);
    this.flash('#ffffff', 220);
    this.burst(th.img.x, th.img.y, '#ffb03d', 24, 420);
    this.burst(th.img.x, th.img.y, '#3a3a48', 16, 300, 'chip');
    this.pop(th.img.x, th.img.y - 40, `-${BOMB_COST}`, '#ff6b7d', 40);
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
        const a = th.img.rotation - Math.PI / 2 + 0.5;
        th.spark.setPosition(th.img.x + Math.cos(a) * 30, th.img.y + Math.sin(a) * 30).setScale(K * (0.8 + Math.random() * 0.8));
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

  /** The blade's trail: a bright line thinning toward its tail */
  private drawBlade(): void {
    this.trail = this.trail.filter((p) => this.t - p.at < 0.14);
    const g = this.blade;
    g.clear();
    const pts = this.trail;
    for (let i = 1; i < pts.length; i++) {
      const k = i / pts.length;
      g.lineStyle(2 + k * 9, 0xffffff, 0.25 + k * 0.7);
      g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    }
  }

  idle(dt: number): void {
    // What is still in the air finishes its flight after the end
    this.t += dt;
    this.move(dt);
  }

  finished(): void {
    this.input.removeAllListeners();
    this.pop(W / 2, H / 2, 'TIME', '#ffffff', 46);
  }
}
