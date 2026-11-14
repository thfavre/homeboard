import { SPRITE_SCALE } from '$shared/crowd.ts';
import type { WDir } from '$shared/world.ts';
import { BLOCK_UP, LOT, LOT_CELL, LOT_CW, LOT_FENCE, LOT_RH, LOT_ROW, blockById, inLot, propById, type BlockDef, type LotGrid, type LotProp } from '$shared/worldBuild.ts';
import { CUT, put, tree, type Cut, type Env, type Prop } from '../games/crowd/scene.ts';

/**
 * The build lot as the TV and the phones draw it: its soil, its low wooden fence with the gate, the
 * blocks stacked in columns (each material drawn by hand, a sprite pixel at a time, lit from the top
 * left like the rest of the town), the decorations from the town's own art, the builder's hammer,
 * a puff of dust where a piece goes up or comes down, and at night the glow of the lantern blocks,
 * the crystals and the lamps.
 */

type G = CanvasRenderingContext2D;
const S = SPRITE_SCALE;

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

/** A little random generator, the same numbers for the same seed (textures look the same every time) */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedOf = (text: string) => [...text].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);

// ------------------------------------------------------------ extra art

/** The town's art sheets the lot uses beyond the square's own */
const EXTRA = ['bush-leafy', 'bush-round', 'barrels', 'crates', 'baskets'] as const;
export type LotArt = Record<(typeof EXTRA)[number], HTMLImageElement>;

let loading: Promise<LotArt | null> | null = null;
/** Load them once (null: they cannot be; those decorations are then not drawn) */
export function loadLotArt(): Promise<LotArt | null> {
  loading ??= Promise.all(
    EXTRA.map(
      (f) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve([f, img]);
          img.onerror = () => reject(new Error(f));
          img.src = `/crowd/env/${f}.png`;
        }),
    ),
  )
    .then((list) => Object.fromEntries(list) as LotArt)
    .catch(() => null);
  return loading;
}

// ------------------------------------------------------------ the ground

const SOIL = { base: '#7d5f43', dark: '#664c35', light: '#94744f', stone: '#a09a8e', edge: '#5a4430', grass: '#5f8a3e', grassLight: '#78a64c' };

/** The lot's ground in sprite pixels: tilled soil with pebbles and tufts, a faint line between the cells, a border of grass */
function buildGround(): HTMLCanvasElement {
  const w = LOT.cols * LOT_CELL;
  const h = LOT.rows * LOT_ROW;
  const [c, g] = canvas(w + 8, h + 8);
  const rand = seeded(7);
  // A border of grass where the fence stands
  px(g, SOIL.grass, 0, 0, w + 8, h + 8);
  for (let i = 0; i < 260; i++) px(g, SOIL.grassLight, Math.floor(rand() * (w + 8)), Math.floor(rand() * (h + 8)));
  px(g, SOIL.edge, 3, 3, w + 2, h + 2);
  px(g, SOIL.base, 4, 4, w, h);
  for (let i = 0; i < w * h * 0.08; i++) px(g, rand() < 0.5 ? SOIL.dark : SOIL.light, 4 + Math.floor(rand() * w), 4 + Math.floor(rand() * h));
  for (let i = 0; i < 40; i++) {
    const x = 4 + Math.floor(rand() * w);
    const y = 4 + Math.floor(rand() * h);
    px(g, SOIL.stone, x, y, 2, 1);
    px(g, SOIL.edge, x, y + 1, 2, 1);
  }
  // The cells, barely: a darker dot at every corner
  for (let r = 1; r < LOT.rows; r++) for (let k = 1; k < LOT.cols; k++) px(g, 'rgba(40,26,14,0.45)', 4 + k * LOT_CELL, 4 + r * LOT_ROW);
  return c;
}

let ground: HTMLCanvasElement | null = null;
/** The lot's ground, under everything (on the town's background, built once) */
export function drawLotGround(g: G, x0 = LOT.x0, y0 = LOT.y0): void {
  ground ??= buildGround();
  g.drawImage(ground, Math.round(x0 - 4 * S), Math.round(y0 - 4 * S), Math.round(ground.width * S), Math.round(ground.height * S));
}

// ------------------------------------------------------------ the fence

const WOOD = { line: '#2a1610', dark: '#4a2a1c', mid: '#6b3d22', light: '#85502c', pale: '#a8703e' };

/** A run of fence along the front (sprite pixels, `w` long): posts every 8 pixels, two rails, gate posts at the ends if asked */
function buildFenceRun(w: number, gateLeft = false, gateRight = false): HTMLCanvasElement {
  const [c, g] = canvas(w, 14);
  for (const y of [4, 8]) {
    px(g, WOOD.line, 0, y - 1, w, 3);
    px(g, WOOD.mid, 0, y, w, 1);
    px(g, WOOD.light, 0, y - 1 + 1, w, 1);
  }
  for (let x = 0; x < w; x += 8) {
    px(g, WOOD.line, x, 1, 3, 13);
    px(g, WOOD.pale, x + 1, 1, 1, 12);
    px(g, WOOD.mid, x + 1, 2, 1, 11);
    px(g, WOOD.light, x + 1, 1, 1, 1);
  }
  for (const [on, x] of [
    [gateLeft, w - 4],
    [gateRight, 0],
  ] as const) {
    if (!on) continue;
    px(g, WOOD.line, x, 0, 4, 14);
    px(g, WOOD.light, x + 1, 0, 2, 13);
    px(g, WOOD.pale, x + 1, 0, 1, 1);
  }
  return c;
}

/** A fence's side run, seen end on: a post at the front and the rails going back up the screen (`len` pixels deep) */
function buildFenceSide(len: number): HTMLCanvasElement {
  const [c, g] = canvas(3, len + 14);
  px(g, WOOD.line, 0, 3, 3, len);
  px(g, WOOD.mid, 1, 3, 1, len);
  px(g, WOOD.line, 0, len, 3, 14);
  px(g, WOOD.pale, 1, len, 1, 13);
  return c;
}

/** The fence as things standing in depth order: the top run with its gate, the bottom run, and the sides cell by cell */
function fenceProps(): Prop[] {
  const out: Prop[] = [];
  const left = LOT.x0 - LOT_FENCE;
  const right = LOT.x1 + LOT_FENCE;
  const top = LOT.y0 - LOT_FENCE;
  const bottom = LOT.y1 + LOT_FENCE;
  const gx0 = LOT.x0 + LOT.gate.c0 * LOT_CW;
  const gx1 = LOT.x0 + (LOT.gate.c1 + 1) * LOT_CW;
  const run = (x0: number, x1: number, y: number, gl: boolean, gr: boolean): Prop => {
    const c = buildFenceRun(Math.max(4, Math.round((x1 - x0) / S)), gl, gr);
    return { y, draw: (g) => g.drawImage(c, Math.round(x0), Math.round(y - c.height * S), Math.round(c.width * S), Math.round(c.height * S)) };
  };
  out.push(run(left, gx0, top, true, false), run(gx1, right, top, false, true), run(left, right + 3 * S, bottom, false, false));
  const side = buildFenceSide(LOT_ROW);
  for (let r = 0; r <= LOT.rows; r++) {
    const y = r === LOT.rows ? bottom : LOT.y0 + r * LOT_RH;
    if (r === 0) continue;
    for (const x of [left, right]) {
      out.push({ y, draw: (g) => g.drawImage(side, Math.round(x - S), Math.round(y - side.height * S), Math.round(side.width * S), Math.round(side.height * S)) });
    }
  }
  return out;
}

// ------------------------------------------------------------ the blocks

/** A block's two faces in sprite pixels: the top (a cell, LOT_ROW deep) and the front (BLOCK_UP high) */
interface Faces {
  top: HTMLCanvasElement;
  front: HTMLCanvasElement;
}

function texture(g: G, b: BlockDef, w: number, h: number, front: boolean, rand: () => number): void {
  const base = front ? b.front : b.top;
  px(g, base, 0, 0, w, h);
  switch (b.look) {
    case 'stone':
      for (let i = 0; i < 9; i++) px(g, rand() < 0.5 ? b.dark : b.light, Math.floor(rand() * w), Math.floor(rand() * h), 1 + Math.floor(rand() * 2), 1);
      px(g, b.dark, 4, front ? 5 : 9, 3, 1);
      px(g, b.dark, 6, front ? 6 : 10, 1, 2);
      break;
    case 'cobble':
      for (let y = 0; y < h; y += 5) {
        for (let x = (y / 5) % 2 ? -3 : 0; x < w; x += 6) {
          px(g, b.dark, x, y + 4, 6, 1);
          px(g, b.dark, x + 5, y, 1, 5);
          px(g, b.light, x + 1, y, 3, 1);
        }
      }
      break;
    case 'brick':
      for (let y = 0; y < h; y += 4) {
        px(g, b.light, 0, y + 3, w, 1);
        for (let x = (y / 4) % 2 ? 4 : 0; x < w; x += 8) px(g, b.light, x, y, 1, 3);
        for (let x = 1; x < w; x += 5) if (rand() < 0.3) px(g, b.dark, x, y + 1, 2, 1);
      }
      break;
    case 'planks':
      for (let y = 0; y < h; y += 4) {
        px(g, b.dark, 0, y + 3, w, 1);
        px(g, b.light, 0, y, w, 1);
        const joint = Math.floor(rand() * (w - 4)) + 2;
        px(g, b.dark, joint, y, 1, 3);
        px(g, b.line, joint - 2, y + 1, 1, 1);
      }
      break;
    case 'leaves':
      for (let i = 0; i < w * h * 0.35; i++) px(g, rand() < 0.55 ? b.dark : b.light, Math.floor(rand() * w), Math.floor(rand() * h));
      break;
    case 'speck':
      for (let i = 0; i < w * h * 0.12; i++) px(g, rand() < 0.5 ? b.dark : b.light, Math.floor(rand() * w), Math.floor(rand() * h));
      break;
    case 'marble': {
      let x = 2 + Math.floor(rand() * 5);
      for (let y = 0; y < h; y++) {
        x += rand() < 0.5 ? 1 : 0;
        px(g, b.dark, x % w, y);
      }
      for (let i = 0; i < 6; i++) px(g, b.light, Math.floor(rand() * w), Math.floor(rand() * h));
      break;
    }
    case 'gold':
      for (let k = 0; k < 3; k++) for (let y = 0; y < h; y++) px(g, b.light, 3 + k + y - (front ? 0 : 2), y);
      px(g, b.dark, 0, h - 2, w, 2);
      break;
    case 'glass':
      px(g, b.light, 2, front ? 2 : 3, 1, 3);
      px(g, b.light, 3, front ? 1 : 2, 2, 1);
      px(g, b.light, w - 4, h - 3, 2, 1);
      break;
    case 'glow':
      px(g, b.light, 3, front ? 2 : 3, w - 6, h - (front ? 4 : 6));
      px(g, b.dark, 1, 1, 1, 1);
      px(g, b.dark, w - 2, h - 2, 1, 1);
      break;
    case 'plain':
      break;
  }
}

function buildFaces(b: BlockDef): Faces {
  const rand = seeded(seedOf(b.id));
  const W = LOT_CELL;
  // The top: in full light from above, so clearly lighter than the front; a light rim at its back
  // and left, and a bright edge along the front where it turns down (the crease that makes it a cube)
  const D = LOT_ROW;
  const [top, tg] = canvas(W, D);
  texture(tg, b, W, D, false, rand);
  px(tg, 'rgba(255,255,255,0.16)', 0, 0, W, D);
  px(tg, b.light, 1, 1, W - 2, 1);
  px(tg, b.light, 1, 1, 1, D - 2);
  px(tg, b.light, 1, D - 1, W - 2, 1);
  px(tg, b.line, 0, 0, W, 1);
  px(tg, b.line, 0, 0, 1, D);
  px(tg, b.line, W - 1, 0, 1, D);
  // The front: in the shade, darker toward the ground, its right edge darker still; a dark seam
  // under the block above (the top's bright edge covers it on the topmost block)
  const [front, fg] = canvas(W, BLOCK_UP);
  texture(fg, b, W, BLOCK_UP, true, rand);
  for (let y = 0; y < BLOCK_UP; y++) px(fg, `rgba(10,8,20,${0.1 + (0.22 * y) / BLOCK_UP})`, 0, y, W, 1);
  px(fg, 'rgba(10,8,20,0.18)', W - 3, 0, 2, BLOCK_UP);
  px(fg, 'rgba(10,8,20,0.35)', 0, 0, W, 1);
  px(fg, b.line, 0, 0, 1, BLOCK_UP);
  px(fg, b.line, W - 1, 0, 1, BLOCK_UP);
  px(fg, b.line, 0, BLOCK_UP - 1, W, 1);
  return { top, front };
}

const faces = new Map<string, Faces>();
const facesOf = (b: BlockDef) => {
  let f = faces.get(b.id);
  if (!f) faces.set(b.id, (f = buildFaces(b)));
  return f;
};

/** A block material's picture for the phone's palette: one block, top and front (sprite pixels) */
export function blockSwatch(id: string): HTMLCanvasElement | null {
  const b = blockById(id);
  if (!b) return null;
  const f = facesOf(b);
  const [c, g] = canvas(LOT_CELL, LOT_ROW + BLOCK_UP);
  g.drawImage(f.top, 0, 0);
  g.drawImage(f.front, 0, LOT_ROW);
  return c;
}

/**
 * A column of blocks standing on a cell, the bottom block first. `ghostFrom`: the blocks from this
 * one up are only on their way (drawn faint, on the phone).
 */
function columnProp(c: number, r: number, list: string[], ghostFrom = Infinity): Prop {
  const x = LOT.x0 + c * LOT_CW;
  const bottom = LOT.y0 + (r + 1) * LOT_RH;
  const W = Math.round(x + LOT_CW) - Math.round(x);
  const X = Math.round(x);
  return {
    y: bottom,
    ground(g) {
      // A soft shadow on the soil in front of the column
      g.fillStyle = 'rgba(20,12,6,0.22)';
      g.fillRect(X, Math.round(bottom), W, Math.round(3 * S));
    },
    draw(g) {
      for (let k = 0; k < list.length; k++) {
        const b = blockById(list[k]);
        if (!b) continue;
        const f = facesOf(b);
        g.globalAlpha = k >= ghostFrom ? 0.45 : 1;
        const y1 = Math.round(bottom - k * BLOCK_UP * S);
        const y0 = Math.round(bottom - (k + 1) * BLOCK_UP * S);
        g.drawImage(f.front, X, y0, W, y1 - y0);
        if (k === list.length - 1) {
          const t0 = Math.round(y0 - LOT_RH);
          g.drawImage(f.top, X, t0, W, y0 - t0);
        }
      }
      g.globalAlpha = 1;
    },
  };
}

// ------------------------------------------------------------ the decorations

/** Where a decoration's art is: its sheet and the cut of it, by its kind and variant (null: drawn otherwise) */
function propCut(env: Env, art: LotArt | null, p: LotProp): [HTMLImageElement, Cut] | null {
  const v = p.v;
  switch (p.kind) {
    case 'flower':
      return [env.flowers, [v * 32, 96, 32, 32]];
    case 'tallFlower':
      return [env.flowers, [v * 32, 128, 32, 32]];
    case 'flowerBush':
      return [env.flowers, [v * 32, 0, 32, 32]];
    case 'shrub':
      return art ? [art['bush-round'], [v * 32, 32, 32, 32]] : null;
    case 'leafy':
      return art ? [art['bush-leafy'], [v * 32, 32, 32, 32]] : null;
    case 'basket':
      return art ? [art.baskets, [64, 0, 32, 32]] : null;
    case 'barrel':
      return art ? [art.barrels, [0, 8, 32, 46]] : null;
    case 'crate':
      return art ? [art.crates, [64, 32, 32, 32]] : null;
    case 'fernPot':
      return [env.planters, [128, 32, 32, 64]];
    case 'planter':
      return [env.planters, [v ? 32 : 0, 32, 32, 52]];
    case 'topiary':
      return [env.planters, CUT.topiary];
    case 'bench':
      return [env.magecity, CUT.bench];
    case 'pillar':
      return [env.magecity, [160, 64, 32, 64]];
    case 'statue':
      return [env.magecity, [64, 392, 32, 86]];
    case 'ironStatue':
      return [env.magecity, [224, 608, 32, 64]];
    case 'fountain':
      return [env.magecity, [192, 64, 64, 64]];
    default:
      return null;
  }
}

/** Where a decoration stands: the middle of its bottom edge (world units) */
function propFoot(p: LotProp): { x: number; y: number } {
  const def = propById(p.kind);
  return { x: LOT.x0 + (p.c + (def?.w ?? 1) / 2) * LOT_CW, y: LOT.y0 + (p.r + (def?.d ?? 1)) * LOT_RH };
}

/** How dark it is for the lot's lamps (set by the TV every frame; the phone shows the day) */
export const lotNow = { dark: 0 };

function decoration(env: Env, art: LotArt | null, p: LotProp, ghost: boolean): Prop | null {
  const { x, y } = propFoot(p);
  const alpha = ghost ? 0.45 : 1;
  if (p.kind === 'tree') {
    const t = tree(env, x, y - 4 * S, false, p.id * 1.3, 0.55, 0.8);
    return {
      y,
      ground: (g, now) => {
        g.globalAlpha = alpha;
        t.ground?.(g, now);
        g.globalAlpha = 1;
      },
      draw: (g, now) => {
        g.globalAlpha = alpha;
        t.draw(g, now);
        g.globalAlpha = 1;
      },
    };
  }
  if (p.kind === 'lamp') {
    return {
      y,
      draw(g) {
        g.globalAlpha = alpha;
        put(g, env['lamp-post'], lotNow.dark > 0.3 ? CUT.lamp : CUT.lampOff, x, y + 2);
        g.globalAlpha = 1;
      },
    };
  }
  const cut = propCut(env, art, p);
  if (!cut) return null;
  const [img, c] = cut;
  return {
    y,
    draw(g) {
      g.globalAlpha = alpha;
      put(g, img, c, x, y + 2);
      g.globalAlpha = 1;
    },
  };
}

/** A decoration's picture for the phone's palette (its art, whole) */
export function propSwatch(env: Env, art: LotArt | null, kind: string, v: number): HTMLCanvasElement | null {
  const p: LotProp = { id: 0, kind, v, c: 0, r: 0 };
  if (kind === 'tree') {
    const [c, g] = canvas(60, 90);
    put(g, env['tree-trunks'], CUT.trunk, 30, 88, 0.55);
    put(g, env['tree-canopies'], CUT.canopySummer, 30, 88 - 44 * 0.55 * 0.8, 0.55);
    return c;
  }
  if (kind === 'lamp') {
    const [c, g] = canvas(CUT.lamp[2], CUT.lamp[3]);
    g.drawImage(env['lamp-post'], ...CUT.lamp, 0, 0, CUT.lamp[2], CUT.lamp[3]);
    return c;
  }
  const cut = propCut(env, art, p);
  if (!cut) return null;
  const [img, [sx, sy, sw, sh]] = cut;
  const [c, g] = canvas(sw, sh);
  g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}

// ------------------------------------------------------------ the lot as a whole

/**
 * Everything standing on the lot, to draw in depth order with the characters: the fence, the
 * columns, the decorations. With `built` (the phone), what is not in it yet is only on its way and
 * drawn faint.
 */
export function lotProps(env: Env, art: LotArt | null, grid: LotGrid, built?: LotGrid): Prop[] {
  const out = fenceProps();
  for (const [key, list] of Object.entries(grid.blocks)) {
    const i = Number(key);
    if (!list.length) continue;
    out.push(columnProp(i % LOT.cols, Math.floor(i / LOT.cols), list, built ? (built.blocks[i]?.length ?? 0) : Infinity));
  }
  for (const p of grid.props) {
    const d = decoration(env, art, p, !!built && !built.props.some((q) => q.id === p.id));
    if (d) out.push(d);
  }
  return out;
}

/** The lot's things on the TV, made again only when the lot changed */
let cache: { key: LotGrid | null; art: LotArt | null; props: Prop[] } = { key: null, art: null, props: [] };
export function lotStanding(env: Env, art: LotArt | null, grid: LotGrid | undefined): Prop[] {
  if (!grid) return [];
  if (cache.key !== grid || cache.art !== art) {
    if (cache.key !== grid) noteChanges(grid);
    cache = { key: grid, art, props: lotProps(env, art, grid) };
  }
  return cache.props;
}

// ------------------------------------------------------------ dust, the hammer, the light

interface Puff {
  x: number;
  y: number;
  at: number;
  big: boolean;
}
let puffs: Puff[] = [];
let before: { counts: Map<number, number>; props: Set<number> } | null = null;

/** Where the lot changed since the last time: a puff of dust there (not the first time it is seen) */
function noteChanges(grid: LotGrid): void {
  const counts = new Map(Object.entries(grid.blocks).map(([k, v]) => [Number(k), v.length]));
  const props = new Set(grid.props.map((p) => p.id));
  const now = performance.now();
  if (before) {
    for (const i of new Set([...counts.keys(), ...before.counts.keys()])) {
      const a = before.counts.get(i) ?? 0;
      const b = counts.get(i) ?? 0;
      if (a === b) continue;
      const x = LOT.x0 + ((i % LOT.cols) + 0.5) * LOT_CW;
      const y = LOT.y0 + (Math.floor(i / LOT.cols) + 1) * LOT_RH - Math.max(a, b) * BLOCK_UP * S;
      puffs.push({ x, y, at: now, big: false });
    }
    for (const p of grid.props) if (!before.props.has(p.id)) puffs.push({ ...propFoot(p), at: now, big: true });
    for (const id of before.props) {
      if (props.has(id)) continue;
      const gone = lastProps.get(id);
      if (gone) puffs.push({ ...propFoot(gone), at: now, big: true });
    }
  }
  lastProps = new Map(grid.props.map((p) => [p.id, p]));
  before = { counts, props };
}
let lastProps = new Map<number, LotProp>();

const PUFF_MS = 700;

/** The dust where pieces went up or came down (over everything) */
export function drawLotPuffs(g: G): void {
  const now = performance.now();
  puffs = puffs.filter((p) => now - p.at < PUFF_MS);
  for (const p of puffs) {
    const t = (now - p.at) / PUFF_MS;
    const n = p.big ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + p.x;
      const d = (p.big ? 22 : 12) * Math.sqrt(t);
      g.fillStyle = `rgba(236,226,206,${0.75 * (1 - t)})`;
      g.beginPath();
      g.arc(p.x + Math.cos(a) * d, p.y - 4 - Math.sin(a) * d * 0.5 - t * 8, (p.big ? 5 : 3.5) * (1 - t * 0.5), 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** A builder kneeling on the lot (the kindling pose there) */
export const buildingAt = (x: number, y: number) => inLot(x, y);

/** The builder's hammer, knocking at the piece in front: in the hand on the side it faces, with a little dust at each knock */
export function drawHammer(g: G, x: number, y: number, dir: WDir, now: number): void {
  const side = dir === 1 ? -1 : 1;
  const hx = x + (dir === 0 ? 7 : dir === 2 ? 9 : 12 * side);
  const hy = y - (dir === 0 ? 30 : 22);
  const beat = (now % 520) / 520;
  const angle = side * (beat < 0.35 ? -0.9 + beat * 4 : 0.5 - (beat - 0.35) * 2);
  g.save();
  g.translate(Math.round(hx), Math.round(hy));
  g.rotate(angle);
  g.fillStyle = WOOD.line;
  g.fillRect(-S, -9 * S, 3 * S, 10 * S);
  g.fillStyle = WOOD.pale;
  g.fillRect(0, -9 * S, S, 9 * S);
  g.fillStyle = '#2b2d36';
  g.fillRect(-3 * S, -12 * S, 7 * S, 4 * S);
  g.fillStyle = '#6d7385';
  g.fillRect(-2 * S, -12 * S, 5 * S, S);
  g.restore();
  if (beat > 0.3 && beat < 0.5) {
    g.fillStyle = 'rgba(236,226,206,0.8)';
    for (let i = 0; i < 3; i++) g.fillRect(Math.round(hx + side * (10 + i * 3)), Math.round(hy - 2 - i * 3), S * 1.5, S * 1.5);
  }
}

/** At night: the lantern blocks and crystals shine on their top, the lamps glow (over the night's veil) */
export function drawLotLight(g: G, grid: LotGrid | undefined, dark: number, now: number): void {
  if (!grid || dark < 0.05) return;
  for (const [key, list] of Object.entries(grid.blocks)) {
    const i = Number(key);
    const c = i % LOT.cols;
    const r = Math.floor(i / LOT.cols);
    list.forEach((id, k) => {
      const glow = blockById(id)?.glow;
      if (!glow) return;
      const x = LOT.x0 + (c + 0.5) * LOT_CW;
      const y = LOT.y0 + (r + 1) * LOT_RH - (k + 0.5) * BLOCK_UP * S;
      const rad = 34 + Math.sin(now / 600 + i) * 2;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(${glow},${0.42 * dark})`);
      grad.addColorStop(1, `rgba(${glow},0)`);
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    });
  }
  for (const p of grid.props) {
    if (!propById(p.kind)?.glow) continue;
    const { x, y } = propFoot(p);
    const ly = y - 80;
    const glow = g.createRadialGradient(x, ly, 0, x, ly, 60);
    glow.addColorStop(0, `rgba(255,210,120,${0.4 * dark})`);
    glow.addColorStop(1, 'rgba(255,210,120,0)');
    g.fillStyle = glow;
    g.fillRect(x - 60, ly - 60, 120, 120);
    const pool = g.createRadialGradient(x, y, 0, x, y, 50);
    pool.addColorStop(0, `rgba(255,200,120,${0.22 * dark})`);
    pool.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = pool;
    g.fillRect(x - 50, y - 50, 100, 100);
  }
}
