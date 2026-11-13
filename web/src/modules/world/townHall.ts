import { SPRITE_SCALE } from '$shared/crowd.ts';
import { TOWN_HALL } from '$shared/world.ts';

/**
 * The town hall: a stone building with a clock tower in the top left corner of the square, standing
 * over the first two houses of the row (it hides them whole), from the top of the screen down onto the
 * square. Seen from above and in front like the houses, and drawn at their scale (their doors are 32
 * pixels wide, their walls about 85 high), but twice as tall: a hipped slate roof with four chimneys
 * and six dormers, the clock tower rising through it to a pointed roof with gold pinnacles on its
 * corners, and below the eaves a front of two floors: in each wing three windows with flower boxes
 * over three tall arched ones, stones on the corners. In the middle the tower's bay comes down to the
 * ground: a tall window between two banners opening onto a balcony, the balcony on a portico of four
 * columns around the double door and its fanlight, a lantern on each side, steps down to the square.
 * It casts its shadow on the ground. The clock's hands show the town's own time (see townMinutes),
 * and at night its face, the windows and the lanterns light up.
 *
 * The building is drawn by hand once, one sprite pixel at a time, in sprite pixels from its top left
 * corner; the TV draws it SPRITE_SCALE world units a pixel over the square's ground, like the houses.
 * The hands are drawn every frame, over it. Characters do not walk over it (see TOWN_OBSTACLES).
 */

const S = SPRITE_SCALE;
/** Where it stands and its size (sprite pixels) */
const X0 = TOWN_HALL.x;
const W = TOWN_HALL.w;
const H = TOWN_HALL.h;
/** The middle, where the tower stands */
const MID = W / 2;

/** Stone lit from the top left, a slate roof, the tower's lighter stone, the clock's gold and face */
const STONE = { line: '#3b3346', dark: '#857a88', mid: '#b3a594', light: '#d2c5ad', shine: '#e9dfc8' };
const TOWER = { line: '#3b3346', dark: '#8f8590', mid: '#c0b3a0', light: '#ddd1b9', shine: '#f1e8d3' };
const SLATE = { line: '#1f2130', dark: '#33364b', mid: '#474c66', light: '#5f6684' };
const GOLD = { o: '#794117', m: '#d19428', l: '#f3c35f', h: '#fdd082' };
const GLASS = { dark: '#1f2a40', mid: '#2e3f5c', light: '#5d7a9a' };
const WOOD = { line: '#2a1610', dark: '#4a2a1c', mid: '#6b3d22', light: '#85502c' };
/** The light painted frames of the windows, like the houses' */
const FRAME = { mid: '#e6e0d0', dark: '#a39c90' };
const FACE = '#f4ecd6';

/** The roof seen from above: its back eave (the top of the screen), its ridge (shorter than the eaves: a hipped roof) and its front eave, where the front wall begins */
const ROOF = { back: 0, ridge: 18, inset: 40, eave: 56 };
const WALL_TOP = ROOF.eave + 5;
/** The bottom of the front wall, where the plinth begins (the plinth ends 10 pixels lower, the steps 24) */
const PLINTH = H - 24;
/** The band of stone between the two floors */
const STRING = 124;
/** The tower: its walls up from the front wall through the roof, the cornice its pointed roof stands on */
const TOWER_X0 = MID - 32;
const TOWER_X1 = MID + 32;
const TOWER_TOP = 20;
/** The ground floor's tall windows: left edge and size, arched at the top */
const WIN = { y: 140, w: 26, h: 46 };
const WIN_XS = [14, 54, 94].flatMap((x) => [x, W - x - WIN.w]);
/** The upper floor's windows over them, each on a flower box */
const UPPER = { y: 76, w: 22, h: 34 };
/** The tower's tall window onto the balcony, arched like the ground floor's */
const FRENCH = { x: MID - 12, y: 72, w: 24, h: 45 };
/** The dormers on the roof's front slope and the chimneys on its back slope: their left edges */
const DORMER_XS = [44, 84, 124].flatMap((x) => [x, W - x - 16]);
const CHIMNEY_XS = [34, 112].flatMap((x) => [x, W - x - 7]);
/** The clock: its middle and the radius of its face */
const CLOCK = { x: MID, y: 40, r: 13 };
/** The double door under the balcony, between the columns: the top of its arched fanlight, where the leaves begin, its bottom */
const DOOR = { x: MID - 20, y: 138, w: 40, leaves: 158, bottom: PLINTH };
/** The portico's lintel on the columns, the height of the balcony's balustrade on it, and the portico's edges */
const LINTEL = DOOR.y - 10;
const BALUSTRADE = 11;
const PORTICO = { x0: DOOR.x - 18, x1: DOOR.x + DOOR.w + 18 };
/** The lanterns on the wall each side of the portico: their left edges, and their top */
const LANTERN_XS = [PORTICO.x0 - 9, PORTICO.x1 + 3];
const LANTERN_Y = 146;
/** The banners' red, the flowers in the boxes and their leaves */
const BANNER = { dark: '#5e1a22', mid: '#9b2a32', light: '#c2434a' };
const FLOWERS = ['#d9475a', '#f08aa0', '#f3c35f'];
const LEAVES = { dark: '#2f5a2c', mid: '#4b8a3c' };

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

/** The top half of a disc, pixel by pixel (an arch), its flat side on `cy` */
function arch(g: CanvasRenderingContext2D, color: string, cx: number, cy: number, r: number): void {
  for (let y = -r; y <= 0; y++) {
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

/** Quoins: big stones on a corner, long and short in turn, from y0 to y1; `left`: the corner's wall goes off to the right */
function quoins(g: CanvasRenderingContext2D, p: typeof STONE, x: number, y0: number, y1: number, left: boolean): void {
  for (let y = y0, k = 0; y < y1; y += 8, k++) {
    const long = k % 2 ? 7 : 11;
    const h = Math.min(7, y1 - y);
    const x0 = left ? x : x - long;
    px(g, left ? p.shine : p.light, x0, y, long, h);
    px(g, p.dark, x0, y + h, long, 1);
    px(g, p.line, left ? x0 + long : x0 - 1, y, 1, h);
  }
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

/**
 * A tall arched window: a stone surround with a keystone, a light painted frame, dark glass in six
 * panes and an arched top light, a gleam, a sill and its shadow
 */
function archWindow(g: CanvasRenderingContext2D, x: number, { y, w, h } = WIN): void {
  const r = w / 2;
  const cx = x + r - 0.5;
  // The stone surround, then the frame, then the glass inside it
  arch(g, STONE.line, cx, y + r, r + 3);
  px(g, STONE.line, x - 3, y + r, w + 6, h - r);
  arch(g, STONE.light, cx, y + r, r + 2);
  px(g, STONE.light, x - 2, y + r, w + 4, h - r);
  arch(g, FRAME.mid, cx, y + r, r);
  px(g, FRAME.mid, x, y + r, w, h - r);
  arch(g, GLASS.mid, cx, y + r, r - 2);
  px(g, GLASS.mid, x + 2, y + r, w - 4, h - r - 2);
  px(g, GLASS.dark, x + 2, y + r, 2, h - r - 2);
  // Glazing bars: the transom under the top light, a mullion, two bars across
  px(g, FRAME.mid, x, y + r, w, 2);
  px(g, FRAME.mid, x + r - 1, y + 3, 2, h - 3);
  for (const k of [12, 23]) px(g, FRAME.mid, x + 2, y + r + k, w - 4, 1);
  px(g, FRAME.dark, x + 2, y + r + 2, w - 4, 1);
  // A gleam on the left panes
  px(g, GLASS.light, x + 5, y + r + 4, 1, 6);
  px(g, GLASS.light, x + 6, y + r + 4, 1, 2);
  px(g, GLASS.light, x + 5, y + r + 15, 1, 4);
  // The keystone over the arch
  px(g, STONE.shine, x + r - 3, y - 4, 6, 5);
  px(g, STONE.line, x + r - 3, y + 1, 6, 1);
  px(g, STONE.dark, x + r + 2, y - 4, 1, 5);
  band(g, STONE, x - 4, y + h, w + 8, 4);
  px(g, 'rgba(20,10,20,0.3)', x - 3, y + h + 4, w + 7, 2);
}

/** An upper floor window: a stone surround under a cornice with a keystone, a frame with six panes, a sill and a flower box */
function upperWindow(g: CanvasRenderingContext2D, x: number): void {
  const { y, w, h } = UPPER;
  px(g, STONE.line, x - 2, y - 2, w + 4, h + 2);
  px(g, STONE.light, x - 1, y - 1, w + 2, h + 1);
  px(g, FRAME.mid, x, y, w, h);
  px(g, GLASS.mid, x + 2, y + 2, w - 4, h - 4);
  px(g, GLASS.dark, x + 2, y + 2, 2, h - 4);
  px(g, FRAME.mid, x + w / 2 - 1, y, 2, h);
  for (const k of [11, 22]) px(g, FRAME.mid, x + 2, y + k, w - 4, 1);
  px(g, FRAME.dark, x + 2, y + 2, w - 4, 1);
  px(g, GLASS.light, x + 5, y + 4, 1, 5);
  px(g, GLASS.light, x + 5, y + 14, 1, 3);
  // The cornice over it with its keystone, and its shadow on the wall
  px(g, 'rgba(20,10,20,0.3)', x - 3, y - 3, w + 7, 2);
  band(g, STONE, x - 4, y - 7, w + 8, 4);
  px(g, STONE.shine, x + w / 2 - 3, y - 4, 6, 4);
  px(g, STONE.line, x + w / 2 - 3, y, 6, 1);
  band(g, STONE, x - 3, y + h, w + 6, 3);
  flowerBox(g, x - 1, y + h + 3, w + 2);
}

/** A box of flowers under a sill: leaves and blooms over a wooden front, a few leaves hanging down it */
function flowerBox(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  px(g, 'rgba(20,10,20,0.3)', x + 1, y + 7, w, 2);
  px(g, WOOD.line, x, y + 1, w, 6);
  px(g, WOOD.mid, x + 1, y + 2, w - 2, 4);
  px(g, WOOD.light, x + 1, y + 2, w - 2, 1);
  for (let k = 0; k < w; k += 2) {
    const up = (k * 7) % 3;
    px(g, k % 4 ? LEAVES.mid : LEAVES.dark, x + k, y - 1 - up, 2, 2 + up);
  }
  for (const k of [2, 9, w - 5]) px(g, LEAVES.dark, x + k, y + 2, 1, 3);
  for (let k = 1, n = 0; k < w - 1; k += 3, n++) px(g, FLOWERS[n % FLOWERS.length], x + k, y - 2 - ((k * 5) % 3), 2, 2);
}

/** A banner hanging from a gold rod: red cloth with a gold stripe down each side, a gold disc, a forked bottom */
function banner(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  px(g, 'rgba(20,10,20,0.3)', x + 2, y + 2, w, h - 2);
  px(g, BANNER.mid, x, y + 1, w, h - 3);
  px(g, BANNER.light, x, y + 1, 2, h - 3);
  px(g, BANNER.dark, x + w - 2, y + 1, 2, h - 3);
  px(g, GOLD.m, x + 2, y + 1, 1, h - 5);
  px(g, GOLD.m, x + w - 3, y + 1, 1, h - 5);
  // The forked bottom: two points with a notch between them
  for (let k = 0; k < 3; k++) {
    px(g, BANNER.mid, x + k, y + h - 2 + k, w / 2 - 2 * k, 1);
    px(g, BANNER.dark, x + w / 2 + k, y + h - 2 + k, w / 2 - 2 * k, 1);
  }
  disc(g, GOLD.o, x + w / 2 - 0.5, y + h / 2 - 2, 2);
  px(g, GOLD.l, x + w / 2 - 1, y + h / 2 - 3, 2, 1);
  px(g, GOLD.o, x - 2, y, w + 4, 2);
  px(g, GOLD.l, x - 2, y, w + 4, 1);
}

/** A lantern on the wall: an iron cap and frame round warm glass, a short stem under it */
function lantern(g: CanvasRenderingContext2D, x: number, y: number): void {
  px(g, 'rgba(20,10,20,0.3)', x + 3, y + 3, 6, 14);
  px(g, WOOD.line, x + 2, y, 2, 2);
  px(g, WOOD.line, x, y + 2, 6, 11);
  px(g, '#f2d58a', x + 1, y + 5, 4, 7);
  px(g, '#c9963d', x + 3, y + 5, 2, 7);
  px(g, WOOD.line, x + 2, y + 5, 1, 7);
  px(g, WOOD.line, x + 1, y + 13, 4, 1);
  px(g, WOOD.line, x + 2, y + 14, 2, 4);
}

/** The balcony over the portico: a rail on stone balusters swelling in their middle, standing on the lintel at `y` */
function balustrade(g: CanvasRenderingContext2D, x0: number, x1: number, y: number): void {
  const top = y - BALUSTRADE;
  for (let x = x0 + 3; x < x1 - 3; x += 5) {
    px(g, TOWER.line, x - 1, top + 3, 5, BALUSTRADE - 3);
    px(g, TOWER.mid, x, top + 3, 3, BALUSTRADE - 3);
    px(g, TOWER.light, x - 1, top + 6, 5, 2);
    px(g, TOWER.shine, x, top + 4, 1, BALUSTRADE - 5);
  }
  band(g, TOWER, x0, top, x1 - x0, 4);
}

/** A gold ball on a short stem, on a corner of the tower's cornice */
function pinnacle(g: CanvasRenderingContext2D, x: number, y: number): void {
  px(g, TOWER.line, x - 1, y + 2, 3, 3);
  px(g, TOWER.light, x, y + 2, 1, 3);
  disc(g, GOLD.o, x, y, 2);
  px(g, GOLD.l, x - 1, y - 1, 2, 1);
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
  const full = TOWER_X1 - TOWER_X0 + 4;
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
  const y = ROOF.ridge + 8;
  px(g, 'rgba(10,10,20,0.3)', x + 16, y + 2, 3, 15);
  px(g, STONE.mid, x, y + 6, 16, 12);
  px(g, STONE.line, x, y + 6, 1, 12);
  px(g, STONE.line, x + 15, y + 6, 1, 12);
  px(g, STONE.line, x, y + 17, 16, 1);
  px(g, FRAME.mid, x + 3, y + 8, 10, 8);
  px(g, GLASS.mid, x + 4, y + 9, 8, 7);
  px(g, GLASS.light, x + 5, y + 10, 1, 3);
  px(g, FRAME.mid, x + 7, y + 9, 1, 7);
  for (let k = 0; k < 8; k++) {
    px(g, k % 3 === 2 ? SLATE.dark : SLATE.mid, x + 8 - k - 1, y + k, (k + 1) * 2, 1);
    px(g, SLATE.line, x + 8 - k - 1, y + k, 1, 1);
    px(g, SLATE.line, x + 8 + k, y + k, 1, 1);
  }
}

/** The double door: an arched fanlight with radiating bars over two panelled leaves with gold handles */
function door(g: CanvasRenderingContext2D): void {
  const { x, y, w, leaves, bottom } = DOOR;
  const r = w / 2;
  const cx = x + r - 0.5;
  // The stone frame round it, then the fanlight's glass
  arch(g, TOWER.line, cx, leaves, r + 2);
  px(g, TOWER.line, x - 2, leaves, w + 4, bottom - leaves);
  arch(g, TOWER.shine, cx, leaves, r + 1);
  px(g, TOWER.shine, x - 1, leaves, w + 2, bottom - leaves);
  arch(g, WOOD.line, cx, leaves, r);
  arch(g, GLASS.mid, cx, leaves, r - 2);
  for (const a of [-0.6, -0.2, 0.2, 0.6]) {
    for (let d = 3; d < r - 1; d++) px(g, WOOD.dark, Math.round(MID - 0.5 + Math.sin(a * 2.4) * d), Math.round(leaves - Math.cos(a * 2.4) * d));
  }
  arch(g, WOOD.dark, cx, leaves, 3);
  px(g, GLASS.light, x + 8, leaves - 8, 1, 3);
  px(g, WOOD.line, x, leaves - 1, w, 2);
  // The two leaves, each with two raised panels
  px(g, WOOD.line, x, leaves + 1, w, bottom - leaves - 1);
  for (const lx of [x + 1, MID + 1]) {
    const lw = w / 2 - 2;
    px(g, WOOD.mid, lx, leaves + 1, lw, bottom - leaves - 1);
    px(g, WOOD.light, lx, leaves + 1, 1, bottom - leaves - 1);
    for (const [py, ph] of [
      [leaves + 4, 14],
      [leaves + 22, 15],
    ]) {
      px(g, WOOD.dark, lx + 3, py, lw - 6, ph);
      px(g, WOOD.light, lx + 4, py + 1, lw - 7, ph - 1);
      px(g, WOOD.mid, lx + 5, py + 2, lw - 9, ph - 3);
    }
  }
  px(g, GOLD.l, MID - 4, leaves + 19, 2, 3);
  px(g, GOLD.l, MID + 2, leaves + 19, 2, 3);
  px(g, GOLD.o, MID - 4, leaves + 21, 2, 1);
  px(g, GOLD.o, MID + 2, leaves + 21, 2, 1);
}

function build(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  roof(g);
  for (const x of CHIMNEY_XS) chimney(g, x, ROOF.back + 1);
  for (const x of DORMER_XS) dormer(g, x);
  // The tower above the roof: lighter stone, quoins on its corners, its shadow on the roof, its
  // pointed roof on a cornice with a pinnacle on each corner, the clock
  px(g, 'rgba(10,10,20,0.3)', TOWER_X1 + 1, TOWER_TOP + 4, 6, ROOF.eave - TOWER_TOP - 4);
  wall(g, TOWER, TOWER_X0, TOWER_TOP, TOWER_X1, WALL_TOP);
  quoins(g, TOWER, TOWER_X0, TOWER_TOP, WALL_TOP, true);
  quoins(g, TOWER, TOWER_X1, TOWER_TOP, WALL_TOP, false);
  px(g, TOWER.line, TOWER_X0 - 1, TOWER_TOP, 1, WALL_TOP - TOWER_TOP);
  px(g, TOWER.line, TOWER_X1, TOWER_TOP, 1, WALL_TOP - TOWER_TOP);
  spire(g);
  band(g, TOWER, TOWER_X0 - 3, TOWER_TOP - 3, TOWER_X1 - TOWER_X0 + 6, 5);
  pinnacle(g, TOWER_X0 - 2, TOWER_TOP - 6);
  pinnacle(g, TOWER_X1 + 1, TOWER_TOP - 6);
  clockFace(g);
  // The front: the stone wall with a band between the floors and stones on its corners, the tower's
  // bay in lighter stone down its middle, a cornice with dentils over it all, a plinth and the base
  wall(g, STONE, 0, WALL_TOP, W, PLINTH);
  band(g, STONE, 0, STRING, W, 3);
  quoins(g, STONE, 1, WALL_TOP, PLINTH, true);
  quoins(g, STONE, W - 1, WALL_TOP, PLINTH, false);
  px(g, 'rgba(20,10,20,0.22)', TOWER_X1 + 1, WALL_TOP, 3, PLINTH - WALL_TOP);
  wall(g, TOWER, TOWER_X0, WALL_TOP, TOWER_X1, PLINTH);
  quoins(g, TOWER, TOWER_X0, WALL_TOP, PLINTH, true);
  quoins(g, TOWER, TOWER_X1, WALL_TOP, PLINTH, false);
  px(g, TOWER.line, TOWER_X0 - 1, WALL_TOP, 1, PLINTH - WALL_TOP);
  px(g, TOWER.line, TOWER_X1, WALL_TOP, 1, PLINTH - WALL_TOP);
  band(g, STONE, 0, WALL_TOP - 4, W, 4);
  for (let x = 1; x < W; x += 4) px(g, STONE.dark, x, WALL_TOP - 2, 2, 1);
  px(g, 'rgba(20,10,20,0.25)', 0, WALL_TOP, W, 2);
  px(g, STONE.line, 0, WALL_TOP - 4, 1, PLINTH - WALL_TOP + 15);
  px(g, STONE.line, W - 1, WALL_TOP - 4, 1, PLINTH - WALL_TOP + 15);
  band(g, STONE, 0, PLINTH, W, 5);
  px(g, STONE.dark, 1, PLINTH + 5, W - 2, 5);
  px(g, STONE.line, 0, PLINTH + 10, W, 1);
  for (const x of WIN_XS) {
    archWindow(g, x);
    upperWindow(g, x + (WIN.w - UPPER.w) / 2);
  }
  // The tower's bay: the tall window onto the balcony between two banners
  archWindow(g, FRENCH.x, FRENCH);
  banner(g, TOWER_X0 + 5, WALL_TOP + 4, 10, 44);
  banner(g, TOWER_X1 - 15, WALL_TOP + 4, 10, 44);
  // The portico: the balcony on a lintel on two pairs of columns, the door between them, a lantern each side
  const { x0, x1 } = PORTICO;
  px(g, 'rgba(20,10,20,0.25)', x1 + 2, LINTEL + 2, 3, DOOR.bottom - LINTEL - 2);
  door(g);
  for (const x of [x0 + 2, x0 + 9, x1 - 15, x1 - 8]) column(g, x, LINTEL + 6, DOOR.bottom);
  balustrade(g, x0 - 2, x1 + 2, LINTEL);
  band(g, TOWER, x0 - 2, LINTEL, x1 - x0 + 4, 6);
  px(g, GOLD.m, MID - 9, LINTEL + 2, 18, 2);
  px(g, GOLD.l, MID - 9, LINTEL + 2, 18, 1);
  for (const x of LANTERN_XS) lantern(g, x, LANTERN_Y);
  // Steps down to the square, each wider than the one above
  for (let k = 0; k < 4; k++) band(g, STONE, x0 - 2 - k * 4, DOOR.bottom + k * 6, x1 - x0 + 4 + k * 8, 6);
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

/** A warm glow on a window's glass at night, warmer at the bottom where the lamps inside are, and a soft halo on the stone round it */
function glowWindow(g: CanvasRenderingContext2D, dark: number, x: number, y: number, w: number, h: number, arched: boolean): void {
  const a = world(x, y);
  const r = (w / 2) * S;
  const hw = h * S;
  const halo = g.createRadialGradient(a.x + r, a.y + hw * 0.55, 0, a.x + r, a.y + hw * 0.55, hw * 0.8);
  halo.addColorStop(0, `rgba(255,200,120,${0.18 * dark})`);
  halo.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = halo;
  g.fillRect(a.x - hw, a.y - hw * 0.3, r * 2 + hw * 2, hw * 1.7);
  const glass = g.createLinearGradient(0, a.y, 0, a.y + hw);
  glass.addColorStop(0, `rgba(255,214,140,${0.45 * dark})`);
  glass.addColorStop(1, `rgba(255,190,100,${0.7 * dark})`);
  g.fillStyle = glass;
  g.beginPath();
  if (arched) {
    g.arc(a.x + r, a.y + r, r, Math.PI, 0);
    g.rect(a.x, a.y + r, w * S, hw - r);
  } else g.rect(a.x, a.y, w * S, hw);
  g.fill();
}

/** At night: the windows and the door's fanlight glow warm, and the clock's face is lit from behind */
export function drawTownHallLight(g: CanvasRenderingContext2D, dark: number): void {
  if (dark <= 0.02) return;
  for (const x of WIN_XS) {
    glowWindow(g, dark, x + 2, WIN.y + 2, WIN.w - 4, WIN.h - 4, true);
    glowWindow(g, dark * 0.8, x + (WIN.w - UPPER.w) / 2 + 2, UPPER.y + 2, UPPER.w - 4, UPPER.h - 4, false);
  }
  glowWindow(g, dark, FRENCH.x + 2, FRENCH.y + 2, FRENCH.w - 4, FRENCH.h - 4, true);
  // The lanterns: a warm pool of light on the wall and the steps round each
  for (const x of LANTERN_XS) {
    const l = world(x + 3, LANTERN_Y + 8);
    const r = 36 * S;
    const pool = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    pool.addColorStop(0, `rgba(255,220,150,${0.6 * dark})`);
    pool.addColorStop(0.2, `rgba(255,190,110,${0.25 * dark})`);
    pool.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = pool;
    g.fillRect(l.x - r, l.y - r, r * 2, r * 2);
  }
  const r = DOOR.w / 2 - 2;
  const f = world(MID, DOOR.leaves);
  g.fillStyle = `rgba(255,205,125,${0.55 * dark})`;
  g.beginPath();
  g.arc(f.x, f.y, r * S, Math.PI, 0);
  g.fill();
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
