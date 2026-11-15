import Phaser from 'phaser';
import { ArcadeScene, H, K, W } from '../engine/base.ts';

const CX = W / 2;
const CY = 235;
/** The log's radius, and how deep a knife sinks into it */
const LOG_R = 78;
const SINK = 18;
const KNIFE_LEN = 100;
/** Two knives closer than this (radians, around the log) touch */
const GAP = 0.2;
const THROW_SPEED = 2800;
const HOLD_Y = 620;

type Spin = 'steady' | 'wobble' | 'reverse' | 'stutter';

interface Level {
  need: number;
  speed: number;
  dir: 1 | -1;
  spin: Spin;
  /** Knives already in the log when it comes (angles on the log) */
  stuck: number[];
}

/**
 * Knife Throw: a log spins at the top, a knife waits at the bottom. A tap throws it; it sinks into
 * the log, unless it lands on a knife already there. Each log takes a few knives, then bursts and a
 * faster one comes, spinning in a way of its own (steady, wobbling, turning back, stuttering).
 */
export class KnifeScene extends ArcadeScene {
  private log!: Phaser.GameObjects.Container;
  private logArt!: Phaser.GameObjects.Image;
  /** Angles (on the log) of the knives in it */
  private angles: number[] = [];
  private level = 0;
  private lv!: Level;
  private stuckHere = 0;
  private held!: Phaser.GameObjects.Image;
  private flying: Phaser.GameObjects.Image | null = null;
  /** Between two logs: no throwing */
  private changing = false;
  private spinT = 0;
  private icons: Phaser.GameObjects.Image[] = [];

  build(): void {
    this.backdrop('knife-bg', '#3a1d14', '#120908');
    // A warm glow behind the log
    this.paint('knife-glow', 360, 360, (g) => {
      const r = g.createRadialGradient(180, 180, 20, 180, 180, 180);
      r.addColorStop(0, 'rgba(255,170,90,0.35)');
      r.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 360, 360);
    });
    this.art(CX, CY, 'knife-glow');
    this.paintLog();
    this.paintKnife();

    this.log = this.add.container(CX, CY);
    this.newLevel(false);
    this.held = this.art(CX, HOLD_Y, 'knife');
  }

  private paintLog(): void {
    const d = LOG_R * 2 + 8;
    this.paint('log', d, d, (g) => {
      const c = d / 2;
      // The bark
      g.fillStyle = '#4a2a17';
      g.beginPath();
      g.arc(c, c, LOG_R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5e3720';
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        g.beginPath();
        g.arc(c + Math.cos(a) * (LOG_R - 3), c + Math.sin(a) * (LOG_R - 3), 4, 0, Math.PI * 2);
        g.fill();
      }
      // The cut wood, lit from the top left, with its rings
      const wood = g.createRadialGradient(c - 18, c - 22, 6, c, c, LOG_R - 8);
      wood.addColorStop(0, '#f2c98a');
      wood.addColorStop(1, '#c98d4e');
      g.fillStyle = wood;
      g.beginPath();
      g.arc(c, c, LOG_R - 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(120,70,30,0.35)';
      g.lineWidth = 2;
      for (let r = 10; r < LOG_R - 10; r += 11) {
        g.beginPath();
        g.ellipse(c + 2, c + 1, r, r * 0.96, 0.3, 0, Math.PI * 2);
        g.stroke();
      }
      // Two cracks from the heart
      g.strokeStyle = 'rgba(90,50,20,0.55)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(c + 4, c - 2);
      g.lineTo(c + 30, c - 26);
      g.lineTo(c + 44, c - 30);
      g.moveTo(c - 3, c + 5);
      g.lineTo(c - 22, c + 34);
      g.stroke();
    });
  }

  private paintKnife(): void {
    this.paint('knife', 20, KNIFE_LEN, (g) => {
      // The blade: steel, the edge lit
      const steel = g.createLinearGradient(3, 0, 17, 0);
      steel.addColorStop(0, '#f4f7fb');
      steel.addColorStop(0.5, '#c4ccd6');
      steel.addColorStop(1, '#7c8794');
      g.fillStyle = steel;
      g.beginPath();
      g.moveTo(10, 0);
      g.lineTo(17, 16);
      g.lineTo(17, 58);
      g.lineTo(3, 58);
      g.lineTo(3, 16);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(5, 16, 2, 40);
      // The guard and the handle
      g.fillStyle = '#d8a440';
      g.fillRect(0, 58, 20, 6);
      const wood = g.createLinearGradient(4, 0, 16, 0);
      wood.addColorStop(0, '#5b3420');
      wood.addColorStop(1, '#2f1a10');
      g.fillStyle = wood;
      g.beginPath();
      g.roundRect(4, 64, 12, 36, 4);
      g.fill();
      g.fillStyle = '#d8a440';
      for (const y of [72, 84]) {
        g.beginPath();
        g.arc(10, y, 1.8, 0, Math.PI * 2);
        g.fill();
      }
    });
  }

  /** A knife in the log at this angle (on the log) */
  private stick(a: number): Phaser.GameObjects.Image {
    const d = LOG_R - SINK + KNIFE_LEN / 2;
    const k = this.add.image(Math.cos(a) * d, Math.sin(a) * d, 'knife').setScale(K);
    // The blade's tip toward the middle of the log
    k.rotation = a - Math.PI / 2;
    this.log.addAt(k, 0);
    this.angles.push(a);
    return k;
  }

  private newLevel(animate: boolean): void {
    const n = this.level;
    const r = this.rand;
    const stuck: number[] = [];
    const count = n === 0 ? 0 : Math.min(4, Math.floor(n * 0.7 + r() * 1.6));
    for (let tries = 0; stuck.length < count && tries < 40; tries++) {
      const a = r() * Math.PI * 2;
      if (stuck.every((b) => Math.abs(Phaser.Math.Angle.Wrap(a - b)) > 0.6)) stuck.push(a);
    }
    const spins: Spin[] = ['steady', 'wobble', 'reverse', 'stutter'];
    this.lv = {
      need: 5 + Math.floor(r() * 3) + Math.min(3, n),
      speed: Math.min(5.2, 1.7 + n * 0.38),
      dir: r() < 0.5 ? 1 : -1,
      spin: n === 0 ? 'steady' : spins[Math.floor(r() * spins.length)],
      stuck,
    };
    this.log.removeAll(true);
    this.angles = [];
    this.stuckHere = 0;
    this.spinT = 0;
    this.logArt = this.add.image(0, 0, 'log').setScale(K);
    this.log.add(this.logArt);
    for (const a of stuck) this.stick(a);
    this.log.rotation = 0;
    if (animate) {
      this.log.setScale(0.2).setAlpha(0);
      this.tweens.add({ targets: this.log, scale: 1, alpha: 1, duration: 380, ease: 'Back.Out' });
    }
    this.drawIcons();
  }

  /** The knives left for this log, down the left side */
  private drawIcons(): void {
    for (const i of this.icons) i.destroy();
    this.icons = [];
    for (let i = 0; i < this.lv.need; i++) {
      const used = i < this.stuckHere;
      const icon = this.add.image(26, H - 40 - i * 30, 'knife').setScale(K * 0.32).setAlpha(used ? 0.25 : 1);
      this.icons.push(icon);
    }
  }

  started(): void {
    this.input.on('pointerdown', () => this.throwKnife());
  }

  private throwKnife(): void {
    if (!this.running || this.flying || this.changing) return;
    this.flying = this.held;
    this.sfx('throw');
    this.held = this.art(CX, HOLD_Y + 80, 'knife').setAlpha(0);
    this.tweens.add({ targets: this.held, y: HOLD_Y, alpha: 1, duration: 140, ease: 'Cubic.Out' });
  }

  /** How fast the log turns now (radians a second, signed) */
  private spinSpeed(): number {
    const { speed, dir, spin } = this.lv;
    const t = this.spinT;
    switch (spin) {
      case 'steady':
        return speed * dir;
      case 'wobble':
        return speed * dir * (1 + 0.65 * Math.sin(t * 1.8));
      case 'reverse':
        // Turns back every 2.4 s, slowing down before
        return speed * dir * Math.cos((t * Math.PI) / 2.4) * 1.2;
      case 'stutter':
        return speed * dir * (Math.floor(t / 0.8) % 2 ? 1.6 : 0.35);
    }
  }

  tick(dt: number): void {
    this.spinT += dt;
    this.log.rotation += this.spinSpeed() * dt;
    const k = this.flying;
    if (!k) return;
    k.y -= THROW_SPEED * dt;
    // The tip reaches the log (its bottom, where knives come from)
    if (k.y - KNIFE_LEN / 2 > CY + LOG_R - SINK) return;
    this.flying = null;
    const a = Phaser.Math.Angle.Wrap(Math.PI / 2 - this.log.rotation);
    if (this.angles.some((b) => Math.abs(Phaser.Math.Angle.Wrap(a - b)) < GAP)) this.bounce(k);
    else this.land(k, a);
  }

  private land(k: Phaser.GameObjects.Image, a: number): void {
    k.destroy();
    this.stick(a);
    this.stuckHere++;
    this.addScore(1);
    this.sfx('thunk');
    this.buzz(12);
    this.burst(CX, CY + LOG_R - 4, '#e3b06d', 8, 220, 'chip', 700);
    // The log jumps a little under the blow
    this.tweens.add({ targets: this.log, y: CY - 7, duration: 50, yoyo: true, ease: 'Quad.Out' });
    this.drawIcons();
    if (this.stuckHere >= this.lv.need) this.clearLog();
  }

  /** The log is full: it bursts, its knives fly off, and the next one comes */
  private clearLog(): void {
    this.changing = true;
    this.sfx('level');
    this.buzz([20, 30, 40]);
    this.burst(CX, CY, '#d99a55', 34, 520, 'chip', 900);
    this.burst(CX, CY, '#ffd9a0', 18, 300);
    this.flash('#ffcf8a', 120);
    for (const k of this.log.list as Phaser.GameObjects.Image[]) {
      if (k === this.logArt) continue;
      const wp = k.getWorldTransformMatrix();
      const img = this.add.image(wp.tx, wp.ty, 'knife').setScale(K).setRotation(k.rotation + this.log.rotation);
      const out = Math.atan2(wp.ty - CY, wp.tx - CX);
      this.tweens.add({
        targets: img,
        x: wp.tx + Math.cos(out) * 260,
        y: wp.ty + Math.sin(out) * 260 + 200,
        rotation: img.rotation + (this.rand() < 0.5 ? -6 : 6),
        alpha: 0,
        duration: 700,
        ease: 'Quad.In',
        onComplete: () => img.destroy(),
      });
    }
    this.log.removeAll(true);
    this.pop(CX, CY, `LOG ${this.level + 2}`, '#ffd28a', 40);
    this.level++;
    this.time.delayedCall(520, () => {
      this.newLevel(true);
      this.changing = false;
    });
  }

  /** On a knife: it bounces off, the run is over */
  private bounce(k: Phaser.GameObjects.Image): void {
    this.sfx('clang');
    this.sfx('crash', 0.6);
    this.buzz([60, 40, 120]);
    this.shake(260, 0.02);
    this.flash('#ff4040', 200);
    this.burst(k.x, k.y - KNIFE_LEN / 2, '#ffffff', 10, 260);
    this.tweens.add({ targets: k, y: H + 120, x: k.x + 70, rotation: 7, duration: 900, ease: 'Quad.In' });
    this.out();
  }

  finished(why: 'out' | 'time'): void {
    this.input.removeAllListeners();
    if (why === 'time') this.pop(CX, H / 2 + 80, 'TIME', '#ffffff', 46);
  }

  idle(dt: number): void {
    // The log turns slowly before the start, and goes on after the end
    this.log.rotation += (this.ended ? 0.6 : 0.9) * dt * (this.lv?.dir ?? 1);
  }
}
