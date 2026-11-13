import { BODY, FRAME_PX, SPRITE_SCALE, SQUARE_HOUSES, WORLD, seeded } from '$shared/crowd.ts';
import { HALL, HALL_ART, RIVERSIDE, RIVERSIDE_ART, THRONE_SEAT, TOWN_BROOK, type SheetInfo } from '$shared/world.ts';
import type { Prop } from '../games/crowd/scene.ts';

/**
 * The throne room on the TV: a hall beyond a river off the right edge of the town, which the camera
 * moves over to for the King's ceremony. A stone bridge crosses the winding river to the castle's
 * open side, between its corner towers; a red carpet runs from there up the steps of a dais to the
 * throne, under banners, between pillars and burning braziers. The castle stands on the grass, with
 * battlements along its walls and bushes and flowers around it.
 *
 * The throne, the carpet's weave, the floor tiles, the potted trees, the bushes and the flowers are
 * LPC Revised art, the castle's towers and the outside of its walls LPC castle art (web/public/crowd/env,
 * see its CREDITS.txt), the reds recolored to one royal red and the castle's warm grey stone to the
 * hall's blue-grey. Everything else (the grass, the river, the inside of the walls, pillars, banners,
 * windows, the dais, the footstool, the braziers and their fire, the bridge and the path) is drawn
 * here by hand in the palettes of those sheets, lit from the top left, one sprite pixel at a time.
 *
 * The ground (the riverside, then the hall: RIVERSIDE_ART and HALL_ART, shared/world.ts) is built
 * once in sprite pixels and drawn SPRITE_SCALE world units a pixel, like the square; what stands up,
 * burns or flows is drawn every frame in world units.
 */

const S = SPRITE_SCALE;
const A = HALL_ART;
const R = RIVERSIDE_ART;
/** The ground's height in sprite pixels: the town's */
const PH = Math.ceil(WORLD.h / S);

// ------------------------------------------------------------ palettes (from the sheets)

/** The blue-grey stone of the walls and pillars, dark to light */
export const STONE = { line: '#1b192b', deep: '#29253a', shade: '#343043', dark: '#4b4b60', mid: '#6a7587', light: '#818e97', pale: '#a8b3b8', white: '#c7cfcc' };
/** The warm stone of the dais and the trims */
export const SAND = { line: '#484152', dark: '#6f6464', mid: '#958080', light: '#c4b59f', pale: '#e3e7d3', white: '#ebede9' };
/** The royal red of the carpet, the banners and the throne's cushions */
const RED = { line: '#3e111a', deep: '#5c1220', dark: '#7e1622', mid: '#9e1f29', light: '#bd3130', shine: '#d95a45' };
export const GOLD = { line: '#794117', dark: '#d19428', mid: '#e09c4c', light: '#f3c35f', shine: '#fdd082' };
const IRON = { line: '#0f1218', dark: '#1b192b', mid: '#29253a', light: '#4b4b60', shine: '#6a7587' };
/** The dark wood of the throne */
const WOOD = { line: '#1a1213', dark: '#3e111a', mid: '#603429', light: '#7f4c31' };
/** The grass sheet's green, a lighter and a darker one for its patches, its blades, and the dark of its edges */
export const GREEN = { base: '#468232', light: '#4f8c37', shade: '#3e7631', blade: '#75a743', dark: '#1c4525', line: '#19332d' };
/** The pond sheet's water: its blue, the darker lumps and deep edges, the shallows, ripples and foam; the dark under the bridge's arch */
export const WATER = { base: '#2a8598', lump: '#217087', deep: '#18506f', shallow: '#3c9aa6', light: '#6cc0cc', foam: '#c9ecef' };
const ARCH = '#16323a';
/** The earth of the pond sheet's banks, where the river cuts into them */
export const EARTH = { top: '#6b3c2e', mid: '#603429', line: '#442725' };

/** The carpet sheet's purple rug and the throne sheet's red cushions, in the royal red */
const CARPET_SWAP: Record<string, string> = { '#1b192b': RED.line, '#382b33': RED.deep, '#4c3b64': RED.dark, '#655789': RED.mid, '#7c6ea6': RED.light };
const CUSHION_SWAP: Record<string, string> = { '#6a1d16': RED.dark, '#7b2008': RED.mid, '#95381c': RED.light, '#b54936': RED.shine };
/** The castle sheet's warm grey stone in the hall's blue-grey, dark to light (the bluish corner stones a little bluer) */
const CASTLE_SWAP: Record<string, string> = {
  '#31313e': STONE.line,
  '#4b444c': STONE.deep,
  '#454c44': STONE.deep,
  '#4a5057': STONE.shade,
  '#5e5252': STONE.dark,
  '#525e5e': STONE.dark,
  '#68767e': '#5c6a80',
  '#7e7068': STONE.mid,
  '#867e7f': '#76828f',
  '#7e8685': '#76828f',
  '#818b8b': STONE.light,
  '#969293': STONE.light,
  '#929695': STONE.light,
};

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
/** Round bushes (the summer row) and small flowering bushes, 32 px each */
const BUSHES = [
  [0, 32],
  [32, 32],
  [64, 32],
] as const;
const FLOWER_BUSHES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => [c * 32, 64] as const);

export interface HallArt {
  /** The hall's ground, in sprite pixels */
  ground: HTMLCanvasElement;
  /** The throne (in the royal red), in sprite pixels: the part behind whoever sits on it */
  throne: HTMLCanvasElement;
  /** The part of the throne drawn in front of whoever sits on it (same size and place as the cut) */
  throneFront: HTMLCanvasElement;
  /** The river and the bridge in the flow's frames (the strip RIVER_CUT, in sprite pixels), taking turns over the ground */
  river: HTMLCanvasElement[];
  /** Glints on the water */
  sparkle: HTMLImageElement;
}

/** The river's moving strip (sprite pixels from the town's edge): the band it winds in and the bridge's ends */
export const RIVER_CUT = { x: R.river.x0 - 6, w: R.river.x1 - R.river.x0 + 12 };
/** How many frames the river's flow takes, and how long each shows */
export const RIVER_FRAMES = 4;
export const RIVER_FRAME_MS = 210;

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
  const names = ['throne', 'carpet', 'pave-stone-diamond', 'planters', 'bush-round', 'flowers', 'castle', 'water-sparkle-anim'] as const;
  loading ??= Promise.all([...names.map(load), front()])
    .then(([throne, carpet, tiles, planters, bushes, flowers, castle, sparkle, near]) => {
      const [tx, ty, tw, th] = THRONE_CUT;
      const back = recolored(throne, tx, ty, tw, th, CUSHION_SWAP);
      const g = back.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(near, 0, 0);
      const sheets: Sheets = { carpet, tiles, planters, bushes, flowers, castle };
      const ground = buildGround(sheets);
      // The river's strip in each frame of the flow: cut from the ground, and from the riverside built again for the others
      const others = Array.from({ length: RIVER_FRAMES - 1 }, (_, k) => {
        const [c, cg] = canvas(R.w, PH);
        riverside(cg, sheets, k + 1);
        return c;
      });
      const river = [ground, ...others].map((from) => {
        const [strip, sg] = canvas(RIVER_CUT.w, PH);
        sg.drawImage(from, -RIVER_CUT.x, 0);
        return strip;
      });
      return { ground, throne: back, throneFront: recolored(near, 0, 0, tw, th, CUSHION_SWAP), river, sparkle };
    })
    .catch(() => null);
  return loading;
}

// ------------------------------------------------------------ drawing helpers

export type G = CanvasRenderingContext2D;

export function canvas(w: number, h: number): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function px(g: G, color: string, x: number, y: number, w = 1, h = 1): void {
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
export function veil(g: G, x: number, y: number, w: number, h: number, alpha: number, light = false): void {
  px(g, light ? `rgba(255,244,214,${alpha})` : `rgba(14,10,24,${alpha})`, x, y, w, h);
}

// ------------------------------------------------------------ the ground (built once)

interface Sheets {
  carpet: HTMLImageElement;
  tiles: HTMLImageElement;
  planters: HTMLImageElement;
  bushes: HTMLImageElement;
  flowers: HTMLImageElement;
  castle: HTMLImageElement;
}

/**
 * Everything lying flat, from the town's edge: the riverside, then the hall on the grass beyond it
 * (the floor, the dais, the carpet, the walls with their banners, windows and pillars, and two
 * small trees in porcelain pots below the dais, where nobody walks), and the garden around it
 */
function buildGround(sheets: Sheets): HTMLCanvasElement {
  const [c, g] = canvas(R.w + A.w, PH);
  riverside(g, sheets, 0);
  g.save();
  g.translate(R.w, 0);
  grass(g, 0, A.w, R.w, 77);
  floor(g, sheets.tiles);
  dais(g);
  carpet(g, sheets.carpet);
  g.save();
  g.translate(0, A.top);
  backWall(g);
  g.restore();
  const { castle } = sheets;
  const stone = recolored(castle, 0, 0, castle.width, castle.height, CASTLE_SWAP);
  outerWalls(g, stone);
  towers(g, stone);
  garden(g, sheets);
  const [sx, sy, sw, sh] = TOPIARY;
  for (const [x, y] of [
    [A.dais[0].x + 34, A.dais[0].y1 + 62],
    // Partly behind the tower at the front right corner
    [TOWERS[3].x - 8, A.dais[0].y1 + 62],
  ]) {
    g.fillStyle = 'rgba(14,10,24,0.26)';
    g.beginPath();
    g.ellipse(x + 3, y - 3, 13, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(sheets.planters, sx, sy, sw, sh, x - sw / 2, y - sh, sw, sh);
  }
  g.restore();
  return c;
}

/** A smooth noise over the ground, about -1 to 1, in patches a few dozen pixels across */
export function noise(x: number, y: number): number {
  return (Math.sin(x * 0.047 + y * 0.029) + Math.sin(x * 0.019 - y * 0.053 + 1.7) + 0.6 * Math.sin(x * 0.091 + y * 0.071 + 4.1)) / 2.6;
}

/** A fixed pseudo-random number from 0 to 1 for a pixel (dithering, pebbles) */
export function hash(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Grass from `x0` to `x1`, the whole height: the sheet's green in lighter and darker patches with
 * dithered edges, blades, tufts and small flowers in clusters. `ox` is how far x0 lies from the
 * riverside's left edge, so the patches run on across the riverside and the hall.
 */
export function grass(g: G, x0: number, x1: number, ox: number, seed: number): void {
  px(g, GREEN.base, x0, 0, x1 - x0, PH);
  for (let y = 0; y < PH; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const v = noise(x + ox, y) + (hash(x + ox, y) - 0.5) * 0.3;
      if (v > 0.4) px(g, GREEN.light, x, y, 2, 2);
      else if (v < -0.4) px(g, GREEN.shade, x, y, 2, 2);
    }
  }
  const r = seeded(seed);
  const w = x1 - x0;
  const area = w * PH;
  // Blades: little slanted strokes, thicker in the lighter patches
  for (let i = 0; i < area / 60; i++) {
    const x = x0 + 1 + Math.floor(r() * (w - 2));
    const y = 1 + Math.floor(r() * (PH - 1));
    if (r() > 0.5 + noise(x + ox, y) * 0.4) continue;
    const lean = r() < 0.5 ? 1 : -1;
    px(g, GREEN.blade, x, y);
    px(g, GREEN.blade, x + lean, y - 1);
  }
  // Tufts: spiky clumps, dark with light tips
  for (let i = 0; i < area / 1500; i++) {
    const tw = 5 + Math.floor(r() * 3);
    const x = x0 + Math.floor(r() * (w - tw));
    const y = 4 + Math.floor(r() * (PH - 4));
    for (let k = 0; k < tw; k++) {
      const h = 1 + Math.floor(r() * 3) + (k === tw >> 1 ? 1 : 0);
      px(g, GREEN.dark, x + k, y - h, 1, h);
      px(g, GREEN.blade, x + k, y - h);
    }
    px(g, GREEN.shade, x, y, tw, 1);
  }
  // Small flowers, a few together: a dot of gold in four petals
  const petals = [SAND.white, '#e7a0bf', '#a9c6ef', GOLD.light];
  for (let i = 0; i < area / 7000; i++) {
    const cx = x0 + 6 + r() * (w - 12);
    const cy = 6 + r() * (PH - 12);
    const color = petals[Math.floor(r() * petals.length)];
    for (let k = 3 + Math.floor(r() * 4); k > 0; k--) {
      const x = Math.round(cx + (r() - 0.5) * 16);
      const y = Math.round(cy + (r() - 0.5) * 9);
      if (x < x0 + 1 || x > x1 - 2) continue;
      px(g, GREEN.dark, x, y + 2);
      px(g, color, x - 1, y, 3, 1);
      px(g, color, x, y - 1, 1, 3);
      px(g, color === GOLD.light ? SAND.white : GOLD.light, x, y);
    }
  }
}

/** The middle of the river's band (sprite pixels of the riverside) */
const RIVER_MID = (R.river.x0 + R.river.x1) / 2;

/**
 * The river at a row of the riverside: its middle and half width, winding in two bends down the
 * screen, and how far it has swung to one side (-1 west to 1 east: the outer bank is on that side)
 */
function riverAt(y: number): { c: number; hw: number; bend: number } {
  const c = RIVER_MID + 24 * Math.sin(y / 74 + 0.5) + 8 * Math.sin(y / 31 + 2.2);
  const hw = 21 + 4 * Math.sin(y / 57 + 1.1) + 1.5 * Math.sin(y / 13);
  return { c, hw, bend: Math.max(-1, Math.min(1, (c - RIVER_MID) / 26)) };
}

/** The river's banks at a row, a pixel or so off the smooth line so they do not look drawn with a ruler */
function banksAt(y: number): { l: number; r: number; bend: number } {
  const { c, hw, bend } = riverAt(y);
  const jit = (s: number) => Math.round(Math.sin(y * 0.9 + s) * 0.6 + Math.sin(y * 0.37 + s * 2) * 0.7);
  return { l: Math.round(c - hw + jit(0)), r: Math.round(c + hw + jit(9)), bend };
}

/** Where the bridge reaches from and to: over the water at its rows, onto the banks */
function bridgeSpan(): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = R.bridge.y0 - 14; y <= R.bridge.y1 + 24; y++) {
    const { c, hw } = riverAt(y);
    lo = Math.min(lo, c - hw);
    hi = Math.max(hi, c + hw);
  }
  return [Math.floor(lo) - 8, Math.ceil(hi) + 8];
}

/**
 * The riverside (sprite pixels from the town's edge), in one frame of the river's flow: the grass,
 * the river winding down it, the path to the castle and the bridge carrying it over the water
 */
function riverside(g: G, sheets: Sheets, frame: number): void {
  grass(g, 0, R.w, 0, 61);
  // Where the square's paving ends: a dark edge, the grass growing over it
  px(g, GREEN.line, 0, 0, 1, PH);
  river(g, frame);
  // The town's river comes in from the left along the bottom and flows into it
  brook(g, Math.round(TOWN_PW), frame, 0);
  const [x0, x1] = bridgeSpan();
  path(g, 0, x0 + 4);
  path(g, x1 - 4, R.w);
  bridge(g);
  // A few flowering bushes in the grass, on whichever side of the river has room
  const r = seeded(19);
  for (const y of [74, 196, 286, 560, 626]) {
    const { l, r: rr } = banksAt(y);
    const x = l > R.w - rr ? Math.round((l + TOWN_EDGE.grass) / 2) : Math.round((rr + R.w) / 2);
    if (x < TOWN_EDGE.grass + 12 || R.w - x < 12 || (x > l - 14 && x < rr + 14)) continue;
    const [fx, fy] = FLOWER_BUSHES[Math.floor(r() * FLOWER_BUSHES.length)];
    g.drawImage(sheets.flowers, fx, fy, 32, 32, x - 12, y - 24, 24, 24);
  }
}

/** Fill a row of the water from x to x + w, kept inside the banks at that row (rocks, lumps and ripples stay in the river) */
function inWater(g: G, color: string, x: number, y: number, w = 1): void {
  if (y < 0 || y >= PH) return;
  const { l, r } = banksAt(y);
  const a = Math.max(Math.round(x), l + 2);
  const b = Math.min(Math.round(x + w), r - 1);
  if (b > a) px(g, color, a, y, b - a, 1);
}

/** Lumps on the river's bed and its ripples, placed along the river (`u`: across it, -1 to 1) */
const LUMPS = (() => {
  const r = seeded(88);
  return Array.from({ length: Math.round(PH / 5) }, () => ({ y: Math.floor(r() * PH), u: r() * 1.7 - 0.85, w: 3 + Math.floor(r() * 6), h: r() < 0.5 ? 2 : 3 }));
})();
const RIPPLES = (() => {
  const r = seeded(91);
  return Array.from({ length: 46 }, () => ({ y: Math.floor(r() * PH), u: r() * 1.4 - 0.7, w: 3 + Math.floor(r() * 3), phase: Math.floor(r() * RIVER_FRAMES) }));
})();
/** Rocks in the water (`u` across it) and lily pads by the calm inner banks */
const ROCKS = [
  { y: 132, u: 0.42, w: 7 },
  { y: 238, u: -0.5, w: 5 },
  { y: 548, u: 0.35, w: 8 },
  { y: 640, u: -0.3, w: 6 },
];

/**
 * The river: earth where it cuts into the outer bank of a bend, a strip of sand and pebbles on the
 * inner one, shallows along the edges and the bank's shadow on the water (light from the left),
 * lumps on its bed, ripples running downstream (`frame` of the flow), rocks with foam around them,
 * lily pads and reeds in the calm water of the inner banks
 */
function river(g: G, frame: number): void {
  for (let y = 0; y < PH; y++) {
    const { l, r, bend } = banksAt(y);
    const east = Math.round(Math.max(0, bend) * 4);
    const west = Math.round(Math.max(0, -bend) * 4);
    // The banks: earth on the outer side, sand on the inner side
    const bank = (x: number, w: number, outward: number, cut: number, sand: number) => {
      if (cut) {
        px(g, EARTH.mid, outward < 0 ? x - cut : x, y, cut, 1);
        px(g, EARTH.top, outward < 0 ? x - cut : x + cut - 1, y);
        px(g, EARTH.line, outward < 0 ? x - 1 : x, y);
      } else if (sand) {
        for (let k = 0; k < sand; k++) {
          const sx = outward < 0 ? x - 1 - k : x + k;
          const h = hash(sx, y);
          px(g, h < 0.12 ? STONE.light : h < 0.3 ? SAND.mid : SAND.light, sx, y);
        }
      }
      const edge = outward < 0 ? x - Math.max(cut, sand) - 1 : x + Math.max(cut, sand) + w - 1;
      px(g, GREEN.line, edge, y);
    };
    bank(l, 0, -1, west, Math.round(Math.max(0, bend) * 5));
    bank(r, 1, 1, east, Math.round(Math.max(0, -bend) * 5));
    // The water: the bank's shadow down its west edge, shallows on the inner side of a bend
    px(g, WATER.base, l, y, r - l, 1);
    px(g, WATER.deep, l, y, 1, 1);
    px(g, WATER.lump, l + 1, y, 2, 1);
    px(g, WATER.deep, r - 1, y);
    const shallow = Math.round(Math.abs(bend) * 3);
    if (shallow) px(g, WATER.shallow, bend > 0 ? l + 3 : r - 1 - shallow, y, shallow, 1);
  }
  // Grass hanging over the banks: spikes every few rows, dark tipped
  for (let y = 1; y < PH; y += 2) {
    const { l, r, bend } = banksAt(y);
    const h = hash(y, 5);
    if (h < 0.55) continue;
    const len = 1 + Math.floor(hash(y, 7) * 3);
    const west = l - Math.round(Math.max(0, -bend) * 4) - Math.round(Math.max(0, bend) * 5);
    const east = r + Math.round(Math.max(0, bend) * 4) + Math.round(Math.max(0, -bend) * 5);
    if (h < 0.78) {
      px(g, GREEN.base, west - 1, y, len, 1);
      px(g, GREEN.line, west - 1 + len, y);
    } else {
      px(g, GREEN.base, east - len + 1, y, len, 1);
      px(g, GREEN.line, east - len, y);
    }
  }
  // The bed: darker lumps, shifting a little from frame to frame
  for (const [i, b] of LUMPS.entries()) {
    const { c, hw } = riverAt(b.y);
    const x = Math.round(c + b.u * hw) + (frame % 2 && i % 3 === 0 ? 1 : 0);
    inWater(g, WATER.lump, x + 1, b.y, b.w - 2);
    inWater(g, WATER.lump, x, b.y + 1, b.w);
    if (b.h === 3) inWater(g, WATER.lump, x + 1, b.y + 2, b.w - 2);
  }
  // Ripples running downstream: each moves down over the frames, then starts again higher up
  for (const p of RIPPLES) {
    const age = (frame + p.phase) % RIVER_FRAMES;
    const y = p.y + age * 4;
    const { c, hw } = riverAt(y);
    const x = Math.round(c + p.u * hw);
    const color = age === 0 || age === RIVER_FRAMES - 1 ? WATER.shallow : WATER.light;
    inWater(g, color, x + 1, y, p.w - 2);
    inWater(g, color, x, y - 1);
    inWater(g, color, x + p.w - 1, y - 1);
  }
  // Rocks, the water breaking white upstream of them and trailing away downstream
  for (const k of ROCKS) {
    const { c, hw } = riverAt(k.y);
    const x = Math.round(c + k.u * hw - k.w / 2);
    const trail = 4 + (frame % 2) * 2;
    for (let j = 1; j <= trail; j++) {
      inWater(g, WATER.light, x - 1 - Math.floor(j / 2), k.y + 1 + j);
      inWater(g, WATER.light, x + k.w + Math.floor(j / 2), k.y + 1 + j);
    }
    inWater(g, WATER.foam, x, k.y - 4, k.w);
    inWater(g, WATER.light, x - 1, k.y - 3, k.w + 2);
    px(g, STONE.line, x, k.y - 3, k.w, 4);
    px(g, STONE.mid, x + 1, k.y - 3, k.w - 2, 3);
    px(g, STONE.pale, x + 1, k.y - 3, Math.max(1, k.w - 4), 1);
    px(g, STONE.dark, x + k.w - 2, k.y - 2, 1, 2);
  }
  // Lily pads in the calm water along the inner banks, one in flower
  const pads = seeded(57);
  let flowered = false;
  for (let y = 20; y < PH - 10; y += 28) {
    const { l, r, bend } = banksAt(y);
    if (Math.abs(bend) < 0.45 || (y > R.bridge.y0 - 30 && y < R.bridge.y1 + 40)) continue;
    for (let n = 0; n < 2; n++) {
      const py = y + Math.floor(pads() * 12);
      const pxx = bend > 0 ? l + 5 + Math.floor(pads() * 6) : r - 8 - Math.floor(pads() * 6);
      inWater(g, '#2d6a30', pxx, py + 1, 5);
      inWater(g, '#3f8a3a', pxx - 1, py, 7);
      inWater(g, '#3f8a3a', pxx, py - 1, 5);
      inWater(g, GREEN.blade, pxx + 1, py - 1, 2);
      inWater(g, WATER.base, pxx + 3, py, 1);
      if (!flowered && pads() < 0.4) {
        flowered = true;
        px(g, '#f2b6cc', pxx + 1, py - 2, 3, 2);
        px(g, SAND.white, pxx + 2, py - 3);
        px(g, GOLD.light, pxx + 2, py - 2);
      }
    }
  }
  // Reeds on the inner banks: stems, light tips, a few brown heads
  const reeds = seeded(63);
  for (const y of [96, 172, 268, 512, 600]) {
    const { l, r, bend } = banksAt(y);
    const x0 = bend > 0 ? l - 7 : r + 2;
    for (let k = 0; k < 6; k++) {
      const x = x0 + k + Math.floor(reeds() * 2);
      const h = 5 + Math.floor(reeds() * 6);
      px(g, '#2f5a2a', x, y - h, 1, h);
      px(g, GREEN.blade, x, y - h);
      if (reeds() < 0.35) px(g, EARTH.top, x, y - h + 1, 1, 3);
    }
  }
}

// ------------------------------------------------------------ the town's river

/** The town's width in sprite pixels: the riverside starts there */
export const TOWN_PW = WORLD.w / S;

/**
 * The town's river laid out once (sprite pixels of the town, on over the riverside past TOWN_PW):
 * its middle every half pixel along a smooth curve through TOWN_BROOK's points, winding a little,
 * and for every pixel near it how far across the river it lies (`v`: negative toward the town,
 * the water from -hw to hw) and how far along (`s`)
 */
interface Brook {
  x0: number;
  y0: number;
  w: number;
  h: number;
  v: Float32Array;
  s: Float32Array;
  /** The middle and the way across (unit, toward the far bank) every half pixel along, and the half width there */
  cx: number[];
  cy: number[];
  nx: number[];
  ny: number[];
  hw: number[];
  length: number;
}
let brookLaid: Brook | null = null;
const STEP = 0.5;

function layBrook(): Brook {
  if (brookLaid) return brookLaid;
  const p = TOWN_BROOK.points;
  // A Catmull-Rom curve through the points, finely
  const fine: [number, number][] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const [a, b, c, d] = [p[Math.max(0, i - 1)], p[i], p[i + 1], p[Math.min(p.length - 1, i + 2)]];
    for (let k = 0; k < 60; k++) {
      const t = k / 60;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (j: 0 | 1) => 0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3);
      fine.push([at(0), at(1)]);
    }
  }
  fine.push(p[p.length - 1]);
  // Every half pixel along it: the middle (winding a little), the way across, the half width
  const cx: number[] = [];
  const cy: number[] = [];
  const nx: number[] = [];
  const ny: number[] = [];
  const hw: number[] = [];
  let along = 0;
  let next = 0;
  for (let i = 1; i < fine.length; i++) {
    const [ax, ay] = fine[i - 1];
    const [bx, by] = fine[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (!len) continue;
    const tx = (bx - ax) / len;
    const ty = (by - ay) / len;
    while (next <= along + len) {
      const k = (next - along) / len;
      const s = next;
      const wind = 1.2 * Math.sin(s / 23) + 0.6 * Math.sin(s / 9);
      cx.push(ax + (bx - ax) * k - ty * wind);
      cy.push(ay + (by - ay) * k + tx * wind);
      nx.push(-ty);
      ny.push(tx);
      hw.push(TOWN_BROOK.hw + 1.5 * Math.sin(s / 31 + 1));
      next += STEP;
    }
    along += len;
  }
  const reach = TOWN_BROOK.hw + 8;
  const x0 = Math.floor(Math.min(...cx) - reach);
  const y0 = Math.floor(Math.min(...cy) - reach);
  const w = Math.ceil(Math.max(...cx) + reach) - x0;
  const h = Math.ceil(Math.max(...cy) + reach) - y0;
  const v = new Float32Array(w * h).fill(999);
  const sAt = new Float32Array(w * h);
  // Stamp across the river at every step: each pixel keeps the nearest way across
  for (let i = 0; i < cx.length; i++) {
    for (let u = -(hw[i] + 5); u < hw[i] + 4; u += 0.5) {
      const x = Math.round(cx[i] + nx[i] * u) - x0;
      const y = Math.round(cy[i] + ny[i] * u) - y0;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = y * w + x;
      if (Math.abs(u) < Math.abs(v[k])) {
        v[k] = u;
        sAt[k] = i * STEP;
      }
    }
  }
  brookLaid = { x0, y0, w, h, v, s: sAt, cx, cy, nx, ny, hw, length: cx.length * STEP };
  return brookLaid;
}

/** Where the town's river is drawn (sprite pixels of the town): its box */
export function brookBox(): { x0: number; y0: number; x1: number; y1: number } {
  const b = layBrook();
  return { x0: b.x0, y0: b.y0, x1: b.x0 + b.w, y1: b.y0 + b.h };
}

/** A point of the town's river (sprite pixels of the town): `s` along it, `u` across it (-1 its town side, 1 its far side) */
export function brookPoint(s: number, u: number): { x: number; y: number } {
  const b = layBrook();
  const i = Math.max(0, Math.min(b.cx.length - 1, Math.round(s / STEP)));
  return { x: b.cx[i] + b.nx[i] * u * b.hw[i], y: b.cy[i] + b.ny[i] * u * b.hw[i] };
}

/** How long the town's river is (sprite pixels) */
export const brookLength = () => layBrook().length;

/** Along the town's river (`s` along it, `u` across it): lumps on its bed, ripples, rocks, lily pads by the far bank, reeds on it */
const BROOK_LUMPS = (() => {
  const r = seeded(83);
  return Array.from({ length: 70 }, () => ({ s: r() * 400, u: r() * 1.5 - 0.75, w: 3 + Math.floor(r() * 5), h: r() < 0.5 ? 2 : 3 }));
})();
const BROOK_RIPPLES = (() => {
  const r = seeded(97);
  return Array.from({ length: 34 }, () => ({ s: r() * 400, u: r() * 1.3 - 0.65, w: 3 + Math.floor(r() * 3), phase: Math.floor(r() * RIVER_FRAMES) }));
})();
const BROOK_ROCKS = [
  { s: 70, u: -0.35, w: 6 },
  { s: 190, u: 0.4, w: 5 },
];
const BROOK_PADS = [40, 46, 150, 250, 258];
const BROOK_REEDS = [20, 110, 205];

/**
 * The town's river, in one frame of its flow, into `g` whose column 0 is the town's column `ox`
 * (sprite pixels; rows are the town's): earth where it cuts into the town's bank, a strip of sand
 * and pebbles on the far bank, the near bank's shadow on the water and shallows along the far
 * side, lumps on its bed, ripples running downstream, rocks with foam, lily pads and reeds by the
 * far bank. `river`: g's column where the riverside begins, when the river by the castle is drawn
 * there: the water runs into it and the banks end at its bank.
 */
export function brook(g: G, ox: number, frame: number, river = Infinity): void {
  const b = layBrook();
  const width = g.canvas.width;
  // Where the river by the castle starts at a row (g's columns): its water, and its west bank's outer edge
  const waterEnd = (y: number) => (river === Infinity ? Infinity : river + banksAt(y).l + 2);
  const bankEnd = (y: number) => {
    if (river === Infinity) return Infinity;
    const { l, bend } = banksAt(y);
    return river + l - Math.round(Math.max(0, -bend) * 4) - Math.round(Math.max(0, bend) * 5) - 1;
  };
  const vAt = (x: number, y: number) => {
    const bx = x - b.x0;
    const by = y - b.y0;
    return bx < 0 || by < 0 || bx >= b.w || by >= b.h ? 999 : b.v[by * b.w + bx];
  };
  for (let y = b.y0; y < b.y0 + b.h; y++) {
    if (y < 0 || y >= PH) continue;
    for (let x = b.x0; x < b.x0 + b.w; x++) {
      const gx = x - ox;
      if (gx < 0 || gx >= width) continue;
      const k = (y - b.y0) * b.w + (x - b.x0);
      const v = b.v[k];
      if (v === 999) continue;
      const h = b.hw[Math.round(b.s[k] / STEP)];
      const water = v >= -h && v < h;
      if (gx >= (water ? waterEnd(y) : bankEnd(y))) continue;
      let color: string;
      if (v < -h - 4) color = hash(x, y) > 0.7 ? GREEN.base : GREEN.line;
      else if (v < -h - 3) color = hash(x, y + 3) > 0.85 ? GREEN.base : EARTH.top;
      else if (v < -h - 1) color = EARTH.mid;
      else if (v < -h) color = EARTH.line;
      else if (v < -h + 1) color = WATER.deep;
      else if (v < -h + 2.5) color = WATER.lump;
      else if (v < h - 1.5) color = WATER.base;
      else if (v < h) color = WATER.shallow;
      else if (v < h + 3) {
        const q = hash(x, y);
        color = q < 0.12 ? STONE.light : q < 0.3 ? SAND.mid : SAND.light;
      } else color = GREEN.line;
      px(g, color, gx, y);
    }
  }
  /** A pixel of the water (not its edges), in g, if it is drawn here */
  const dot = (color: string, x: number, y: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const v = vAt(rx, ry);
    const gx = rx - ox;
    if (Math.abs(v) < TOWN_BROOK.hw - 2 && gx >= 0 && gx < width && gx < waterEnd(ry)) px(g, color, gx, ry);
  };
  /** A short stroke along the river from `s`, at `u` across it, `dv` pixels further across */
  const stroke = (color: string, s: number, u: number, len: number, dv = 0) => {
    for (let j = 0; j < len; j++) {
      const q = brookPoint(s + j, u);
      const i = Math.max(0, Math.min(b.cx.length - 1, Math.round((s + j) / STEP)));
      dot(color, q.x + b.nx[i] * dv, q.y + b.ny[i] * dv);
    }
  };
  // The bed: darker lumps, shifting a little from frame to frame
  for (const [i, l] of BROOK_LUMPS.entries()) {
    const s = l.s + (frame % 2 && i % 3 === 0 ? 1 : 0);
    stroke(WATER.lump, s + 1, l.u, l.w - 2);
    stroke(WATER.lump, s, l.u, l.w, 1);
    if (l.h === 3) stroke(WATER.lump, s + 1, l.u, l.w - 2, 2);
  }
  // Ripples running downstream: each moves along over the frames, then starts again behind
  for (const r of BROOK_RIPPLES) {
    const age = (frame + r.phase) % RIVER_FRAMES;
    const s = r.s + age * 4;
    const color = age === 0 || age === RIVER_FRAMES - 1 ? WATER.shallow : WATER.light;
    stroke(color, s + 1, r.u, r.w - 2);
    stroke(color, s, r.u, 1, -1);
    stroke(color, s + r.w - 1, r.u, 1, -1);
  }
  // Rocks, the water breaking white upstream of them and trailing away downstream
  for (const k of BROOK_ROCKS) {
    const trail = 4 + (frame % 2) * 2;
    for (let j = 1; j <= trail; j++) {
      stroke(WATER.light, k.s + k.w + j, k.u, 1, -2 - Math.floor(j / 2));
      stroke(WATER.light, k.s + k.w + j, k.u, 1, 2 + Math.floor(j / 2));
    }
    stroke(WATER.foam, k.s - 2, k.u, 2, 0);
    for (let j = 0; j < k.w; j++) {
      for (let dv = -1; dv <= 1; dv++) stroke(j === 0 || j === k.w - 1 ? STONE.dark : dv < 0 ? STONE.pale : STONE.mid, k.s + j, k.u, 1, dv);
    }
  }
  // Lily pads in the calm water by the far bank, one in flower
  for (const [i, s] of BROOK_PADS.entries()) {
    const u = 0.62 - (i % 2) * 0.12;
    stroke('#2d6a30', s, u, 5, 1);
    stroke('#3f8a3a', s - 1, u, 7);
    stroke('#3f8a3a', s, u, 5, -1);
    stroke(GREEN.blade, s + 1, u, 2, -1);
    if (i === 2) {
      stroke('#f2b6cc', s + 1, u, 3, -2);
      stroke(GOLD.light, s + 2, u, 1, -2);
    }
  }
  // Reeds on the far bank: stems up over the water's edge, light tips, a few brown heads
  const reeds = seeded(67);
  for (const s0 of BROOK_REEDS) {
    for (let k = 0; k < 7; k++) {
      const q = brookPoint(s0 + k * 1.5, 1.1);
      const x = Math.round(q.x);
      const yb = Math.round(q.y);
      const h = 5 + Math.floor(reeds() * 6);
      const head = reeds() < 0.35;
      const gx = x - ox;
      if (gx < 0 || gx >= width || gx >= bankEnd(yb)) continue;
      px(g, '#2f5a2a', gx, yb - h, 1, h);
      px(g, GREEN.blade, gx, yb - h);
      if (head) px(g, EARTH.top, gx, yb - h + 1, 1, 3);
    }
  }
}


/** How far the town's edge reaches back over the square and out over the riverside, and where the grass is clear of it (sprite pixels) */
const TOWN_EDGE = { back: 24, out: 100, grass: 40 };

/**
 * Where the town meets the grass: the end of the square's ground (`town`, built wider than the
 * screen: `from` is where the screen ends, `house` where the last house ends, `street` the foot of
 * the sidewalk under the houses) laid over the riverside's grass. The last house shows whole, its
 * sidewalk ends at its corner and the house throws its shadow on the grass; below, the paving breaks
 * up into the grass in ragged slabs, a few loose ones lying out on it, grass growing in its cracks
 * and over its edge. Drawn over the river's frames, at `x` (sprite pixels of the square).
 */
export function townEdge(town: HTMLCanvasElement, from: number, house: number, street: number, stop = PH): { canvas: HTMLCanvasElement; x: number } {
  const B = TOWN_EDGE.back;
  const [c, g] = canvas(B + TOWN_EDGE.out, PH);
  const r = seeded(71);
  // Where the paving ends on each row: in broken slabs, each a few rows high, the corner of the sidewalk at the top
  const ends: number[] = [];
  let step = 0;
  let slab = 0;
  for (let y = 0; y < PH; y++) {
    if (y >= step) {
      step = y + 6 + Math.floor(r() * 9);
      slab = B + 6 + Math.floor(r() * 16) - (r() < 0.25 ? 10 : 0);
    }
    ends.push(y < SQUARE_HOUSES.bottom ? house - from + B : y < street + 3 ? house - from + B + 4 : slab);
  }
  // From `stop` down the town has turned to grass and the river at its edge: nothing to lay over the riverside
  for (let y = stop; y < PH; y++) ends[y] = 0;
  for (let y = 0; y < PH; y++) if (ends[y]) g.drawImage(town, from - B, y, ends[y], 1, 0, y, ends[y], 1);
  // The house's shadow on the grass, to its right, and the end of its sidewalk's curb
  const corner = house - from + B;
  veil(g, corner, 24, 6, SQUARE_HOUSES.bottom - 24, 0.28);
  veil(g, corner + 4, SQUARE_HOUSES.bottom, 3, street - SQUARE_HOUSES.bottom + 3, 0.3);
  px(g, '#9aa0a6', corner + 2, SQUARE_HOUSES.bottom, 2, street - SQUARE_HOUSES.bottom);
  // Loose slabs out on the grass, cut from the paving itself, sunk a little at their edges
  for (let y = street + 20; y < Math.min(PH, stop) - 12; y += 18 + Math.floor(r() * 26)) {
    const w = 6 + Math.floor(r() * 7);
    const h = 4 + Math.floor(r() * 3);
    const x = ends[y] + 3 + Math.floor(r() * 12);
    if (x + w > B + TOWN_EDGE.grass - 2) continue;
    g.drawImage(town, from - 40 - Math.floor(r() * 60), y, w, h, x, y, w, h);
    px(g, 'rgba(14,10,24,0.35)', x, y + h, w, 1);
    px(g, GREEN.line, x - 1, y, 1, h);
    px(g, GREEN.blade, x + Math.floor(r() * w), y - 1, 2, 1);
  }
  for (let y = street + 3; y < stop; y++) {
    const x = ends[y];
    // The grass's dark edge along the paving, tufts hanging over it now and then
    px(g, GREEN.line, x, y);
    if (r() < 0.3) {
      const len = 1 + Math.floor(r() * 3);
      px(g, GREEN.base, x - len, y, len, 1);
      px(g, GREEN.dark, x - len - 1, y);
    }
    // Grass in the paving's cracks: more of it the nearer the edge
    for (let k = 0; k < 2; k++) {
      const gx = Math.floor(B - 20 + r() * (x - B + 20));
      if (r() > ((gx - (B - 20)) / (x - B + 20)) ** 2 * 0.5) continue;
      px(g, GREEN.shade, gx, y, 2, 1);
      px(g, GREEN.blade, gx + (r() < 0.5 ? 0 : 1), y - 1);
    }
  }
  // Moss creeping over the slabs nearest the grass
  for (let i = 0; i < 70; i++) {
    const y = street + 6 + Math.floor(r() * (Math.min(PH, stop) - street - 10));
    const x = ends[y] - 2 - Math.floor(r() * 8);
    px(g, 'rgba(70,130,50,0.35)', x, y, 2 + Math.floor(r() * 3), 1 + Math.floor(r() * 2));
  }
  return { canvas: c, x: from - B };
}

/** The path to the hall from `x0` to `x1`, along the bridge's line: slabs of warm stone, grass growing over its edges */
function path(g: G, x0: number, x1: number): void {
  const r = seeded(x0 + 7);
  const y0 = R.bridge.y0 + 2;
  const y1 = R.bridge.y1 - 2;
  px(g, SAND.dark, x0, y0, x1 - x0, y1 - y0);
  for (let y = y0, row = 0; y < y1; y += 12, row++) {
    for (let x = x0 - (row % 2 ? 9 : 0); x < x1; x += 18) {
      const bx = Math.max(x0, x + 1);
      const bw = Math.min(x + 17, x1) - bx;
      const bh = Math.min(11, y1 - y - 1);
      if (bw <= 0 || bh <= 0) continue;
      px(g, r() < 0.3 ? SAND.mid : SAND.light, bx, y + 1, bw, bh);
      px(g, SAND.pale, bx, y + 1, bw, 1);
      veil(g, bx, y + bh, bw, 1, 0.18);
    }
  }
  for (let x = x0; x < x1; x += 3) {
    const t = Math.floor(r() * 3);
    px(g, GREEN.shade, x, y0, 2, 1 + t);
    px(g, GREEN.blade, x + 1, y1 - 1 - t, 2, 1 + t);
  }
}

/**
 * The bridge: a deck of flagstones between two low parapets, over one round arch. Seen from above,
 * the top parapet shows its top and its face toward the deck, the bottom one its top and below it
 * the bridge's face, with the arch over the water and its shadow under it.
 */
function bridge(g: G): void {
  const r = seeded(23);
  const [x0, x1] = bridgeSpan();
  const w = x1 - x0;
  const { y0, y1 } = R.bridge;
  // Its shadow on the water, below the face
  veil(g, x0 + 4, y1 + 20, w - 4, 6, 0.3);
  veil(g, x0 + 4, y1 + 26, w - 4, 4, 0.14);
  // The deck: flagstones
  px(g, SAND.dark, x0, y0, w, y1 - y0);
  for (let y = y0, row = 0; y < y1; y += 12, row++) {
    for (let x = x0 - (row % 2 ? 10 : 0); x < x1; x += 20) {
      const bx = Math.max(x0, x + 1);
      const bw = Math.min(x + 19, x1) - bx;
      const bh = Math.min(11, y1 - y - 1);
      if (bw <= 0 || bh <= 0) continue;
      px(g, r() < 0.25 ? SAND.mid : SAND.light, bx, y + 1, bw, bh);
      px(g, SAND.pale, bx, y + 1, bw, 1);
    }
  }
  // The top parapet: its top, its face toward the deck in shade, its shadow on the deck
  px(g, SAND.line, x0, y0 - 10, w, 10);
  px(g, SAND.light, x0, y0 - 9, w, 4);
  px(g, SAND.pale, x0, y0 - 9, w, 1);
  px(g, SAND.mid, x0, y0 - 5, w, 4);
  for (let x = x0 + 10; x < x1; x += 14) px(g, SAND.dark, x, y0 - 5, 1, 4);
  veil(g, x0, y0, w, 3, 0.25);
  // The bottom parapet's top
  px(g, SAND.line, x0, y1, w, 7);
  px(g, SAND.light, x0, y1 + 1, w, 4);
  px(g, SAND.pale, x0, y1 + 1, w, 1);
  // The bridge's face under it: courses of stone, the arch's dark mouth over the water
  const face = y1 + 7;
  const fh = 14;
  px(g, SAND.mid, x0, face, w, fh);
  for (let y = face, row = 0; y < face + fh; y += 4, row++) {
    px(g, SAND.dark, x0, y + 3, w, 1);
    for (let x = x0 + (row % 2 ? 6 : 0); x < x1; x += 12) px(g, SAND.dark, x, y, 1, 3);
  }
  const under = riverAt(face + fh);
  const ax = Math.round(under.c);
  const half = Math.round(under.hw) + 1;
  for (let j = 0; j < fh; j++) {
    // The arch: as wide as the water at the bottom, rounding off upward
    const rr = Math.round(half * Math.sqrt(Math.max(0, 1 - ((fh - j) / (fh + 1)) ** 2)));
    if (rr <= 0) continue;
    px(g, ARCH, ax - rr, face + j, rr * 2, 1);
    px(g, SAND.pale, ax - rr - 1, face + j, 1, 1);
    px(g, SAND.dark, ax + rr, face + j, 1, 1);
  }
  px(g, SAND.line, x0, face + fh, w, 1);
  // A post at each corner: a block of stone a little higher than the parapets
  for (const [x, y] of [
    [x0 - 2, y0 - 14],
    [x1 - 8, y0 - 14],
    [x0 - 2, y1 - 4],
    [x1 - 8, y1 - 4],
  ]) {
    px(g, SAND.line, x, y, 10, 13);
    px(g, SAND.light, x + 1, y + 1, 8, 7);
    px(g, SAND.pale, x + 1, y + 1, 8, 1);
    px(g, SAND.mid, x + 1, y + 8, 8, 4);
    veil(g, x + 10, y + 2, 2, 11, 0.25);
  }
}

/**
 * The grass around the hall (in the hall's own pixels): round bushes along the top of the back wall
 * with flowers between them, a bed of flowering bushes along the foot of the front wall
 */
function garden(g: G, sheets: Sheets): void {
  const r = seeded(43);
  const shadow = (x: number, y: number, rx: number) => {
    g.fillStyle = 'rgba(14,10,24,0.22)';
    g.beginPath();
    g.ellipse(x + 3, y - 2, rx, rx / 3, 0, 0, Math.PI * 2);
    g.fill();
  };
  // Above the back wall: bushes in a loose row, a flower here and there between them
  for (let x = TOWER_W + 6; x < A.w - TOWER_W - 6; x += 30 + Math.floor(r() * 18)) {
    const [bx, by] = BUSHES[Math.floor(r() * BUSHES.length)];
    const y = A.top - BACK_TOP - 2 - Math.floor(r() * 8);
    if (r() < 0.6) {
      const [fx, fy] = FLOWER_BUSHES[Math.floor(r() * FLOWER_BUSHES.length)];
      g.drawImage(sheets.flowers, fx, fy, 32, 32, x + 4, y - 34 - Math.floor(r() * 8), 24, 24);
    }
    shadow(x, y, 12);
    g.drawImage(sheets.bushes, bx, by, 32, 32, x - 16, y - 30, 32, 32);
  }
  // Below the front wall: a bed of flowering bushes, two colors taking turns
  const bed = A.front + FRONT_FACE + 28;
  const colors = [FLOWER_BUSHES[1], FLOWER_BUSHES[7]];
  for (let x = TOWER_W + 6, k = 0; x < A.w - TOWER_W - 6; x += 26, k++) {
    const [fx, fy] = colors[k % 2];
    const y = bed + (k % 2) * 4;
    shadow(x, y, 11);
    g.drawImage(sheets.flowers, fx, fy, 32, 32, x - 16, y - 30, 32, 32);
  }
}

/** The floor: a chessboard of diamond tiles, a sill of light stone along the open side, the back wall's shadow */
function floor(g: G, tiles: HTMLImageElement): void {
  const y0 = A.wall - 12;
  // On under the front wall's merlons, which show it between them
  const y1 = A.front + 12;
  for (let y = y0, row = 0; y < y1; y += 32, row++) {
    for (let x = 6, col = 0; x < A.east; x += 32, col++) {
      const [sx, sy] = FLOOR_TILES[(row + col) % 2];
      const h = Math.min(32, y1 - y);
      g.drawImage(tiles, sx, sy, 32, h, x, y, 32, h);
    }
  }
  // The sill: one step up from the grass
  const h = A.front - A.wall;
  px(g, SAND.light, 0, A.wall, 6, h);
  px(g, SAND.pale, 0, A.wall, 1, h);
  px(g, SAND.dark, 5, A.wall, 1, h);
  for (let y = A.wall + 20; y < A.front; y += 24) px(g, SAND.mid, 1, y, 4, 1);
  veil(g, 6, A.wall, 2, h, 0.22);
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

/** The back wall's face, from its top (drawn A.top lower on the ground): courses of dark stone on a lighter foot, pillars along it, banners and windows between them */
function backWall(g: G): void {
  const r = seeded(4);
  const x0 = 0;
  const x1 = A.east;
  const wall = A.wall - A.top;
  const foot = wall - 12;
  px(g, STONE.deep, x0, 0, x1 - x0, wall);
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
  for (let k = 0; first + k * step < x1 - 12; k++) pillar(g, first + k * step, 0, wall + 6, 22);
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

/** How far below the front wall's edge its face ends (sprite pixels) */
const FRONT_FACE = 56;
/** How high the battlements along the top of the back wall stand over its face */
const BACK_TOP = 24;

/** The castle sheet's tiles */
const TILE = 32;
/** Cuts of the castle sheet (LPC castle, 32 px tiles) */
const CASTLE = {
  /** The battlements along the top of a wall seen from above (their row): the left end, the middle, the right end turning down, and that side running on down */
  top: { y: 64, left: 224, mid: 256, right: 288, side: 96 },
  /** A straight wall's face (its rows: merlons along its top, then a course of stone): the left end, the middle, the right end with their corner stones */
  face: { merlons: 160, course: 192, left: 224, mid: 256, right: 288 },
  /** An arrow slit with its sill */
  slit: [136, 84, 16, 32],
  /**
   * The round tower: its outer columns (a narrow tower), and the rows of its parapet seen from above,
   * the merlons on its far side, and its body with the merlons of its near side
   */
  tower: { cols: [320, 384], ring: [16, 48], merlons: [64, 40], body: [144, 112] },
} as const;

/** A row of the castle sheet's 32 px tiles from x 0 to `w`: the left end, middles, the right end (always whole, at the far end) */
function tileRow(g: G, sheet: CanvasImageSource, y: number, sy: number, h: number, w: number, left: number, mid: number, right: number): void {
  for (let x = 0; x < w - TILE; x += TILE) g.drawImage(sheet, x === 0 ? left : mid, sy, TILE, h, x, y, TILE, h);
  g.drawImage(sheet, right, sy, TILE, h, w - TILE, y, TILE, h);
}

/**
 * The castle's walls seen from outside and above: battlements along the top of the back wall, the
 * top of the right wall running down to the front, and the front wall, its walk along the top and
 * its face toward us, merlons along its edge and arrow slits, its shadow on the grass
 */
function outerWalls(g: G, stone: HTMLCanvasElement): void {
  const T = CASTLE.top;
  const F = CASTLE.face;
  // The back wall's battlements (their stone sits on the top of its face)
  tileRow(g, stone, A.top - 26, T.y, TILE, A.w, T.left, T.mid, T.right);
  // The right wall's top: its stone, and the battlements' side running down along its edge
  const x = A.east;
  px(g, STONE.shade, x, A.top, A.w - x, A.front - A.top);
  for (let y = A.top + 2, row = 0; y < A.front; y += 20, row++) {
    px(g, STONE.dark, x + 1, y, A.w - x - 9, Math.min(18, A.front - y));
    veil(g, x + 1, y, A.w - x - 9, 1, 0.12, true);
    if (row % 3 === 1) veil(g, x + 1, y, A.w - x - 9, Math.min(18, A.front - y), 0.1);
  }
  for (let y = A.top + 6; y < A.front; y += TILE) g.drawImage(stone, T.right, T.side, TILE, Math.min(TILE, A.front - y), A.w - TILE, y, TILE, Math.min(TILE, A.front - y));
  px(g, STONE.line, x - 1, A.wall, 1, A.front - A.wall);
  // The front wall's face (the hall's floor runs on under its merlons, so the gaps between them
  // show the floor): merlons along its edge over a course of stone, another course under it, arrow slits
  tileRow(g, stone, A.front - 8, F.merlons, TILE, A.w, F.left, F.mid, F.right);
  tileRow(g, stone, A.front + 24, F.course, TILE, A.w, F.left, F.mid, F.right);
  const [sx, sy, sw, sh] = CASTLE.slit;
  for (let bx = TOWER_W + 20; bx < A.w - TOWER_W - 20; bx += 66) g.drawImage(stone, sx, sy, sw, sh, bx, A.front + 22, sw, sh);
  // Its shadow on the grass
  veil(g, 0, A.front + FRONT_FACE, A.w, 4, 0.3);
  veil(g, 0, A.front + FRONT_FACE + 4, A.w, 3, 0.14);
}

/** The towers: as wide as two of the castle sheet's tiles, where their floor is (from their top), and how tall the tall ones and the low ones are */
const TOWER_W = 64;
const TOWER_FLOOR = 36;
const TOWER_TALL = 188;
const TOWER_LOW = 132;
/** Where the towers stand (in the hall's pixels: their left edge and their foot): two tall ones at the back, two low ones at the front */
const TOWERS = [
  { x: -30, foot: A.wall + 4, tall: true },
  { x: A.w - TOWER_W, foot: A.wall + 4, tall: true },
  { x: -30, foot: A.front + FRONT_FACE + 4, tall: false },
  { x: A.w - TOWER_W, foot: A.front + FRONT_FACE + 4, tall: false },
];

/**
 * A narrow round tower from the castle sheet: a floor of stone inside its parapet, the parapet seen
 * from above with the merlons on its far side, and its body with the merlons of its near side. A tall
 * one has a longer body (its middle courses once more), a low one its top, a course of its middle and
 * its foot.
 */
function castleTower(stone: HTMLCanvasElement, tall: boolean): HTMLCanvasElement {
  const T = CASTLE.tower;
  const [c, g] = canvas(TOWER_W, tall ? TOWER_TALL : TOWER_LOW);
  const top = 16;
  // The floor: stone flags in the shade of the parapet
  for (let j = -8; j <= 8; j++) {
    const half = Math.round(25 * Math.sqrt(1 - (j / 8.5) ** 2));
    px(g, STONE.shade, TOWER_W / 2 - half, top + 20 + j, half * 2, 1);
  }
  for (let y = top + 14; y < top + 28; y += 5) px(g, STONE.deep, 10, y, TOWER_W - 20, 1);
  const piece = (sy: number, h: number, y: number) => T.cols.forEach((sx, k) => g.drawImage(stone, sx, sy, TILE, h, k * TILE, y, TILE, h));
  piece(T.ring[0], T.ring[1], top);
  piece(T.merlons[0], T.merlons[1], top - 16);
  const [by] = T.body;
  if (tall) {
    piece(by, 64, top + 12);
    piece(by + 32, 32, top + 76);
    piece(by + 32, 16, top + 108);
    piece(by + 64, 48, top + 124);
  } else {
    piece(by, 26, top + 12);
    piece(by + 26, 48, top + 38);
    piece(by + 82, 30, top + 86);
  }
  return c;
}

/**
 * The towers' pictures, once built with the ground. The tall ones are part of the ground (drawn again
 * over the river's frames where they stand out over the riverside); the front ones stand up among
 * the people and props (hallProps), in front of whoever is behind them.
 */
let towerArt: { tall: HTMLCanvasElement; low: HTMLCanvasElement } | null = null;

function towers(g: G, stone: HTMLCanvasElement): void {
  const art = (towerArt = { tall: castleTower(stone, true), low: castleTower(stone, false) });
  for (const t of TOWERS) {
    const img = t.tall ? art.tall : art.low;
    // Its shadow on the ground, to the right
    g.fillStyle = 'rgba(14,10,24,0.28)';
    g.beginPath();
    g.ellipse(t.x + TOWER_W / 2 + 6, t.foot - 6, TOWER_W / 2 + 2, 9, 0, 0, Math.PI * 2);
    g.fill();
    if (t.tall) g.drawImage(img, t.x, t.foot - img.height);
  }
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
  for (let cx = 46; cx < A.east - 12; cx += 68) if (cx > TOWERS[0].x + TOWER_W + 6 && cx < TOWERS[1].x - 6) out.push({ x: cx, y: A.top + 74 });
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

/** World position of a point of the riverside's art */
const onRiverside = (x: number, y: number) => ({ x: RIVERSIDE.x0 + x * S, y: y * S });

/** Where the water glints (rows of the riverside and across the river, -1 to 1), and how far into the twinkle each one starts */
const GLINTS = [
  [92, -0.3, 0],
  [252, 0.2, 2],
  [330, -0.4, 1],
  [524, 0.1, 3],
  [612, 0.45, 2],
  [180, -0.1, 1],
] as const;

/**
 * The river flowing: its two frames taking turns over the ground (the bridge comes with them), and
 * glints on the water. Drawn right after the ground.
 */
export function drawRiver(g: G, art: HallArt, now: number): void {
  const strip = art.river[Math.floor(now / RIVER_FRAME_MS) % art.river.length];
  const p = onRiverside(RIVER_CUT.x, 0);
  g.drawImage(strip, 0, 0, strip.width, strip.height, p.x, 0, strip.width * S, strip.height * S);
  const t = Math.floor(now / 160);
  g.globalAlpha = 0.75;
  for (const [y, u, k] of GLINTS) {
    const { c, hw } = riverAt(y);
    const q = onRiverside(c + u * hw, y);
    g.drawImage(art.sparkle, ((t + k) % 4) * 32, 32, 32, 32, Math.round(q.x - 16), Math.round(q.y - 16), 32, 32);
  }
  g.globalAlpha = 1;
  // The towers standing out over the riverside's grass, which the river's frames just painted over
  for (const tw of TOWERS) {
    const img = towerArt?.tall;
    if (!img || !tw.tall || tw.x >= 0) continue;
    const q = at(tw.x, tw.foot - img.height);
    g.drawImage(img, q.x, q.y, img.width * S, img.height * S);
  }
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
  // The flags on the tall towers, waving
  TOWERS.forEach((t, k) => {
    if (!t.tall) return;
    const p = at(t.x + TOWER_W / 2, t.foot - TOWER_TALL + TOWER_FLOOR);
    flag(g, p.x, p.y, now, k);
  });
}

/** A pennant on a pole, the pole's foot at (x, y): the royal red with a golden stripe, waving in the wind */
function flag(g: G, x: number, y: number, now: number, seed: number): void {
  const u = pen(g, x, y);
  u(0, -16, 1, 16, IRON.line);
  u(-1, -18, 3, 2, GOLD.light);
  const len = 14;
  for (let i = 0; i < len; i++) {
    const wave = Math.round(Math.sin(now / 170 - i * 0.55 + seed * 2) * 1.3);
    const h = Math.max(1, Math.round(7 * (1 - i / len)));
    const top = -16 + wave + Math.round((7 - h) / 2);
    u(1 + i, top, 1, h, i % 3 === 0 ? RED.dark : RED.mid);
    if (h > 2) u(1 + i, top + Math.floor(h / 2), 1, 1, GOLD.light);
    u(1 + i, top, 1, 1, RED.light);
  }
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
  // The front towers, standing in front of whoever is behind them, a flag waving on each
  TOWERS.forEach((t, k) => {
    const img = towerArt?.low;
    if (t.tall || !img) return;
    const q = at(t.x, t.foot - img.height);
    const pole = at(t.x + TOWER_W / 2, t.foot - img.height + TOWER_FLOOR);
    out.push({
      y: t.foot * S,
      draw(g, now) {
        g.drawImage(img, q.x, q.y, img.width * S, img.height * S);
        flag(g, pole.x, pole.y, now, k);
      },
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
      const a = at(cx - 15, A.top + 88);
      const b = at(cx + 15, A.top + 88);
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
const SEAT_DROP = 8;

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
