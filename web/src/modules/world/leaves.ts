import { SPRITE_SCALE } from '$shared/crowd.ts';
import { TOWN_SCENE } from '$shared/world.ts';
import type { Env } from '../games/crowd/scene.ts';

/**
 * Now and then a leaf comes off one of the town's trees: it drifts down from the crown, swaying and
 * turning over, lands near the trunk, lies there a moment and fades. Kept rare on purpose, a leaf
 * every few seconds over the whole square. The art is the LPC leaf recolors (web/public/crowd/env,
 * see its CREDITS.txt): five rows of colours, eleven single leaves in each.
 */

/** The single leaves of a row (x, y, width, height in its pixels, within the row's 32 pixel band) */
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
/** The rows: dark green, orange, red, brown (pink is left out). Most leaves come down green. */
const ROWS = [0, 0, 0, 0, 0, 3, 3, 1, 2];
/** At the sprites' own scale, pixel for pixel like the rest of the town */
const SIZE = SPRITE_SCALE;
const MAX = 8;

interface Leaf {
  x: number;
  y: number;
  /** Where it lands */
  floor: number;
  cut: number;
  row: number;
  /** Its own phase for the sway and the turning over */
  phase: number;
  fall: number;
  /** Seconds since it landed (null: still in the air) */
  down: number | null;
}

export class FallingLeaves {
  private leaves: Leaf[] = [];
  private wait = 2;

  /** Move them on by `dt` seconds (and maybe pick a new one off a tree) */
  update(dt: number): void {
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 2.5 + Math.random() * 4;
      if (this.leaves.length < MAX) this.spawn();
    }
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

  /** A leaf lets go somewhere in a tree's crown */
  private spawn(): void {
    const t = TOWN_SCENE.trees[Math.floor(Math.random() * TOWN_SCENE.trees.length)];
    const size = t.size;
    const stem = ('stem' in t ? t.stem : undefined) ?? 1;
    // The crown (as the tree draws it): over the trunk, about 94 by 80 sheet pixels
    const k = SPRITE_SCALE * size;
    const top = t.y - 44 * k * stem - 70 * k;
    const a = Math.random() * Math.PI * 2;
    this.leaves.push({
      x: t.x + Math.cos(a) * 34 * k * Math.random(),
      y: top + 30 * k + Math.sin(a) * 18 * k,
      floor: t.y + (Math.random() - 0.3) * 40,
      cut: Math.floor(Math.random() * CUTS.length),
      row: ROWS[Math.floor(Math.random() * ROWS.length)],
      phase: Math.random() * Math.PI * 2,
      fall: 16 + Math.random() * 10,
      down: null,
    });
  }

  /** The ones lying on the ground, under everyone */
  drawGround(g: CanvasRenderingContext2D, env: Env): void {
    for (const l of this.leaves) if (l.down !== null) this.drawLeaf(g, env, l, 1, Math.max(0, Math.min(1, (6 - l.down) / 2)));
  }

  /** The ones still in the air, over everyone */
  drawAir(g: CanvasRenderingContext2D, env: Env, now: number): void {
    for (const l of this.leaves) {
      if (l.down !== null) continue;
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
    g.drawImage(env.leaves, cx, cy + l.row * 32, cw, ch, -w / 2, -h, w, h);
    g.restore();
  }
}
