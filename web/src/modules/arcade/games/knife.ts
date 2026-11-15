import Phaser from 'phaser';
import { ArcadeScene, H, INK, PX, W } from '../engine/base.ts';

const CX = W / 2;
const CY = 250;
/** The log's radius, and how deep a knife sinks into it */
const LOG_R = 80;
const SINK = 18;
const KNIFE_LEN = 100;
/** Two knives closer than this (radians, around the log) touch */
const GAP = 0.2;
/** A knife this close to an apple slices it */
const APPLE_GAP = 0.28;
const THROW_SPEED = 2800;
const HOLD_Y = 560;

type Spin = 'steady' | 'wobble' | 'reverse' | 'stutter';

interface Level {
  need: number;
  speed: number;
  dir: 1 | -1;
  spin: Spin;
  /** Knives already in the log when it comes (angles on the log) */
  stuck: number[];
  /** An apple on the rim (angle on the log), or none */
  apple: number | null;
}

/**
 * Knife Throw: a log spins on the tavern's wall, the player's character waits below with a knife.
 * A tap throws it; it sinks into the log, unless it lands on a knife already there (a life lost).
 * Some logs carry an apple: slice it for bonus points. Each log takes a few knives, then bursts and
 * a faster one comes, spinning in a way of its own (steady, wobbling, turning back, stuttering). The
 * corner shows which log the rival is on.
 */
export class KnifeScene extends ArcadeScene {
  private log!: Phaser.GameObjects.Container;
  private logArt!: Phaser.GameObjects.Image;
  private apple: Phaser.GameObjects.Image | null = null;
  /** Angles (on the log) of the knives in it */
  private angles: number[] = [];
  private level = 0;
  private lv!: Level;
  private stuckHere = 0;
  private held!: Phaser.GameObjects.Image;
  private flying: Phaser.GameObjects.Image | null = null;
  /** Between two logs, and after a knife bounced: no throwing */
  private changing = false;
  private spinT = 0;
  private icons: Phaser.GameObjects.Image[] = [];
  private hero!: Phaser.GameObjects.Sprite;
  private flames: Phaser.GameObjects.Image[] = [];

  build(): void {
    this.paintArt();
    this.sprite(W / 2, H / 2, 'knife-wall').setDepth(-100);
    // Two torches on the wall, a warm glow behind the log
    for (const x of [44, W - 44]) {
      this.sprite(x, 120, 'knife-torch').setDepth(-90);
      this.flames.push(this.sprite(x, 92, 'knife-flame').setDepth(-89));
    }
    this.sprite(CX, CY, 'knife-glow').setDepth(-95).setAlpha(0.9);
    // The floor boards
    this.add.rectangle(W / 2, H - 50, W, 100, 0x2a160e).setDepth(-80);
    this.add.rectangle(W / 2, H - 100, W, PX * 2, 0x4a2a18).setDepth(-79);

    this.log = this.add.container(CX, CY);
    this.newLevel(false);
    this.hero = this.avatar('me', CX - 58, H - 40).setDepth(30);
    this.pose(this.hero, 'idleUp');
    this.held = this.sprite(CX, HOLD_Y, 'knife').setDepth(31);
  }

  private paintArt(): void {
    this.pix('knife-wall', W / PX, H / PX, (p) => {
      const w = W / PX;
      const h = H / PX;
      p.rect('#2a1810', 0, 0, w, h);
      // Planks, each a little different
      for (let x = 0, i = 0; x < w; x += 20, i++) {
        p.rect(i % 2 ? '#3a2216' : '#331e13', x, 0, 19, h);
        p.rect('#1a0e08', x + 19, 0, 1, h);
        p.rect('#4a2c1c', x, 0, 1, h);
        for (let y = (i * 37) % 60; y < h; y += 70) {
          p.rect('#24140c', x + 6, y, 6, 3);
          p.rect('#4a2c1c', x + 6, y + 3, 6, 1);
        }
      }
      p.dither('#000000', 0, 0, w, 8);
    });
    this.pix('knife-glow', 140, 140, (p) => {
      for (let r = 70; r > 0; r -= 6) p.disc(`rgba(255,170,90,${0.05 + (70 - r) / 70 * 0.06})`, 70, 70, r);
    });
    this.pix('knife-torch', 8, 22, (p) => {
      p.rect(INK.line, 2, 4, 4, 18);
      p.rect('#6a3a1e', 3, 4, 2, 18);
      p.rect('#8a8a9a', 0, 2, 8, 3);
      p.rect('#5a5a6a', 0, 4, 8, 1);
    });
    this.pix('knife-flame', 10, 14, (p) => {
      p.disc('#ff6a1a', 5, 9, 4, 5);
      p.disc('#ffb43d', 5, 10, 3, 3);
      p.rect('#fff0a0', 4, 9, 2, 3);
      p.rect('#ff6a1a', 4, 1, 2, 4);
    });
    const d = Math.ceil((LOG_R * 2) / PX) + 4;
    this.pix('log', d, d, (p) => {
      const c = d / 2;
      const r = LOG_R / PX;
      p.disc(INK.line, c, c, r + 1);
      p.disc('#4a2a17', c, c, r);
      // Bark bumps round the edge
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        p.disc('#5e3720', c + Math.cos(a) * (r - 1.5), c + Math.sin(a) * (r - 1.5), 1.6);
      }
      // The cut wood with its rings, lit from the top left
      p.disc('#c98d4e', c, c, r - 4);
      p.disc('#dba468', c - 1, c - 1, r - 6);
      for (let rr = r - 8; rr > 2; rr -= 5) {
        p.disc('#b87d44', c, c, rr);
        p.disc(rr > 12 ? '#e6b479' : '#f2c98a', c - 0.5, c - 0.5, rr - 1);
      }
      p.disc('#a86c36', c, c, 1.5);
      // Two cracks from the heart
      for (let i = 0; i < 14; i++) p.rect('#8a5228', c + 2 + i, c - 1 - i, 1, 1);
      for (let i = 0; i < 10; i++) p.rect('#8a5228', c - 2 - i * 0.6, c + 2 + i, 1, 1);
    });
    this.pix('knife', 6, KNIFE_LEN / PX, (p) => {
      const h = KNIFE_LEN / PX;
      // The blade: steel, the edge lit, a point at the top
      p.rect(INK.line, 0, 3, 6, 27);
      p.rect(INK.line, 1, 1, 4, 2);
      p.rect(INK.line, 2, 0, 2, 1);
      p.rect('#c4ccd6', 1, 3, 4, 26);
      p.rect('#f4f7fb', 1, 3, 2, 26);
      p.rect('#e8eef6', 2, 1, 2, 2);
      p.rect('#7c8794', 4, 5, 1, 24);
      // The guard and the handle
      p.rect('#d8a440', 0, 29, 6, 3);
      p.rect('#8a6020', 0, 31, 6, 1);
      p.rect(INK.line, 1, 32, 4, h - 32);
      p.rect('#6b3d22', 2, 32, 2, h - 33);
      p.rect('#d8a440', 2, 37, 2, 1);
      p.rect('#d8a440', 2, 43, 2, 1);
    });
  }

  /** A knife in the log at this angle (on the log) */
  private stick(a: number): Phaser.GameObjects.Image {
    const d = LOG_R - SINK + KNIFE_LEN / 2;
    const k = this.sprite(Math.cos(a) * d, Math.sin(a) * d, 'knife');
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
    let apple: number | null = null;
    if (n > 0 && r() < 0.65) {
      for (let tries = 0; apple === null && tries < 20; tries++) {
        const a = r() * Math.PI * 2;
        if (stuck.every((b) => Math.abs(Phaser.Math.Angle.Wrap(a - b)) > 0.5)) apple = a;
      }
    }
    const spins: Spin[] = ['steady', 'wobble', 'reverse', 'stutter'];
    this.lv = {
      need: 5 + Math.floor(r() * 3) + Math.min(3, n),
      speed: Math.min(5.2, 1.7 + n * 0.38),
      dir: r() < 0.5 ? 1 : -1,
      spin: n === 0 ? 'steady' : spins[Math.floor(r() * spins.length)],
      stuck,
      apple,
    };
    this.log.removeAll(true);
    this.angles = [];
    this.stuckHere = 0;
    this.spinT = 0;
    this.apple = null;
    this.logArt = this.sprite(0, 0, 'log');
    this.log.add(this.logArt);
    for (const a of stuck) this.stick(a);
    if (apple !== null) {
      const d = LOG_R + 10;
      this.apple = this.sprite(Math.cos(apple) * d, Math.sin(apple) * d, 'lpc-apple');
      this.apple.rotation = apple + Math.PI / 2;
      this.log.add(this.apple);
    }
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
      const icon = this.sprite(22, H - 130 - i * 34, 'knife', 1).setAlpha(used ? 0.25 : 1).setDepth(20);
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
    this.tweens.add({ targets: this.hero, scaleY: { from: PX * 0.9, to: PX }, duration: 160, ease: 'Back.Out' });
    this.held = this.sprite(CX, HOLD_Y + 80, 'knife').setAlpha(0).setDepth(31);
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
    this.flicker();
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
    this.good();
    this.sfx('thunk');
    this.buzz(12);
    this.burst(CX, CY + LOG_R - 4, '#e3b06d', 8, 220, 700);
    // The log jumps a little under the blow
    this.tweens.add({ targets: this.log, y: CY - 7, duration: 50, yoyo: true, ease: 'Quad.Out' });
    if (this.apple && this.lv.apple !== null && Math.abs(Phaser.Math.Angle.Wrap(a - this.lv.apple)) < APPLE_GAP) this.sliceApple();
    this.drawIcons();
    if (this.stuckHere >= this.lv.need) this.clearLog();
  }

  private sliceApple(): void {
    const apple = this.apple!;
    const wp = apple.getWorldTransformMatrix();
    this.apple = null;
    apple.destroy();
    const got = this.addScore(2);
    this.good(true);
    this.sfx('slice');
    this.burst(wp.tx, wp.ty, '#ff4d5e', 14, 260);
    this.burst(wp.tx, wp.ty, '#fff0d0', 6, 200);
    this.pop(wp.tx, wp.ty - 30, `+${got}`, INK.gold, 3);
  }

  /** The log is full: it bursts, its knives fly off, and the next one comes */
  private clearLog(): void {
    this.changing = true;
    this.sfx('level');
    this.buzz([20, 30, 40]);
    this.burst(CX, CY, '#d99a55', 34, 520, 900, 3);
    this.burst(CX, CY, '#ffd9a0', 18, 300);
    this.flash('#ffcf8a', 120);
    for (const k of this.log.list as Phaser.GameObjects.Image[]) {
      if (k === this.logArt) continue;
      const wp = k.getWorldTransformMatrix();
      const img = this.sprite(wp.tx, wp.ty, k.texture.key).setRotation(k.rotation + this.log.rotation);
      const out = Math.atan2(wp.ty - CY, wp.tx - CX);
      this.tweens.add({
        targets: img,
        x: wp.tx + Math.cos(out) * 260,
        y: wp.ty + Math.sin(out) * 260 + 200,
        rotation: img.rotation + (out > 0 ? -6 : 6),
        alpha: 0,
        duration: 700,
        ease: 'Quad.In',
        onComplete: () => img.destroy(),
      });
    }
    this.log.removeAll(true);
    const got = this.addScore(1);
    this.good(true);
    this.pop(CX, CY - 20, `+${got}`, INK.gold, 4);
    this.pose(this.hero, 'emote', 8, 0);
    this.level++;
    this.time.delayedCall(520, () => {
      this.newLevel(true);
      this.changing = false;
      if (this.running) this.pose(this.hero, 'idleUp');
    });
  }

  /** On a knife: it bounces off, a life lost */
  private bounce(k: Phaser.GameObjects.Image): void {
    this.sfx('clang');
    this.shake(260, 0.02);
    this.flash('#ff4040', 200);
    this.burst(k.x, k.y - KNIFE_LEN / 2, '#ffffff', 10, 260);
    this.tweens.add({ targets: k, y: H + 120, x: k.x + 70, rotation: 7, duration: 900, ease: 'Quad.In', onComplete: () => k.destroy() });
    this.changing = true;
    if (this.miss()) this.time.delayedCall(450, () => (this.changing = false));
  }

  private flicker(): void {
    const t = this.time.now;
    this.flames.forEach((f, i) => {
      f.setScale(PX * (0.9 + Math.abs(Math.sin(t / 90 + i * 2)) * 0.25), PX * (0.85 + Math.abs(Math.sin(t / 70 + i)) * 0.35));
    });
  }
  ghost(): number[] {
    return [this.level, this.stuckHere];
  }

  finished(why: 'out' | 'time'): void {
    this.input.removeAllListeners();
    this.pose(this.hero, why === 'out' ? 'hurt' : 'idleUp', 8, why === 'out' ? 0 : -1);
  }

  idle(dt: number): void {
    // The log turns slowly before the start, and goes on after the end
    this.log.rotation += (this.ended ? 0.6 : 0.9) * dt * (this.lv?.dir ?? 1);
    this.flicker();
  }
}
