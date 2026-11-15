import Phaser from 'phaser';
import { ARCADE_FEVER_MS, ARCADE_GHOST_MS, arcadeRandom, type ArcadeGameId } from '$shared/arcade.ts';
import type { SheetInfo } from '$shared/world.ts';
import { PIXEL_CHARS, PIXEL_FONT, pixelClean } from '$lib/pixelFont.ts';
import { buzz, play, type SoundId } from './sfx.ts';
import { LPC_FRAMES, type LpcImages } from './lpc.ts';

/** Every game is laid out on this portrait board; the phone shows it as big as it fits */
export const W = 400;
export const H = 720;
/** The canvas has this many pixels per CSS pixel of the screen, so it stays sharp on a phone */
export const DPR = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
/**
 * Board units per pixel of the games' pixel art, the same as the characters' sprites: everything
 * is drawn in pixels of one size, like the town
 */
export const PX = 2;

/** The palette every game shares (the town arcade's): outlines, the night, neon lights, gold */
export const INK = {
  line: '#120c26',
  night: '#1a1033',
  deep: '#0b0718',
  white: '#ffffff',
  cream: '#fff3d6',
  gold: '#ffd23d',
  goldDark: '#c98a12',
  pink: '#ff4fb0',
  cyan: '#4fe8ff',
  red: '#ff4d5e',
  green: '#4dff9e',
  shadow: 'rgba(10,5,25,0.35)',
};

/** A player as the game draws them: their character's sprite sheet (or a stand-in) and their color */
export interface Fighter {
  id: string;
  name: string;
  color: string;
  img: HTMLImageElement;
  sheet: SheetInfo;
}

export interface RunOptions {
  game: ArcadeGameId;
  seed: number;
  /** The run's length (the most it lasts for a game with lives) */
  seconds: number;
  /** 0: no lives (mistakes cost points or time) */
  lives: number;
  me: Fighter;
  rival: Fighter;
  /** The LPC sheets (crates, barrels, fruit), loaded */
  lpc: LpcImages;
  onScore(score: number): void;
  /** The run is over: the last life lost ('out') or the time is up */
  onOver(score: number, why: 'out' | 'time'): void;
  /** Time left (ms), a few times a second */
  onTime(left: number): void;
  onLives(lives: number): void;
  /** The fever bar (0 to 1) and whether points are doubled now */
  onFever(level: number, on: boolean): void;
  /** Where this player is, for the other phone's ghost (about 10 times a second) */
  onGhost(d: number[]): void;
}

/** A hex color as a number for Phaser (#ff8800 -> 0xff8800) */
export const hex = (c: string) => parseInt(c.replace('#', ''), 16);

/** A pixel canvas's drawing helpers (see ArcadeScene.pix) */
export interface Pen {
  g: CanvasRenderingContext2D;
  /** A rectangle of pixels */
  rect(color: string, x: number, y: number, w?: number, h?: number): void;
  /** A filled pixel circle (or ellipse) around cx, cy */
  disc(color: string, cx: number, cy: number, rx: number, ry?: number): void;
  /** Every other pixel of a rectangle, for soft shading */
  dither(color: string, x: number, y: number, w: number, h: number, phase?: number): void;
}

function pen(g: CanvasRenderingContext2D): Pen {
  const rect = (color: string, x: number, y: number, w = 1, h = 1) => {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  return {
    g,
    rect,
    disc(color, cx, cy, rx, ry = rx) {
      g.fillStyle = color;
      for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
        const k = 1 - (y * y) / ((ry + 0.35) * (ry + 0.35));
        if (k < 0) continue;
        const half = Math.round(Math.sqrt(k) * (rx + 0.35));
        g.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1);
      }
    },
    dither(color, x, y, w, h, phase = 0) {
      g.fillStyle = color;
      for (let j = 0; j < h; j++) for (let i = (j + phase) % 2; i < w; i += 2) g.fillRect(x + i, y + j, 1, 1);
    },
  };
}

/**
 * What every Arcade game shares: the seeded random numbers (both phones draw the same), the clock
 * of the run, lives, combos and the fever (points doubled), the rival's ghost, the pixel art and
 * font, the players' characters, and the juice (pop-up texts, bursts, shakes, flashes, sounds,
 * vibration).
 *
 * A game draws in board units (W x H), its art in pixels of PX units. It builds its world in
 * `build`, which shows before the countdown ends, and moves it in `tick` once the run has started
 * (`begin`). It calls `addScore`, `good` (a good move: the combo and the fever bar go up), `slip`
 * and `miss` (a life lost); the run also ends by itself when the time is up. `ghost` says where the
 * player is, `ghostNow` where the rival is, and a game with `canWatch` goes on moving with the
 * rival's ghost (`watch`) after its own run is over.
 */
export abstract class ArcadeScene extends Phaser.Scene {
  opts!: RunOptions;
  rand: () => number = Math.random;
  score = 0;
  lives = 0;
  /** Between the end of the countdown and the end of the run */
  running = false;
  ended = false;
  /** Time played (ms), and time taken off by mistakes (Quick Maths) */
  played = 0;
  penalty = 0;
  /** Good moves in a row */
  combo = 0;
  /** The fever bar, 0 to 1; full: points doubled while it runs down */
  fever = 0;
  feverOn = false;
  /** No life is lost before this time played (just after losing one) */
  safeUntil = 0;
  /** The rival's run is over */
  rivalDone = false;
  /** The world goes on with the rival's ghost after this run is over (see watch) */
  canWatch = false;
  private told = 0;
  private sentAt = 0;
  private ghostPrev: number[] | null = null;
  private ghostNext: number[] | null = null;
  private ghostAt = 0;

  init(opts: RunOptions): void {
    this.opts = opts;
    this.rand = arcadeRandom(opts.seed);
    this.score = 0;
    this.lives = opts.lives;
    this.running = false;
    this.ended = false;
    this.played = 0;
    this.penalty = 0;
    this.combo = 0;
    this.fever = 0;
    this.feverOn = false;
    this.safeUntil = 0;
    this.rivalDone = false;
  }

  create(): void {
    this.fit(true);
    // The space on the phone changes (the address bar, a turn of the phone): the board follows
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fit(false));
    this.pix('px', 1, 1, (p) => p.rect('#fff', 0, 0));
    this.makeFont();
    this.makeFighter('me', this.opts.me);
    this.makeFighter('rival', this.opts.rival);
    // Each LPC sprite as a texture of its own (lpc-apple, lpc-crate...), in the sheets' pixels
    for (const [name, [sheet, x, y, w, h]] of Object.entries(LPC_FRAMES)) {
      this.pix(`lpc-${name}`, w, h, (p) => p.g.drawImage(this.opts.lpc[sheet], x, y, w, h, 0, 0, w, h));
    }
    this.build();
    this.opts.onTime(this.left());
  }

  /**
   * The board as big as the canvas allows, in its middle (the game moves the view from there):
   * on a resize the view stays centered where it was
   */
  fit(first: boolean): void {
    const cam = this.cameras.main;
    const mid = first ? { x: W / 2, y: H / 2 } : { x: cam.midPoint.x, y: cam.midPoint.y };
    cam.setSize(this.scale.width, this.scale.height);
    cam.setZoom(Math.min(this.scale.width / W, this.scale.height / H));
    cam.centerOn(mid.x, mid.y);
  }

  /** The board as it is before the start */
  abstract build(): void;
  /** One frame of the run (dt in seconds) */
  abstract tick(dt: number): void;
  /** Before the start, and after the end: things that move anyway (a bird hovering, clouds) */
  idle(_dt: number): void {}
  /** After this run is over, while the rival still plays (games with canWatch): the world goes on with their ghost */
  watch(dt: number): void {
    this.idle(dt);
  }
  /** The run has started */
  started(): void {}
  /** The run is over (out or time up): the game shows it */
  finished(_why: 'out' | 'time'): void {}
  /** Where the player is, for the rival's ghost (null: nothing to send) */
  ghost(): number[] | null {
    return null;
  }
  /** The rival's run is over */
  rivalGone(): void {}

  /** The countdown is over */
  begin(): void {
    if (this.running || this.ended) return;
    this.running = true;
    this.started();
  }

  left(): number {
    return Math.max(0, this.opts.seconds * 1000 - this.played - this.penalty);
  }

  update(time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    if (!this.running) {
      if (this.ended && this.canWatch && !this.rivalDone) this.watch(dt);
      else this.idle(dt);
      return;
    }
    this.played += delta;
    const left = this.left();
    if (this.feverOn) {
      this.fever = Math.max(0, this.fever - delta / ARCADE_FEVER_MS);
      if (this.fever <= 0) {
        this.feverOn = false;
        this.combo = 0;
      }
    }
    if (this.played - this.told > 100 || left <= 0) {
      this.told = this.played;
      this.opts.onTime(left);
      this.opts.onFever(this.fever, this.feverOn);
    }
    if (left <= 0) {
      this.stop('time');
      return;
    }
    if (time - this.sentAt >= ARCADE_GHOST_MS) {
      this.sentAt = time;
      const d = this.ghost();
      if (d) this.opts.onGhost(d);
    }
    this.tick(dt);
  }

  // ------------------------------------------------------------ score, lives, fever

  /** Points (doubled in a fever); returns what was added */
  addScore(n = 1): number {
    if (!this.running) return 0;
    const add = n > 0 && this.feverOn ? n * 2 : n;
    this.score = Math.max(0, this.score + add);
    this.opts.onScore(this.score);
    return add;
  }

  /** A good move: the combo goes up and fills the fever bar (great: a lot more) */
  good(great = false): void {
    if (!this.running) return;
    this.combo++;
    if (!this.feverOn) {
      this.fever = Math.min(1, this.fever + (great ? 0.2 : 0.075));
      if (this.fever >= 1) this.startFever();
    }
    if (this.combo % 10 === 0 && !this.feverOn) this.sfx('combo');
    this.opts.onFever(this.fever, this.feverOn);
  }

  private startFever(): void {
    this.feverOn = true;
    this.fever = 1;
    this.sfx('fever');
    this.buzz([30, 40, 30]);
    this.flash(INK.gold, 220);
    // A shower of gold over the view (the score bar's frame turns rainbow while it lasts)
    const m = this.cameras.main.worldView;
    for (let i = 0; i < 5; i++) this.burst(m.x + (m.width * (i + 0.5)) / 5, m.y + 40, i % 2 ? INK.gold : INK.pink, 10, 260, 700);
  }

  /** A slip: the combo is gone and the fever bar drops (a fever going on keeps running) */
  slip(): void {
    this.combo = 0;
    if (!this.feverOn) this.fever = Math.max(0, this.fever - 0.4);
    this.opts.onFever(this.fever, this.feverOn);
  }

  /** Is the player out of harm's way just after losing a life? */
  get safe(): boolean {
    return this.played < this.safeUntil;
  }

  /**
   * A mistake that costs a life (a game without lives: only a slip). Returns false when it was the
   * last one: the run is over.
   */
  miss(): boolean {
    this.slip();
    if (this.opts.lives <= 0) return true;
    this.lives = Math.max(0, this.lives - 1);
    this.opts.onLives(this.lives);
    this.buzz([60, 40, 120]);
    if (this.lives <= 0) {
      this.sfx('crash');
      this.stop('out');
      return false;
    }
    this.sfx('life');
    this.safeUntil = this.played + 1600;
    // (the score bar breaks a heart)
    this.flash('#ff2040', 200);
    return true;
  }

  /** A game object blinks while the player is safe after a lost life */
  blink(o: { setAlpha(alpha: number): unknown }, base = 1): void {
    o.setAlpha(this.safe && Math.floor(this.played / 90) % 2 ? base * 0.25 : base);
  }

  private stop(why: 'out' | 'time'): void {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    this.feverOn = false;
    this.opts.onTime(this.left());
    this.opts.onFever(0, false);
    this.opts.onOver(this.score, why);
    this.finished(why);
  }

  // ------------------------------------------------------------ the rival

  /** Where the rival is (from the other phone, about 10 times a second) */
  rival(d: number[]): void {
    this.ghostPrev = this.ghostNow() ?? d;
    this.ghostNext = d;
    this.ghostAt = performance.now();
  }

  /** The rival's run is over */
  rivalOver(): void {
    if (this.rivalDone) return;
    this.rivalDone = true;
    this.rivalGone();
  }

  /** Where the rival's ghost is now: smoothed between their last two places (null before the first) */
  ghostNow(): number[] | null {
    const a = this.ghostPrev;
    const b = this.ghostNext;
    if (!a || !b) return b;
    const t = Math.min(1.3, (performance.now() - this.ghostAt) / ARCADE_GHOST_MS);
    return b.map((v, i) => (a[i] === undefined || Math.abs(v - a[i]) > 400 ? v : a[i] + (v - a[i]) * t));
  }

  /** The rival's last place as sent (no smoothing: for counts and flags) */
  ghostLast(): number[] | null {
    return this.ghostNext;
  }

  // ------------------------------------------------------------ pixel art

  /** A texture painted in pixels (w x h pixels): show it with `sprite`, PX units a pixel */
  pix(key: string, w: number, h: number, draw: (p: Pen) => void): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    const t = this.textures.createCanvas(key, Math.ceil(w), Math.ceil(h))!;
    const g = t.getContext();
    g.imageSmoothingEnabled = false;
    draw(pen(g));
    t.refresh();
  }

  /** An image of a pixel texture, PX units a pixel (or `scale`) */
  sprite(x: number, y: number, key: string, scale = PX): Phaser.GameObjects.Image {
    return this.add.image(x, y, key).setScale(scale);
  }

  /**
   * A full-board sky: bands of color from top to bottom, dithered where they meet (follows the
   * camera when the game moves it: set its position)
   */
  backdrop(key: string, bands: string[]): Phaser.GameObjects.Image {
    const w = W / PX;
    const h = H / PX;
    this.pix(key, w, h, (p) => {
      const band = h / bands.length;
      bands.forEach((c, i) => {
        p.rect(c, 0, Math.floor(i * band), w, Math.ceil(band) + 1);
        if (i > 0) p.dither(c, 0, Math.floor(i * band) - 3, w, 3, i);
      });
    });
    return this.sprite(W / 2, H / 2, key).setDepth(-100);
  }

  /** The board point under a pointer */
  at(p: Phaser.Input.Pointer): { x: number; y: number } {
    const v = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: v.x, y: v.y };
  }

  // ------------------------------------------------------------ the pixel font

  private makeFont(): void {
    if (this.cache.bitmapFont.exists('pix')) return;
    const n = PIXEL_CHARS.length;
    this.pix('pixfont', n * 6, 8, (p) => {
      for (let i = 0; i < n; i++) {
        const glyph = PIXEL_FONT[PIXEL_CHARS[i]];
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (glyph[r][c] === '#') p.rect('#fff', i * 6 + c, r);
      }
    });
    const data = Phaser.GameObjects.RetroFont.Parse(this, {
      image: 'pixfont',
      width: 6,
      height: 8,
      chars: PIXEL_CHARS,
      charsPerRow: n,
      'offset.x': 0,
      'offset.y': 0,
      'spacing.x': 0,
      'spacing.y': 0,
      lineSpacing: 2,
    });
    this.cache.bitmapFont.add('pix', data);
  }

  /** Text in the pixel font with a dark shadow, `k` pixels of PX units a font pixel, centered on x, y */
  label(x: number, y: number, s: string, k = 3, color = INK.white): Phaser.GameObjects.Container {
    const text = pixelClean(s.replace(/\n/g, ' ')) || ' ';
    // (a retro font's size is its letters' width: 6 font pixels)
    const size = 6 * k * PX;
    const make = (dx: number, dy: number, tint: string) =>
      this.add
        .bitmapText(dx, dy, 'pix', text, size)
        .setOrigin(0.5)
        .setTint(hex(tint));
    const shadow = make(k * PX * 0.5, k * PX * 0.5, INK.line).setAlpha(0.75);
    const main = make(0, 0, color);
    return this.add.container(x, y, [shadow, main]);
  }

  /** Changes a label's text */
  relabel(c: Phaser.GameObjects.Container, s: string, color?: string): void {
    const text = pixelClean(s) || ' ';
    for (const t of c.list as Phaser.GameObjects.BitmapText[]) t.setText(text);
    if (color) (c.list[1] as Phaser.GameObjects.BitmapText).setTint(hex(color));
  }

  // ------------------------------------------------------------ the characters

  private makeFighter(who: 'me' | 'rival', f: Fighter): void {
    const key = `av-${who}`;
    if (this.textures.exists(key)) return;
    const frame = f.sheet.frame || 64;
    this.textures.addSpriteSheet(key, f.img, { frameWidth: frame, frameHeight: frame });
    const cols = Math.max(1, Math.floor(f.img.naturalWidth / frame));
    for (const [row, r] of Object.entries(f.sheet.rows)) {
      if (!r.frames) continue;
      this.anims.create({
        key: `${who}-${row}`,
        frames: this.anims.generateFrameNumbers(key, { start: r.row * cols, end: r.row * cols + r.frames - 1 }),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  /** A player's character standing with their feet at x, y (`scale`: units a sprite pixel) */
  avatar(who: 'me' | 'rival', x: number, y: number, scale = PX): Phaser.GameObjects.Sprite {
    const f = who === 'me' ? this.opts.me : this.opts.rival;
    const frame = f.sheet.frame || 64;
    const s = this.add.sprite(x, y, `av-${who}`).setScale(scale).setOrigin(0.5, (f.sheet.feet || frame - 4) / frame);
    this.pose(s, 'idleDown');
    return s;
  }

  /** Plays one row of a character's sheet (falls back to standing when the sheet lacks it) */
  pose(s: Phaser.GameObjects.Sprite, row: string, frameRate = 9, repeat = -1): void {
    const who = s.texture.key === 'av-rival' ? 'rival' : 'me';
    let key = `${who}-${row}`;
    if (!this.anims.exists(key)) key = `${who}-idleDown`;
    if (!this.anims.exists(key)) return;
    if (s.anims.currentAnim?.key === key && s.anims.isPlaying && repeat === -1) {
      s.anims.msPerFrame = 1000 / frameRate;
      return;
    }
    s.play({ key, frameRate, repeat });
  }

  /** How tall a character is drawn at `scale` (from the top of the hair to the feet) */
  avatarHeight(who: 'me' | 'rival', scale = PX): number {
    const f = who === 'me' ? this.opts.me : this.opts.rival;
    return ((f.sheet.feet || 60) - (f.sheet.body.top || 14)) * scale;
  }

  // ------------------------------------------------------------ juice

  /** A text that pops up and floats away (+1, PERFECT...) */
  pop(x: number, y: number, s: string, color = INK.white, k = 3): void {
    // Kept inside the view
    const view = this.cameras.main.worldView;
    const half = (pixelClean(s).length * 6 * k * PX) / 2 + 6;
    x = Phaser.Math.Clamp(x, view.x + half, Math.max(view.x + half, view.right - half));
    const t = this.label(x, y, s, k, color).setDepth(80).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.Out' });
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, delay: 300, duration: 480, ease: 'Cubic.In', onComplete: () => t.destroy() });
  }
  /** Square bits flying out of a point */
  burst(x: number, y: number, color: string | number, count = 14, speed = 260, gravity = 500, size = 2): void {
    const e = this.add.particles(x, y, 'px', {
      speed: { min: speed * 0.4, max: speed },
      angle: { min: 0, max: 360 },
      lifespan: { min: 350, max: 750 },
      scale: { start: PX * size, end: 0 },
      gravityY: gravity,
      tint: typeof color === 'string' ? hex(color) : color,
      emitting: false,
    });
    e.setDepth(40);
    e.explode(count);
    this.time.delayedCall(900, () => e.destroy());
  }

  shake(ms = 180, strength = 0.012): void {
    this.cameras.main.shake(ms, strength);
  }

  flash(color = '#ffffff', ms = 160): void {
    const c = Phaser.Display.Color.HexStringToColor(color);
    this.cameras.main.flash(ms, c.red, c.green, c.blue);
  }

  /** A sound (`rate` above 1: faster and higher, for a rising combo) */
  sfx(id: SoundId, volume = 1, rate = 1): void {
    play(id, volume, rate);
  }

  buzz(pattern: number | number[]): void {
    buzz(pattern);
  }
}
