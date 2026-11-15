import Phaser from 'phaser';
import { ArcadeScene, H, INK, PX, W, hex, type Pen } from '../engine/base.ts';

const COLS = [82, 200, 318];
const ROWS = [330, 460, 590];
/** A critter's texture, in pixels a side */
const C = 26;
const CAT_COST = 3;
const GOLD_POINTS = 3;

type Kind = 'mole' | 'gold' | 'cat';

interface Pop {
  id: number;
  hole: number;
  kind: Kind;
  /** Times in the run (s): it rises from `at`, stays until `until`, then sinks */
  at: number;
  until: number;
  img: Phaser.GameObjects.Image;
  hit: boolean;
}

/**
 * Pop Up: moles pop out of the nine holes of a garden; a tap bops them. Golden moles score more,
 * and the cat now and then looking out of a hole must not be tapped (points lost). They come
 * quicker and stay less as it goes. Which hole and when come from the seed, the same for both
 * players: a puff in the rival's color shows the ones they got.
 */
export class WhackScene extends ArcadeScene {
  private pops: Pop[] = [];
  private t = 0;
  private next = 0.5;
  private made = 0;
  /** When each hole is free again (from the plan, not the taps: the same on both phones) */
  private busy = Array.from({ length: 9 }, () => 0);
  private hero!: Phaser.GameObjects.Sprite;
  private rivalHits = -1;
  /** Critters bopped, and the last one (for the rival's puffs) */
  private hits = 0;
  private lastHit = -1;

  build(): void {
    this.paintArt();
    this.sprite(W / 2, H / 2, 'whack-garden').setDepth(-100);
    for (let i = 0; i < 9; i++) {
      const { x, y } = this.hole(i);
      // Each row in front of the one behind it: the hole, then its critter, then the hole's front edge
      const row = Math.floor(i / 3) * 3;
      this.sprite(x, y, 'whack-hole').setDepth(row + 1);
      this.sprite(x, y + 9, 'whack-lip').setDepth(row + 3);
    }
    this.hero = this.avatar('me', 64, 214, 1.5).setDepth(-50);
  }

  private hole(i: number): { x: number; y: number } {
    return { x: COLS[i % 3], y: ROWS[Math.floor(i / 3)] };
  }

  private paintArt(): void {
    this.pix('whack-garden', W / PX, H / PX, (p) => {
      const w = W / PX;
      const h = H / PX;
      // The sky over the fence, the fence, the lawn in stripes, flowers
      p.rect('#8fd0ff', 0, 0, w, 60);
      p.dither('#a8dcff', 0, 0, w, 30);
      p.disc('#ffffff', 40, 26, 10, 5);
      p.disc('#ffffff', 52, 22, 8, 6);
      p.disc('#ffffff', 150, 34, 12, 5);
      p.rect('#5aa83a', 0, 60, w, h - 60);
      for (let y = 60; y < h; y += 20) p.rect('#66b844', 0, y, w, 10);
      for (let x = 0; x < w; x += 10) {
        p.rect(INK.line, x + 1, 42, 7, 32);
        p.rect('#f4e8d0', x + 2, 43, 5, 30);
        p.rect('#d8c8a8', x + 6, 43, 1, 30);
        p.rect('#f4e8d0', x + 3, 41, 3, 2);
      }
      p.rect('#c8b890', 0, 52, w, 3);
      p.rect('#c8b890', 0, 66, w, 3);
      for (let i = 0; i < 40; i++) {
        const fx = (i * 53) % w;
        const fy = 90 + ((i * 97) % (h - 100));
        p.rect(['#ff6a8a', '#ffd23d', '#ffffff', '#b07aff'][i % 4], fx, fy, 2, 2);
        p.rect('#3d8b2f', fx, fy + 2, 1, 2);
      }
    });
    this.pix('whack-hole', 44, 18, (p) => {
      p.disc('#3d2a18', 22, 9, 21, 8);
      p.disc('#1a0f08', 22, 9, 17, 6);
      p.rect('#5a3e24', 6, 3, 32, 1);
    });
    // The front edge of the hole: drawn over a critter's bottom as it rises
    this.pix('whack-lip', 46, 8, (p) => {
      p.rect('#6a4a2a', 2, 0, 42, 4);
      p.rect('#8a6238', 4, 0, 38, 1);
      p.rect('#5aa83a', 0, 4, 46, 4);
      p.rect('#3d2a18', 4, 4, 38, 1);
    });
    const face = (p: Pen, fur: string, light: string, belly: string) => {
      p.disc(INK.line, C / 2, 15, 11, 12);
      p.disc(fur, C / 2, 15, 10, 11);
      p.disc(light, C / 2 - 3, 10, 4, 3);
      p.disc(belly, C / 2, 21, 6, 5);
    };
    this.pix('whack-mole', C, C, (p) => {
      face(p, '#7a5034', '#9a6a48', '#c89a72');
      p.rect(INK.line, 9, 11, 2, 3);
      p.rect(INK.line, 15, 11, 2, 3);
      p.rect('#ffffff', 9, 11, 1, 1);
      p.rect('#ffffff', 15, 11, 1, 1);
      p.disc('#ff8aa0', C / 2, 16, 2, 1.5);
      p.rect('#ffffff', 12, 18, 1, 2);
      p.rect('#ffffff', 14, 18, 1, 2);
      // Little claws
      p.rect('#f4e0c8', 4, 22, 3, 2);
      p.rect('#f4e0c8', 19, 22, 3, 2);
    });
    this.pix('whack-gold', C, C, (p) => {
      face(p, '#e8a312', '#ffd23d', '#fff0a0');
      p.rect(INK.line, 9, 11, 2, 3);
      p.rect(INK.line, 15, 11, 2, 3);
      p.disc('#ff8aa0', C / 2, 16, 2, 1.5);
      p.rect('#ffffff', 4, 4, 1, 3);
      p.rect('#ffffff', 3, 5, 3, 1);
      p.rect('#ffffff', 21, 2, 1, 3);
      p.rect('#ffffff', 20, 3, 3, 1);
    });
    this.pix('whack-cat', C, C, (p) => {
      // Ears, the face, stripes, green eyes, whiskers
      for (const x of [4, 17]) {
        p.rect(INK.line, x, 2, 6, 7);
        p.rect('#f08a3a', x + 1, 3, 4, 6);
        p.rect('#ffb0c0', x + 2, 5, 2, 3);
      }
      face(p, '#f08a3a', '#ffb060', '#fff0e0');
      p.rect('#c0601e', 12, 5, 2, 4);
      p.rect('#c0601e', 6, 12, 3, 1);
      p.rect('#c0601e', 17, 12, 3, 1);
      p.rect('#3dd06a', 8, 11, 3, 3);
      p.rect('#3dd06a', 15, 11, 3, 3);
      p.rect(INK.line, 9, 11, 1, 3);
      p.rect(INK.line, 16, 11, 1, 3);
      p.rect('#ff6a8a', 12, 16, 2, 1);
      p.rect('#ffffff', 2, 16, 6, 1);
      p.rect('#ffffff', 18, 16, 6, 1);
    });
    this.pix('whack-star', 5, 5, (p) => {
      p.rect('#ffd23d', 2, 0, 1, 5);
      p.rect('#ffd23d', 0, 2, 5, 1);
      p.rect('#ffffff', 2, 2, 1, 1);
    });
  }

  started(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.tap(this.at(p)));
  }

  /** The next critter from the seed: which hole, what, for how long (quicker as it goes) */
  private plan(): void {
    const r = this.rand;
    const late = Math.min(1, this.t / this.opts.seconds);
    const free = this.busy.map((b, i) => (b <= this.t ? i : -1)).filter((i) => i >= 0);
    const roll = r();
    const pick = r();
    const stay = Math.max(0.62, 1.3 - late * 0.6) * (0.85 + r() * 0.3);
    const gap = Math.max(0.28, 0.8 - late * 0.45) * (0.7 + r() * 0.6);
    this.next = this.t + gap;
    if (!free.length) return;
    const hole = free[Math.floor(pick * free.length)];
    const kind: Kind = this.t > 3 && roll < 0.13 ? 'cat' : roll > 0.93 ? 'gold' : 'mole';
    const { x, y } = this.hole(hole);
    const img = this.sprite(x, y, `whack-${kind}`).setOrigin(0.5, 0).setDepth(Math.floor(hole / 3) * 3 + 2).setVisible(false);
    this.busy[hole] = this.t + stay + 0.3;
    this.pops.push({ id: this.made++, hole, kind, at: this.t, until: this.t + stay, img, hit: false });
  }

  /** How far out of its hole a critter is now, 0 to 1 */
  private out(p: Pop): number {
    const rise = 0.12;
    if (this.t < p.at) return 0;
    if (p.hit) return Math.max(0, 1 - (this.t - p.until) / 0.1);
    if (this.t < p.at + rise) return (this.t - p.at) / rise;
    if (this.t < p.until) return 1;
    return Math.max(0, 1 - (this.t - p.until) / rise);
  }

  tick(dt: number): void {
    this.t += dt;
    while (this.t >= this.next) this.plan();
    this.draw();
    this.showRival();
  }

  private draw(): void {
    for (const p of this.pops) {
      const k = this.out(p);
      const { y } = this.hole(p.hole);
      const vis = Math.round(k * (C - 2));
      p.img.setVisible(vis > 0);
      p.img.setCrop(0, 0, C, vis);
      p.img.y = y + 8 - vis * PX;
    }
    this.pops = this.pops.filter((p) => {
      if (this.t < p.until + 0.3) return true;
      p.img.destroy();
      return false;
    });
  }

  private tap(pt: { x: number; y: number }): void {
    if (!this.running) return;
    for (const p of this.pops) {
      if (p.hit || this.out(p) < 0.35) continue;
      const { x, y } = this.hole(p.hole);
      if (Math.abs(pt.x - x) > 56 || pt.y > y + 30 || pt.y < y - C * PX - 20) continue;
      p.hit = true;
      p.until = this.t;
      this.bop(p, x, y);
      return;
    }
  }

  private bop(p: Pop, x: number, y: number): void {
    const top = y - C * PX + 10;
    if (p.kind === 'cat') {
      this.addScore(-CAT_COST);
      this.miss();
      this.sfx('meow');
      this.buzz([40, 30, 60]);
      this.shake(160, 0.01);
      this.pop(x, top - 20, `-${CAT_COST}`, '#ff6b7d', 4);
      this.pose(this.hero, 'hurt', 8, 0);
      return;
    }
    const gold = p.kind === 'gold';
    const got = this.addScore(gold ? GOLD_POINTS : 1);
    this.good(gold);
    this.sfx(gold ? 'gem' : 'bonk');
    this.buzz(10);
    this.burst(x, top + 10, gold ? INK.gold : '#c89a72', gold ? 14 : 8, 220, 400);
    this.pop(x, top - 20, `+${got}`, gold ? INK.gold : INK.white, gold ? 4 : 3);
    // Dizzy stars
    for (let i = 0; i < 3; i++) {
      const s = this.sprite(x, top, 'whack-star').setDepth(90);
      const a = (i / 3) * Math.PI * 2;
      this.tweens.add({ targets: s, x: x + Math.cos(a) * 30, y: top - 10 + Math.sin(a) * 12, alpha: 0, duration: 500, onComplete: () => s.destroy() });
    }
    if (this.combo > 0 && this.combo % 8 === 0) this.pose(this.hero, 'emote', 8, 0);
  }

  /** A puff in the rival's color over the critters they got */
  private showRival(): void {
    const d = this.ghostLast();
    if (!d || d[0] === this.rivalHits) return;
    this.rivalHits = d[0];
    const p = this.pops.find((x) => x.id === d[1]);
    if (!p) return;
    const { x, y } = this.hole(p.hole);
    const color = hex(this.opts.rival.color);
    this.burst(x + 30, y - 40, color, 6, 120, 0);
    const name = this.opts.rival.name.trim()[0] ?? '?';
    const t = this.label(x + 34, y - 54, name, 2, this.opts.rival.color).setDepth(85);
    this.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  ghost(): number[] {
    const hit = [...this.pops].reverse().find((p) => p.hit && p.kind !== 'cat');
    if (hit && hit.id !== this.lastHit) {
      this.lastHit = hit.id;
      this.hits++;
    }
    return [this.hits, this.lastHit];
  }

  idle(dt: number): void {
    if (!this.ended) return;
    this.t += dt;
    this.draw();
  }

  finished(): void {
    this.input.removeAllListeners();
    this.pose(this.hero, 'happy');
  }
}
