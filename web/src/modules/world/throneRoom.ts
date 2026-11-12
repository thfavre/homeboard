import { BODY, FRAME_PX, SPRITE_SCALE, WORLD, seeded } from '$shared/crowd.ts';
import { HALL, HALL_ART, THRONE_SEAT, type SheetInfo } from '$shared/world.ts';
import type { Prop } from '../games/crowd/scene.ts';

/**
 * The throne room on the TV: a hall off the right edge of the town that the camera moves over to for
 * the King's ceremony. A red carpet runs from its open side up the steps of a dais to the throne,
 * under banners, between pillars and burning braziers.
 *
 * The throne, the carpet's weave, the floor tiles and the potted trees are LPC Revised art
 * (web/public/crowd/env, see its CREDITS.txt), the reds recolored to one royal red. Everything else
 * (the walls, pillars, banners, windows, the dais, the footstool, the braziers and their fire) is
 * drawn here by hand in the palettes of those sheets, lit from the top left, one sprite pixel at a
 * time.
 *
 * The ground is built once in sprite pixels (HALL_ART, shared/world.ts) and drawn SPRITE_SCALE world
 * units a pixel, like the square; what stands up or burns is drawn every frame in world units.
 */

const S = SPRITE_SCALE;
const A = HALL_ART;
/** The hall's height in sprite pixels: the town's */
const PH = Math.ceil(WORLD.h / S);

// ------------------------------------------------------------ palettes (from the sheets)

/** The blue-grey stone of the walls and pillars, dark to light */
const STONE = { line: '#1b192b', deep: '#29253a', shade: '#343043', dark: '#4b4b60', mid: '#6a7587', light: '#818e97', pale: '#a8b3b8', white: '#c7cfcc' };
/** The warm stone of the dais and the trims */
const SAND = { line: '#484152', dark: '#6f6464', mid: '#958080', light: '#c4b59f', pale: '#e3e7d3', white: '#ebede9' };
/** The royal red of the carpet, the banners and the throne's cushions */
const RED = { line: '#3e111a', deep: '#5c1220', dark: '#7e1622', mid: '#9e1f29', light: '#bd3130', shine: '#d95a45' };
const GOLD = { line: '#794117', dark: '#d19428', mid: '#e09c4c', light: '#f3c35f', shine: '#fdd082' };
const IRON = { line: '#0f1218', dark: '#1b192b', mid: '#29253a', light: '#4b4b60', shine: '#6a7587' };
/** The dark wood of the throne */
const WOOD = { line: '#1a1213', dark: '#3e111a', mid: '#603429', light: '#7f4c31' };

/** The carpet sheet's purple rug and the throne sheet's red cushions, in the royal red */
const CARPET_SWAP: Record<string, string> = { '#1b192b': RED.line, '#382b33': RED.deep, '#4c3b64': RED.dark, '#655789': RED.mid, '#7c6ea6': RED.light };
const CUSHION_SWAP: Record<string, string> = { '#6a1d16': RED.dark, '#7b2008': RED.mid, '#95381c': RED.light, '#b54936': RED.shine };

// ------------------------------------------------------------ cuts of the sheets

/** The purple rug: 3 x 3 tiles of 32 px (corners, edges, the middle) */
const RUG = { x: 0, y: 96, tile: 32 };
/** The throne with the red cushions, seen from the side and facing left (its finials stick out above its 64 px) */
const THRONE_CUT = [96, 80, 32, 80] as const;
/** A small round tree in a porcelain pot (the planters sheet) */
const TOPIARY = [64, 0, 32, 80] as const;
/** The floor: two tones of diamond tiles (32 px), laid as a chessboard */
const FLOOR_TILES = [
  [32, 32],
  [32, 64],
] as const;

export interface HallArt {
  /** The hall's ground, in sprite pixels */
  ground: HTMLCanvasElement;
  /** The throne (in the royal red), in sprite pixels: the part behind whoever sits on it */
  throne: HTMLCanvasElement;
  /** The part of the throne drawn in front of whoever sits on it (same size and place as the cut) */
  throneFront: HTMLCanvasElement;
}

let loading: Promise<HallArt | null> | null = null;

/** Load the sheets and build the hall once (null: they cannot be, the town has no throne room to show) */
export function loadHall(): Promise<HallArt | null> {
  const load = (f: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(f));
      img.src = `/crowd/env/${f}.png`;
    });
  // The front part is drawn by hand over the cut (/world/throne-front.png, the cut's size): its pixels
  // come off the back part, so each pixel of the throne is drawn once
  const front = () =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('throne-front'));
      img.src = '/world/throne-front.png';
    });
  loading ??= Promise.all([load('throne'), load('carpet'), load('pave-stone-diamond'), load('planters'), front()])
    .then(([throne, carpet, tiles, planters, near]) => {
      const [tx, ty, tw, th] = THRONE_CUT;
      const back = recolored(throne, tx, ty, tw, th, CUSHION_SWAP);
      const g = back.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(near, 0, 0);
      return { ground: buildGround(carpet, tiles, planters), throne: back, throneFront: recolored(near, 0, 0, tw, th, CUSHION_SWAP) };
    })
    .catch(() => null);
  return loading;
}

// ------------------------------------------------------------ drawing helpers

type G = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function px(g: G, color: string, x: number, y: number, w = 1, h = 1): void {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

/** A part of a sheet with some of its colors swapped for others */
function recolored(img: CanvasImageSource, sx: number, sy: number, w: number, h: number, swap: Record<string, string>): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  g.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  const d = data.data;
  const to = new Map(Object.entries(swap).map(([from, hex]) => [parseInt(from.slice(1), 16), parseInt(hex.slice(1), 16)]));
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const hit = to.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (hit === undefined) continue;
    d[i] = hit >> 16;
    d[i + 1] = (hit >> 8) & 255;
    d[i + 2] = hit & 255;
  }
  g.putImageData(data, 0, 0);
  return c;
}

/** A darker or lighter veil over a part of the picture (soft shadows, worn stone) */
function veil(g: G, x: number, y: number, w: number, h: number, alpha: number, light = false): void {
  px(g, light ? `rgba(255,244,214,${alpha})` : `rgba(14,10,24,${alpha})`, x, y, w, h);
}

// ------------------------------------------------------------ the ground (built once)

/**
 * The whole hall lying flat: the floor, the dais, the carpet, the walls with their banners, windows
 * and pillars, and two small trees in porcelain pots below the dais (nobody walks there)
 */
function buildGround(carpetSheet: HTMLImageElement, tiles: HTMLImageElement, planters: HTMLImageElement): HTMLCanvasElement {
  const [c, g] = canvas(A.w, PH);
  floor(g, tiles);
  dais(g);
  carpet(g, carpetSheet);
  backWall(g);
  outerWalls(g);
  const [sx, sy, sw, sh] = TOPIARY;
  for (const [x, y] of [
    [A.dais[0].x + 22, A.dais[0].y1 + 70],
    [A.east - 24, A.dais[0].y1 + 70],
  ]) {
    g.fillStyle = 'rgba(14,10,24,0.26)';
    g.beginPath();
    g.ellipse(x + 3, y - 3, 13, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(planters, sx, sy, sw, sh, x - sw / 2, y - sh, sw, sh);
  }
  return c;
}

/** The floor: a chessboard of diamond tiles, a sill of light stone along the open side, the back wall's shadow */
function floor(g: G, tiles: HTMLImageElement): void {
  const y0 = A.wall - 12;
  for (let y = y0, row = 0; y < PH; y += 32, row++) {
    for (let x = 6, col = 0; x < A.east; x += 32, col++) {
      const [sx, sy] = FLOOR_TILES[(row + col) % 2];
      g.drawImage(tiles, sx, sy, 32, 32, x, y, 32, 32);
    }
  }
  // The sill: one step up from the square
  px(g, SAND.light, 0, A.wall, 6, PH - A.wall);
  px(g, SAND.pale, 0, A.wall, 1, PH - A.wall);
  px(g, SAND.dark, 5, A.wall, 1, PH - A.wall);
  for (let y = A.wall + 20; y < PH; y += 24) px(g, SAND.mid, 1, y, 4, 1);
  veil(g, 6, A.wall, 2, PH - A.wall, 0.22);
  // The back wall's shadow on the floor
  for (let k = 0; k < 10; k++) veil(g, 6, A.wall + k, A.east - 6, 1, 0.3 * (1 - k / 10));
}

/** The dais: three steps of warm stone, each a little smaller and higher, the stairs facing the carpet */
function dais(g: G): void {
  const r = seeded(31);
  A.dais.forEach((t, k) => {
    const up = (k + 1) * A.rise;
    const x1 = A.east;
    const top = t.y0 - up;
    const bottom = t.y1 - up;
    // The shadow the step casts on what lies below it, to the right of the light
    if (k === 0) veil(g, t.x + 2, bottom + A.rise, x1 - t.x - 2, 3, 0.28);
    // Its top: slabs of stone with a lit edge all around
    px(g, SAND.light, t.x, top, x1 - t.x, bottom - top);
    for (let y = top; y < bottom; y += 16) {
      for (let x = t.x + ((Math.floor((y - top) / 16) % 2) * 12 - 12); x < x1; x += 24) {
        const cx = Math.max(t.x, x);
        if (r() < 0.3) veil(g, cx, y, Math.min(x + 24, x1) - cx, Math.min(16, bottom - y), 0.05);
        if (x > t.x) px(g, SAND.mid, x, y, 1, Math.min(16, bottom - y));
      }
      if (y > top) px(g, SAND.mid, t.x, y, x1 - t.x, 1);
    }
    px(g, SAND.pale, t.x, top, x1 - t.x, 1);
    px(g, SAND.pale, t.x, top, 2, bottom - top);
    px(g, SAND.white, t.x, top, 1, bottom - top);
    if (k === A.dais.length - 1) {
      // The top step: a line of gold inlaid along its edge
      px(g, GOLD.dark, t.x + 5, top + 4, x1 - t.x - 5, 1);
      px(g, GOLD.dark, t.x + 5, bottom - 5, x1 - t.x - 5, 1);
      px(g, GOLD.dark, t.x + 5, top + 4, 1, bottom - top - 8);
      px(g, GOLD.light, t.x + 6, top + 5, x1 - t.x - 6, 1);
      px(g, GOLD.light, t.x + 6, top + 5, 1, bottom - top - 10);
    }
    // The edge of the stairs: the step before it in shade
    px(g, SAND.line, t.x - 1, top, 1, bottom - top + A.rise);
    // Its front, seen from above: a band of darker stone, joints, a dark foot
    px(g, SAND.mid, t.x, bottom, x1 - t.x, A.rise);
    px(g, SAND.light, t.x, bottom, x1 - t.x, 1);
    px(g, SAND.dark, t.x, bottom + A.rise - 2, x1 - t.x, 1);
    px(g, SAND.line, t.x, bottom + A.rise - 1, x1 - t.x, 1);
    for (let x = t.x + 10; x < x1; x += 20) px(g, SAND.dark, x, bottom + 1, 1, A.rise - 2);
  });
}

/** The red carpet: the rug's weave in royal red with a golden border, from the hall's open side up the stairs to the throne */
function carpet(g: G, sheet: HTMLImageElement): void {
  const x0 = 12;
  const x1 = A.east - 12;
  const w = x1 - x0;
  const h = A.carpet.y1 - A.carpet.y0;
  const [strip, sg] = canvas(w, h);
  const rug = recolored(sheet, RUG.x, RUG.y, RUG.tile * 3, RUG.tile * 3, CARPET_SWAP);
  // The rug's corners and edges on the rim, its middle repeated inside
  for (let y = 0; y < h; y += RUG.tile) {
    for (let x = 0; x < w; x += RUG.tile) {
      const col = x === 0 ? 0 : x + RUG.tile >= w ? 2 : 1;
      const row = y === 0 ? 0 : y + RUG.tile >= h ? 2 : 1;
      const dx = col === 2 ? w - RUG.tile : x;
      const dy = row === 2 ? h - RUG.tile : y;
      sg.drawImage(rug, col * RUG.tile, row * RUG.tile, RUG.tile, RUG.tile, dx, dy, RUG.tile, RUG.tile);
    }
  }
  // The rim in gold: a dark line, two of gold, a dark line
  const rim = [GOLD.line, GOLD.light, GOLD.dark, GOLD.line];
  rim.forEach((color, k) => {
    sg.fillStyle = color;
    sg.fillRect(k, k, w - 2 * k, 1);
    sg.fillRect(k, h - 1 - k, w - 2 * k, 1);
    sg.fillRect(k, k, 1, h - 2 * k);
    sg.fillRect(w - 1 - k, k, 1, h - 2 * k);
  });
  // Flat on the floor, then up the stairs: each step lifts it, and leaves a fold of shade and light
  const edges = [x0, ...A.dais.map((t) => t.x), x1];
  for (let k = 0; k + 1 < edges.length; k++) {
    const from = edges[k];
    const to = edges[k + 1];
    const up = k * A.rise;
    g.drawImage(strip, from - x0, 0, to - from, h, from, A.carpet.y0 - up, to - from, h);
    if (k === 0) {
      // Its shadow on the floor along its lower edge
      veil(g, from + 1, A.carpet.y1, to - from - 1, 2, 0.25);
      continue;
    }
    px(g, RED.line, from - 1, A.carpet.y0 - up + A.rise, 1, h);
    px(g, RED.shine, from, A.carpet.y0 - up, 1, h);
    // The carpet's edge on the step below shows under the lifted part
    px(g, RED.deep, from, A.carpet.y1 - up, to - from, 1);
  }
}

/** A block of dressed stone: lit along the top, in shade along the bottom */
function block(g: G, x: number, y: number, w: number, h: number, tone: number): void {
  px(g, STONE.dark, x, y, w, h);
  if (tone) veil(g, x, y, w, h, Math.abs(tone), tone > 0);
  veil(g, x, y, w, 1, 0.14, true);
  veil(g, x, y + h - 1, w, 1, 0.22);
}

/** The back wall: courses of dark stone on a lighter foot, pillars along it, banners and windows between them */
function backWall(g: G): void {
  const r = seeded(4);
  const x0 = 0;
  const x1 = A.east;
  const foot = A.wall - 12;
  px(g, STONE.deep, x0, 0, x1 - x0, A.wall);
  for (let y = foot - 12, row = 0; y > -12; y -= 12, row++) {
    for (let x = x0 - (row % 2 ? 13 : 0); x < x1; x += 26) {
      const tone = r() < 0.2 ? 0.07 : r() < 0.25 ? -0.1 : 0;
      block(g, Math.max(x0, x), y, Math.min(x + 25, x1) - Math.max(x0, x), 11, tone);
    }
  }
  // The foot of the wall: a course of lighter stone with a rounded top
  px(g, STONE.mid, x0, foot, x1 - x0, 12);
  px(g, STONE.pale, x0, foot, x1 - x0, 1);
  px(g, STONE.light, x0, foot + 1, x1 - x0, 2);
  px(g, STONE.dark, x0, foot + 10, x1 - x0, 1);
  px(g, STONE.line, x0, foot + 11, x1 - x0, 1);
  for (let x = x0 + 18; x < x1; x += 36) px(g, STONE.dark, x, foot + 3, 1, 7);

  // Between the pillars, in turn: a banner, a window, a banner...
  const first = 46;
  const step = 68;
  for (let k = 0; first + k * step < x1 - 20; k++) {
    const cx = first + k * step;
    const between = cx + step / 2;
    if (between < x1 - 18) {
      if (k % 2 === 0) banner(g, between, 10, 34, 84);
      else tallWindow(g, between, 12, 30, 74);
    }
  }
  for (let k = 0; first + k * step < x1 - 12; k++) pillar(g, first + k * step, 0, A.wall + 6, 22);
  // The corner by the open side: a pier of lighter stone, a step out of the wall
  pier(g, 0, 0, 30, A.wall + 10);
}

/** A round pillar from `top` down to its foot at `bottom`, lit from the left, a golden ring under the torch it carries */
function pillar(g: G, cx: number, top: number, bottom: number, w: number): void {
  const x = cx - w / 2;
  const shaftBottom = bottom - 12;
  // The shadow it casts on the wall to its right
  veil(g, x + w, top, 5, shaftBottom - top, 0.3);
  // The shaft: bands of tone around the curve
  const bands: [string, number][] = [
    [STONE.line, 1],
    [STONE.light, 2],
    [STONE.white, 2],
    [STONE.pale, 4],
    [STONE.light, 5],
    [STONE.mid, 4],
    [STONE.dark, 3],
    [STONE.line, 1],
  ];
  let bx = x;
  for (const [color, bw] of bands) {
    px(g, color, bx, top, bw, shaftBottom - top);
    bx += bw;
  }
  // Drum joints
  for (let y = shaftBottom - 34; y > top; y -= 34) veil(g, x + 1, y, w - 2, 1, 0.28);
  // A golden ring
  const ring = shaftBottom - 22;
  px(g, GOLD.line, x, ring - 1, w, 1);
  px(g, GOLD.light, x, ring, w, 2);
  px(g, GOLD.shine, x + 3, ring, 4, 1);
  px(g, GOLD.dark, x + w - 7, ring, 7, 2);
  px(g, GOLD.line, x, ring + 2, w, 1);
  // The foot: a round moulding on a square plinth
  px(g, STONE.line, x - 2, shaftBottom, w + 4, 5);
  px(g, STONE.pale, x - 1, shaftBottom + 1, w + 2, 1);
  px(g, STONE.light, x - 1, shaftBottom + 2, w + 2, 2);
  px(g, STONE.dark, x + w - 5, shaftBottom + 1, 6, 3);
  px(g, STONE.line, x - 4, shaftBottom + 5, w + 8, 7);
  px(g, STONE.light, x - 3, shaftBottom + 6, w + 6, 5);
  px(g, STONE.pale, x - 3, shaftBottom + 6, w + 6, 1);
  px(g, STONE.mid, x + w - 4, shaftBottom + 7, 7, 4);
  veil(g, x - 2, bottom, w + 8, 2, 0.3);
}

/** A square pier of lighter stone (the corner of the hall by its open side) */
function pier(g: G, x: number, top: number, w: number, bottom: number): void {
  const r = seeded(12);
  px(g, STONE.line, x, top, w, bottom - top);
  for (let y = bottom - 14, row = 0; y > top - 14; y -= 14, row++) {
    const half = row % 2 ? Math.round(w / 2) : 0;
    for (const [bx, bw] of half ? [[x, half - 1], [x + half, w - half - 1]] : [[x, w - 1]]) {
      px(g, STONE.mid, bx, y, bw, 13);
      if (r() < 0.4) veil(g, bx, y, bw, 13, 0.08);
      px(g, STONE.light, bx, y, bw, 1);
      px(g, STONE.light, bx, y, 1, 13);
      px(g, STONE.dark, bx, y + 12, bw, 1);
    }
  }
  // Its shadow on the wall and the floor to its right
  veil(g, x + w, top, 6, bottom - top - 10, 0.3);
  veil(g, x + 2, bottom, w + 4, 3, 0.3);
}

/** A small crown in gold, 13 x 8 sprite pixels (the banners' emblem) */
function crown(g: G, x: number, y: number): void {
  // How far down the crown starts in each column: three points
  const tops = [1, 0, 1, 2, 3, 1, 0, 1, 3, 2, 1, 0, 1];
  tops.forEach((t, c) => {
    px(g, GOLD.light, x + c, y + t, 1, 8 - t);
    px(g, GOLD.shine, x + c, y + t, 1, 1);
    if (c > 7) px(g, GOLD.dark, x + c, y + t + 1, 1, 7 - t);
  });
  // The band: a dark foot, three jewels
  px(g, GOLD.mid, x, y + 5, 13, 1);
  px(g, GOLD.line, x, y + 7, 13, 1);
  for (const c of [2, 6, 10]) px(g, RED.light, x + c, y + 5, 1, 1);
}

/** A banner hanging from a golden rod: royal red, a golden border, a crown, two tails */
function banner(g: G, cx: number, top: number, w: number, h: number): void {
  const x = Math.round(cx - w / 2);
  const tail = 12;
  // Its shadow on the wall
  veil(g, x + 3, top + 4, w, h - tail, 0.28);
  // The cloth, with its two tails cut out at the bottom
  for (let j = 0; j < h; j++) {
    const cut = j > h - tail ? Math.round(((j - (h - tail)) / tail) * (w / 2 - 2)) : 0;
    for (const [bx, bw] of cut ? [[x, w / 2 - cut], [x + w / 2 + cut, w / 2 - cut]] : [[x, w]]) {
      if (bw <= 0) continue;
      px(g, RED.mid, bx, top + j, bw, 1);
    }
    if (!cut) {
      // Folds: light down the left, shade down the right
      px(g, RED.light, x + 4, top + j, 3, 1);
      px(g, RED.dark, x + w - 9, top + j, 4, 1);
      px(g, RED.light, x + Math.round(w / 2) - 1, top + j, 2, 1);
      // The border: gold inside a dark edge
      px(g, RED.line, x, top + j, 1, 1);
      px(g, RED.line, x + w - 1, top + j, 1, 1);
      px(g, GOLD.light, x + 1, top + j, 2, 1);
      px(g, GOLD.dark, x + w - 3, top + j, 2, 1);
    } else {
      // The tails' edges, in gold along the cut
      px(g, GOLD.light, x + 1, top + j, 2, 1);
      px(g, GOLD.dark, x + w - 3, top + j, 2, 1);
      px(g, GOLD.dark, x + w / 2 - cut - 1, top + j, 1, 1);
      px(g, GOLD.light, x + w / 2 + cut, top + j, 1, 1);
      px(g, RED.line, x, top + j, 1, 1);
      px(g, RED.line, x + w - 1, top + j, 1, 1);
    }
  }
  // A golden band across the top and above the tails
  px(g, GOLD.light, x + 1, top + 3, w - 2, 2);
  px(g, GOLD.dark, x + 1, top + 5, w - 2, 1);
  px(g, GOLD.light, x + 3, top + h - tail - 4, w - 6, 1);
  px(g, GOLD.dark, x + 3, top + h - tail - 3, w - 6, 1);
  // The crown, and a diamond under it
  crown(g, Math.round(cx - 6.5), top + 18);
  const dy = top + 38;
  for (let k = 0; k < 5; k++) {
    const half = k < 3 ? k : 4 - k;
    px(g, GOLD.light, Math.round(cx) - half - 1, dy + k * 2, half * 2 + 2, 2);
  }
  px(g, GOLD.shine, Math.round(cx) - 1, dy + 2, 1, 2);
  // The rod it hangs from, with a knob at each end
  px(g, GOLD.line, x - 4, top - 2, w + 8, 4);
  px(g, GOLD.light, x - 3, top - 1, w + 6, 1);
  px(g, GOLD.dark, x - 3, top, w + 6, 1);
  for (const kx of [x - 6, x + w + 3]) {
    px(g, GOLD.line, kx, top - 3, 4, 6);
    px(g, GOLD.light, kx + 1, top - 2, 2, 3);
    px(g, GOLD.shine, kx + 1, top - 2, 1, 1);
  }
}

/** A tall window with a round arch: a frame of light stone, leaded glass full of daylight */
function tallWindow(g: G, cx: number, top: number, w: number, h: number): void {
  const x = Math.round(cx - w / 2);
  const r = w / 2;
  for (let j = 0; j < h; j++) {
    // The arch narrows the first rows
    const inset = j < r ? Math.round(r - Math.sqrt(Math.max(0, r * r - (r - j) * (r - j)))) : 0;
    const gx = x + inset;
    const gw = w - 2 * inset;
    if (gw <= 0) continue;
    px(g, STONE.line, gx - 3, top + j, gw + 6, 1);
    px(g, STONE.pale, gx - 2, top + j, gw + 4, 1);
    px(g, STONE.light, gx + gw, top + j, 2, 1);
    // The glass: brighter at the top
    px(g, j < h * 0.45 ? '#fbf3d6' : '#f2e3b3', gx, top + j, gw, 1);
    // Leading: a net of lozenges
    for (let i = 0; i < gw; i++) {
      const u = gx + i - x;
      if ((u + j) % 8 === 0 || (u - j + 800) % 8 === 0) px(g, 'rgba(110,96,86,0.55)', gx + i, top + j, 1, 1);
    }
  }
  // The arch's top stone, the frame's edge at the top, the sill
  px(g, STONE.line, x + 2, top - 3, w - 4, 1);
  px(g, STONE.pale, x + 3, top - 2, w - 6, 2);
  px(g, STONE.line, x - 5, top + h, w + 10, 5);
  px(g, STONE.white, x - 4, top + h + 1, w + 8, 1);
  px(g, STONE.pale, x - 4, top + h + 2, w + 8, 2);
  // A mullion down the middle, a bar across
  px(g, STONE.dark, Math.round(cx) - 1, top + 3, 2, h - 3);
  px(g, STONE.dark, x, top + Math.round(h * 0.45), w, 2);
  veil(g, x - 3, top + h + 5, w + 8, 2, 0.3);
}

/** How thick the front wall shows along the bottom of the picture (sprite pixels) */
const FRONT_WALL = 13;

/**
 * The right wall and the front wall, seen from above: the tops of thick walls of dark stone, and
 * the top of the pier where the front wall ends at the open side
 */
function outerWalls(g: G): void {
  const x = A.east;
  const w = A.w - x;
  px(g, STONE.shade, x, 0, w, PH);
  for (let y = -6, row = 0; y < PH; y += 20, row++) {
    px(g, STONE.dark, x + 1, y + 1, w - 1, 18);
    veil(g, x + 1, y + 1, w - 1, 1, 0.12, true);
    if (row % 3 === 1) veil(g, x + 1, y + 1, w - 1, 18, 0.1);
  }
  px(g, STONE.light, x, 0, 1, PH);
  px(g, STONE.line, x - 1, A.wall, 1, PH - A.wall);
  // The front wall: the same stone, laid along the bottom edge
  const y = PH - FRONT_WALL;
  px(g, STONE.shade, 0, y, A.w, FRONT_WALL);
  for (let bx = 4, col = 0; bx < A.w; bx += 22, col++) {
    px(g, STONE.dark, bx + 1, y + 2, 20, FRONT_WALL - 2);
    veil(g, bx + 1, y + 2, 20, 1, 0.12, true);
    if (col % 3 === 1) veil(g, bx + 1, y + 2, 20, FRONT_WALL - 2, 0.1);
  }
  px(g, STONE.light, 0, y + 1, A.w, 1);
  px(g, STONE.line, 0, y, A.w, 1);
  // Its end by the open side: the top of a pier, like the one at the back
  px(g, STONE.line, 0, y - 5, 30, FRONT_WALL + 5);
  px(g, STONE.mid, 1, y - 4, 28, FRONT_WALL + 3);
  px(g, STONE.light, 1, y - 4, 28, 1);
  px(g, STONE.light, 1, y - 4, 1, FRONT_WALL + 3);
  px(g, STONE.dark, 15, y - 3, 1, FRONT_WALL + 2);
}

// ------------------------------------------------------------ what stands up and burns (every frame)

/** World position of a point of the hall's art, lifted by how high it stands on the dais (sprite pixels) */
const at = (x: number, y: number, up = 0) => ({ x: HALL.x0 + x * S, y: (y - up) * S });

/** A flame, three shapes taking turns: `.` nothing, r red, o orange, y yellow, w white hot */
const FLAMES = [
  ['...y...', '..yy...', '..yoy..', '.yooy..', '.yowoy.', 'yoowoy.', 'yowwooy', 'rowwwor', '.rooor.'],
  ['....y..', '...yy..', '..yoy..', '..yooy.', '.yowoy.', '.yowooy', 'yoowwoy', 'rowwwor', '.rooor.'],
  ['..y....', '..yy...', '.yoy.y.', '.yooyy.', 'yowooy.', 'yowwoy.', 'yowwooy', 'roowwor', '.rooor.'],
];
const FLAME_COLORS: Record<string, string> = { r: '#c8353a', o: '#e9853a', y: GOLD.light, w: '#fff6c8' };

/** A fire with its bottom middle at (x, y), `scale` world units a flame pixel */
function flame(g: G, x: number, y: number, now: number, seed: number, scale = S): void {
  const rows = FLAMES[Math.floor(now / 130 + seed * 1.7) % FLAMES.length];
  const w = rows[0].length;
  rows.forEach((row, j) => {
    for (let i = 0; i < w; i++) {
      const color = FLAME_COLORS[row[i]];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(Math.round(x + (i - w / 2) * scale), Math.round(y + (j - rows.length) * scale), Math.ceil(scale), Math.ceil(scale));
    }
  });
}

/** The warm light of a fire: a glow that breathes */
function glow(g: G, x: number, y: number, radius: number, strength: number, now: number, seed: number): void {
  const a = strength * (0.85 + 0.15 * Math.sin(now / 170 + seed * 2.3) * Math.sin(now / 97 + seed));
  const light = g.createRadialGradient(x, y, 0, x, y, radius);
  light.addColorStop(0, `rgba(255,196,110,${a})`);
  light.addColorStop(0.45, `rgba(255,150,70,${a * 0.4})`);
  light.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = light;
  g.beginPath();
  g.arc(x, y, radius, 0, Math.PI * 2);
  g.fill();
}

/** Where the torches on the back wall's pillars burn (sprite pixels: the flame's foot) */
const TORCHES: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  for (let cx = 46; cx < A.east - 12; cx += 68) out.push({ x: cx, y: 74 });
  return out;
})();

/** The braziers on the lowest step of the dais, on both sides of the stairs (sprite pixels: where they stand) */
const BRAZIERS: { x: number; y: number }[] = [
  { x: A.dais[0].x + 9, y: A.dais[0].y0 + 16 },
  { x: A.dais[0].x + 9, y: A.dais[0].y1 - 8 },
];

/** A pen for small things drawn in sprite pixels around a point of the world: (dx, dy, w, h, color) fills a block */
const pen = (g: G, x: number, y: number) => (dx: number, dy: number, w: number, h: number, color: string) => {
  g.fillStyle = color;
  g.fillRect(Math.round(x + dx * S), Math.round(y + dy * S), Math.ceil(w * S), Math.ceil(h * S));
};

/** A torch holder on a pillar, in iron (the fire is drawn over it every frame) */
function sconce(g: G, x: number, y: number): void {
  const u = pen(g, x, y);
  u(-4, 0, 8, 2, IRON.line);
  u(-3, 0, 6, 1, IRON.light);
  u(-2, 2, 4, 3, IRON.mid);
  u(-1, 5, 2, 5, IRON.line);
  u(-1, 5, 1, 4, IRON.light);
}

/** A brazier: an iron bowl of embers on three legs, as tall as a character's chest */
function brazier(g: G, x: number, y: number, now: number, seed: number): void {
  const u = pen(g, x, y);
  // Legs, a ring between them, the bowl with a lit rim
  u(-7, -22, 2, 22, IRON.line);
  u(5, -22, 2, 22, IRON.line);
  u(-1, -20, 2, 19, IRON.dark);
  u(-6, -21, 1, 20, IRON.light);
  u(-7, -9, 14, 2, IRON.line);
  u(-6, -9, 12, 1, IRON.light);
  u(-9, -29, 18, 8, IRON.line);
  u(-8, -28, 16, 5, IRON.mid);
  u(-8, -28, 5, 4, IRON.light);
  u(-10, -31, 20, 3, IRON.line);
  u(-9, -30, 18, 1, IRON.shine);
  // Embers, and the fire over them
  u(-7, -32, 14, 2, '#c8353a');
  u(-5, -33, 10, 1, '#e9853a');
  flame(g, x - 5 * S, y - 31 * S, now, seed, S * 1.25);
  flame(g, x + 5 * S, y - 31 * S, now, seed + 1.3, S * 1.25);
  flame(g, x, y - 32 * S, now, seed + 0.6, S * 1.7);
}

/** The throne's footstool, its bottom middle at (x, y): dark wood like the throne, a cushion in the royal red */
function footstool(g: G, x: number, y: number): void {
  const u = pen(g, x, y);
  u(-7, -8, 2, 8, WOOD.line);
  u(5, -8, 2, 8, WOOD.line);
  u(-6, -7, 1, 6, WOOD.dark);
  u(-8, -11, 16, 4, WOOD.line);
  u(-7, -10, 14, 2, WOOD.mid);
  u(-7, -10, 14, 1, WOOD.light);
  u(-7, -16, 14, 5, RED.line);
  u(-6, -15, 12, 4, RED.mid);
  u(-6, -15, 12, 1, RED.shine);
  u(-6, -12, 12, 1, RED.dark);
  u(-6, -11, 1, 1, GOLD.light);
  u(5, -11, 1, 1, GOLD.light);
}

/**
 * A banner on a standing pole, its foot at (x, y): the royal red with a golden border and a crown,
 * hanging from a crossbar. A row of them stands behind the throne.
 */
function standard(g: G, x: number, y: number, tall: number): void {
  const u = pen(g, x, y);
  // The foot and the pole, a knob on top
  u(-4, -3, 8, 3, GOLD.line);
  u(-3, -3, 6, 1, GOLD.light);
  u(-1, -tall, 2, tall - 2, GOLD.line);
  u(-1, -tall, 1, tall - 2, GOLD.light);
  u(-2, -tall - 5, 4, 5, GOLD.line);
  u(-1, -tall - 4, 2, 3, GOLD.shine);
  // The crossbar
  const top = -tall + 4;
  u(-12, top, 24, 3, GOLD.line);
  u(-11, top, 22, 1, GOLD.light);
  // The cloth: red, lit down the left, two tails at the bottom
  const w = 20;
  const h = 46;
  const tail = 8;
  const y0 = top + 3;
  for (let j = 0; j < h; j++) {
    const cut = j > h - tail ? Math.round(((j - (h - tail)) / tail) * (w / 2 - 2)) : 0;
    for (const [dx, dw] of cut ? [[-w / 2, w / 2 - cut], [cut, w / 2 - cut]] : [[-w / 2, w]]) {
      if (dw <= 0) continue;
      u(dx, y0 + j, dw, 1, RED.mid);
    }
    u(-w / 2, y0 + j, 1, 1, RED.line);
    u(w / 2 - 1, y0 + j, 1, 1, RED.line);
    u(-w / 2 + 1, y0 + j, 2, 1, GOLD.light);
    u(w / 2 - 3, y0 + j, 2, 1, GOLD.dark);
    if (!cut) {
      u(-w / 2 + 4, y0 + j, 2, 1, RED.light);
      u(w / 2 - 6, y0 + j, 2, 1, RED.dark);
    } else {
      u(-cut - 1, y0 + j, 1, 1, GOLD.dark);
      u(cut, y0 + j, 1, 1, GOLD.light);
    }
  }
  u(-w / 2 + 1, y0 + 2, w - 2, 1, GOLD.light);
  u(-w / 2 + 3, y0 + h - tail - 3, w - 6, 1, GOLD.dark);
  // A small crown: three points on a band
  const tops = [2, 0, 2, 3, 1, 3, 2, 0, 2];
  tops.forEach((t, c) => {
    u(c - 5, y0 + 12 + t, 1, 6 - t, c > 5 ? GOLD.dark : GOLD.light);
    u(c - 5, y0 + 12 + t, 1, 1, GOLD.shine);
  });
  u(-5, y0 + 18, 9, 1, GOLD.line);
}

/**
 * The fires on the back wall (the torches on its pillars). They burn behind everyone, so they are
 * drawn right after the ground.
 */
export function drawHallWall(g: G, now: number): void {
  TORCHES.forEach((t, k) => {
    const p = at(t.x, t.y);
    sconce(g, p.x, p.y);
    flame(g, p.x, p.y + 1, now, k);
  });
}

/** What stands up in the hall, drawn in depth order with the characters: the throne (in two parts, around whoever sits on it: see throne-front.png) and the braziers */
export function hallProps(art: HallArt): Prop[] {
  const up = A.dais.length * A.rise;
  const w = art.throne.width;
  const h = art.throne.height;
  const feet = at(A.throne.x, A.throne.y, up);
  const left = Math.round(feet.x - (w * S) / 2);
  const top = Math.round(feet.y - h * S);
  const out: Prop[] = [
    {
      // Just behind the King: the whole throne and the footstool before it, and their shadow on the dais
      y: THRONE_SEAT.y - 2,
      ground(g) {
        g.fillStyle = 'rgba(0,0,0,0.26)';
        g.beginPath();
        g.ellipse(feet.x + 2, feet.y - 2, 30, 7, 0, 0, Math.PI * 2);
        g.fill();
      },
      draw(g) {
        g.drawImage(art.throne, 0, 0, w, h, left, top, Math.round(w * S), Math.round(h * S));
        footstool(g, feet.x - 21 * S, feet.y);
      },
    },
    {
      // Just in front of the King: the hand-drawn front part of the throne
      y: THRONE_SEAT.y + 2,
      draw: (g) => g.drawImage(art.throneFront, 0, 0, w, h, left, top, Math.round(w * S), Math.round(h * S)),
    },
  ];
  // Behind the throne, along the back edge of the top step: a row of banners on poles, the middle one the tallest
  const back = A.dais[A.dais.length - 1];
  [back.x + 26, back.x + 58, back.x + 90].forEach((x, k) => {
    const p = at(x, back.y0 + 10, up);
    out.push({
      y: (back.y0 + 10) * S,
      ground(g) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.beginPath();
        g.ellipse(p.x + 3, p.y, 9, 3, 0, 0, Math.PI * 2);
        g.fill();
      },
      draw: (g) => standard(g, p.x, p.y, k === 1 ? 96 : 84),
    });
  });
  BRAZIERS.forEach((b, k) => {
    const p = at(b.x, b.y, A.rise);
    out.push({
      y: b.y * S,
      ground(g) {
        g.fillStyle = 'rgba(0,0,0,0.26)';
        g.beginPath();
        g.ellipse(p.x + 2, p.y, 13, 4, 0, 0, Math.PI * 2);
        g.fill();
      },
      draw: (g, now) => brazier(g, p.x, p.y, now, k * 2.1 + 5),
    });
  });
  return out;
}

/**
 * The hall's light, over everything in it: daylight falling in through the windows (fading with the
 * evening), the glow of every fire (stronger in the dark), and once the King has opened the court
 * (`seated`: how long ago, in ms; null: not yet) a golden light around the throne, with sparks rising.
 */
export function drawHallLight(g: G, now: number, dark: number, seated: number | null): void {
  g.save();
  g.globalCompositeOperation = 'lighter';
  if (seated !== null) {
    const fade = Math.min(1, seated / 1800);
    const c = at(A.throne.x - 4, A.throne.y - 40, A.dais.length * A.rise);
    const halo = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, 150);
    halo.addColorStop(0, `rgba(255,214,120,${0.26 * fade})`);
    halo.addColorStop(0.5, `rgba(255,190,90,${0.1 * fade})`);
    halo.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(c.x, c.y, 150, 0, Math.PI * 2);
    g.fill();
    // Sparks: each rises along its own line, twinkling in and out
    for (let i = 0; i < 16; i++) {
      const period = 2400 + ((i * 311) % 1100);
      const t = ((now + i * 457) % period) / period;
      const x = Math.round(c.x + (((i * 73) % 100) / 100 - 0.5) * 170 + Math.sin(t * 6.3 + i) * 5);
      const y = Math.round(c.y + 70 - t * 150);
      const s = 2 + (i % 2);
      g.fillStyle = `rgba(255,240,190,${Math.sin(Math.PI * t) * 0.85 * fade})`;
      g.fillRect(x - s, y, s * 2 + 1, 1);
      g.fillRect(x, y - s, 1, s * 2 + 1);
    }
  }
  // The windows are the ones between the pillars that are not banners
  const day = 1 - dark;
  if (day > 0.05) {
    for (let k = 1, cx = 46 + 68 * 1.5; cx < A.east - 18; k += 2, cx += 136) {
      const a = at(cx - 15, 88);
      const b = at(cx + 15, 88);
      const reach = 250;
      const slant = 96;
      const shaft = g.createLinearGradient(0, a.y, 0, a.y + reach);
      shaft.addColorStop(0, `rgba(255,236,180,${0.17 * day})`);
      shaft.addColorStop(1, 'rgba(255,236,180,0)');
      g.fillStyle = shaft;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(b.x - slant + 26, b.y + reach);
      g.lineTo(a.x - slant - 26, a.y + reach);
      g.closePath();
      g.fill();
    }
  }
  const fire = 0.5 + 0.5 * dark;
  TORCHES.forEach((t, k) => {
    const p = at(t.x, t.y - 5);
    glow(g, p.x, p.y, 60, 0.3 * fire, now, k);
  });
  BRAZIERS.forEach((b, k) => {
    const p = at(b.x, b.y - 36, A.rise);
    glow(g, p.x, p.y, 120, 0.34 * fire, now, k * 2.1 + 5);
  });
  g.restore();
}

// ------------------------------------------------------------ the characters of the ceremony

/** The row of a sheet by name, if the sheet's picture has it (a sheet drawn before a row existed is shorter) */
function rowOf(img: HTMLImageElement, info: SheetInfo, key: string, frames: number): { row: number; frames: number } | null {
  const row = info.rows[key];
  return row && row.frames >= frames && img.naturalHeight >= (row.row + 1) * (info.frame || FRAME_PX) ? row : null;
}

function drawFrame(g: G, img: HTMLImageElement, info: SheetInfo, row: number, frame: number, x: number, y: number): void {
  const p = info.frame || FRAME_PX;
  const size = FRAME_PX * S;
  g.drawImage(img, frame * p, row * p, p, p, Math.round(x - BODY.centerX * S), Math.round(y - BODY.feetY * S), size, size);
}

/** How long a bow before the throne takes from one to the next, and how far the body leans (radians) */
const BOW_MS = 6400;
const BOW_LEAN = 0.42;

/**
 * Kneeling toward the throne: seated on the heels, facing right (the LPC sit sheet), and bowing low
 * now and then. The bows run through the crowd as a wave, from the throne back. A sheet made before
 * that row existed kneels facing us instead. False: nothing to draw it with.
 */
export function drawKneeling(g: G, img: HTMLImageElement, info: SheetInfo, x: number, y: number, since: number, now: number): boolean {
  const side = rowOf(img, info, 'sitRight', 2);
  if (!side) {
    const row = rowOf(img, info, 'sit', 2);
    if (!row) return false;
    // Kneeling up (0) for a while, bowing down (1) for longer
    drawFrame(g, img, info, row.row, since < 400 || (now + x * 7) % 3000 < 1100 ? 0 : 1, x, y);
    return true;
  }
  // Upright, down in 0.7 s, held low, up again: how deep the bow is now (0..1)
  const t = (((now + x * 5) % BOW_MS) + BOW_MS) % BOW_MS;
  const ease = (v: number) => v * v * (3 - 2 * v);
  const bow = since < 900 ? 0 : t < 3200 ? 0 : t < 3900 ? ease((t - 3200) / 700) : t < 5500 ? 1 : t < 6200 ? 1 - ease((t - 5500) / 700) : 0;
  if (!bow) {
    drawFrame(g, img, info, side.row, 1, x, y);
    return true;
  }
  // The whole body leans forward around the knees
  const px = x + 9 * S;
  const py = y - 3 * S;
  g.save();
  g.translate(px, py);
  g.rotate(bow * BOW_LEAN);
  drawFrame(g, img, info, side.row, 1, x - px, y - py);
  g.restore();
  return true;
}

/** How far below the seat point the seated King is drawn (sprite pixels), so he sinks into the cushion */
const SEAT_DROP = 10;

/** Seated on the throne, seen from the side: the chair frame of the LPC sit sheet, facing left. False: the sheet has no such row */
export function drawEnthroned(g: G, img: HTMLImageElement, info: SheetInfo, x: number, y: number): boolean {
  const row = rowOf(img, info, 'sitLeft', 3);
  if (!row) return false;
  drawFrame(g, img, info, row.row, 2, x, y + SEAT_DROP * S);
  return true;
}

/**
 * The King before the throne, both hands up to open the court: the arms-up frame of the LPC emote
 * sheet, facing left. The hands go up, come halfway down once, and up again. False: the sheet has
 * no such row.
 */
export function drawHailing(g: G, img: HTMLImageElement, info: SheetInfo, x: number, y: number, since: number): boolean {
  const row = rowOf(img, info, 'emoteLeft', 3);
  if (!row) return false;
  drawFrame(g, img, info, row.row, since < 220 || (since > 1200 && since < 1450) ? 1 : 2, x, y);
  return true;
}

/** A small crown, its bottom middle at (x, y) */
export function crownMark(g: G, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x - s, y);
  g.lineTo(x - s, y - s * 1.1);
  g.lineTo(x - s * 0.5, y - s * 0.5);
  g.lineTo(x, y - s * 1.35);
  g.lineTo(x + s * 0.5, y - s * 0.5);
  g.lineTo(x + s, y - s * 1.1);
  g.lineTo(x + s, y);
  g.closePath();
  g.fill();
}
