import { SPRITE_SCALE, SQUARE_HOUSES, WORLD, houseRow } from '$shared/crowd.ts';

/**
 * The town hall: a stone building with a clock tower in the top left corner of the square, standing
 * in front of the first house of the row and a little further down than the houses. Seen from above
 * and in front like the houses: a hipped slate roof with two chimneys and two dormers, the clock tower
 * rising through it to a pointed roof, and below the eaves the front: two arched windows in each wing,
 * two columns on each side of the door under the clock, steps down to the square. It casts its shadow
 * on the ground. The clock's hands show the town's own time (see townMinutes), and at night its face
 * and the windows light up.
 *
 * The building is drawn by hand once, one sprite pixel at a time, in sprite pixels from its top left
 * corner; the TV draws it SPRITE_SCALE world units a pixel over the square's ground, like the houses.
 * The hands are drawn every frame, over it.
 */

const S = SPRITE_SCALE;
/** The house of the row it stands in front of: the first one, in the corner */
const HOUSE = houseRow(SQUARE_HOUSES.seed, Math.ceil(WORLD.w / S))[0];
/** Where it stands and its size: from the top of the screen down past the sidewalk (the houses end at SQUARE_HOUSES.bottom) */
const X0 = Math.max(0, HOUSE.x) + 4;
const W = 200;
const H = 134;
/** The middle, where the tower stands */
const MID = W / 2;

/** Stone lit from the top left, a slate roof, the tower's lighter stone, the clock's gold and face */
const STONE = { line: '#3b3346', dark: '#857a88', mid: '#b3a594', light: '#d2c5ad', shine: '#e9dfc8' };
const TOWER = { line: '#3b3346', dark: '#8f8590', mid: '#c0b3a0', light: '#ddd1b9', shine: '#f1e8d3' };
const SLATE = { line: '#1f2130', dark: '#33364b', mid: '#474c66', light: '#5f6684' };
const GOLD = { o: '#794117', m: '#d19428', l: '#f3c35f', h: '#fdd082' };
const GLASS = { dark: '#1f2a40', mid: '#2e3f5c', light: '#5d7a9a' };
const WOOD = { line: '#2a1610', dark: '#4a2a1c', mid: '#6b3d22', light: '#85502c' };
const FACE = '#f4ecd6';

/** The roof seen from above: its back eave, its ridge (shorter than the eaves: a hipped roof) and its front eave, where the front wall begins */
const ROOF = { back: 12, ridge: 30, inset: 34, eave: 64 };
const WALL_TOP = ROOF.eave + 5;
const PLINTH = 118;
/** The tower: its walls up from the front wall through the roof, the cornice its pointed roof stands on */
const TOWER_X0 = MID - 26;
const TOWER_X1 = MID + 26;
const TOWER_TOP = 22;
/** The wings' windows: left edge and size, arched at the top */
const WIN = { y: 78, w: 16, h: 32 };
const WIN_XS = [12, 42].flatMap((x) => [x, W - x - WIN.w]);
/** The dormers on the roof's front slope: their left edges */
const DORMER_XS = [26, W - 26 - 16];
/** The clock: its middle and the radius of its face */
const CLOCK = { x: MID, y: 42, r: 13 };
/** The door under the clock, between the columns */
const DOOR = { x: MID - 10, y: 86, w: 20, bottom: 122 };

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

/** A band lit from the top (a cornice, a step, a sill): shine, body, shade, outline */
function band(g: CanvasRenderingContext2D, p: typeof STONE, x: number, y: number, w: number, h: number): void {
  px(g, p.mid, x, y, w, h);
  px(g, p.shine, x, y, w, 1);
  if (h > 2) px(g, p.dark, x, y + h - 2, w, 1);
  px(g, p.line, x, y + h - 1, w, 1);
}

/** A column with its base and capital, lit from the left */
function column(g: CanvasRenderingContext2D, x: number, top: number, bottom: number): void {
  band(g, TOWER, x - 1, top, 7, 3);
  const h = bottom - top - 6;
  px(g, TOWER.mid, x, top + 3, 5, h);
  px(g, TOWER.line, x, top + 3, 1, h);
  px(g, TOWER.shine, x + 1, top + 3, 1, h);
  px(g, TOWER.dark, x + 3, top + 3, 1, h);
  px(g, TOWER.line, x + 4, top + 3, 1, h);
  band(g, TOWER, x - 1, bottom - 3, 7, 3);
}

/** An arched window: a stone surround with a keystone, dark glass with glazing bars and a gleam, a sill */
function archWindow(g: CanvasRenderingContext2D, x: number): void {
  const { y, w, h } = WIN;
  const r = w / 2;
  disc(g, STONE.light, x + r - 0.5, y + r, r + 1.5);
  px(g, STONE.light, x - 2, y + r, w + 4, h - r);
  px(g, STONE.line, x - 2, y + r, 1, h - r);
  disc(g, GLASS.mid, x + r - 0.5, y + r, r - 0.5);
  px(g, GLASS.mid, x, y + r, w, h - r);
  px(g, GLASS.dark, x, y + r, 2, h - r);
  px(g, GLASS.light, x + 3, y + r + 2, 1, 8);
  px(g, GLASS.light, x + 4, y + r + 1, 1, 3);
  px(g, STONE.dark, x + r - 1, y + 1, 1, h - 1);
  px(g, STONE.dark, x, y + r + 7, w, 1);
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
    const long = k % 3 === 0 ? 3 : 1;
    for (let d = r - 3 - long + 1; d <= r - 3; d++) px(g, '#3a2c34', Math.round(x + Math.sin(a) * d), Math.round(y - Math.cos(a) * d));
  }
}

/** The tower's pointed roof: slate rows narrowing up to a gold finial, lit on its left side */
function spire(g: CanvasRenderingContext2D): void {
  const full = TOWER_X1 - TOWER_X0 + 6;
  for (let y = 4; y < TOWER_TOP - 3; y++) {
    const t = (y - 4) / (TOWER_TOP - 7);
    const w = Math.round(3 + (full / 2 - 3) * t) * 2;
    const x = Math.round(MID - w / 2);
    px(g, (y - 4) % 3 === 2 ? SLATE.dark : SLATE.mid, x, y, w, 1);
    px(g, SLATE.light, x, y, Math.max(1, Math.round(w * 0.35)), 1);
    px(g, SLATE.line, x, y, 1, 1);
    px(g, SLATE.line, x + w - 1, y, 1, 1);
  }
  px(g, GOLD.o, MID - 1, 0, 2, 5);
  px(g, GOLD.l, MID - 1, 0, 1, 4);
  px(g, GOLD.m, MID - 2, 1, 4, 1);
}

/**
 * The hipped roof seen from above: the back slope (foreshortened, catching the light) from the back
 * eave up to the ridge, the front slope from the ridge down to the front eave, and a triangle at
 * each end (the left one lit, the right one in shade). Rows of slates across, a light ridge cap.
 */
function roof(g: CanvasRenderingContext2D): void {
  const { back, ridge, inset, eave } = ROOF;
  for (let y = back; y < eave; y++) {
    // How far in from each side the end slopes reach at this height
    const side = y < ridge ? Math.round((inset * (y - back)) / (ridge - back)) : Math.round((inset * (eave - y)) / (eave - ridge));
    const front = y >= ridge;
    const row = front ? (eave - y) % 5 === 0 : (y - back) % 4 === 0;
    px(g, front ? (row ? SLATE.dark : SLATE.mid) : row ? SLATE.mid : SLATE.light, side, y, W - 2 * side, 1);
    px(g, row ? SLATE.mid : SLATE.light, 0, y, side, 1);
    px(g, row ? SLATE.line : SLATE.dark, W - side, y, side, 1);
    // The hip lines from the ridge's ends down to the corners
    px(g, SLATE.line, side, y, 1, 1);
    px(g, SLATE.line, W - side - 1, y, 1, 1);
  }
  px(g, SLATE.line, 0, back - 1, W, 1);
  px(g, '#8a90aa', inset, ridge - 1, W - 2 * inset, 2);
  px(g, SLATE.line, inset, ridge + 1, W - 2 * inset, 1);
  // The gutter along the front eave
  px(g, SLATE.line, 0, eave, W, 1);
  px(g, SLATE.dark, 0, eave + 1, W, 1);
}

/** A chimney on the roof: stone, a cap, its shadow on the slates */
function chimney(g: CanvasRenderingContext2D, x: number, top: number): void {
  px(g, 'rgba(10,10,20,0.35)', x + 6, top + 4, 4, 12);
  px(g, STONE.mid, x, top + 2, 7, 12);
  px(g, STONE.shine, x + 1, top + 2, 1, 12);
  px(g, STONE.dark, x + 5, top + 2, 1, 12);
  px(g, STONE.line, x - 1, top + 13, 9, 1);
  band(g, STONE, x - 1, top, 9, 3);
  px(g, '#2a2430', x + 2, top, 3, 1);
}

/** A dormer on the front slope: a little gable roof over a small window */
function dormer(g: CanvasRenderingContext2D, x: number): void {
  const y = ROOF.ridge + 12;
  px(g, 'rgba(10,10,20,0.3)', x + 16, y + 2, 3, 15);
  px(g, STONE.mid, x, y + 6, 16, 12);
  px(g, STONE.line, x, y + 6, 1, 12);
  px(g, STONE.line, x + 15, y + 6, 1, 12);
  px(g, STONE.line, x, y + 17, 16, 1);
  px(g, STONE.light, x + 3, y + 8, 10, 8);
  px(g, GLASS.mid, x + 4, y + 9, 8, 7);
  px(g, GLASS.light, x + 5, y + 10, 1, 3);
  px(g, STONE.dark, x + 7, y + 9, 1, 7);
  for (let k = 0; k < 8; k++) {
    px(g, k % 3 === 2 ? SLATE.dark : SLATE.mid, x + 8 - k - 1, y + k, (k + 1) * 2, 1);
    px(g, SLATE.line, x + 8 - k - 1, y + k, 1, 1);
    px(g, SLATE.line, x + 8 + k, y + k, 1, 1);
  }
}

function build(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  roof(g);
  chimney(g, 30, ROOF.back + 2);
  chimney(g, W - 37, ROOF.back + 2);
  for (const x of DORMER_XS) dormer(g, x);
  // The front: a cornice with dentils under the eaves, the stone wall, a plinth and the base
  band(g, STONE, 0, WALL_TOP - 4, W, 4);
  for (let x = 1; x < W; x += 4) px(g, STONE.dark, x, WALL_TOP - 2, 2, 1);
  wall(g, STONE, 0, WALL_TOP, W, PLINTH);
  px(g, STONE.line, 0, WALL_TOP - 4, 1, H - WALL_TOP + 4);
  px(g, STONE.line, W - 1, WALL_TOP - 4, 1, H - WALL_TOP + 4);
  band(g, STONE, 0, PLINTH, W, 5);
  px(g, STONE.dark, 0, PLINTH + 5, W, 5);
  px(g, STONE.line, 0, PLINTH + 10, W, 1);
  for (const x of WIN_XS) archWindow(g, x);
  // The tower: lighter stone up through the roof, quoins on its corners, its shadow on the roof and
  // the right wing, its pointed roof on a cornice
  px(g, 'rgba(10,10,20,0.3)', TOWER_X1 + 1, TOWER_TOP + 4, 6, ROOF.eave - TOWER_TOP - 4);
  px(g, 'rgba(20,10,20,0.22)', TOWER_X1 + 1, WALL_TOP, 3, PLINTH - WALL_TOP);
  wall(g, TOWER, TOWER_X0, TOWER_TOP, TOWER_X1, PLINTH);
  for (let y = TOWER_TOP; y < PLINTH; y += 8) {
    const long = ((y - TOWER_TOP) / 8) % 2 ? 5 : 8;
    px(g, TOWER.shine, TOWER_X0, y, long, 7);
    px(g, TOWER.light, TOWER_X1 - long, y, long, 7);
    px(g, TOWER.dark, TOWER_X0, y + 7, long, 1);
    px(g, TOWER.dark, TOWER_X1 - long, y + 7, long, 1);
  }
  px(g, TOWER.line, TOWER_X0 - 1, TOWER_TOP, 1, PLINTH - TOWER_TOP);
  px(g, TOWER.line, TOWER_X1, TOWER_TOP, 1, PLINTH - TOWER_TOP);
  // Where the tower comes out of the roof: a band of lead flashing
  px(g, SLATE.line, TOWER_X0 - 2, ROOF.eave - 1, TOWER_X1 - TOWER_X0 + 4, 1);
  spire(g);
  band(g, TOWER, TOWER_X0 - 3, TOWER_TOP - 3, TOWER_X1 - TOWER_X0 + 6, 5);
  clockFace(g);
  // The portico: a lintel on two pairs of columns, the arched door between them
  const lintel = DOOR.y - 8;
  band(g, TOWER, DOOR.x - 14, lintel, DOOR.w + 28, 5);
  px(g, GOLD.m, MID - 5, lintel + 1, 10, 2);
  px(g, GOLD.l, MID - 5, lintel + 1, 10, 1);
  for (const x of [DOOR.x - 13, DOOR.x - 7, DOOR.x + DOOR.w + 2, DOOR.x + DOOR.w + 8]) column(g, x, lintel + 5, DOOR.bottom);
  const r = DOOR.w / 2;
  disc(g, TOWER.line, DOOR.x + r - 0.5, DOOR.y + r, r + 1);
  px(g, TOWER.line, DOOR.x - 1, DOOR.y + r, DOOR.w + 2, DOOR.bottom - DOOR.y - r);
  disc(g, WOOD.mid, DOOR.x + r - 0.5, DOOR.y + r, r - 1);
  px(g, WOOD.mid, DOOR.x, DOOR.y + r, DOOR.w, DOOR.bottom - DOOR.y - r);
  px(g, WOOD.line, MID - 1, DOOR.y + 1, 1, DOOR.bottom - DOOR.y - 1);
  for (const x of [DOOR.x + 2, MID + 2]) {
    px(g, WOOD.dark, x, DOOR.y + r + 1, 6, 9);
    px(g, WOOD.light, x + 1, DOOR.y + r + 2, 5, 8);
    px(g, WOOD.dark, x, DOOR.y + r + 13, 6, 9);
    px(g, WOOD.light, x + 1, DOOR.y + r + 14, 5, 8);
  }
  px(g, GOLD.l, MID - 3, DOOR.y + r + 11, 1, 2);
  px(g, GOLD.l, MID + 1, DOOR.y + r + 11, 1, 2);
  // Steps down to the square, each wider than the one above
  band(g, STONE, DOOR.x - 18, DOOR.bottom, DOOR.w + 36, 4);
  band(g, STONE, DOOR.x - 22, DOOR.bottom + 4, DOOR.w + 44, 4);
  band(g, STONE, DOOR.x - 26, DOOR.bottom + 8, DOOR.w + 52, 4);
  return c;
}

let built: HTMLCanvasElement | null = null;

/** Draw the building over the square's ground and its row of houses (world units), with its shadow on the ground to the right */
export function drawTownHall(g: CanvasRenderingContext2D): void {
  g.fillStyle = 'rgba(10,10,25,0.28)';
  g.fillRect((X0 + W) * S, (ROOF.back + 4) * S, 6 * S, (PLINTH + 10 - ROOF.back - 4) * S);
  g.drawImage((built ??= build()), X0 * S, 0, W * S, H * S);
}

/** The building's left and right edges (world units): the sidewalk's plants and benches stay clear of it */
export const TOWN_HALL_SPAN = { x0: X0 * S, x1: (X0 + W) * S };

/** World position of a sprite pixel of the building */
const world = (x: number, y: number) => ({ x: (X0 + x) * S, y: y * S });

/** At night: the windows glow warm, and the clock's face is lit from behind */
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
  hand((minute % 720) / 720, r * 0.55, 2.4);
  hand((minute % 60) / 60, r * 0.85, 1.6);
  g.fillStyle = GOLD.m;
  g.beginPath();
  g.arc(c.x, c.y, 1.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
