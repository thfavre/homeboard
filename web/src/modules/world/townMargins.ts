import { SPRITE_SCALE, SQUARE_HOUSES, WORLD, seeded } from '$shared/crowd.ts';
import { TOWN_HALL } from '$shared/world.ts';
import { CUT, houses, put, type Env, type HouseSwap } from '../games/crowd/scene.ts';
import { canvas, grass, veil } from './throneRoom.ts';

/**
 * What the TV shows past the town's top, in the room a screen of another shape than the town's
 * leaves (the town sits on the screen's bottom, nothing of it cut): the houses' roofs in full, with
 * rows of treetops behind them, smaller and in more shade the farther back. Built once in sprite
 * pixels, MARGIN rows high. The town hall's top is drawn over it by the TV (drawTownHall, its art
 * reaches above the town's edge).
 */

const S = SPRITE_SCALE;
const PW = Math.ceil(WORLD.w / S);
/** How high it is (sprite pixels): enough for a 4:3 screen */
export const MARGIN = Math.ceil(300 / S);

/** Above the town: grass with trees, their tops showing over the houses' roofs */
export function townTop(env: Env, swap?: HouseSwap): HTMLCanvasElement {
  const [c, g] = canvas(PW, MARGIN);
  grass(g, 0, PW, 0, 53);
  const r = seeded(61);
  // Rows of treetops up to the top, the far ones first: the nearest just over the roofs
  const rows: { y: number; k: number; shade: number }[] = [];
  for (let i = 0, y = MARGIN - 63; y > 0; i++, y -= 38) rows.unshift({ y, k: Math.max(0.6, 1 - i * 0.1), shade: Math.min(0.45, i * 0.12) });
  for (const row of rows) {
    for (let x = -30 + Math.floor(r() * 40); x < PW + 40; x += Math.round((52 + Math.floor(r() * 30)) * row.k)) {
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
