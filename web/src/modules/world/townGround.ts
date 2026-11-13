import { SPRITE_SCALE, WORLD, seeded } from '$shared/crowd.ts';
import { TOWN_GREEN, TOWN_RIVER } from '$shared/world.ts';
import { GREEN, RIVER_CUT, RIVER_FRAMES, RIVER_FRAME_MS, TOWN_PW, brook, brookAt, canvas, grass, px, veil } from './throneRoom.ts';

/**
 * The town's own ground over the square's paving (sprite pixels, built once): along the bottom the
 * paving breaks up into a grassy bank above the river, and in the bottom right corner it gives way
 * to a stretch of grass around the campfire. Where they meet the paving ends in ragged slabs, a few
 * loose ones lying out on the grass, grass hanging over the edge and growing in the cracks, as where
 * the town meets the riverside (see townEdge). The river flows in frames over it (brookFrames).
 */

const S = SPRITE_SCALE;
const PH = Math.ceil(WORLD.h / S);
/** The top of the grass corner at the town's right edge (sprite pixels) */
export const GREEN_TOP = TOWN_RIVER.top - TOWN_GREEN.ry;

/** Where the corner's grass starts on a row (x), on its smooth curve: a quarter of an ellipse from the town's right edge */
function cornerAt(y: number): number {
  const k = (y - TOWN_RIVER.top) / TOWN_GREEN.ry;
  return k <= -1 ? Infinity : TOWN_PW - TOWN_GREEN.rx * Math.sqrt(Math.max(0, 1 - k * k));
}

/**
 * Lay the town's grass, its bank and the river over the square's ground (`ground`, in sprite
 * pixels, possibly wider than the town). Its own paving is used for the loose slabs on the grass.
 */
export function townGround(ground: HTMLCanvasElement): void {
  const W = ground.width;
  const g = ground.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const [paving] = canvas(W, PH);
  paving.getContext('2d')!.drawImage(ground, 0, 0);
  // The grass, its patches running on into the riverside's at the town's edge
  const [lawn, lg] = canvas(W, PH);
  grass(lg, 0, W, -Math.round(TOWN_PW), 41);
  const r = seeded(29);

  // Where the paving ends: along the bottom per column (slabs a few columns wide, some broken off
  // shorter), in the corner per row (slabs a few rows high, around the curve)
  const bottom: number[] = [];
  for (let x = 0; x < W; ) {
    const w = 6 + Math.floor(r() * 10);
    const end = TOWN_RIVER.paving - 3 + Math.floor(r() * 7) - (r() < 0.2 ? 5 : 0);
    for (let k = 0; k < w && x < W; k++, x++) bottom.push(end);
  }
  const corner: number[] = new Array(PH).fill(Infinity);
  for (let y = Math.ceil(GREEN_TOP); y < PH; ) {
    const h = 5 + Math.floor(r() * 7);
    const edge = cornerAt(Math.min(TOWN_RIVER.top, y + h / 2));
    const x = Math.round(edge + Math.floor(r() * 9) - 4 - (r() < 0.25 ? 8 : 0));
    for (let k = 0; k < h && y < PH; k++, y++) corner[y] = Math.max(0, x);
  }
  // A column's grass starts at the higher of: the bottom's edge, or the first row the corner reaches it
  const from = (x: number) => {
    let y = bottom[x];
    for (let row = Math.ceil(GREEN_TOP); row < y; row++) {
      if (corner[row] <= x) return row;
    }
    return y;
  };
  const starts: number[] = [];
  for (let x = 0; x < W; x++) {
    const y = from(x);
    starts.push(y);
    g.drawImage(lawn, x, y, 1, PH - y, x, y, 1, PH - y);
  }
  // The paving's edge: the grass's dark line along it, its shadow on the grass, tufts hanging over it
  for (let x = 0; x < W; x++) {
    const y = starts[x];
    px(g, GREEN.line, x, y);
    veil(g, x, y + 1, 1, 1, 0.22);
    if (r() < 0.22) {
      const len = 1 + Math.floor(r() * 3);
      px(g, GREEN.base, x, y - len, 1, len);
      px(g, GREEN.dark, x, y - len - 1);
    }
  }
  for (let y = Math.ceil(GREEN_TOP); y < TOWN_RIVER.paving + 8; y++) {
    const x = corner[y];
    if (x >= W) continue;
    px(g, GREEN.line, x, y);
    if (r() < 0.3) {
      const len = 1 + Math.floor(r() * 3);
      px(g, GREEN.base, x - len, y, len, 1);
      px(g, GREEN.dark, x - len - 1, y);
    }
  }
  // Grass in the paving's cracks, more of it the nearer the edge
  for (let x = 0; x < W; x++) {
    for (let k = 0; k < 2; k++) {
      const d = Math.floor(r() * 22);
      if (r() > ((22 - d) / 22) ** 2 * 0.45) continue;
      const y = starts[x] - 2 - d;
      if (y > GREEN_TOP && corner[y] <= x) continue;
      px(g, GREEN.shade, x, y, 2, 1);
      px(g, GREEN.blade, x + (r() < 0.5 ? 0 : 1), y - 1);
    }
  }
  // Loose slabs out on the grass, cut from the paving itself, sunk a little at their edges
  const slab = (x: number, y: number) => {
    const w = 6 + Math.floor(r() * 7);
    const h = 4 + Math.floor(r() * 3);
    g.drawImage(paving, 200 + Math.floor(r() * 600), 300 + Math.floor(r() * 120), w, h, x, y, w, h);
    px(g, 'rgba(14,10,24,0.35)', x, y + h, w, 1);
    px(g, GREEN.line, x - 1, y, 1, h);
    px(g, GREEN.blade, x + Math.floor(r() * w), y - 1, 2, 1);
  };
  for (let x = 20; x < W - 20; x += 70 + Math.floor(r() * 90)) {
    const y = starts[x] + 4 + Math.floor(r() * 5);
    if (y + 8 < brookAt(x).top - 5) slab(x, y);
  }
  for (let y = Math.ceil(GREEN_TOP) + 12; y < TOWN_RIVER.paving - 16; y += 20 + Math.floor(r() * 22)) {
    const x = corner[y] + 4 + Math.floor(r() * 10);
    if (x < W - 12) slab(x, y);
  }
  // Moss creeping over the slabs nearest the grass
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(r() * W);
    const y = starts[x] - 1 - Math.floor(r() * 6);
    px(g, 'rgba(70,130,50,0.35)', x, y, 2 + Math.floor(r() * 3), 1 + Math.floor(r() * 2));
  }
  // The river, in the first frame of its flow (the others are drawn over it, see brookFrames)
  brook(g, 0, W, 0, 0);
}

/** The rows of the town's river that change with its flow (sprite pixels) */
const BAND = { y0: TOWN_RIVER.top - 12, y1: TOWN_RIVER.bottom + 8 };

/**
 * The town's river in each frame of its flow: a band across the town and on to where the river by
 * the castle takes over (its own frames start there), transparent outside the river's banks
 */
export function brookFrames(): HTMLCanvasElement[] {
  const w = Math.ceil(TOWN_PW) + RIVER_CUT.x;
  return Array.from({ length: RIVER_FRAMES }, (_, k) => {
    const [c, g] = canvas(w, BAND.y1 - BAND.y0);
    g.translate(0, -BAND.y0);
    brook(g, 0, w, 0, k, Math.ceil(TOWN_PW));
    return c;
  });
}

/** Draw the town's river in its frame now (world units); `full`: on over the riverside too (the camera is moving over to it) */
export function drawBrook(g: CanvasRenderingContext2D, frames: HTMLCanvasElement[], now: number, full: boolean): void {
  const f = frames[Math.floor(now / RIVER_FRAME_MS) % frames.length];
  const w = full ? f.width : Math.ceil(TOWN_PW);
  g.drawImage(f, 0, 0, w, f.height, 0, BAND.y0 * S, w * S, f.height * S);
}

/** Glints on the town's river: where they are (sprite pixels along it, and across it) and their phase */
const GLINTS = (() => {
  const r = seeded(13);
  return Array.from({ length: 9 }, () => ({ x: 30 + r() * 1120, v: 0.25 + r() * 0.5, k: Math.floor(r() * 4) }));
})();

/** The water glinting in the light: the sparkle sheet's frames, here and there on the river */
export function drawBrookGlints(g: CanvasRenderingContext2D, sparkle: HTMLImageElement, now: number): void {
  const t = Math.floor(now / 160);
  g.globalAlpha = 0.7;
  for (const p of GLINTS) {
    const { top, bottom } = brookAt(p.x);
    const x = p.x * S;
    const y = (top + p.v * (bottom - top)) * S;
    g.drawImage(sparkle, ((t + p.k) % 4) * 32, 32, 32, 32, Math.round(x - 16), Math.round(y - 16), 32, 32);
  }
  g.globalAlpha = 1;
}
