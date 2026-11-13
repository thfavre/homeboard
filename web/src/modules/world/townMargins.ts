import { SPRITE_SCALE, SQUARE_HOUSES, WORLD, seeded } from '$shared/crowd.ts';
import { TOWN_HALL } from '$shared/world.ts';
import { CUT, houses, put, type Env, type HouseSwap } from '../games/crowd/scene.ts';
import { EARTH, GREEN, SAND, STONE, WATER, brookLength, brookPoint, canvas, grass, hash, px, veil } from './throneRoom.ts';

/**
 * What the TV shows past the town's top and bottom edges, in the bands a screen of another shape
 * than the town's leaves (nothing of the town is cut to fill them): above, the houses' roofs in full
 * with treetops behind them; below, a street along the square with the river running under it and
 * out across the grass beyond. Built once in sprite pixels, MARGIN rows each. The town hall's top
 * is drawn over the top one by the TV (drawTownHall, its art reaches above the town's edge).
 */

const S = SPRITE_SCALE;
const PW = Math.ceil(WORLD.w / S);
const PH = Math.ceil(WORLD.h / S);
/** How high each band is (sprite pixels): enough for a 4:3 screen */
export const MARGIN = Math.ceil(200 / S);

/** Above the town: grass with trees, their tops showing over the houses' roofs */
export function townTop(env: Env, swap?: HouseSwap): HTMLCanvasElement {
  const [c, g] = canvas(PW, MARGIN);
  grass(g, 0, PW, 0, 53);
  const r = seeded(61);
  // Two rows of treetops, the far one smaller and in the shade, the near one just over the roofs
  for (const row of [
    { y: 48, k: 0.8, shade: 0.25 },
    { y: 86, k: 1, shade: 0 },
  ]) {
    for (let x = -30 + Math.floor(r() * 40); x < PW + 40; x += 52 + Math.floor(r() * 30)) {
      const y = row.y + Math.floor(r() * 12);
      g.globalAlpha = 0.35;
      put(g, env['tree-shadows'], CUT.treeShadow, x + 6, y + 10, row.k);
      g.globalAlpha = 1;
      put(g, env['tree-canopies'], r() < 0.5 ? CUT.canopySummer : CUT.canopySpring, x, y, row.k);
      if (row.shade) {
        g.globalCompositeOperation = 'source-atop';
        veil(g, x - 50, y - 70, 100, 72, row.shade);
        g.globalCompositeOperation = 'source-over';
      }
    }
  }
  // The houses right of the town hall in full (the town hall draws its own)
  houses(g, env, SQUARE_HOUSES.bottom + MARGIN, SQUARE_HOUSES.seed, swap, TOWN_HALL.x + TOWN_HALL.w);
  return c;
}

/** Where the street's parts are (rows of the bottom band) */
const CURB = 3;
const ROAD_END = 60;
const WALK_END = 88;

/**
 * Below the town: a curb, the street with its dashed middle line, a sidewalk, then grass. The river
 * goes under the street, between a stone parapet on each side, and runs on across the grass.
 */
export function townBottom(env: Env): HTMLCanvasElement {
  const [c, g] = canvas(PW, MARGIN);
  const r = seeded(71);
  // The street: plain asphalt, now and then a cracked tile
  for (let y = CURB; y < ROAD_END; y += 32) {
    for (let x = 0; x < PW; x += 32) {
      const h = Math.min(32, ROAD_END - y);
      if (r() < 0.05) {
        const t = Math.floor(r() * 18);
        g.drawImage(env['street-road-cracked'], (t % 6) * 32, Math.floor(t / 6) * 32, 32, h, x, y, 32, h);
      } else g.drawImage(env['street-road'], 0, 0, 32, h, x, y, 32, h);
    }
  }
  // Its middle line, worn
  g.fillStyle = 'rgba(235,235,225,0.4)';
  for (let x = 6; x < PW; x += 40) g.fillRect(x, Math.round((CURB + ROAD_END) / 2) - 1, 22, 2);
  // The sidewalk on the far side, its curb toward the street
  for (let y = ROAD_END; y < WALK_END; y += 32) {
    for (let x = 0; x < PW; x += 32) {
      const h = Math.min(32, WALK_END - y);
      g.drawImage(env['street-sidewalk'], 192 + ((x / 32) % 2) * 32, 160, 32, h, x, y, 32, h);
    }
  }
  px(g, '#9aa0a6', 0, ROAD_END, PW, 2);
  veil(g, 0, ROAD_END - 2, PW, 2, 0.3);
  // Grass beyond, its edge in the sidewalk's shadow
  const [lawn, lg] = canvas(PW, PH);
  grass(lg, 0, PW, 0, 67);
  g.drawImage(lawn, 0, 0, PW, MARGIN - WALK_END, 0, WALK_END, PW, MARGIN - WALK_END);
  veil(g, 0, WALK_END, PW, 2, 0.3);
  // The square's curb along the top, its shadow on the street
  px(g, '#9aa0a6', 0, 0, PW, CURB);
  veil(g, 0, CURB, PW, 3, 0.35);

  // The river: where it leaves the town's bottom edge, and which way it goes
  let s = 0;
  while (s < brookLength() && brookPoint(s, 0).y > PH) s += 0.5;
  const at = brookPoint(s, 0);
  const near = brookPoint(s, -1);
  const far = brookPoint(s, 1);
  const half = Math.hypot(far.x - near.x, far.y - near.y) / 2;
  const below = brookPoint(Math.max(0, s - 10), 0);
  const slope = (at.x - below.x) / (at.y - below.y);
  const cx = (y: number) => at.x + slope * (y + PH - at.y) + 1.5 * Math.sin(y / 13);
  // Out across the grass: earth on the town's side, water, sand on the far one
  for (let y = WALK_END; y < MARGIN; y++) {
    const m = cx(y);
    for (let x = Math.floor(m - half - 5); x < m + half + 4; x++) {
      const v = x - m;
      let color: string;
      if (v < -half - 3) color = hash(x, y) > 0.5 ? GREEN.base : GREEN.line;
      else if (v < -half - 1) color = EARTH.mid;
      else if (v < -half) color = EARTH.line;
      else if (v < -half + 1) color = WATER.deep;
      else if (v < -half + 2.5) color = WATER.lump;
      else if (v < half - 1.5) color = hash(x, y) > 0.97 ? WATER.light : WATER.base;
      else if (v < half) color = WATER.shallow;
      else {
        const q = hash(x, y);
        color = q < 0.12 ? STONE.light : q < 0.3 ? SAND.mid : SAND.light;
      }
      px(g, color, x, y);
    }
  }
  // Coming out from under the sidewalk: in its shadow
  veil(g, Math.floor(cx(WALK_END) - half), WALK_END, Math.ceil(half * 2), 6, 0.35);
  // The street crosses on a bridge: a stone parapet each side, over the river's width
  for (const [y, h, x] of [
    [0, 6, cx(0)],
    [WALK_END - 4, 6, cx(WALK_END)],
  ]) {
    const x0 = Math.floor(x - half - 6);
    const w = Math.ceil(half * 2 + 12);
    px(g, STONE.line, x0 - 1, y, w + 2, h + 1);
    px(g, STONE.mid, x0, y, w, h - 1);
    px(g, STONE.pale, x0, y, w, 2);
    for (let k = x0 + 6; k < x0 + w - 2; k += 8) px(g, STONE.dark, k, y + 2, 1, h - 3);
    veil(g, x0, y + h, w, 2, 0.4);
  }
  return c;
}
