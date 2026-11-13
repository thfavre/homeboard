import { SPRITE_SCALE, WORLD, seeded } from '$shared/crowd.ts';
import { TOWN_GRASS } from '$shared/world.ts';
import { GREEN, RIVER_CUT, RIVER_FRAMES, RIVER_FRAME_MS, TOWN_PW, brook, brookBox, brookLength, brookPoint, canvas, grass, px, veil } from './throneRoom.ts';

/**
 * The town's own ground over the square's paving (sprite pixels, built once): in the bottom right
 * corner the paving gives way to grass along a slant (TOWN_GRASS), and the town's river runs across
 * that grass and out under the town's right edge. Where the paving ends it breaks up in ragged
 * slabs, a few loose ones lying out on the grass, grass hanging over the edge and growing in the
 * cracks, as where the town meets the riverside (see townEdge). The river flows in frames over it
 * (brookFrames).
 */

const S = SPRITE_SCALE;
const PH = Math.ceil(WORLD.h / S);
/** The row where the grass reaches the town's right edge (the town's edge over the riverside stops there) */
export const GREEN_TOP = TOWN_GRASS.edge;

/** Where the grass starts on a row (x), on the smooth slant from the bottom edge up to the right edge */
const slantAt = (y: number) => TOWN_GRASS.bottom + ((PH - y) * (TOWN_PW - TOWN_GRASS.bottom)) / (PH - TOWN_GRASS.edge);

/**
 * Lay the town's grass and its river over the square's ground (`ground`, in sprite pixels, possibly
 * wider than the town). Its own paving is used for the loose slabs on the grass.
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

  // Where the paving ends on each row: in slabs a few rows high along the slant, some broken off shorter
  const ends: number[] = new Array(PH).fill(Infinity);
  for (let y = GREEN_TOP; y < PH; ) {
    const h = 5 + Math.floor(r() * 7);
    const x = Math.round(slantAt(Math.min(PH, y + h / 2)) + Math.floor(r() * 9) - 4 - (r() < 0.25 ? 8 : 0));
    for (let k = 0; k < h && y < PH; k++, y++) ends[y] = Math.max(0, x);
  }
  for (let y = GREEN_TOP; y < PH; y++) {
    const x = ends[y];
    if (x < W) g.drawImage(lawn, x, y, W - x, 1, x, y, W - x, 1);
  }
  // The paving's edge: the grass's dark line along it, tufts hanging over it, its shadow on the grass
  for (let y = GREEN_TOP; y < PH; y++) {
    const x = ends[y];
    if (x >= W) continue;
    px(g, GREEN.line, x, y);
    veil(g, x + 1, y, 1, 1, 0.22);
    if (r() < 0.3) {
      const len = 1 + Math.floor(r() * 3);
      px(g, GREEN.base, x - len, y, len, 1);
      px(g, GREEN.dark, x - len - 1, y);
    }
    // Grass in the paving's cracks, more of it the nearer the edge
    for (let k = 0; k < 2; k++) {
      const d = Math.floor(r() * 24);
      if (r() > ((24 - d) / 24) ** 2 * 0.45) continue;
      px(g, GREEN.shade, x - 2 - d, y, 2, 1);
      px(g, GREEN.blade, x - 2 - d + (r() < 0.5 ? 0 : 1), y - 1);
    }
  }
  // Loose slabs out on the grass, cut from the paving itself, sunk a little at their edges
  for (let y = GREEN_TOP + 12; y < PH - 10; y += 20 + Math.floor(r() * 24)) {
    const x = ends[y] + 4 + Math.floor(r() * 12);
    if (x > W - 12) continue;
    const w = 6 + Math.floor(r() * 7);
    const h = 4 + Math.floor(r() * 3);
    g.drawImage(paving, 200 + Math.floor(r() * 600), 300 + Math.floor(r() * 120), w, h, x, y, w, h);
    px(g, 'rgba(14,10,24,0.35)', x, y + h, w, 1);
    px(g, GREEN.line, x - 1, y, 1, h);
    px(g, GREEN.blade, x + Math.floor(r() * w), y - 1, 2, 1);
  }
  // Moss creeping over the slabs nearest the grass
  for (let i = 0; i < 90; i++) {
    const y = GREEN_TOP + Math.floor(r() * (PH - GREEN_TOP));
    px(g, 'rgba(70,130,50,0.35)', ends[y] - 2 - Math.floor(r() * 8), y, 2 + Math.floor(r() * 3), 1 + Math.floor(r() * 2));
  }
  // The river, in the first frame of its flow (the others are drawn over it, see brookFrames)
  brook(g, 0, 0);
}

/**
 * The town's river in each frame of its flow: its box, from the town on to where the river by the
 * castle takes over (its own frames start there), transparent outside the river's banks
 */
export function brookFrames(): { x0: number; y0: number; frames: HTMLCanvasElement[] } {
  const box = brookBox();
  const x1 = Math.ceil(TOWN_PW) + RIVER_CUT.x;
  const frames = Array.from({ length: RIVER_FRAMES }, (_, k) => {
    const [c, g] = canvas(x1 - box.x0, Math.min(PH, box.y1) - box.y0);
    g.translate(0, -box.y0);
    brook(g, box.x0, k, Math.ceil(TOWN_PW) - box.x0);
    return c;
  });
  return { x0: box.x0, y0: box.y0, frames };
}

/** Draw the town's river in its frame now (world units); `full`: on over the riverside too (the camera is moving over to it) */
export function drawBrook(g: CanvasRenderingContext2D, b: ReturnType<typeof brookFrames>, now: number, full: boolean): void {
  const f = b.frames[Math.floor(now / RIVER_FRAME_MS) % b.frames.length];
  const w = full ? f.width : Math.min(f.width, Math.ceil(TOWN_PW) - b.x0);
  g.drawImage(f, 0, 0, w, f.height, b.x0 * S, b.y0 * S, w * S, f.height * S);
}

/** Glints on the town's river: how far along it, across it, and their phase */
const GLINTS = (() => {
  const r = seeded(13);
  return Array.from({ length: 5 }, (_, i) => ({ s: 25 + i * 52 + r() * 20, u: r() * 0.8 - 0.4, k: Math.floor(r() * 4) }));
})();

/** The water glinting in the light: the sparkle sheet's frames, here and there on the river (`full`: those over the riverside too) */
export function drawBrookGlints(g: CanvasRenderingContext2D, sparkle: HTMLImageElement, now: number, full: boolean): void {
  const t = Math.floor(now / 160);
  g.globalAlpha = 0.7;
  for (const p of GLINTS) {
    if (p.s > brookLength()) continue;
    const q = brookPoint(p.s, p.u);
    if (!full && q.x > TOWN_PW - 6) continue;
    g.drawImage(sparkle, ((t + p.k) % 4) * 32, 32, 32, 32, Math.round(q.x * S - 16), Math.round(q.y * S - 16), 32, 32);
  }
  g.globalAlpha = 1;
}
