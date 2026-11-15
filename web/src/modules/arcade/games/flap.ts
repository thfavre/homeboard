import Phaser from 'phaser';
import { ArcadeScene, H, K, R, W } from '../engine/base.ts';

const BIRD_X = 115;
const BIRD_R = 15;
const GRAVITY = 1500;
const FLAP_V = -500;
const GROUND = 664;
const WALL_W = 74;
const SPACING = 245;

interface Wall {
  x: number;
  gapY: number;
  gap: number;
  top: Phaser.GameObjects.Container;
  bottom: Phaser.GameObjects.Container;
  passed: boolean;
}

/**
 * Flap: a little bird falls; a tap flaps it up. Pillars come from the right with a gap to fly
 * through, the gaps (the same for both players) narrowing as the score goes up. A pillar or the
 * ground ends the run.
 */
export class FlapScene extends ArcadeScene {
  private bird!: Phaser.GameObjects.Container;
  private wing!: Phaser.GameObjects.Image;
  private vy = 0;
  private walls: Wall[] = [];
  private nextAt = W + 120;
  private lastGap = 380;
  private clouds: Phaser.GameObjects.Image[] = [];
  private groundStripes!: Phaser.GameObjects.Graphics;
  private stripeX = 0;
  private hover = 0;
  private dead = false;

  build(): void {
    this.backdrop('flap-bg', '#ff9a5a', '#5a2a7a');
    // The sun, clouds and two rows of hills far away
    this.add.circle(300, 250, 70, 0xffe3a0, 0.85).setDepth(-95);
    this.paint('cloud', 120, 46, (g) => {
      g.fillStyle = 'rgba(255,240,230,0.85)';
      for (const [x, y, r] of [
        [30, 28, 18],
        [55, 20, 22],
        [82, 26, 18],
        [60, 32, 16],
      ])
        g.beginPath(), g.arc(x, y, r, 0, Math.PI * 2), g.fill();
    });
    for (let i = 0; i < 4; i++) {
      const c = this.art(this.rand() * W, 80 + this.rand() * 260, 'cloud').setDepth(-92).setAlpha(0.7 + this.rand() * 0.3);
      this.clouds.push(c);
    }
    const hills = this.add.graphics().setDepth(-90);
    hills.fillStyle(0x7a3b7c, 1);
    for (let x = -40; x < W + 80; x += 90) hills.fillCircle(x, GROUND + 30, 80 + ((x * 7) % 40));
    hills.fillStyle(0x4d2462, 1);
    for (let x = 0; x < W + 80; x += 70) hills.fillCircle(x, GROUND + 50, 60 + ((x * 13) % 30));

    this.paintArt();
    // The ground: a strip with stripes running by
    const ground = this.add.graphics().setDepth(20);
    ground.fillStyle(0x3b1f4f, 1).fillRect(0, GROUND, W, H - GROUND + 40);
    ground.fillStyle(0xffb36b, 1).fillRect(0, GROUND, W, 5);
    this.groundStripes = this.add.graphics().setDepth(21);
    this.drawStripes();

    this.bird = this.add.container(BIRD_X, 330).setDepth(30);
    this.bird.add(this.add.image(0, 0, 'bird').setScale(K));
    this.wing = this.add.image(-4, 3, 'wing').setScale(K).setOrigin(0.8, 0.3);
    this.bird.add(this.wing);
  }

  private paintArt(): void {
    this.paint('bird', 46, 38, (g) => {
      const body = g.createRadialGradient(18, 14, 3, 22, 19, 19);
      body.addColorStop(0, '#fff3a0');
      body.addColorStop(1, '#ffb21a');
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(22, 20, 18, 16, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#a5560a';
      g.lineWidth = 2;
      g.stroke();
      // Eye and beak
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(30, 14, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a1020';
      g.beginPath();
      g.arc(32, 14, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff6a3d';
      g.beginPath();
      g.moveTo(36, 19);
      g.lineTo(46, 22);
      g.lineTo(36, 26);
      g.closePath();
      g.fill();
    });
    this.paint('wing', 20, 14, (g) => {
      g.fillStyle = '#ffe07a';
      g.strokeStyle = '#a5560a';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(10, 7, 9, 6, -0.2, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    });
    // A pillar: glowing glass in a dark frame, its cap wider
    this.paint('pillar', WALL_W, 40, (g) => {
      const glass = g.createLinearGradient(0, 0, WALL_W, 0);
      glass.addColorStop(0, '#3dd6ff');
      glass.addColorStop(0.35, '#9ff0ff');
      glass.addColorStop(1, '#1a6fb0');
      g.fillStyle = glass;
      g.fillRect(6, 0, WALL_W - 12, 40);
      g.fillStyle = 'rgba(10,20,50,0.55)';
      g.fillRect(6, 0, 3, 40);
      g.fillRect(WALL_W - 9, 0, 3, 40);
    });
    this.paint('cap', WALL_W + 12, 22, (g) => {
      g.fillStyle = '#1b2a5c';
      g.beginPath();
      g.roundRect(0, 0, WALL_W + 12, 22, 6);
      g.fill();
      g.fillStyle = '#5be0ff';
      g.fillRect(4, 4, WALL_W + 4, 4);
    });
  }

  private drawStripes(): void {
    const g = this.groundStripes;
    g.clear();
    g.fillStyle(0x51306a, 1);
    for (let x = -40 + (this.stripeX % 40); x < W + 40; x += 40) {
      g.beginPath();
      g.moveTo(x, GROUND + 5);
      g.lineTo(x + 20, GROUND + 5);
      g.lineTo(x + 8, GROUND + 22);
      g.lineTo(x - 12, GROUND + 22);
      g.closePath();
      g.fillPath();
    }
  }

  /** A pillar from y0 to y1, its cap on the gap side */
  private pillar(x: number, y0: number, y1: number, capAtBottom: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, 0).setDepth(10);
    const h = y1 - y0;
    const body = this.add.tileSprite(0, y0 + h / 2, WALL_W * R, h * R, 'pillar').setScale(K);
    c.add(body);
    c.add(this.add.image(0, capAtBottom ? y1 - 11 : y0 + 11, 'cap').setScale(K));
    return c;
  }

  private spawnWall(x: number): void {
    const score = this.walls.filter((w) => w.passed).length + this.score;
    const gap = Math.max(150, 205 - score * 2.2);
    const lo = 110 + gap / 2;
    const hi = GROUND - 70 - gap / 2;
    let y = lo + this.rand() * (hi - lo);
    y = Phaser.Math.Clamp(y, this.lastGap - 230, this.lastGap + 230);
    this.lastGap = y;
    this.walls.push({
      x,
      gapY: y,
      gap,
      top: this.pillar(x, -40, y - gap / 2, true),
      bottom: this.pillar(x, y + gap / 2, GROUND, false),
      passed: false,
    });
  }

  started(): void {
    this.input.on('pointerdown', () => this.flap());
    this.flap();
  }

  private flap(): void {
    if (!this.running) return;
    this.vy = FLAP_V;
    this.sfx('flap');
    this.tweens.add({ targets: this.wing, rotation: { from: -0.9, to: 0.3 }, duration: 160, ease: 'Quad.Out' });
  }

  private speed(): number {
    return 170 + Math.min(80, this.score * 2.5);
  }

  tick(dt: number): void {
    const v = this.speed();
    this.vy = Math.min(820, this.vy + GRAVITY * dt);
    this.bird.y += this.vy * dt;
    if (this.bird.y < BIRD_R) {
      this.bird.y = BIRD_R;
      this.vy = 0;
    }
    this.bird.rotation = Phaser.Math.Clamp(this.vy / 900, -0.45, 1.2);
    this.scroll(v * dt);

    // New pillars as the last one moves in
    this.nextAt -= v * dt;
    if (this.nextAt <= W + 60) {
      this.spawnWall(this.nextAt + WALL_W);
      this.nextAt += SPACING;
    }
    for (const w of this.walls) {
      w.x -= v * dt;
      w.top.x = w.x;
      w.bottom.x = w.x;
      if (!w.passed && w.x + WALL_W / 2 < BIRD_X - BIRD_R) {
        w.passed = true;
        this.addScore(1);
        this.sfx('point');
        this.buzz(8);
      }
      // Touching a pillar (the bird as a circle, the pillar a box, its cap a bit wider)
      if (Math.abs(w.x - BIRD_X) < WALL_W / 2 + 6 + BIRD_R) {
        const near = Math.abs(w.x - BIRD_X) < WALL_W / 2 + BIRD_R - 3;
        if (near && (this.bird.y - BIRD_R + 3 < w.gapY - w.gap / 2 || this.bird.y + BIRD_R - 3 > w.gapY + w.gap / 2)) {
          this.crash();
          return;
        }
      }
    }
    this.walls = this.walls.filter((w) => {
      if (w.x > -WALL_W) return true;
      w.top.destroy();
      w.bottom.destroy();
      return false;
    });
    if (this.bird.y + BIRD_R >= GROUND) this.crash();
  }

  private scroll(dx: number): void {
    this.stripeX -= dx;
    this.drawStripes();
    for (const c of this.clouds) {
      c.x -= dx * 0.15;
      if (c.x < -70) c.x = W + 70;
    }
  }

  private crash(): void {
    this.dead = true;
    this.sfx('crash');
    this.buzz([60, 40, 120]);
    this.shake(260, 0.02);
    this.flash('#ffffff', 140);
    this.burst(this.bird.x, this.bird.y, '#ffd04a', 16, 260);
    this.out();
  }

  idle(dt: number): void {
    if (this.dead) {
      // Down to the ground, nose first
      if (this.bird.y + BIRD_R < GROUND) {
        this.vy = Math.min(900, this.vy + GRAVITY * dt);
        this.bird.y = Math.min(GROUND - BIRD_R, this.bird.y + this.vy * dt);
        this.bird.rotation = Math.min(1.5, this.bird.rotation + dt * 6);
      }
      return;
    }
    if (this.ended) return;
    // Hovering before the start
    this.hover += dt;
    this.bird.y = 330 + Math.sin(this.hover * 4) * 8;
    this.wing.rotation = Math.sin(this.hover * 14) * 0.5;
    this.scroll(60 * dt);
  }

  finished(why: 'out' | 'time'): void {
    this.input.removeAllListeners();
    if (why === 'time') this.pop(W / 2, H / 2, 'TIME', '#ffffff', 46);
  }
}
