import Phaser from 'phaser';
import { ArcadeScene, H, INK, PX, W } from '../engine/base.ts';

/** A tile's top (a diamond) and how thick the block is */
const TW = 56;
const TH = 32;
const DEPTH = 20;
/** Where the ball is on the screen: low, the road climbs ahead */
const BALL_ON_SCREEN = 520;
/** A turn this close (in tiles) to the middle of the corner is perfect */
const PERFECT = 0.22;

interface Tile {
  img: Phaser.GameObjects.Image;
  i: number;
  j: number;
  seg: number;
  /** Its stretch's direction (0: i, 1: j) */
  dir: number;
  /** Its place along the road */
  n: number;
  gem: Phaser.GameObjects.Image | null;
}

const key = (i: number, j: number) => `${i},${j}`;

/**
 * Zig: a ball rolls along a zigzag road of cobbled blocks floating in the evening sky, climbing up
 * the screen; a tap turns it the other way. A turn right in the middle of the corner scores double,
 * gems on the road score too. Turn too early or too late and the ball falls off: a life lost, and it
 * starts again at the next corner. Each corner turned is a point, and it gets faster. The road is
 * drawn from the seed, the same for both players.
 */
export class ZigScene extends ArcadeScene {
  private tiles = new Map<string, Tile>();
  /** The road being laid ahead: its last tile, its direction, tiles left in this stretch */
  private end = { i: 0, j: 0, dir: 0, left: 5, seg: 0, n: 0 };
  /** The ball in road coordinates (i: up right, j: up left) and its direction (0: i, 1: j) */
  private u = 0;
  private v = 0;
  private dir = 0;
  private seg = 0;
  private perfectTurn = false;
  private ball!: Phaser.GameObjects.Image;
  private bob = 0;
  private shadow!: Phaser.GameObjects.Ellipse;
  private bg!: Phaser.GameObjects.Image;
  private clouds: Phaser.GameObjects.Image[] = [];
  private hue = 0;
  private cam = { x: W / 2, y: H / 2 };
  private falling = false;

  build(): void {
    this.bg = this.backdrop('zig-sky', ['#120624', '#1f0b3d', '#2f1257', '#47186b', '#6a2079']);
    this.hue = this.rand();
    this.paintArt();
    for (let i = 0; i < 7; i++) {
      this.clouds.push(this.sprite(Math.random() * W, Math.random() * H, 'zig-cloud').setDepth(-90).setAlpha(0.5 + Math.random() * 0.3));
    }
    this.lay(48);
    this.shadow = this.add.ellipse(0, 0, 24, 10, 0x000000, 0.3).setDepth(9);
    this.ball = this.sprite(0, 0, 'zig-ball').setDepth(10);
    this.place();
    const p = this.screen(0, 0);
    this.cam = { x: p.x, y: p.y - (BALL_ON_SCREEN - H / 2) };
    this.cameras.main.centerOn(this.cam.x, this.cam.y);
  }

  private paintArt(): void {
    const tw = TW / PX;
    const th = TH / PX;
    const dp = DEPTH / PX;
    // One block, lit from the top left: cobbled top, the left face mid, the right face dark (tinted per stretch)
    this.pix('ztile', tw, th + dp, (p) => {
      for (let x = 0; x < tw; x++) {
        // How far the diamond reaches up and down from its middle in this column
        const h = Math.round((th / 2) * (1 - Math.abs(x + 0.5 - tw / 2) / (tw / 2)));
        const top = th / 2 - h;
        const bottom = th / 2 + h;
        // The face under it: lighter on the left, darker on the right, a dark edge at the bottom
        p.rect(x < tw / 2 ? '#9a9a9a' : '#626262', x, bottom, 1, dp);
        p.rect('#3a3a3a', x, bottom + dp - 1, 1, 1);
        // The top, light, with a lit edge on the left
        p.rect('#f2f2f2', x, top, 1, bottom - top);
        p.rect(x < tw / 2 ? '#ffffff' : '#d0d0d0', x, top, 1, 1);
      }
      // Cobbles on the top
      for (let y = 3; y < th - 2; y += 3) {
        const half = (th / 2 - Math.abs(y - th / 2)) * (tw / th) - 3;
        for (let x = tw / 2 - half + ((y / 3) % 2) * 2; x < tw / 2 + half - 2; x += 5) p.rect('#cfcfcf', x, y, 3, 1);
      }
    });
    // The ball: shiny, lit from the top left
    this.pix('zig-ball', 13, 13, (p) => {
      p.disc(INK.line, 6.5, 6.5, 6.5);
      p.disc('#d8337a', 6.5, 6.5, 5.5);
      p.disc('#ff5fa2', 6, 6, 4.5);
      p.disc('#ff9cc8', 5, 5, 2.5);
      p.rect('#ffffff', 4, 3, 2, 2);
    });
    this.pix('zig-gem', 9, 11, (p) => {
      p.rect(INK.line, 2, 0, 5, 1);
      p.rect(INK.line, 1, 1, 7, 1);
      p.rect(INK.line, 0, 2, 9, 3);
      p.rect('#7af0ff', 1, 2, 7, 3);
      p.rect('#ffffff', 2, 2, 2, 1);
      for (let y = 5; y < 11; y++) {
        const half = Math.max(0, 4 - (y - 5) * 0.8);
        p.rect(INK.line, 4.5 - half - 1, y, half * 2 + 2, 1);
        p.rect('#2fb8e0', 4.5 - half, y, half * 2, 1);
      }
    });
    this.pix('zig-cloud', 34, 10, (p) => {
      p.disc('#8a4a9e', 10, 6, 8, 4);
      p.disc('#8a4a9e', 22, 5, 10, 5);
      p.rect('#a865b8', 14, 1, 10, 1);
    });
  }

  /** Screen position of a point of the road (the middle of a tile's top) */
  private screen(i: number, j: number): { x: number; y: number } {
    return { x: (i - j) * (TW / 2), y: -(i + j) * (TH / 2) };
  }

  private color(seg: number): number {
    const c = Phaser.Display.Color.HSVToRGB((this.hue + Math.floor(seg / 8) * 0.13) % 1, 0.45, 1, new Phaser.Display.Color()) as Phaser.Display.Color;
    return c.color;
  }

  /** Lay `count` more tiles at the end of the road */
  private lay(count: number): void {
    const e = this.end;
    for (let k = 0; k < count; k++) {
      const p = this.screen(e.i, e.j);
      const img = this.sprite(p.x, p.y + DEPTH / 2, 'ztile')
        .setTint(this.color(e.seg))
        .setDepth(-1 - (e.i + e.j) / 10000);
      // New tiles drop in from above
      if (e.n > 10) {
        img.y -= 40;
        img.alpha = 0;
        this.tweens.add({ targets: img, y: p.y + DEPTH / 2, alpha: 1, duration: 260, ease: 'Quad.Out' });
      }
      // Now and then a gem on a straight (from the seed, the same for both players)
      const straight = e.left > 1 && e.n > 8;
      const gem = straight && this.rand() < 0.14 ? this.sprite(p.x, p.y - 14, 'zig-gem').setDepth(8 - (e.i + e.j) / 10000) : null;
      this.tiles.set(key(e.i, e.j), { img, i: e.i, j: e.j, seg: e.seg, dir: e.dir, n: e.n, gem });
      e.n++;
      e.left--;
      if (e.left <= 0) {
        // A corner: the next stretch goes the other way, 1 to 4 tiles long (longer at the start)
        e.dir = 1 - e.dir;
        e.seg++;
        e.left = e.seg < 4 ? 2 + Math.floor(this.rand() * 3) : 1 + Math.floor(this.rand() * 4);
      }
      if (e.dir === 0) e.i++;
      else e.j++;
    }
  }

  private place(): void {
    const p = this.screen(this.u, this.v);
    const y = p.y - 12 + (this.running ? 0 : Math.sin(this.bob * 5) * 3);
    this.ball.setPosition(p.x, y);
    this.shadow.setPosition(p.x, p.y + 2);
  }

  started(): void {
    this.input.on('pointerdown', () => this.turn());
  }

  private turn(): void {
    if (!this.running || this.falling) return;
    // Right in the middle of a tile: snapped onto it, and a perfect corner if it is one
    const along = this.dir === 0 ? this.u : this.v;
    const off = along - Math.round(along);
    const here = this.tiles.get(key(Math.round(this.u), Math.round(this.v)));
    const corner = here && !this.tiles.get(this.dir === 0 ? key(Math.round(this.u) + 1, Math.round(this.v)) : key(Math.round(this.u), Math.round(this.v) + 1));
    if (Math.abs(off) < PERFECT && corner) {
      if (this.dir === 0) this.u = Math.round(this.u);
      else this.v = Math.round(this.v);
      this.perfectTurn = true;
    }
    this.dir = 1 - this.dir;
    this.sfx('turn');
    this.buzz(6);
  }

  private speed(): number {
    return Math.min(6.6, 3.1 + this.seg * 0.075);
  }

  tick(dt: number): void {
    if (this.falling) {
      this.follow(dt);
      return;
    }
    const step = this.speed() * dt;
    if (this.dir === 0) this.u += step;
    else this.v += step;
    const here = this.tiles.get(key(Math.round(this.u), Math.round(this.v)));
    if (!here) {
      this.fall();
      return;
    }
    if (here.seg > this.seg) {
      // Round a corner
      this.seg = here.seg;
      if (this.perfectTurn) {
        const got = this.addScore(2);
        this.good(true);
        this.pop(this.ball.x, this.ball.y - 50, `+${got}`, INK.gold, 3);
        this.burst(this.ball.x, this.ball.y, INK.gold, 10, 180, 0);
        this.sfx('perfect', 0.6);
      } else {
        this.addScore(1);
        this.good();
        this.sfx('point', 0.6);
      }
      if (this.seg % 8 === 0) {
        this.sfx('level');
      }
    }
    this.perfectTurn = false;
    if (here.gem) {
      const g = here.gem;
      here.gem = null;
      const got = this.addScore(2);
      this.good(true);
      this.sfx('gem');
      this.burst(g.x, g.y, '#7af0ff', 10, 200);
      this.pop(g.x, g.y - 30, `+${got}`, INK.cyan, 3);
      g.destroy();
    }
    this.keepRoad(here.n);
    this.place();
    // It rolls: turning with its speed, the way it goes
    this.ball.rotation += (this.dir === 0 ? 1 : -1) * this.speed() * dt * 1.6;
    this.blink(this.ball);
    this.follow(dt);
  }

  /** Lay ahead of the place `n` on the road, drop the tiles left behind it */
  private keepRoad(n: number): void {
    if (this.end.n - n < 40) this.lay(10);
    for (const [k, t] of this.tiles) {
      if (t.n < n - 3) {
        this.tiles.delete(k);
        t.gem?.destroy();
        this.tweens.add({ targets: t.img, y: t.img.y + 260, alpha: 0, duration: 700, ease: 'Quad.In', onComplete: () => t.img.destroy() });
      }
    }
  }

  private follow(dt: number): void {
    const want = { x: this.ball.x, y: this.ball.y + 2 - (BALL_ON_SCREEN - H / 2) };
    const k = Math.min(1, dt * 4);
    this.cam.x += (want.x - this.cam.x) * k;
    this.cam.y += (want.y - this.cam.y) * k;
    this.cameras.main.centerOn(this.cam.x, this.cam.y);
    this.bg.setPosition(this.cam.x, this.cam.y);
    for (const c of this.clouds) {
      // Clouds below the road drift by slower than the camera
      if (c.y > this.cam.y + H / 2 + 20) c.y -= H + 40;
      if (c.x < this.cam.x - W / 2 - 40) c.x += W + 80;
      if (c.x > this.cam.x + W / 2 + 40) c.x -= W + 80;
    }
  }

  private fall(): void {
    this.falling = true;
    this.shadow.setVisible(false);
    // Behind the road's edge, down into the dark
    this.ball.setDepth(-50);
    this.tweens.add({ targets: this.ball, y: this.ball.y + 320, scale: PX * 0.5, alpha: 0, duration: 800, ease: 'Quad.In' });
    this.shake(220, 0.012);
    if (this.miss()) this.time.delayedCall(850, () => this.respawn());
  }

  /** Back on the road, at the start of the next stretch */
  private respawn(): void {
    if (!this.running) return;
    let next: Tile | null = null;
    for (const t of this.tiles.values()) if (t.seg === this.seg + 1 && (!next || t.n < next.n)) next = t;
    if (!next) for (const t of this.tiles.values()) if (!next || t.n > next.n) next = t;
    if (!next) return;
    this.u = next.i;
    this.v = next.j;
    this.dir = next.dir;
    this.seg = next.seg;
    this.falling = false;
    this.tweens.killTweensOf(this.ball);
    this.ball.setDepth(10).setScale(PX).setAlpha(1);
    this.shadow.setVisible(true);
    this.place();
    this.burst(this.ball.x, this.ball.y - 30, '#ffffff', 12, 180, 0);
  }

  idle(dt: number): void {
    this.bob += dt;
    if (!this.ended && !this.falling) this.place();
    if (!this.falling) this.follow(dt);
  }

  finished(): void {
    this.input.removeAllListeners();
  }
}
