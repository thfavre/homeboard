import { SPRITE_SCALE, SQUARE_HOUSES, WORLD, seeded } from '$shared/crowd.ts';
import { TOWN_HALL } from '$shared/world.ts';
import { houses, type Env, type HouseSwap } from '../games/crowd/scene.ts';
import { STONE, canvas, px, veil } from './throneRoom.ts';

/**
 * What the TV shows past the town's top, in the room a screen of another shape than the town's
 * leaves (the town sits on the screen's bottom, nothing of it cut): the houses' roofs in full, and
 * rows of the town's houses behind them, darker the farther back. Built once in sprite
 * pixels, MARGIN rows high. The town hall's top is drawn over it by the TV (drawTownHall, its art
 * reaches above the town's edge).
 */

const S = SPRITE_SCALE;
const PW = Math.ceil(WORLD.w / S);
/** How high it is (sprite pixels): enough for a 4:3 screen */
export const MARGIN = Math.ceil(300 / S);
/** How far each row of houses behind stands from the one in front (sprite pixels) */
const ROW = 62;

/** Above the town: rows of the town's houses farther back, their roofs over the next row's, each row a little darker */
export function townTop(env: Env, swap?: HouseSwap): HTMLCanvasElement {
  const [c, g] = canvas(PW, MARGIN);
  // The lanes between the rows, seen in the gaps between the houses
  px(g, STONE.deep, 0, 0, PW, MARGIN);
  const r = seeded(61);
  const front = SQUARE_HOUSES.bottom + MARGIN;
  const rows: number[] = [];
  for (let bottom = front - ROW; bottom - 160 > -ROW; bottom -= ROW) rows.unshift(bottom);
  rows.forEach((bottom, i) => {
    // Each row on its own canvas, shifted along, so its darkening only falls on its houses
    const [row, rg] = canvas(PW, MARGIN);
    // (twice side by side, so it can be shifted far enough that its houses do not line up with the next row's)
    rg.translate(-60 - Math.floor(r() * 300), 0);
    houses(rg, env, bottom, 101 + i * 7);
    rg.translate(PW, 0);
    houses(rg, env, bottom, 103 + i * 7);
    rg.setTransform(1, 0, 0, 1, 0, 0);
    rg.globalCompositeOperation = 'source-atop';
    veil(rg, 0, 0, PW, MARGIN, Math.min(0.5, 0.14 * (rows.length - i)));
    // Its roofline's shadow on the row behind
    g.shadowColor = 'rgba(14,10,24,0.55)';
    g.shadowOffsetY = -2;
    g.drawImage(row, 0, 0);
    g.shadowColor = 'transparent';
    g.shadowOffsetY = 0;
  });
  // The houses right of the town hall in full (the town hall draws its own)
  houses(g, env, SQUARE_HOUSES.bottom + MARGIN, SQUARE_HOUSES.seed, swap, TOWN_HALL.x + TOWN_HALL.w);
  return c;
}
