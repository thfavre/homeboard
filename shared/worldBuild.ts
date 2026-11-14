// The build lot: a fenced plot on the town's square where guests build from their phone. Blocks
// stack into columns (sculptures, towers, walls), props from the town's own art decorate it (flowers,
// bushes, benches, statues). Each piece is brought by the guest's character: it walks into the lot
// and kneels where the piece goes. Anyone can take anything down.

import { SPRITE_SCALE } from './crowd.ts';
import type { WDir } from './world.ts';

const S = SPRITE_SCALE;

/**
 * A cell of the lot in sprite pixels: half a ground tile wide, and shallower than wide (`LOT_ROW`),
 * the way the town's crates and barrels show their tops; and the same in world units
 */
export const LOT_CELL = 16;
export const LOT_ROW = 10;
export const LOT_CW = LOT_CELL * S;
export const LOT_RH = LOT_ROW * S;

/**
 * The lot in the bottom left of the square (world units): `cols` x `rows` cells from (x0, y0), the
 * fence a little outside them, and the gate in the top fence: its cells (nothing is built on them,
 * so there is always a way in) and where one stands before it, outside.
 */
export const LOT = (() => {
  const cols = 22;
  const rows = 25;
  const x0 = 72;
  const y0 = 522;
  const gate = { c0: 17, c1: 18 };
  return {
    cols,
    rows,
    x0,
    y0,
    x1: x0 + cols * LOT_CW,
    y1: y0 + rows * LOT_RH,
    gate: { ...gate, x: x0 + (gate.c0 + (gate.c1 - gate.c0 + 1) / 2) * LOT_CW, out: y0 - 18 },
  };
})();

/** How far the fence stands outside the cells (world units): nobody walks in there but the builders */
export const LOT_FENCE = 6;

/**
 * How many blocks a column takes, and how high each block's front stands (sprite pixels): a little
 * higher than its top is deep (a row), like the town's crates, so a block reads as a box
 */
export const LOT_STACK = 5;
export const BLOCK_UP = 12;

/** Inside the fence */
export function inLot(x: number, y: number, margin = 0): boolean {
  return x > LOT.x0 - LOT_FENCE - margin && x < LOT.x1 + LOT_FENCE + margin && y > LOT.y0 - LOT_FENCE - margin && y < LOT.y1 + LOT_FENCE + margin;
}

/** A cell's number (row after row) */
export const cellIndex = (c: number, r: number) => r * LOT.cols + c;
/** The middle of a cell on the ground (world units): where one stands in it */
export const cellMiddle = (c: number, r: number) => ({ x: LOT.x0 + (c + 0.5) * LOT_CW, y: LOT.y0 + (r + 0.5) * LOT_RH });
/** The cell a ground point lies in (null: outside the lot) */
export function cellAt(x: number, y: number): { c: number; r: number } | null {
  const c = Math.floor((x - LOT.x0) / LOT_CW);
  const r = Math.floor((y - LOT.y0) / LOT_RH);
  return c >= 0 && c < LOT.cols && r >= 0 && r < LOT.rows ? { c, r } : null;
}
/** The gate's cells: always free */
export const isGate = (c: number, r: number) => r === 0 && c >= LOT.gate.c0 && c <= LOT.gate.c1;

// ------------------------------------------------------------ the pieces

export type LotTier = 'block' | 'fancy' | 'small' | 'big' | 'grand';
export const LOT_TIERS: LotTier[] = ['block', 'fancy', 'small', 'big', 'grand'];
export const LOT_TIER_NAMES: Record<LotTier, string> = { block: 'Block', fancy: 'Fancy block', small: 'Small decoration', big: 'Big decoration', grand: 'Grand decoration' };

/**
 * A block's material. Its colors: the top face (`top`, lit), the front face (`front`), their dark and
 * light details, and the outline. `look` is the pattern drawn on it (see web/src/modules/world/lotArt.ts).
 */
export interface BlockDef {
  id: string;
  name: string;
  tier: 'block' | 'fancy';
  look: 'plain' | 'stone' | 'cobble' | 'brick' | 'planks' | 'leaves' | 'speck' | 'marble' | 'gold' | 'glass' | 'glow';
  top: string;
  front: string;
  dark: string;
  light: string;
  line: string;
  /** Shines at night */
  glow?: string;
}

const paint = (id: string, name: string, top: string, front: string, dark: string, light: string, line: string): BlockDef => ({ id, name, tier: 'block', look: 'plain', top, front, dark, light, line });

export const BLOCKS: BlockDef[] = [
  { id: 'stone', name: 'Stone', tier: 'block', look: 'stone', top: '#a3a4ad', front: '#80818c', dark: '#5f606b', light: '#c3c4cc', line: '#383943' },
  { id: 'cobble', name: 'Cobblestone', tier: 'block', look: 'cobble', top: '#9a948a', front: '#7a746b', dark: '#55504a', light: '#bdb7ab', line: '#33302c' },
  { id: 'brick', name: 'Brick', tier: 'block', look: 'brick', top: '#b85f40', front: '#9b4a31', dark: '#6e3121', light: '#d9c0a0', line: '#3d1d14' },
  { id: 'planks', name: 'Wood', tier: 'block', look: 'planks', top: '#b67d45', front: '#94612f', dark: '#6b4220', light: '#d39b5c', line: '#3b2412' },
  { id: 'leaves', name: 'Leaves', tier: 'block', look: 'leaves', top: '#5f9a43', front: '#467a33', dark: '#2f5824', light: '#86c060', line: '#1d3416' },
  { id: 'sand', name: 'Sand', tier: 'block', look: 'speck', top: '#e6cf92', front: '#cdb175', dark: '#a98e57', light: '#f5e4b4', line: '#6d5a35' },
  { id: 'snow', name: 'Snow', tier: 'block', look: 'speck', top: '#f4f7fb', front: '#d4dce8', dark: '#aab7c9', light: '#ffffff', line: '#6b7a91' },
  paint('white', 'White', '#eeeae2', '#cfcac0', '#a9a397', '#ffffff', '#5b5750'),
  paint('black', 'Black', '#45464f', '#30313a', '#1f2027', '#5d5f6b', '#101015'),
  paint('red', 'Red', '#d24a3e', '#ad3328', '#7c2019', '#ec7a68', '#41100c'),
  paint('orange', 'Orange', '#e88a32', '#c56c1f', '#8f4b14', '#f6b366', '#4a260a'),
  paint('yellow', 'Yellow', '#f1cf45', '#d0ab28', '#9a7c18', '#fbe68a', '#4f3f0b'),
  paint('green', 'Green', '#58b356', '#3e923f', '#2a6a2c', '#88d47f', '#143516'),
  paint('blue', 'Blue', '#4a7fd6', '#3462b4', '#234582', '#7ea7ee', '#0f2145'),
  paint('purple', 'Purple', '#9459c8', '#7541a6', '#532c78', '#bb8be6', '#28143d'),
  paint('pink', 'Pink', '#ec8fb8', '#cf6c9a', '#9e4c71', '#f8bcd6', '#4f2236'),
  { id: 'marble', name: 'Marble', tier: 'fancy', look: 'marble', top: '#f1efe9', front: '#d9d5cb', dark: '#b2ab9c', light: '#ffffff', line: '#6f695d' },
  { id: 'gold', name: 'Gold', tier: 'fancy', look: 'gold', top: '#f2c641', front: '#d29e22', dark: '#9c6f12', light: '#fff0a6', line: '#4f3608' },
  { id: 'glass', name: 'Glass', tier: 'fancy', look: 'glass', top: 'rgba(190,226,240,0.55)', front: 'rgba(150,200,225,0.5)', dark: 'rgba(90,140,170,0.7)', light: 'rgba(255,255,255,0.9)', line: 'rgba(60,96,120,0.9)' },
  { id: 'crystal', name: 'Crystal', tier: 'fancy', look: 'glow', top: '#7fe3ef', front: '#4cc0d2', dark: '#2a8da3', light: '#d6fbff', line: '#134a57', glow: '120,230,255' },
  { id: 'lantern', name: 'Lantern block', tier: 'fancy', look: 'glow', top: '#ffd77a', front: '#f0b04a', dark: '#b97624', light: '#fff2c4', line: '#5a3510', glow: '255,200,110' },
];
export const blockById = (id: string) => BLOCKS.find((b) => b.id === id);

/**
 * A decoration from the town's art. `w` x `d`: the cells it stands on (columns, rows), from its top
 * left cell; it is drawn standing on its bottom row. `variants`: how many colors or kinds it comes in.
 */
export interface PropDef {
  id: string;
  name: string;
  tier: 'small' | 'big' | 'grand';
  w: number;
  d: number;
  variants?: string[];
  /** Shines at night (a lamp) */
  glow?: boolean;
}

const FLOWER_COLORS = ['White', 'Pink', 'Red', 'Blue', 'Purple', 'Yellow', 'Orange', 'Amber', 'Sky'];

export const PROPS: PropDef[] = [
  { id: 'flower', name: 'Flower', tier: 'small', w: 1, d: 1, variants: FLOWER_COLORS },
  { id: 'tallFlower', name: 'Tall flower', tier: 'small', w: 1, d: 1, variants: FLOWER_COLORS },
  { id: 'flowerBush', name: 'Flower bush', tier: 'small', w: 2, d: 2, variants: FLOWER_COLORS },
  { id: 'shrub', name: 'Shrub', tier: 'small', w: 2, d: 2, variants: ['Ragged', 'Lumpy', 'Round'] },
  { id: 'leafy', name: 'Leafy bush', tier: 'small', w: 2, d: 2, variants: ['Round', 'Bushy', 'Spiky', 'Star'] },
  { id: 'basket', name: 'Basket', tier: 'small', w: 2, d: 2 },
  { id: 'barrel', name: 'Barrel', tier: 'small', w: 2, d: 2 },
  { id: 'crate', name: 'Crate', tier: 'small', w: 2, d: 2 },
  { id: 'fernPot', name: 'Potted fern', tier: 'big', w: 2, d: 2 },
  { id: 'planter', name: 'Planter box', tier: 'big', w: 2, d: 2, variants: ['Fern', 'Flowers'] },
  { id: 'topiary', name: 'Topiary', tier: 'big', w: 2, d: 2 },
  { id: 'bench', name: 'Bench', tier: 'big', w: 4, d: 2 },
  { id: 'lamp', name: 'Lamp post', tier: 'big', w: 1, d: 1, glow: true },
  { id: 'pillar', name: 'Stone pillar', tier: 'big', w: 2, d: 2 },
  { id: 'statue', name: 'Statue', tier: 'grand', w: 2, d: 2 },
  { id: 'ironStatue', name: 'Iron sculpture', tier: 'grand', w: 2, d: 2 },
  { id: 'fountain', name: 'Fountain', tier: 'grand', w: 4, d: 3 },
  { id: 'tree', name: 'Young tree', tier: 'grand', w: 2, d: 2 },
];
export const propById = (id: string) => PROPS.find((p) => p.id === id);

/** A decoration on the lot: its kind and variant, its top left cell */
export interface LotProp {
  id: number;
  kind: string;
  v: number;
  c: number;
  r: number;
}

/** What stands on the lot: the blocks of each column (by cell number, bottom first) and the decorations */
export interface LotGrid {
  blocks: Record<number, string[]>;
  props: LotProp[];
}

/** The decoration standing on a cell, if any */
export function propAt(grid: LotGrid, c: number, r: number): LotProp | undefined {
  return grid.props.find((p) => {
    const def = propById(p.kind);
    return !!def && c >= p.c && c < p.c + def.w && r >= p.r && r < p.r + def.d;
  });
}

/** Something to do on the lot: put a block on a column, set a decoration down, or take the top piece of a cell away */
export type LotJob = { kind: 'block'; c: number; r: number; what: string } | { kind: 'prop'; c: number; r: number; what: string; v: number } | { kind: 'remove'; c: number; r: number };

/** Why a job cannot be done on the lot as it stands (null: it can) */
export function jobProblem(grid: LotGrid, job: LotJob): string | null {
  const inside = (c: number, r: number) => Number.isInteger(c) && Number.isInteger(r) && c >= 0 && c < LOT.cols && r >= 0 && r < LOT.rows;
  if (!inside(job.c, job.r)) return 'That is outside the lot';
  if (job.kind === 'remove') return grid.blocks[cellIndex(job.c, job.r)]?.length || propAt(grid, job.c, job.r) ? null : 'Nothing to take away there';
  if (job.kind === 'block') {
    if (!blockById(job.what)) return 'Unknown block';
    if (isGate(job.c, job.r)) return 'The gate stays free';
    if (propAt(grid, job.c, job.r)) return 'A decoration stands there';
    return (grid.blocks[cellIndex(job.c, job.r)]?.length ?? 0) >= LOT_STACK ? `Columns stop at ${LOT_STACK} blocks` : null;
  }
  const def = propById(job.what);
  if (!def) return 'Unknown decoration';
  if (!Number.isInteger(job.v) || job.v < 0 || job.v >= (def.variants?.length ?? 1)) return 'Unknown kind';
  for (let r = job.r; r < job.r + def.d; r++) {
    for (let c = job.c; c < job.c + def.w; c++) {
      if (!inside(c, r)) return 'It does not fit there';
      if (isGate(c, r)) return 'The gate stays free';
      if (grid.blocks[cellIndex(c, r)]?.length || propAt(grid, c, r)) return 'Something is in the way';
    }
  }
  return null;
}

/** Do a job on the lot (checked first with jobProblem) */
export function applyJob(grid: LotGrid, job: LotJob, nextId: () => number): void {
  const i = cellIndex(job.c, job.r);
  if (job.kind === 'block') (grid.blocks[i] ??= []).push(job.what);
  else if (job.kind === 'prop') grid.props.push({ id: nextId(), kind: job.what, v: job.v, c: job.c, r: job.r });
  else {
    const p = propAt(grid, job.c, job.r);
    if (p) grid.props = grid.props.filter((q) => q !== p);
    else {
      grid.blocks[i]?.pop();
      if (!grid.blocks[i]?.length) delete grid.blocks[i];
    }
  }
}

/** The tier a job is priced by (taking away is free) */
export function jobTier(job: LotJob): LotTier | null {
  if (job.kind === 'remove') return null;
  if (job.kind === 'block') return blockById(job.what)?.tier ?? null;
  return propById(job.what)?.tier ?? null;
}

/** The cells a job works on (a decoration: all of its cells) */
export function jobCells(job: LotJob): { c: number; r: number; w: number; d: number } {
  const def = job.kind === 'prop' ? propById(job.what) : undefined;
  return { c: job.c, r: job.r, w: def?.w ?? 1, d: def?.d ?? 1 };
}

/**
 * Where townsfolk stop to look at the lot, outside the fence, facing it: along its top fence (looking
 * down at it) and down its right side (looking left). Not by the gate, nor by the lamp above the fence.
 */
export const LOT_ADMIRE: { x: number; y: number; dir: WDir }[] = [
  ...[120, 190, 380, 520].map((x) => ({ x, y: LOT.y0 - LOT_FENCE - 16, dir: 2 as WDir })),
  ...[600, 690, 780].map((y) => ({ x: LOT.x1 + LOT_FENCE + 16, y, dir: 1 as WDir })),
];

/** A piece on its way: what the guest asked for, and what it cost them (the day's free share and their money) */
export interface LotPending {
  id: number;
  job: LotJob;
  free: number;
  paid: number;
}

/** The lot as everyone sees it */
export interface LotInfo {
  on: boolean;
  grid: LotGrid;
  prices: Record<LotTier, number>;
  /** What a guest can build for free each town day */
  freePerDay: number;
  /** How many pieces a guest can have on the way at once */
  queueMax: number;
}

/** A guest's own side of the lot: the pieces on their way and what is left of today's free share */
export interface LotMine {
  pending: LotPending[];
  freeLeft: number;
  balance: number;
}

/** The build lot's settings (part of the world's) */
export interface LotSettings {
  lot: boolean;
  /** What each guest builds for free every town day (the town's money) */
  lotFreePerDay: number;
  /** Prices by tier: a block, a fancy block, a small, big and grand decoration */
  lotBlock: number;
  lotFancy: number;
  lotSmall: number;
  lotBig: number;
  lotGrand: number;
  /** Pieces a guest can have on the way at once */
  lotQueueMax: number;
  /** How long a character kneels to put a piece up (seconds) */
  lotBuildSec: number;
  /** The chance a character picking something to do stops at the fence to look (percent) */
  lotAdmirePct: number;
  /** A new session (a new party) starts on an empty lot */
  lotClearOnNew: boolean;
}
