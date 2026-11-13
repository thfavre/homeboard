import { SPRITE_SCALE, SQUARE_HOUSES, WORLD, houseRow } from '$shared/crowd.ts';
import type { HouseSwap } from '../games/crowd/scene.ts';

/**
 * The town hall: a stone building with a clock tower, standing in the row of houses along the top
 * of the square, left of the clothes shop, in place of two of its houses. Arched windows in both
 * wings, two columns on each side of the door under the clock, steps up to it. The clock's hands
 * show the town's own time (see townMinutes), and at night its face and the windows light up.
 *
 * The building is drawn by hand once, one sprite pixel at a time, in sprite pixels from its top
 * left corner (y down to its bottom on the row's line); the TV draws it SPRITE_SCALE world units a
 * pixel, like the houses. The hands are drawn every frame, over it.
 */

const S = SPRITE_SCALE;
/** The two houses it stands in place of: the first left of the middle of the square, and the one after it */
const ROW = houseRow(SQUARE_HOUSES.seed, Math.ceil(WORLD.w / S));
const FIRST = ROW.findIndex((h) => (h.x + h.w) * S > 300);
const LEFT = ROW[FIRST];
const RIGHT = ROW[FIRST + 1];
/** Its size: from the first house's left edge to the second's right edge, as tall as the tallest house art (the top is off the screen) */
const W = RIGHT.x + RIGHT.w - LEFT.x;
const H = 160;
/** The middle, where the tower stands */
const MID = Math.round(W / 2);

/** Stone lit from the top left, a slate roof, the tower's lighter stone, the clock's gold and face */
const STONE = { line: '#3b3346', dark: '#857a88', mid: '#b3a594', light: '#d2c5ad', shine: '#e9dfc8' };
const TOWER = { line: '#3b3346', dark: '#8f8590', mid: '#c0b3a0', light: '#ddd1b9', shine: '#f1e8d3' };
const SLATE = { line: '#1f2130', dark: '#33364b', mid: '#474c66', light: '#5f6684' };
const GOLD = { o: '#794117', m: '#d19428', l: '#f3c35f', h: '#fdd082' };
const GLASS = { dark: '#1f2a40', mid: '#2e3f5c', light: '#5d7a9a' };
const WOOD = { line: '#2a1610', dark: '#4a2a1c', mid: '#6b3d22', light: '#85502c' };
const FACE = '#f4ecd6';

/** The wings' windows: left edge and size (sprite pixels of the building), arched at the top */
const WIN = { y: 94, w: 18, h: 38 };
const WIN_XS = [14, 47, 80].flatMap((x) => [x, W - x - WIN.w]);
/** The clock: its middle and the radius of its face */
const CLOCK = { x: MID, y: 93, r: 16 };
/** The tower, the door under the clock */
const TOWER_X0 = MID - 37;
const TOWER_X1 = MID + 37;
const DOOR = { x: MID - 14, y: 122, w: 28, bottom: 150 };

function px(g: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1): void {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

/** A filled disc, pixel by pixel */
function disc(g: CanvasRenderingContext2D, color: string, cx: number, cy: number, r: number): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y + r * 0.8));
    px(g, color, cx - half, cy + y, half * 2 + 1, 1);
  }
}

/** Stone wall: its color, a course every 8 pixels and joints staggered from one course to the next */
function wall(g: CanvasRenderingContext2D, p: typeof STONE, x0: number, y0: number, x1: number, y1: number): void {
  px(g, p.mid, x0, y0, x1 - x0, y1 - y0);
  for (let y = y0 + 7; y < y1; y += 8) {
    px(g, p.dark, x0, y, x1 - x0, 1);
    px(g, p.light, x0, y + 1, x1 - x0, 1);
    const shift = ((y - y0) / 8) % 2 ? 8 : 0;
    for (let x = x0 + shift; x < x1; x += 16) px(g, p.dark, x, y - 7, 1, 7);
  }
}

/** A band lit from the top (a cornice, a step, a sill): outline, shine, body, shade */
function band(g: CanvasRenderingContext2D, p: typeof STONE, x: number, y: number, w: number, h: number): void {
  px(g, p.mid, x, y, w, h);
  px(g, p.shine, x, y, w, 1);
  if (h > 2) px(g, p.dark, x, y + h - 2, w, 1);
  px(g, p.line, x, y + h - 1, w, 1);
}

/** A column with its base and capital, lit from the left */
function column(g: CanvasRenderingContext2D, x: number, top: number, bottom: number): void {
  band(g, TOWER, x - 1, top, 8, 3);
  px(g, TOWER.mid, x, top + 3, 6, bottom - top - 6);
  px(g, TOWER.line, x, top + 3, 1, bottom - top - 6);
  px(g, TOWER.shine, x + 1, top + 3, 1, bottom - top - 6);
  px(g, TOWER.light, x + 2, top + 3, 1, bottom - top - 6);
  px(g, TOWER.dark, x + 4, top + 3, 1, bottom - top - 6);
  px(g, TOWER.line, x + 5, top + 3, 1, bottom - top - 6);
  band(g, TOWER, x - 1, bottom - 3, 8, 3);
}

/** An arched window: a stone surround with a keystone, dark glass with a cross of glazing bars and a gleam, a sill */
function archWindow(g: CanvasRenderingContext2D, x: number): void {
  const { y, w, h } = WIN;
  const r = w / 2;
  // The surround, a little wider than the opening
  disc(g, STONE.light, x + r - 0.5, y + r, r + 1.5);
  px(g, STONE.light, x - 2, y + r, w + 4, h - r);
  px(g, STONE.line, x - 2, y + r, 1, h - r);
  // The glass
  disc(g, GLASS.mid, x + r - 0.5, y + r, r - 0.5);
  px(g, GLASS.mid, x, y + r, w, h - r);
  px(g, GLASS.dark, x, y + r, 2, h - r);
  px(g, GLASS.light, x + 3, y + r + 2, 1, 10);
  px(g, GLASS.light, x + 4, y + r + 1, 1, 4);
  // Glazing bars
  px(g, STONE.dark, x + r - 1, y + 1, 1, h - 1);
  px(g, STONE.dark, x, y + r + 8, w, 1);
  // The keystone and the sill
  px(g, STONE.shine, x + r - 3, y - 3, 5, 5);
  px(g, STONE.dark, x + r - 3, y + 1, 5, 1);
  band(g, STONE, x - 3, y + h, w + 6, 3);
  px(g, 'rgba(20,10,20,0.3)', x - 2, y + h + 3, w + 5, 2);
}

/** The clock's face: a stone roundel, a gold ring, the hour marks (the four quarters longer) */
function clockFace(g: CanvasRenderingContext2D): void {
  const { x, y, r } = CLOCK;
  disc(g, TOWER.line, x, y, r + 4);
  disc(g, TOWER.shine, x, y, r + 3);
  disc(g, GOLD.o, x, y, r + 1);
  disc(g, GOLD.m, x, y, r);
  disc(g, FACE, x, y, r - 2);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const long = k % 3 === 0 ? 4 : 2;
    for (let d = r - 3 - long + 1; d <= r - 3; d++) px(g, '#3a2c34', Math.round(x + Math.sin(a) * d), Math.round(y - Math.cos(a) * d));
  }
}

function build(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // The wings: a slate roof (mostly off the screen), a cornice with dentils, the stone wall and a darker plinth
  px(g, SLATE.mid, 0, 40, W, 32);
  for (let y = 44; y < 72; y += 5) px(g, SLATE.dark, 0, y, W, 1);
  px(g, SLATE.light, 0, 70, W, 1);
  band(g, STONE, 0, 72, W, 6);
  for (let x = 1; x < W; x += 4) px(g, STONE.dark, x, 76, 2, 1);
  wall(g, STONE, 0, 78, W, 142);
  band(g, STONE, 0, 142, W, 8);
  px(g, STONE.dark, 0, 150, W, 10);
  px(g, STONE.line, 0, 150, W, 1);
  for (const x of WIN_XS) archWindow(g, x);
  // The tower: lighter stone up off the screen, quoins on its corners, its shadow on the right wing
  wall(g, TOWER, TOWER_X0, 0, TOWER_X1, 150);
  for (let y = 0; y < 150; y += 8) {
    const long = (y / 8) % 2 ? 6 : 9;
    px(g, TOWER.shine, TOWER_X0, y, long, 7);
    px(g, TOWER.light, TOWER_X1 - long, y, long, 7);
    px(g, TOWER.dark, TOWER_X0, y + 7, long, 1);
    px(g, TOWER.dark, TOWER_X1 - long, y + 7, long, 1);
  }
  px(g, TOWER.line, TOWER_X0 - 1, 0, 1, 150);
  px(g, TOWER.line, TOWER_X1, 0, 1, 150);
  px(g, 'rgba(20,10,20,0.28)', TOWER_X1 + 1, 72, 4, 78);
  band(g, TOWER, TOWER_X0 - 3, 68, TOWER_X1 - TOWER_X0 + 6, 5);
  clockFace(g);
  // The portico: a lintel on two pairs of columns, the arched door between them, steps up to it
  band(g, TOWER, DOOR.x - 20, 114, DOOR.w + 40, 5);
  px(g, GOLD.m, MID - 6, 115, 12, 2);
  px(g, GOLD.l, MID - 6, 115, 12, 1);
  for (const x of [DOOR.x - 18, DOOR.x - 10, DOOR.x + DOOR.w + 4, DOOR.x + DOOR.w + 12]) column(g, x, 119, 150);
  const r = DOOR.w / 2;
  disc(g, TOWER.line, DOOR.x + r - 0.5, DOOR.y + r, r + 1);
  px(g, TOWER.line, DOOR.x - 1, DOOR.y + r, DOOR.w + 2, DOOR.bottom - DOOR.y - r);
  disc(g, WOOD.mid, DOOR.x + r - 0.5, DOOR.y + r, r - 1);
  px(g, WOOD.mid, DOOR.x, DOOR.y + r, DOOR.w, DOOR.bottom - DOOR.y - r);
  px(g, WOOD.line, MID - 1, DOOR.y + 1, 1, DOOR.bottom - DOOR.y - 1);
  for (const x of [DOOR.x + 3, MID + 2]) {
    px(g, WOOD.dark, x, DOOR.y + r + 1, 9, 9);
    px(g, WOOD.light, x + 1, DOOR.y + r + 2, 8, 8);
    px(g, WOOD.dark, x, DOOR.y + r + 13, 9, 9);
    px(g, WOOD.light, x + 1, DOOR.y + r + 14, 8, 8);
  }
  px(g, GOLD.l, MID - 4, DOOR.y + r + 11, 2, 2);
  px(g, GOLD.l, MID + 2, DOOR.y + r + 11, 2, 2);
  band(g, STONE, DOOR.x - 24, 150, DOOR.w + 48, 4);
  band(g, STONE, DOOR.x - 28, 154, DOOR.w + 56, 3);
  band(g, STONE, DOOR.x - 32, 157, DOOR.w + 64, 3);
  return c;
}

let built: HTMLCanvasElement | null = null;
const empty = (() => {
  let e: HTMLCanvasElement | null = null;
  return () => (e ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }));
})();

/** The row of houses with the town hall in place of its two houses (and whatever else `inner` builds) */
export function townHallSwap(inner?: HouseSwap): HouseSwap {
  return (kind, x) => {
    if (x === LEFT.x) return (built ??= build());
    if (x === RIGHT.x) return empty();
    return inner?.(kind, x) ?? null;
  };
}

/** World position of a sprite pixel of the building */
const world = (x: number, y: number) => ({ x: (LEFT.x + x) * S, y: (SQUARE_HOUSES.bottom - H + y) * S });

/** At night: the windows and the door's fanlight glow warm, and the clock's face is lit from behind */
export function drawTownHallLight(g: CanvasRenderingContext2D, dark: number): void {
  if (dark <= 0.02) return;
  for (const x of WIN_XS) {
    const a = world(x, WIN.y);
    const r = (WIN.w / 2) * S;
    const h = WIN.h * S;
    // A soft halo on the stone around it, then the glass, warmer at the bottom where the lamps inside are
    const halo = g.createRadialGradient(a.x + r, a.y + h * 0.55, 0, a.x + r, a.y + h * 0.55, h * 0.8);
    halo.addColorStop(0, `rgba(255,200,120,${0.18 * dark})`);
    halo.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = halo;
    g.fillRect(a.x - h, a.y - h * 0.3, r * 2 + h * 2, h * 1.7);
    const glass = g.createLinearGradient(0, a.y, 0, a.y + h);
    glass.addColorStop(0, `rgba(255,214,140,${0.45 * dark})`);
    glass.addColorStop(1, `rgba(255,190,100,${0.7 * dark})`);
    g.fillStyle = glass;
    g.beginPath();
    g.arc(a.x + r, a.y + r, r, Math.PI, 0);
    g.rect(a.x, a.y + r, WIN.w * S, h - r);
    g.fill();
  }
  const c = world(CLOCK.x, CLOCK.y);
  const glow = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, CLOCK.r * S * 2.2);
  glow.addColorStop(0, `rgba(255,236,190,${0.5 * dark})`);
  glow.addColorStop(0.45, `rgba(255,226,170,${0.35 * dark})`);
  glow.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(c.x, c.y, CLOCK.r * S * 2.2, 0, Math.PI * 2);
  g.fill();
}

/** The clock's hands at a minute of the day: the hour hand once round every 12 hours, the minute hand every hour */
export function drawTownHallClock(g: CanvasRenderingContext2D, minute: number): void {
  const c = world(CLOCK.x, CLOCK.y);
  const r = (CLOCK.r - 2) * S;
  const hand = (turn: number, length: number, width: number) => {
    const a = turn * Math.PI * 2;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(c.x - Math.sin(a) * length * 0.18, c.y + Math.cos(a) * length * 0.18);
    g.lineTo(c.x + Math.sin(a) * length, c.y - Math.cos(a) * length);
    g.stroke();
  };
  g.save();
  g.strokeStyle = '#2a1f2c';
  g.lineCap = 'round';
  hand((minute % 720) / 720, r * 0.55, 2.6);
  hand((minute % 60) / 60, r * 0.85, 1.7);
  g.fillStyle = GOLD.m;
  g.beginPath();
  g.arc(c.x, c.y, 1.8, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
