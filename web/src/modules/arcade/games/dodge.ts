import Phaser from 'phaser';
import { ArcadeScene, H, INK, PX, W } from '../engine/base.ts';

/** The road between the sidewalks, and its lanes (things come in lanes, the runner goes anywhere) */
const ROAD_L = 64;
const ROAD_R = W - 64;
const LANES = 5;
const LANE_W = (ROAD_R - ROAD_L) / LANES;
const RUNNER_Y = 600;
const RUNNER_R = 15;
/** A row of things every this many units run */
const ROW_GAP = 165;
/** The LPC crates and barrels' scale (units a pixel of their art): about a lane wide; the stack of crates takes two */
const THING_SCALE = 1.5;
const STACK_SCALE = 1.65;

type Kind = 'crate' | 'barrel' | 'cart' | 'coin' | 'gem';

interface Thing {
  kind: Kind;
  img: Phaser.GameObjects.Image;
  /** Half its size, for bumping into it */
  hw: number;
  hh: number;
  done: boolean;
}

/**
 * Street Dash: the player's character runs up the town's street (seen from above) and steers with
 * a finger sliding left and right. Crates, barrels and stacks of crates (LPC art) stand in the way: bumping into one
 * costs a life (the runner blinks through for a moment). Coins score, gems score more. The street is
 * drawn from the seed and runs as fast on both phones: the rival runs beside, as a ghost.
 */
export class DodgeScene extends ArcadeScene {
  private things: Thing[] = [];
  private street!: Phaser.GameObjects.TileSprite;
  private runner!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private ghostBody!: Phaser.GameObjects.Sprite;
  private x = W / 2;
  private want = W / 2;
  private grab: { px: number; x: number } | null = null;
  /** Units run, and where the next row of things comes */
  private dist = 0;
  private nextRow = 400;
  private rows = 0;
  private t = 0;

  build(): void {
    this.canWatch = true;
    this.paintArt();
    this.street = this.add.tileSprite(W / 2, H / 2, W / PX, H / PX, 'dodge-street').setScale(PX).setDepth(-100);
    this.shadow = this.add.ellipse(W / 2, RUNNER_Y, 30, 10, 0x000000, 0.3).setDepth(9);
    this.ghostBody = this.avatar('rival', W / 2, RUNNER_Y).setAlpha(0.28).setDepth(9).setVisible(false);
    this.pose(this.ghostBody, 'walkUp', 13);
    this.runner = this.avatar('me', W / 2, RUNNER_Y).setDepth(30);
    this.pose(this.runner, 'idleUp');
  }

  private paintArt(): void {
    const w = W / PX;
    const h = H / PX;
    this.pix('dodge-street', w, h, (p) => {
      const l = ROAD_L / PX;
      const r = ROAD_R / PX;
      // The road: cobbles in rows
      p.rect('#4a4058', 0, 0, w, h);
      for (let y = 0; y < h; y += 6) {
        const off = (y / 6) % 2 ? 3 : 0;
        for (let x = l - 6 + off; x < r; x += 7) {
          p.rect('#5a4f6a', x, y, 6, 5);
          p.rect('#6a5e7c', x, y, 6, 1);
        }
      }
      // The sidewalks: paving, the curb, a lamp post now and then
      for (const [x0, x1] of [
        [0, l],
        [r, w],
      ]) {
        p.rect('#8a7a8a', x0, 0, x1 - x0, h);
        for (let y = 0; y < h; y += 12) for (let x = x0; x < x1; x += 12) p.rect('#9a8a9a', x + 1, y + 1, 10, 10);
      }
      p.rect('#2e2638', l - 2, 0, 2, h);
      p.rect('#2e2638', r, 0, 2, h);
      p.rect('#c0b0c0', l - 3, 0, 1, h);
      p.rect('#c0b0c0', r + 2, 0, 1, h);
      for (let y = 30; y < h; y += 120) {
        for (const x of [l - 12, r + 10]) {
          p.disc(INK.shadow, x + 3, y + 4, 5, 3);
          p.disc(INK.line, x, y, 4);
          p.disc('#ffe6a0', x, y, 3);
          p.rect('#ffffff', x - 1, y - 1, 1, 1);
        }
      }
      // Flower boxes and doorsteps along the walls
      for (let y = 80; y < h; y += 120) {
        p.rect('#5a3a24', 2, y, 8, 20);
        p.rect('#ff6a8a', 3, y + 2, 2, 2);
        p.rect('#ffd23d', 6, y + 8, 2, 2);
        p.rect('#4dbb5a', 3, y + 14, 5, 3);
        p.rect('#6a5a74', w - 10, y + 10, 10, 16);
        p.rect('#7a6a84', w - 10, y + 10, 10, 2);
      }
    });
    // A gold coin: a dark rim, a raised edge, a star stamped in the middle, a shine
    this.pix('dodge-coin', 12, 12, (p) => {
      p.disc(INK.line, 6, 6, 6);
      p.disc('#a86a08', 6, 6, 5.2);
      p.disc('#ffc21d', 5.6, 5.6, 4.6);
      p.disc('#e8a312', 6, 6, 3.4);
      p.disc('#ffd84a', 5.7, 5.7, 2.8);
      p.rect('#b07808', 5, 4, 2, 5);
      p.rect('#b07808', 4, 5, 4, 2);
      p.rect('#fff6c0', 3, 2, 2, 1);
      p.rect('#fff6c0', 2, 3, 1, 2);
    });
    this.pix('dodge-gem', 11, 11, (p) => {
      for (let y = 0; y < 11; y++) {
        const half = 5.5 - Math.abs(y - 5.5) * 0.9;
        p.rect(INK.line, 5.5 - half - 1, y, half * 2 + 2, 1);
        p.rect(y < 5 ? '#ff8ad8' : '#d83aa8', 5.5 - half, y, half * 2, 1);
      }
      p.rect('#ffffff', 4, 3, 2, 1);
    });
  }

  started(): void {
    this.pose(this.runner, 'walkUp', 13);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.grab = { px: this.at(p).x, x: this.want };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.grab || !p.isDown) return;
      this.want = Phaser.Math.Clamp(this.grab.x + (this.at(p).x - this.grab.px) * 1.3, ROAD_L + 16, ROAD_R - 16);
    });
    const up = () => (this.grab = null);
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  /** Units a second: faster as the run goes on (by time: the same on both phones) */
  private speed(): number {
    return 290 + Math.min(250, this.t * 5);
  }

  /** A row of things across the road, from the seed: one or two in the way, coins in a free lane */
  private row(): void {
    const n = this.rows++;
    const r = this.rand;
    const lanes = Array.from({ length: LANES }, (_, i) => i);
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const blocked = n < 2 ? 1 : 1 + (r() < Math.min(0.75, 0.3 + n * 0.02) ? 1 : 0) + (n > 20 && r() < 0.25 ? 1 : 0);
    const used = new Set<number>();
    for (let b = 0; b < blocked; b++) {
      const lane = lanes[b];
      if (used.has(lane)) continue;
      const roll = r();
      // A cart takes two lanes side by side
      if (roll < 0.22 && lane < LANES - 1 && !used.has(lane + 1)) {
        used.add(lane).add(lane + 1);
        this.add_('cart', ROAD_L + (lane + 1) * LANE_W, 'lpc-crateStack', STACK_SCALE);
      } else {
        used.add(lane);
        // (which crate or barrel follows the lane: no draw from the seed)
        if (roll < 0.6) this.add_('crate', ROAD_L + (lane + 0.5) * LANE_W, lane % 2 ? 'lpc-crate' : 'lpc-crateCorner', THING_SCALE);
        else this.add_('barrel', ROAD_L + (lane + 0.5) * LANE_W, lane % 2 ? 'lpc-barrel' : 'lpc-barrelBanded', THING_SCALE);
      }
    }
    // Coins in a line in a free lane, now and then a gem instead
    const free = lanes.filter((l) => !used.has(l));
    if (free.length && r() < 0.8) {
      const lane = free[Math.floor(r() * free.length)];
      const x = ROAD_L + (lane + 0.5) * LANE_W;
      if (r() < 0.12) this.add_('gem', x, 'dodge-gem');
      else for (let k = 0; k < 3; k++) this.add_('coin', x, 'dodge-coin', PX, -k * 46);
    }
  }

  /** A thing on the road at x (`key`: its texture, at `scale` units a pixel); bumping counts on a box a little smaller than the art */
  private add_(kind: Kind, x: number, key: string, scale = PX, dy = 0): void {
    const img = this.sprite(x, -60 + dy, key, scale).setDepth(kind === 'coin' || kind === 'gem' ? 12 : 20);
    this.things.push({ kind, img, hw: img.displayWidth / 2 - 4, hh: img.displayHeight / 2 - 6, done: false });
  }

  tick(dt: number): void {
    this.world(dt);
    // The runner glides toward the finger
    const k = Math.min(1, dt * 14);
    this.x += (this.want - this.x) * k;
    this.runner.x = this.x;
    this.shadow.x = this.x;
    this.runner.rotation = Phaser.Math.Clamp((this.want - this.x) / 400, -0.2, 0.2);
    this.blink(this.runner);
    const cy = RUNNER_Y - RUNNER_R;
    for (const th of this.things) {
      if (th.done) continue;
      const dx = Math.abs(th.img.x - this.x);
      const dy = Math.abs(th.img.y - cy);
      if (dx > th.hw + RUNNER_R || dy > th.hh + RUNNER_R) continue;
      if (th.kind === 'coin' || th.kind === 'gem') {
        th.done = true;
        const gem = th.kind === 'gem';
        const got = this.addScore(gem ? 3 : 1);
        this.good(gem);
        this.sfx(gem ? 'gem' : 'coin');
        this.burst(th.img.x, th.img.y, gem ? '#ff8ad8' : INK.gold, gem ? 12 : 6, 180, 0);
        if (gem || got > 1) this.pop(th.img.x, th.img.y - 30, `+${got}`, gem ? '#ff8ad8' : INK.gold, 3);
        th.img.destroy();
      } else if (!this.safe) {
        th.done = true;
        this.bump(th);
        if (!this.running) return;
      }
    }
  }

  private bump(th: Thing): void {
    this.shake(220, 0.016);
    this.flash('#ff4040', 140);
    this.burst(th.img.x, th.img.y, th.kind === 'barrel' ? '#8a5028' : '#b07a40', 12, 260, 600, 3);
    this.tweens.add({ targets: th.img, x: th.img.x + (th.img.x < this.x ? -80 : 80), rotation: 2, alpha: 0, duration: 500 });
    this.pose(this.runner, 'hurt', 8, 0);
    this.time.delayedCall(400, () => this.running && this.pose(this.runner, 'walkUp', 13));
    this.miss();
  }

  /** The street runs down the screen, things come in rows (the same on both phones), the rival's ghost */
  private world(dt: number): void {
    this.t += dt;
    const v = this.speed();
    this.dist += v * dt;
    this.street.tilePositionY -= (v * dt) / PX;
    while (this.dist >= this.nextRow) {
      this.row();
      this.nextRow += ROW_GAP;
    }
    for (const th of this.things) th.img.y += v * dt;
    // Coins spin
    const spin = Math.abs(Math.cos(this.t * 6));
    for (const th of this.things) if (th.kind === 'coin' && !th.done) th.img.scaleX = PX * Math.max(0.25, spin);
    this.things = this.things.filter((th) => {
      if (th.img.y < H + 80 && th.img.active) return true;
      th.img.destroy();
      return false;
    });
    this.runner.anims.timeScale = v / 300;
    const d = this.ghostNow();
    if (d && !this.rivalDone) {
      this.ghostBody.setVisible(true).setX(d[0]);
      this.ghostBody.anims.timeScale = v / 300;
    }
  }

  ghost(): number[] {
    return [Math.round(this.x)];
  }

  watch(dt: number): void {
    this.world(dt);
  }

  rivalGone(): void {
    this.tweens.add({ targets: this.ghostBody, alpha: 0, duration: 500 });
  }

  finished(why: 'out' | 'time'): void {
    this.input.removeAllListeners();
    this.pose(this.runner, why === 'out' ? 'dead' : 'happy', 8, why === 'out' ? 0 : -1);
    this.runner.rotation = 0;
  }
}
