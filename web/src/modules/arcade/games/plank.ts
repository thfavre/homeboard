import Phaser from 'phaser';
import { ArcadeScene, H, INK, PX, W, hex } from '../engine/base.ts';

/** The roofs' top */
const ROOF_Y = 470;
/** How fast the plank grows (units a second) */
const GROW = 380;
const WALK = 230;
/** The gold mark in the middle of each roof: a tip this close to its middle is perfect */
const PERFECT = 6;
/** Where the hero stands on the screen once the view has moved on */
const HERO_ON_SCREEN = 100;

interface Roof {
  x0: number;
  x1: number;
  g: Phaser.GameObjects.Graphics;
}

type State = 'ready' | 'growing' | 'laying' | 'walking' | 'falling';

/**
 * Plank: the player's character crosses the town by its rooftops at night. Hold to grow a plank
 * straight up from the edge of the roof, let go to lay it down toward the next roof. If it reaches
 * that roof, the character walks over (the gold mark in its middle scores double); too short or too
 * long and they fall: a life lost, and they try again from the same roof. The roofs come from the
 * seed: the rival crosses the same ones, as a ghost.
 */
export class PlankScene extends ArcadeScene {
  private roofs: Roof[] = [];
  /** The roof the hero stands on */
  private onRoof = 0;
  private state: State = 'ready';
  private hero!: Phaser.GameObjects.Sprite;
  private plank!: Phaser.GameObjects.Container;
  private plankArt!: Phaser.GameObjects.TileSprite;
  private len = 0;
  private growSound = 0;
  private camX = 0;
  private bg!: Phaser.GameObjects.Image;
  private far!: Phaser.GameObjects.TileSprite;
  private moon!: Phaser.GameObjects.Image;
  private stars: Phaser.GameObjects.Rectangle[] = [];
  private ghostBody!: Phaser.GameObjects.Sprite;
  private tag!: Phaser.GameObjects.Container;
  private planks: Phaser.GameObjects.Container[] = [];

  build(): void {
    this.canWatch = true;
    this.bg = this.backdrop('plank-sky', ['#0a0a24', '#14123a', '#221a52', '#3a2266', '#5a2c74']);
    this.paintArt();
    for (let i = 0; i < 50; i++) {
      this.stars.push(this.add.rectangle(Math.random() * W, Math.random() * 360, PX, PX, 0xffffff, 0.2 + Math.random() * 0.6).setDepth(-95));
    }
    this.moon = this.sprite(320, 110, 'plank-moon').setDepth(-94);
    this.far = this.add.tileSprite(W / 2, ROOF_Y + 10, W / PX, 90, 'plank-far').setScale(PX).setDepth(-90);
    // The first roof is wide; the others come from the seed
    this.addRoof(-40, 130);
    while (this.roofs.length < 6) this.nextRoof();
    this.ghostBody = this.avatar('rival', 0, ROOF_Y).setAlpha(0.45).setDepth(18).setVisible(false);
    this.tag = this.rivalTag().setVisible(false);
    this.hero = this.avatar('me', this.roofs[0].x1 - 14, ROOF_Y).setDepth(20);
    this.pose(this.hero, 'idleRight');
    this.newPlank();
    this.camX = this.wantCam(this.hero.x);
    this.view();
  }

  private paintArt(): void {
    this.pix('plank-moon', 24, 24, (p) => {
      p.disc('#fff2c8', 12, 12, 11);
      p.disc('#e6d7a6', 8, 14, 3);
      p.disc('#e6d7a6', 15, 8, 2);
    });
    this.pix('plank-far', 100, 45, (p) => {
      let x = 0;
      for (const [w, h, dome] of [
        [14, 26, 0],
        [10, 34, 1],
        [18, 20, 0],
        [12, 40, 0],
        [16, 28, 1],
        [12, 22, 0],
        [18, 32, 0],
      ] as const) {
        p.rect('#1c1840', x, 45 - h, w, h);
        if (dome) p.disc('#1c1840', x + w / 2, 45 - h, w / 2 - 1, 4);
        for (let wy = 45 - h + 4; wy < 43; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4) if ((wx * 11 + wy * 5) % 7 < 2) p.rect('#e8b860', wx, wy, 1, 2);
        x += w;
      }
    });
    this.pix('plank-wood', 4, 8, (p) => {
      p.rect(INK.line, 0, 0, 4, 8);
      p.rect('#b7854e', 1, 0, 2, 8);
      p.rect('#d9a86a', 1, 0, 1, 8);
      p.rect('#8a5e32', 1, 5, 2, 1);
    });
  }

  /** A roof from x0 to x1: its ledge, the wall below with windows, a gold mark in the middle */
  private addRoof(x0: number, x1: number): void {
    const n = this.roofs.length;
    const g = this.add.graphics().setDepth(5);
    const w = x1 - x0;
    const wall = [0x3a2a5a, 0x4a2a4a, 0x2a3a5a, 0x3a3a4a][n % 4];
    g.fillStyle(hex(INK.line), 1).fillRect(x0, ROOF_Y, w, H - ROOF_Y + 40);
    g.fillStyle(wall, 1).fillRect(x0 + PX, ROOF_Y + PX * 4, w - PX * 2, H - ROOF_Y + 40);
    g.fillStyle(0x8a7a9a, 1).fillRect(x0, ROOF_Y, w, PX * 4);
    g.fillStyle(0xbcaeca, 1).fillRect(x0, ROOF_Y, w, PX);
    g.fillStyle(0x000000, 0.25).fillRect(x0 + w - PX * 3, ROOF_Y + PX * 4, PX * 2, H - ROOF_Y);
    let k = n * 13 + 5;
    for (let y = ROOF_Y + 26; y < H; y += 34) {
      for (let x = x0 + 10; x + 12 < x1 - 6; x += 22) {
        k = (k * 29 + 11) % 89;
        const lit = k % 3 !== 0;
        g.fillStyle(lit ? 0xffd27a : 0x1a1530, 1).fillRect(x, y, PX * 5, PX * 7);
        if (lit) g.fillStyle(0xfff0c0, 1).fillRect(x, y, PX * 5, PX * 2);
      }
    }
    if (n > 0) {
      const mid = (x0 + x1) / 2;
      g.fillStyle(hex(INK.goldDark), 1).fillRect(mid - PERFECT, ROOF_Y, PERFECT * 2, PX * 2);
      g.fillStyle(hex(INK.gold), 1).fillRect(mid - PERFECT, ROOF_Y, PERFECT * 2, PX);
    }
    this.roofs.push({ x0, x1, g });
  }

  /** The next roof from the seed: further and narrower as it goes (the same for both players) */
  private nextRoof(): void {
    const n = this.roofs.length;
    const last = this.roofs[n - 1];
    const gap = 40 + this.rand() * (90 + Math.min(80, n * 4));
    const width = Math.max(28, (100 - Math.min(60, n * 2.5)) * (0.6 + this.rand() * 0.7));
    const x0 = Math.round((last.x1 + gap) / PX) * PX;
    this.addRoof(x0, x0 + Math.round(width / PX) * PX);
  }

  /** A plank standing at the edge of the hero's roof, not grown yet */
  private newPlank(): void {
    const r = this.roofs[this.onRoof];
    this.len = 0;
    this.plank = this.add.container(r.x1, ROOF_Y).setDepth(15);
    this.plankArt = this.add.tileSprite(0, 0, 4, 1, 'plank-wood').setScale(PX).setOrigin(0.5, 1);
    this.plank.add(this.plankArt);
    this.plank.setVisible(false);
  }

  started(): void {
    this.input.on('pointerdown', () => {
      if (!this.running || this.state !== 'ready') return;
      this.state = 'growing';
      this.plank.setVisible(true);
      this.pose(this.hero, 'emote', 6);
    });
    const up = () => {
      if (this.state === 'growing') this.lay();
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  tick(dt: number): void {
    if (this.state === 'growing') {
      this.len = Math.min(H, this.len + GROW * dt);
      this.plankArt.height = Math.max(1, this.len / PX);
      this.growSound -= dt;
      if (this.growSound <= 0) {
        this.growSound = 0.07;
        this.sfx('grow', 0.6 + Math.min(0.6, this.len / 600));
      }
    }
    this.blink(this.hero);
    this.view(dt);
  }

  /** Let go: the plank falls toward the next roof */
  private lay(): void {
    this.state = 'laying';
    this.pose(this.hero, 'idleRight');
    this.tweens.add({
      targets: this.plank,
      rotation: Math.PI / 2,
      duration: 280,
      ease: 'Quad.In',
      onComplete: () => {
        this.sfx('land');
        this.shake(80, 0.004);
        this.judge();
      },
    });
  }

  /** Where the plank's tip landed: on the next roof, on its gold mark, or nowhere */
  private judge(): void {
    if (!this.running) return;
    const from = this.roofs[this.onRoof];
    const next = this.roofs[this.onRoof + 1];
    const tip = from.x1 + this.len;
    const onIt = tip >= next.x0 && tip <= next.x1;
    this.state = 'walking';
    this.pose(this.hero, 'walk', 11);
    const to = onIt ? next.x1 - 14 : tip + 6;
    this.tweens.add({
      targets: this.hero,
      x: to,
      duration: (Math.abs(to - this.hero.x) / WALK) * 1000,
      onComplete: () => (onIt ? this.across(Math.abs(tip - (next.x0 + next.x1) / 2) <= PERFECT) : this.fall()),
    });
  }

  private across(perfect: boolean): void {
    if (!this.running) return;
    this.onRoof++;
    this.planks.push(this.plank);
    if (perfect) {
      const got = this.addScore(2);
      this.good(true);
      this.sfx('perfect');
      this.pop(this.hero.x, ROOF_Y - 120, `PERFECT +${got}`, INK.gold, 3);
      this.burst((this.roofs[this.onRoof].x0 + this.roofs[this.onRoof].x1) / 2, ROOF_Y, INK.gold, 14, 220);
    } else {
      const got = this.addScore(1);
      this.good();
      this.sfx('point');
      if (got > 1) this.pop(this.hero.x, ROOF_Y - 120, `+${got}`, INK.gold, 3);
    }
    this.buzz(10);
    while (this.roofs.length < this.onRoof + 5) this.nextRoof();
    this.pose(this.hero, 'idleRight');
    this.newPlank();
    this.state = 'ready';
  }

  /** Off the end of the plank, down between the houses */
  private fall(): void {
    this.state = 'falling';
    this.pose(this.hero, 'hurt', 8, 0);
    const plank = this.plank;
    this.tweens.add({ targets: plank, rotation: Math.PI, duration: 380, ease: 'Quad.In', onComplete: () => this.tweens.add({ targets: plank, y: H + 200, alpha: 0, duration: 500, onComplete: () => plank.destroy() }) });
    this.hero.setDepth(2);
    this.tweens.add({ targets: this.hero, y: H + 140, duration: 650, ease: 'Quad.In' });
    this.shake(200, 0.012);
    if (this.miss()) {
      this.time.delayedCall(800, () => {
        if (!this.running) return;
        // Back on the roof it fell from
        this.hero.setDepth(20).setPosition(this.roofs[this.onRoof].x1 - 14, ROOF_Y);
        this.pose(this.hero, 'idleRight');
        this.burst(this.hero.x, ROOF_Y - 40, '#ffffff', 10, 160, 0);
        this.newPlank();
        this.state = 'ready';
      });
    }
  }

  /** Where the camera's left edge goes to have x where the hero stands on the screen */
  private wantCam(x: number): number {
    return x - HERO_ON_SCREEN;
  }

  /** The view moves on with the hero (or the ghost, once watching); the far city and the sky slower */
  private view(dt = 1, x = this.hero.x): void {
    const want = this.wantCam(x);
    this.camX += (want - this.camX) * Math.min(1, dt * 3);
    this.cameras.main.centerOn(this.camX + W / 2, H / 2);
    this.bg.x = this.camX + W / 2;
    this.far.x = this.camX + W / 2;
    this.far.tilePositionX = (this.camX * 0.3) / PX;
    this.moon.x = this.camX + 320;
    for (const s of this.stars) {
      if (s.x < this.camX - 10) s.x += W + 20;
    }
    this.drawGhost();
  }

  private drawGhost(): void {
    const d = this.ghostNow();
    if (!d || this.rivalDone) return;
    while (this.roofs.length < d[0] + 4) this.nextRoof();
    const x = d[1];
    const right = this.camX + W - 24;
    this.ghostBody.setVisible(x < right).setPosition(x, d[2] ? ROOF_Y + 200 : ROOF_Y);
    // Ahead of the view: their name at the right edge, with an arrow
    this.placeTag(this.tag.setVisible(true), x, ROOF_Y - this.avatarHeight('rival') - 14);
    const name = this.opts.rival.name.trim().split(/\s+/)[0] ?? '';
    this.relabel(this.tag, x < right ? name.slice(0, 8) : `${name.slice(0, 6)} >`);
  }

  ghost(): number[] {
    return [this.onRoof, Math.round(this.hero.x), this.state === 'falling' ? 1 : 0];
  }

  watch(dt: number): void {
    const d = this.ghostNow();
    this.view(dt, d ? d[1] : this.hero.x);
  }

  rivalGone(): void {
    this.tag.setVisible(false);
    this.tweens.add({ targets: this.ghostBody, alpha: 0, duration: 600 });
  }

  idle(dt: number): void {
    this.view(dt);
  }

  finished(why: 'out' | 'time'): void {
    this.input.removeAllListeners();
    if (why === 'time' && this.state !== 'falling') this.pose(this.hero, 'happy');
  }
}
