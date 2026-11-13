import { SPRITE_SCALE } from '$shared/crowd.ts';
import { TOWN_SCENE } from '$shared/world.ts';
import type { Env } from '../games/crowd/scene.ts';

/**
 * Now and then a leaf comes off one of the town's trees: it drifts down, swaying and turning over,
 * hidden by the crown at first, then in front of the trunk or behind it, lands by the trunk, lies
 * there a moment and fades. Each tree keeps its own timer: its next leaf comes after a random wait
 * in the range the admin sets. The art is the LPC leaf recolors (web/public/crowd/env, see its
 * CREDITS.txt): only its green row, like the trees, eleven single leaves in it.
 */

/** The single leaves of the green row, the sheet's first (x, y, width, height in its pixels) */
const CUTS: [number, number, number, number][] = [
  [64, 1, 11, 9],
  [3, 5, 11, 7],
  [99, 8, 10, 10],
  [20, 9, 12, 7],
  [52, 10, 12, 8],
  [8, 17, 8, 13],
  [67, 17, 8, 12],
  [113, 17, 10, 10],
  [48, 18, 11, 10],
  [17, 19, 10, 10],
  [38, 19, 9, 11],
];
/** At the sprites' own scale, pixel for pixel like the rest of the town */
const SIZE = SPRITE_SCALE;
/** Never more than this many at once, whatever the range (a very short one would fill the square) */
const MAX = 40;

interface Leaf {
  x: number;
  y: number;
  /** Where it lands */
  floor: number;
  cut: number;
  /** The tree it came from, and whether it falls in front of its trunk or behind it */
  tree: number;
  front: boolean;
  /** Its own phase for the sway and the turning over */
  phase: number;
  fall: number;
  /** Seconds since it landed (null: still in the air) */
  down: number | null;
}

export class FallingLeaves {
  private leaves: Leaf[] = [];
  /** Per tree: seconds until it drops its next leaf (each starts at its own point in the range) */
  private waits: number[] | null = null;
  /** Off (the admin's switch): the trees draw none of them */
  on = true;

  /** Move them on by `dt` seconds, and each tree whose wait is over drops a leaf (`range`: from, to in seconds) */
  update(dt: number, range: [number, number]): void {
    const lo = Math.max(0.5, Math.min(range[0], range[1]));
    const hi = Math.max(lo, range[0], range[1]);
    const next = () => lo + Math.random() * (hi - lo);
    this.waits ??= TOWN_SCENE.trees.map(() => Math.random() * next());
    this.waits.forEach((w, i) => {
      // (a wait longer than the range allows, after the admin shortened it, is cut down to it)
      w = Math.min(w, hi) - dt;
      if (w <= 0) {
        w = next();
        if (this.leaves.length < MAX) this.spawn(i);
      }
      this.waits![i] = w;
    });
    for (const l of this.leaves) {
      if (l.down !== null) {
        l.down += dt;
        continue;
      }
      l.y += l.fall * dt;
      // A slow sway from side to side, as if carried by the air
      l.x += Math.cos(l.y / 22 + l.phase) * 14 * dt;
      if (l.y >= l.floor) {
        l.y = l.floor;
        l.down = 0;
      }
    }
    this.leaves = this.leaves.filter((l) => l.down === null || l.down < 6);
  }

  /** A leaf lets go somewhere in tree `i`'s crown */
  private spawn(i: number): void {
    const t = TOWN_SCENE.trees[i];
    const size = t.size;
    const stem = ('stem' in t ? t.stem : undefined) ?? 1;
    // The crown (as the tree draws it): over the trunk, about 94 by 80 sheet pixels
    const k = SPRITE_SCALE * size;
    const top = t.y - 44 * k * stem - 70 * k;
    const a = Math.random() * Math.PI * 2;
    // One falling behind the trunk lands behind its foot, one in front of it before it
    const front = Math.random() < 0.5;
    this.leaves.push({
      x: t.x + Math.cos(a) * 34 * k * Math.random(),
      y: top + 30 * k + Math.sin(a) * 18 * k,
      floor: front ? t.y + 2 + Math.random() * 26 : t.y - 2 - Math.random() * 12,
      tree: i,
      front,
      cut: Math.floor(Math.random() * CUTS.length),
      phase: Math.random() * Math.PI * 2,
      fall: 16 + Math.random() * 10,
      down: null,
    });
  }

  /** The ones lying on the ground, under everyone */
  drawGround(g: CanvasRenderingContext2D, env: Env): void {
    if (!this.on) return;
    for (const l of this.leaves) if (l.down !== null) this.drawLeaf(g, env, l, 1, Math.max(0, Math.min(1, (6 - l.down) / 2)));
  }

  /**
   * The ones still in the air from tree `i`, drawn by the tree itself under its crown: those behind
   * the trunk before it, those in front after it
   */
  drawTree(g: CanvasRenderingContext2D, env: Env, i: number, front: boolean, now: number): void {
    if (!this.on) return;
    for (const l of this.leaves) {
      if (l.down !== null || l.tree !== i || l.front !== front) continue;
      // Turning over as it falls: squeezed flat and back, never quite to nothing
      const turn = Math.cos(now / 520 + l.phase);
      this.drawLeaf(g, env, l, Math.sign(turn || 1) * Math.max(0.25, Math.abs(turn)), 1);
    }
  }

  private drawLeaf(g: CanvasRenderingContext2D, env: Env, l: Leaf, sx: number, alpha: number): void {
    if (alpha <= 0) return;
    const [cx, cy, cw, ch] = CUTS[l.cut];
    const w = cw * SIZE;
    const h = ch * SIZE;
    g.save();
    g.globalAlpha = alpha;
    g.translate(Math.round(l.x), Math.round(l.y));
    g.scale(sx, 1);
    g.drawImage(env.leaves, cx, cy, cw, ch, -w / 2, -h, w, h);
    g.restore();
  }
}
