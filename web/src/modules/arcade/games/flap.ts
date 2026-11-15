import Phaser from 'phaser';
import { ArcadeScene, H, INK, PX, W } from '../engine/base.ts';

const FLYER_X = 130;
/** The flyer's sprite scale (units a sprite pixel), and its round hitbox */
const FLYER_SCALE = 1.5;
const FLYER_R = 17;
const GRAVITY = 1500;
const FLAP_V = -500;
const GROUND = 660;
const WALL_W = 76;
const SPACING = 250;

interface Wall {
  /** Its number from the start: the gap and the speed follow it, the same on both phones */
  n: number;
  x: number;
  gapY: number;
  gap: number;
  top: Phaser.GameObjects.Container;
  bottom: Phaser.GameObjects.Container;
  /** Past the flyer */
  passed: boolean;
  /** Bumped into: it scores nothing */
  hit: boolean;
}

interface Flyer {
  box: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  wing: Phaser.GameObjects.Image;
}

/**
 * Flap: the player's character flies with little wings over the town at sunset; a tap flaps up.
 * Brick chimneys come from the right with a gap to fly through, narrower and faster the further it
 * goes (by distance, the same for both players). Right through the middle of a gap scores double.
 * A chimney or the ground costs a life (the flyer blinks through for a moment). The rival flies
 * beside as a ghost; once out, the player watches them go on.
 */
export class FlapScene extends ArcadeScene {
  private me!: Flyer;
  private them!: Flyer;
  private tag!: Phaser.GameObjects.Container;
  private vy = 0;
  private walls: Wall[] = [];
  private made = 0;
  /** Walls gone past the flyer's x, scored or not: the speed follows it */
  private gone = 0;
  private nextAt = W + 120;
  private lastGap = 380;
  private clouds: Phaser.GameObjects.Image[] = [];
  private roofs!: Phaser.GameObjects.TileSprite;
  private street!: Phaser.GameObjects.TileSprite;
  private hover = 0;
  private down = false;

  build(): void {
    this.canWatch = true;
    this.backdrop('flap-sky', ['#24154d', '#3b1d63', '#5e2777', '#8f3478', '#c74c6c', '#f0785a', '#ffaa66']);
    this.paintArt();
    // The sun low over the roofs, clouds, the town's roofs far away, the street
    this.sprite(290, 470, 'flap-sun').setDepth(-95);
    for (let i = 0; i < 5; i++) {
      const c = this.sprite(this.rand() * W, 70 + this.rand() * 300, i % 2 ? 'flap-cloud' : 'flap-cloud2').setDepth(-92);
      this.clouds.push(c);
    }
    this.roofs = this.add.tileSprite(W / 2, GROUND - 60, W / PX, 120 / PX, 'flap-roofs').setScale(PX).setDepth(-90);
    this.street = this.add.tileSprite(W / 2, GROUND + (H - GROUND) / 2, W / PX, (H - GROUND) / PX, 'flap-street').setScale(PX).setDepth(20);

    this.them = this.flyer('rival', FLYER_X - 26, 300);
    this.them.box.setAlpha(0.42).setDepth(28).setVisible(false);
    this.tag = this.rivalTag().setVisible(false);
    this.me = this.flyer('me', FLYER_X, 330);
  }

  private flyer(who: 'me' | 'rival', x: number, y: number): Flyer {
    const box = this.add.container(x, y).setDepth(30);
    const wing = this.sprite(-8, -4, 'flap-wing').setOrigin(0.9, 0.7);
    // Feet at the bottom of the hitbox: the body's middle is the box's middle
    const body = this.avatar(who, 0, this.avatarHeight(who, FLYER_SCALE) / 2, FLYER_SCALE);
    this.pose(body, 'run', 12);
    box.add([wing, body]);
    return { box, body, wing };
  }

  private paintArt(): void {
    this.pix('flap-sun', 44, 44, (p) => {
      p.disc('#ffd9a0', 22, 22, 21);
      p.disc('#ffe9c4', 22, 22, 17);
      p.disc('#fff6e0', 20, 19, 9);
    });
    for (const [key, w] of [
      ['flap-cloud', 40],
      ['flap-cloud2', 30],
    ] as const) {
      this.pix(key, w, 14, (p) => {
        p.disc('#ffd3c4', w * 0.3, 9, w * 0.2, 5);
        p.disc('#ffd3c4', w * 0.55, 7, w * 0.25, 6);
        p.disc('#ffd3c4', w * 0.78, 9, w * 0.18, 4);
        p.rect('#e8a3a8', 2, 12, w - 4, 2);
        p.rect('#fff0e6', w * 0.42, 2, w * 0.2, 2);
      });
    }
    // Roofs and chimneys far away, a strip that tiles across
    this.pix('flap-roofs', 100, 60, (p) => {
      const d = '#4a1f5e';
      const dd = '#3a1850';
      let x = 0;
      for (const [w, h, peak] of [
        [22, 26, 1],
        [16, 34, 0],
        [26, 22, 1],
        [14, 40, 0],
        [22, 28, 1],
      ] as const) {
        p.rect(d, x, 60 - h, w, h);
        if (peak) for (let i = 0; i < w / 2; i++) p.rect(d, x + i, 60 - h - i * 0.6, w - i * 2, 1);
        // Lit windows
        for (let wy = 60 - h + 6; wy < 56; wy += 8) for (let wx = x + 3; wx < x + w - 3; wx += 6) if ((wx * 7 + wy * 3) % 5 < 2) p.rect('#ffcf7a', wx, wy, 2, 3);
        p.rect(dd, x + w - 2, 60 - h, 2, h);
        x += w;
      }
    });
    this.pix('flap-street', 16, (H - GROUND) / PX, (p) => {
      p.rect('#3a2440', 0, 0, 16, 40);
      p.rect('#ffb36b', 0, 0, 16, 1);
      p.rect('#5a3a52', 0, 1, 16, 2);
      // Cobblestones
      for (let y = 4; y < 40; y += 6) {
        const off = (y / 6) % 2 ? 4 : 0;
        for (let x = -8 + off; x < 16; x += 8) {
          p.rect('#4e3150', x + 1, y, 6, 4);
          p.rect('#6a4566', x + 1, y, 6, 1);
        }
      }
    });
    this.pix('flap-wing', 14, 10, (p) => {
      p.rect(INK.line, 1, 2, 12, 6);
      p.rect('#ffffff', 2, 3, 10, 4);
      p.rect('#dfe6ff', 2, 6, 10, 1);
      p.rect('#ffffff', 0, 3, 2, 2);
      p.rect(INK.line, 4, 5, 1, 1);
      p.rect(INK.line, 7, 5, 1, 1);
    });
    // A chimney: bricks (tiled down), a stone cap on the gap's side
    this.pix('flap-brick', WALL_W / PX, 12, (p) => {
      const w = WALL_W / PX;
      p.rect('#7a2e2e', 0, 0, w, 12);
      for (let y = 0; y < 12; y += 6) {
        const off = y ? 5 : 0;
        for (let x = -10 + off; x < w; x += 10) {
          p.rect('#b5483a', x + 1, y + 1, 8, 4);
          p.rect('#d06a4c', x + 1, y + 1, 8, 1);
        }
      }
      p.rect('#5a1e24', 0, 0, 2, 12);
      p.rect(INK.line, 0, 0, 1, 12);
      p.rect(INK.line, w - 1, 0, 1, 12);
      p.rect('#5a1e24', w - 4, 0, 3, 12);
    });
    this.pix('flap-cap', WALL_W / PX + 6, 9, (p) => {
      const w = WALL_W / PX + 6;
      p.rect(INK.line, 0, 0, w, 9);
      p.rect('#9a8aa8', 1, 1, w - 2, 7);
      p.rect('#cfc2d8', 1, 1, w - 2, 2);
      p.rect('#6a5a7a', 1, 6, w - 2, 2);
    });
    this.pix('flap-smoke', 6, 6, (p) => {
      p.disc('#d8c8e0', 3, 3, 2.6);
      p.rect('#ffffff', 2, 1, 2, 1);
    });
  }

  /** A chimney from y0 to y1, its cap on the gap's side */
  private chimney(x: number, y0: number, y1: number, capAtBottom: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, 0).setDepth(10);
    const h = y1 - y0;
    c.add(this.add.tileSprite(0, y0 + h / 2, WALL_W / PX, h / PX, 'flap-brick').setScale(PX));
    c.add(this.sprite(0, capAtBottom ? y1 - 9 : y0 + 9, 'flap-cap'));
    return c;
  }

  private spawnWall(x: number): void {
    const n = this.made++;
    const gap = Math.max(168, 216 - n * 2.2);
    const lo = 100 + gap / 2;
    const hi = GROUND - 60 - gap / 2;
    let y = lo + this.rand() * (hi - lo);
    y = Phaser.Math.Clamp(y, this.lastGap - 230, this.lastGap + 230);
    this.lastGap = y;
    this.walls.push({
      n,
      x,
      gapY: y,
      gap,
      top: this.chimney(x, -40, y - gap / 2, true),
      bottom: this.chimney(x, y + gap / 2, GROUND, false),
      passed: false,
      hit: false,
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
    this.tweens.add({ targets: this.me.wing, rotation: { from: -1, to: 0.4 }, duration: 160, ease: 'Quad.Out' });
  }

  /** Units a second: faster with each chimney gone by (the same for both players) */
  private speed(): number {
    return 175 + Math.min(85, this.gone * 2.5);
  }

  tick(dt: number): void {
    this.world(dt);
    // The flyer
    this.vy = Math.min(820, this.vy + GRAVITY * dt);
    const f = this.me.box;
    f.y += this.vy * dt;
    if (f.y < FLYER_R) {
      f.y = FLYER_R;
      this.vy = 0;
    }
    f.rotation = Phaser.Math.Clamp(this.vy / 1000, -0.4, 0.9);
    this.blink(f);

    for (const w of this.walls) {
      if (!w.passed && w.x + WALL_W / 2 < FLYER_X - FLYER_R) {
        w.passed = true;
        if (!w.hit) this.through(w);
      }
      // Touching a chimney (the flyer a circle, the chimney a box, its cap a bit wider)
      if (!w.hit && !this.safe && Math.abs(w.x - FLYER_X) < WALL_W / 2 + FLYER_R - 3) {
        if (f.y - FLYER_R + 4 < w.gapY - w.gap / 2 || f.y + FLYER_R - 4 > w.gapY + w.gap / 2) {
          w.hit = true;
          if (!this.crash(false)) return;
        }
      }
    }
    if (f.y + FLYER_R >= GROUND) {
      f.y = GROUND - FLYER_R;
      if (!this.safe) {
        if (!this.crash(true)) return;
      } else this.vy = FLAP_V * 0.8;
    }
  }

  /** Through a gap: right through the middle scores double */
  private through(w: Wall): void {
    const off = Math.abs(this.me.box.y - w.gapY) / (w.gap / 2);
    if (off < 0.3) {
      const got = this.addScore(2);
      this.good(true);
      this.sfx('perfect', 0.7);
      this.pop(FLYER_X + 10, this.me.box.y - 50, `NICE +${got}`, INK.gold, 3);
    } else {
      const got = this.addScore(1);
      this.good();
      this.sfx('point');
      if (got > 1) this.pop(FLYER_X + 10, this.me.box.y - 50, `+${got}`, INK.gold, 3);
    }
    this.buzz(8);
  }

  /** The chimneys, the clouds, the roofs and the street move on (the rival's ghost too) */
  private world(dt: number): void {
    const v = this.speed();
    this.scroll(v * dt);
    // New chimneys as the last one moves in
    this.nextAt -= v * dt;
    if (this.nextAt <= W + 60) {
      this.spawnWall(this.nextAt + WALL_W);
      this.nextAt += SPACING;
    }
    for (const w of this.walls) {
      const before = w.x;
      w.x -= v * dt;
      w.top.x = w.x;
      w.bottom.x = w.x;
      if (before + WALL_W / 2 >= FLYER_X - FLYER_R && w.x + WALL_W / 2 < FLYER_X - FLYER_R) this.gone++;
      // Smoke from the chimneys standing on the ground, now and then (not from the seed: both phones draw the same chimneys)
      if (Math.random() < dt * 1.2 && w.x < W + 20) this.smoke(w.x, w.gapY + w.gap / 2);
    }
    this.walls = this.walls.filter((w) => {
      if (w.x > -WALL_W) return true;
      w.top.destroy();
      w.bottom.destroy();
      return false;
    });
    this.drawGhost(dt);
  }

  private smoke(x: number, y: number): void {
    const s = this.sprite(x + (Math.random() - 0.5) * 30, y + 6, 'flap-smoke').setDepth(11).setAlpha(0.8);
    this.tweens.add({ targets: s, y: y - 30, x: s.x - 70, alpha: 0, scale: PX * 2, duration: 1200, onComplete: () => s.destroy() });
  }

  private drawGhost(dt: number): void {
    const d = this.ghostNow();
    const box = this.them.box;
    if (!d || this.rivalDone) return;
    box.setVisible(true);
    box.y = d[0];
    box.rotation = Phaser.Math.Clamp(d[1] / 1000, -0.4, 0.9);
    this.them.wing.rotation = Math.sin(this.time.now / 70) * 0.5;
    this.placeTag(this.tag.setVisible(true), box.x, box.y - 46);
    void dt;
  }

  private scroll(dx: number): void {
    this.street.tilePositionX += dx / PX;
    this.roofs.tilePositionX += (dx * 0.3) / PX;
    for (const c of this.clouds) {
      c.x -= dx * 0.12;
      if (c.x < -60) c.x = W + 60;
    }
  }

  /** A crash: a life lost (false: it was the last) */
  private crash(ground: boolean): boolean {
    this.shake(220, 0.018);
    this.flash('#ffffff', 120);
    this.burst(this.me.box.x, this.me.box.y, '#ffffff', 12, 240);
    this.pose(this.me.body, 'hurt', 8, 0);
    this.time.delayedCall(500, () => this.running && this.pose(this.me.body, 'run', 12));
    if (!this.miss()) {
      this.down = true;
      return false;
    }
    this.vy = ground ? FLAP_V * 1.05 : FLAP_V * 0.5;
    return true;
  }

  ghost(): number[] {
    return [Math.round(this.me.box.y), Math.round(this.vy)];
  }

  watch(dt: number): void {
    this.world(dt);
    this.fallDown(dt);
  }

  rivalGone(): void {
    const box = this.them.box;
    this.tag.setVisible(false);
    this.tweens.add({ targets: box, y: GROUND - FLYER_R, rotation: 1.4, alpha: 0, duration: 700, ease: 'Quad.In' });
  }

  /** Out: down to the street, lying there */
  private fallDown(dt: number): void {
    if (!this.down) return;
    const f = this.me.box;
    if (f.y + FLYER_R < GROUND) {
      this.vy = Math.min(900, this.vy + GRAVITY * dt);
      f.y = Math.min(GROUND - FLYER_R, f.y + this.vy * dt);
      f.rotation = Math.min(1.5, f.rotation + dt * 6);
    }
    f.setAlpha(1);
  }

  idle(dt: number): void {
    if (this.down) {
      this.fallDown(dt);
      return;
    }
    if (this.ended) return;
    // Hovering before the start
    this.hover += dt;
    this.me.box.y = 330 + Math.sin(this.hover * 4) * 8;
    this.me.wing.rotation = Math.sin(this.hover * 14) * 0.5;
    this.scroll(50 * dt);
  }

  finished(why: 'out' | 'time'): void {
    this.input.removeAllListeners();
    if (why === 'out') this.down = true;
  }
}
