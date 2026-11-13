import { SPRITE_SCALE } from '$shared/crowd.ts';
import { SHOPFRONTS, TOWN_PLACES, type PlaceId, type TownPlace } from '$shared/world.ts';
import { houseArt, type Env, type HouseSwap } from '../games/crowd/scene.ts';

/**
 * The town's two shops as buildings of their own, built once from LPC art (web/public/world/shops,
 * see its CREDITS.txt) on the house of the square they stand in: a painted wooden shopfront with a
 * fascia, a display window and a door, a fabric awning, a sign. What is drawn here by hand (the
 * shopfront's woodwork, the sign icons, the barber pole) uses the palettes of those sheets, lit from
 * the top left, one sprite pixel at a time.
 *
 * Everything is in sprite pixels of the house's art (x from its left, y from its top); the TV draws
 * it SPRITE_SCALE world units a pixel, like the rest of the square.
 */

const FILES = ['awnings', 'sign-boards', 'doors', 'curtains', 'dress-forms', 'fabric-rolls', 'mirrors', 'chair', 'wallpaper'] as const;
type ShopImage = (typeof FILES)[number];
export type ShopArt = Record<ShopImage, HTMLImageElement>;

let loading: Promise<ShopArt | null> | null = null;
/** Load the shops' sheets once (null: they cannot be, the houses stay plain houses) */
export function loadShopArt(): Promise<ShopArt | null> {
  loading ??= Promise.all(
    FILES.map(
      (f) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve([f, img]);
          img.onerror = () => reject(new Error(f));
          img.src = `/world/shops/${f}.png`;
        }),
    ),
  )
    .then((list) => Object.fromEntries(list) as ShopArt)
    .catch(() => null);
  return loading;
}

// ------------------------------------------------------------ palettes (from the sheets)

/** Painted wood: the clothes shop's crimson and the barber's teal are the colors of their doors */
const PAINT = {
  clothes: { line: '#3e111a', dark: '#6a1d16', mid: '#7b2008', light: '#95381c', shine: '#b54936' },
  barber: { line: '#172038', dark: '#253a5e', mid: '#3a5a72', light: '#4f899d', shine: '#7fb3bf' },
};
type Paint = (typeof PAINT)[PlaceId];
/** The gold of the LPC sign icons */
const GOLD = { o: '#794117', m: '#d19428', l: '#f3c35f', h: '#fdd082' } as Record<string, string>;
/** Wrought iron and the stone of the square's houses */
const IRON = { line: '#0f1218', dark: '#29253a', mid: '#4b4b60', light: '#6a7587', shine: '#a8b3b8' };
const STONE = { line: '#343043', dark: '#726b7e', mid: '#958080', light: '#c4b59f' };
/** The dark inside behind an open door, as in the houses' doorways */
const INDOOR = '#2a1722';

// ------------------------------------------------------------ cuts of the sheets

type Cut = [number, number, number, number];
/** Each shop's door in doors.png: a row of 7 frames 64x96 (open to the left ... closed ... open to the right) */
const DOOR_ROW = { clothes: [448, 0], barber: [448, 96] } as const;
/** The door itself inside a frame */
const DOOR_IN_FRAME = { x: 32, y: 16, w: 32, h: 48 };
/** The middle piece of an awning: the canopy, its valance and two posts (terracotta and sky blue) */
const AWNING: Record<PlaceId, Cut> = { clothes: [256, 23, 32, 18], barber: [160, 119, 32, 18] };
/** The sign boards: a light and a dark stone frame */
const BOARD: Record<PlaceId, Cut> = { clothes: [36, 4, 24, 24], barber: [36, 36, 24, 24] };
const DRESS_FORM_LIGHT: Cut = [0, 0, 32, 32];
const DRESS_FORM_DARK: Cut = [0, 32, 32, 32];
const FABRIC_ROLLS: Cut = [0, 0, 64, 64];
/** A make-up mirror ringed with bulbs */
const BULB_MIRROR: Cut = [77, 13, 39, 39];
const CHAIR_FRONT: Cut = [4, 3, 24, 29];
/** Tied-back drapes on a rod (red) and a drawn curtain, its folds hanging straight (red) */
const DRAPES: Cut = [105, 128, 46, 63];
export const CURTAIN: Cut = [288, 128, 48, 78];
/** A strip of striped wallpaper: cream with rose for the clothes shop, white with blue for the barber */
const WALLPAPER: Record<PlaceId, Cut> = { clothes: [960, 0, 96, 80], barber: [480, 0, 96, 80] };

// ------------------------------------------------------------ hand drawn icons (gold, in the sign icons' style)

/** A shirt, for the clothes shop's sign */
const SHIRT = [
  '..ooo...ooo..',
  '.ohhlooolmmo.',
  'ohllllllllmmo',
  'ohllllllllmmo',
  'oooollllmoooo',
  '...ohllllmo..',
  '...ollllmmo..',
  '...ollllmmo..',
  '...ollllmmo..',
  '...oooooooo..',
];
/** Open scissors, for the barber's sign */
const SCISSORS = [
  '.ooo..........',
  'ohlho.....ooo.',
  'ol.lo...oohho.',
  '.ooohhoohlo...',
  '.....ommo.....',
  '.ooolmooomo...',
  'ol.lo...oommo.',
  'ohlmo.....ooo.',
  '.ooo..........',
];

function icon(g: CanvasRenderingContext2D, rows: string[], x: number, y: number): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = GOLD[row[i]];
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(x + i, y + j, 1, 1);
    }
  });
}

// ------------------------------------------------------------ drawing helpers

function px(g: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1): void {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function put(g: CanvasRenderingContext2D, img: CanvasImageSource, c: Cut, x: number, y: number): void {
  g.drawImage(img, c[0], c[1], c[2], c[3], x, y, c[2], c[3]);
}

/** A sign board of any size, its stone frame kept and its middle stretched (a 24 px board cut in nine) */
function board(g: CanvasRenderingContext2D, img: HTMLImageElement, c: Cut, x: number, y: number, w: number, h: number): void {
  const b = 6;
  const [sx, sy, sw, sh] = c;
  const cols = [
    [sx, b, x, b],
    [sx + b, sw - 2 * b, x + b, w - 2 * b],
    [sx + sw - b, b, x + w - b, b],
  ];
  const rows = [
    [sy, b, y, b],
    [sy + b, sh - 2 * b, y + b, h - 2 * b],
    [sy + sh - b, b, y + h - b, b],
  ];
  for (const [cx, cw, dx, dw] of cols) for (const [cy, ch, dy, dh] of rows) g.drawImage(img, cx, cy, cw, ch, dx, dy, dw, dh);
}

/** An awning of any width: the ends of the middle piece kept, its scalloped middle repeated */
export function awning(g: CanvasRenderingContext2D, img: HTMLImageElement, c: Cut, x: number, y: number, w: number): void {
  const [sx, sy, sw, sh] = c;
  const end = 7;
  g.drawImage(img, sx, sy, end, sh, x, y, end, sh);
  const mid = sw - 2 * end;
  for (let dx = end; dx < w - end; dx += mid) {
    const cw = Math.min(mid, w - end - dx);
    g.drawImage(img, sx + end, sy, cw, sh, x + dx, y, cw, sh);
  }
  g.drawImage(img, sx + sw - end, sy, end, sh, x + w - end, y, end, sh);
}

/** A painted post, lit from the left: outline, shine, body, shade */
function post(g: CanvasRenderingContext2D, p: Paint, x: number, y: number, w: number, h: number): void {
  px(g, p.mid, x, y, w, h);
  px(g, p.line, x, y, 1, h);
  px(g, p.line, x + w - 1, y, 1, h);
  if (w > 2) px(g, p.shine, x + 1, y, 1, h);
  if (w > 3) px(g, p.dark, x + w - 2, y, 1, h);
}

/** A painted beam, lit from the top: outline, shine, body, shade, outline */
function beam(g: CanvasRenderingContext2D, p: Paint, x: number, y: number, w: number, h: number): void {
  px(g, p.mid, x, y, w, h);
  px(g, p.line, x, y, w, 1);
  px(g, p.line, x, y + h - 1, w, 1);
  if (h > 2) px(g, p.shine, x, y + 1, w, 1);
  if (h > 3) px(g, p.dark, x, y + h - 2, w, 1);
}

/** A sunk panel (on a door's side, under a window): the top and left edges in shade, the others lit */
function panel(g: CanvasRenderingContext2D, p: Paint, x: number, y: number, w: number, h: number): void {
  px(g, p.mid, x, y, w, h);
  px(g, p.dark, x, y, w, 1);
  px(g, p.dark, x, y, 1, h);
  px(g, p.light, x, y + h - 1, w, 1);
  px(g, p.light, x + w - 1, y, 1, h);
}

/** The shadow something casts on the wall below and right of it */
function shade(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 0.3): void {
  px(g, `rgba(20,10,20,${a})`, x, y, w, h);
}

// ------------------------------------------------------------ where things are on each shop

/** A shop's front, in sprite pixels of its house's art */
export interface Front {
  id: PlaceId;
  /** Size of the house's art */
  w: number;
  h: number;
  /** The glass of the shop window */
  glass: { x: number; y: number; w: number; h: number };
  /** The door's top left (32x48) */
  door: { x: number; y: number };
  /** The barber pole (only the barber): its glass, top left */
  pole?: { x: number; y: number; h: number };
}

export function frontOf(p: TownPlace): Front {
  const f = SHOPFRONTS[p.house.kind]!;
  const h = p.id === 'clothes' ? 201 : 192;
  const w = Math.round((p.house.x1 - p.house.x0) / SPRITE_SCALE);
  const glass = { x: f.win.x0, y: h - f.win.top, w: f.win.x1 - f.win.x0, h: f.win.top - f.win.bottom };
  // The clothes shop's door stands at the top of its steps, the barber's on the ground
  const door = { x: Math.round(f.door - 16), y: (p.id === 'clothes' ? h - f.doorUp : h) - DOOR_IN_FRAME.h };
  return { id: p.id, w, h, glass, door, pole: p.id === 'barber' ? { x: 117, y: 142, h: 30 } : undefined };
}

// ------------------------------------------------------------ the buildings (in the ground, built once)

/** The clothes shop on the big brick house: a crimson shopfront between its stone corners */
function buildClothes(g: CanvasRenderingContext2D, env: Env, art: ShopArt, f: Front): void {
  const [house, c] = houseArt(env, 'brickA');
  const P = PAINT.clothes;
  const { glass: gl, door } = f;
  // The house's steps move to the new door; where they were, the stone base goes on
  const stepsAt = c[0] + 40;
  g.drawImage(house, c[0] + 88, 176, 32, 16, 40, 176, 32, 16);
  g.clearRect(40, 192, 32, 9);
  g.drawImage(house, stepsAt, 176, 32, 25, door.x, 176, 32, 25);

  // The shopfront fills the wall between the stone corners, from the cornice down to the base
  const x0 = 22;
  const x1 = 121;
  px(g, P.mid, x0, 110, x1 - x0, 66);
  // Cornice and fascia
  beam(g, P, x0 - 2, 109, x1 - x0 + 4, 4);
  px(g, P.dark, x0, 113, x1 - x0, 1);
  panel(g, P, x0 + 2, 114, x1 - x0 - 4, 9);
  px(g, GOLD.m, x0 + 4, 116, x1 - x0 - 8, 1);
  px(g, GOLD.o, x0 + 4, 120, x1 - x0 - 8, 1);
  beam(g, P, x0, 123, x1 - x0, 3);
  shade(g, x0, 126, x1 - x0, 1, 0.35);
  // Posts: at the corners, between the door and the window
  post(g, P, x0, 126, 4, 50);
  post(g, P, door.x + 32, 126, gl.x - door.x - 32, 50);
  post(g, P, x1 - 3, 126, 3, 50);
  // The door's frame and the dark inside it (the door is drawn by the TV, it opens)
  beam(g, P, door.x - 1, 126, 34, 2);
  px(g, INDOOR, door.x, 128, 32, 48);
  // The window: a frame around the glass, a sill, a panel under it
  beam(g, P, gl.x - 1, gl.y - 3, gl.w + 2, 3);
  px(g, P.line, gl.x - 1, gl.y, 1, gl.h);
  px(g, P.line, gl.x + gl.w, gl.y, 1, gl.h);
  beam(g, P, gl.x - 2, gl.y + gl.h, gl.w + 4, 3);
  panel(g, P, gl.x + 1, gl.y + gl.h + 3, gl.w - 2, 176 - gl.y - gl.h - 3);
  shade(g, gl.x - 2, gl.y + gl.h + 3, gl.w + 4, 1, 0.35);
  // The base under the shopfront in shade
  shade(g, x0, 176, x1 - x0, 1, 0.3);

  // A sign hanging from an iron bracket off the right corner: a shirt on a stone board
  const bx = 121;
  px(g, IRON.dark, bx, 129, 30, 2);
  px(g, IRON.light, bx, 129, 30, 1);
  px(g, IRON.dark, bx + 2, 131, 1, 6);
  for (let i = 0; i < 6; i++) px(g, IRON.dark, bx + 3 + i, 136 - i, 1, 1);
  px(g, IRON.mid, bx + 29, 128, 2, 4);
  for (const hx of [bx + 9, bx + 24]) px(g, IRON.dark, hx, 131, 1, 3);
  board(g, art['sign-boards'], BOARD.clothes, bx + 5, 134, 23, 21);
  icon(g, SHIRT, bx + 10, 139);
  shade(g, bx + 6, 155, 22, 1, 0.25);

  // Two dress forms out front by the set back wing, in their best
  put(g, art['dress-forms'], DRESS_FORM_LIGHT, 148, 166);
  put(g, art['dress-forms'], DRESS_FORM_DARK, 172, 166);
}

/** The barber on the small brick house: a teal shopfront window, a sign over the door, the pole */
function buildBarber(g: CanvasRenderingContext2D, art: ShopArt, f: Front): void {
  const P = PAINT.barber;
  const { glass: gl, door } = f;
  // The window, its frame and the panel down to the ground, over the house's own window
  const x0 = gl.x - 4;
  const x1 = gl.x + gl.w + 4;
  px(g, P.mid, x0, gl.y - 6, x1 - x0, f.h - gl.y + 6);
  beam(g, P, x0 - 1, gl.y - 7, x1 - x0 + 2, 4);
  beam(g, P, x0, gl.y - 3, x1 - x0, 3);
  post(g, P, x0, gl.y, 4, gl.h);
  post(g, P, x1 - 4, gl.y, 4, gl.h);
  px(g, P.line, gl.x - 1, gl.y, 1, gl.h);
  px(g, P.line, gl.x + gl.w, gl.y, 1, gl.h);
  beam(g, P, x0 - 2, gl.y + gl.h, x1 - x0 + 4, 3);
  post(g, P, x0, gl.y + gl.h + 3, x1 - x0, f.h - gl.y - gl.h - 3);
  const ph = f.h - gl.y - gl.h - 8;
  const pw = Math.floor((x1 - x0 - 10) / 2);
  panel(g, P, x0 + 3, gl.y + gl.h + 5, pw, ph);
  panel(g, P, x1 - 3 - pw, gl.y + gl.h + 5, pw, ph);
  shade(g, x0 - 2, gl.y + gl.h + 3, x1 - x0 + 4, 1, 0.35);
  shade(g, x1 + 1, gl.y - 6, 1, f.h - gl.y + 6, 0.25);

  // The doorway: a lit fanlight over a teal door (drawn by the TV, it opens)
  const top = 133;
  px(g, '#f2d79b', door.x, top, 32, door.y - top - 1);
  px(g, '#fbecc4', door.x, top, 32, 2);
  for (const mx of [door.x + 10, door.x + 21]) px(g, P.line, mx, top, 1, door.y - top - 1);
  beam(g, P, door.x, door.y - 2, 32, 2);
  px(g, INDOOR, door.x, door.y, 32, DOOR_IN_FRAME.h);

  // The sign over the door: scissors in gold on a dark board
  board(g, art['sign-boards'], BOARD.barber, door.x - 4, 111, 40, 17);
  icon(g, SCISSORS, door.x + 9, 115);
  shade(g, door.x - 3, 128, 39, 1, 0.3);

  // The pole on the wall by the door, its brackets and caps (its stripes turn on the TV)
  const pole = f.pole!;
  drawPole(g, pole.x, pole.y, pole.h, 0);
}

/** The barber pole: a glass cylinder of red, white and blue stripes between brass caps, turning by `phase` (px) */
export function drawPole(g: CanvasRenderingContext2D, x: number, y: number, h: number, phase: number): void {
  const w = 6;
  const SH = {
    r: ['#e9806d', '#c8353a', '#8e2430'],
    b: ['#7d9fd8', '#2f5d9a', '#203f6e'],
    w: ['#ffffff', '#e4e6ea', '#a8b0bc'],
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const t = (((j - i + phase) % 12) + 12) % 12;
      const band = t < 3 ? 'r' : t < 6 ? 'w' : t < 9 ? 'b' : 'w';
      const s = i === 0 ? 0 : i === w - 1 ? 2 : 1;
      px(g, SH[band][s], x + 1 + i, y + j, 1, 1);
    }
  }
  px(g, IRON.line, x, y, 1, h);
  px(g, IRON.line, x + w + 1, y, 1, h);
  // A glint down the glass
  px(g, 'rgba(255,255,255,0.45)', x + 2, y + 1, 1, h - 2);
  // Brass caps, a ball on top, and the brackets to the wall
  for (const cy of [y - 3, y + h]) {
    px(g, GOLD.o, x - 1, cy, w + 4, 3);
    px(g, GOLD.l, x, cy, w + 2, 1);
    px(g, GOLD.m, x, cy + 1, w + 2, 1);
  }
  px(g, GOLD.o, x + 2, y - 6, 4, 3);
  px(g, GOLD.h, x + 3, y - 5, 1, 1);
  px(g, GOLD.m, x + 4, y - 5, 1, 1);
  px(g, IRON.dark, x + w + 2, y + 2, 2, 1);
  px(g, IRON.dark, x + w + 2, y + h - 3, 2, 1);
}

// ------------------------------------------------------------ what is seen through the window (built once)

/** The room behind the glass, glass-sized: wallpaper, the shop's things on the back wall, warm light */
function buildRoom(art: ShopArt, f: Front): HTMLCanvasElement {
  const { w, h } = f.glass;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const wp = WALLPAPER[f.id];
  for (let x = 0; x < w; x += wp[2]) g.drawImage(art.wallpaper, wp[0], wp[1], wp[2], wp[3], x, -4, wp[2], wp[3]);
  if (f.id === 'clothes') {
    // A rack of fabric rolls along the back wall
    const r = FABRIC_ROLLS;
    put(g, art['fabric-rolls'], r, Math.round(w / 2 - r[2] / 2), -2);
  } else {
    // The mirror with its bulbs on the back wall, the chair in front of it
    put(g, art.mirrors, BULB_MIRROR, Math.round(w / 2 - BULB_MIRROR[2] / 2), 1);
    put(g, art.chair, CHAIR_FRONT, Math.round(w / 2 - CHAIR_FRONT[2] / 2), h - 20);
  }
  // The light of the room, warm and brighter at the top, the floor and the corners darker
  const lit = g.createLinearGradient(0, 0, 0, h);
  lit.addColorStop(0, 'rgba(255,230,180,0.2)');
  lit.addColorStop(0.6, 'rgba(255,230,180,0)');
  lit.addColorStop(1, 'rgba(40,20,30,0.25)');
  g.fillStyle = lit;
  g.fillRect(0, 0, w, h);
  return c;
}

/** In front of the people inside: the glass, drapes, the awning and its shadow (house-sized) */
function buildFront(art: ShopArt, f: Front): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = f.w;
  c.height = f.h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const { x, y, w, h } = f.glass;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  // A cool tint, the awning's shadow along the top, two slanted glints
  px(g, 'rgba(170,205,235,0.14)', x, y, w, h);
  px(g, 'rgba(20,10,30,0.28)', x, y, w, 5);
  px(g, 'rgba(20,10,30,0.14)', x, y + 5, w, 2);
  for (const [o, k] of [
    [0.22, 3],
    [0.36, 1],
  ] as const) {
    const gx = Math.round(x + w * o);
    for (let j = 0; j < h; j++) px(g, 'rgba(255,255,255,0.2)', gx + Math.floor((h - j) / 2) - Math.floor(h / 4), y + j, k, 1);
  }
  if (f.id === 'clothes') {
    // Drapes tied back at both sides of the window, on their rod
    const dw = 11;
    g.drawImage(art.curtains, DRAPES[0], DRAPES[1], dw, h + 2, x - 1, y - 1, dw, h + 2);
    g.drawImage(art.curtains, DRAPES[0] + DRAPES[2] - dw, DRAPES[1], dw, h + 2, x + w - dw + 1, y - 1, dw, h + 2);
  }
  g.restore();
  // The awning over it all
  const a = AWNING[f.id];
  awning(g, art.awnings, a, x - 5, y - 11, w + 10);
  return c;
}

// ------------------------------------------------------------ for the TV

export interface ShopLook {
  front: Front;
  /** The building, swapped into the ground in place of the house */
  facade: HTMLCanvasElement;
  room: HTMLCanvasElement;
  over: HTMLCanvasElement;
}

let looks: Record<PlaceId, ShopLook> | null = null;
let builtFor: [Env, ShopArt] | null = null;

/** Both shops, built once for these sheets */
export function shopLooks(env: Env, art: ShopArt): Record<PlaceId, ShopLook> {
  if (looks && builtFor?.[0] === env && builtFor[1] === art) return looks;
  const make = (p: TownPlace): ShopLook => {
    const front = frontOf(p);
    const [house, cut] = houseArt(env, p.house.kind);
    const facade = document.createElement('canvas');
    facade.width = cut[2];
    facade.height = cut[3];
    const g = facade.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(house, cut[0], cut[1], cut[2], cut[3], 0, 0, cut[2], cut[3]);
    if (p.id === 'clothes') buildClothes(g, env, art, front);
    else buildBarber(g, art, front);
    return { front, facade, room: buildRoom(art, front), over: buildFront(art, front) };
  };
  looks = { clothes: make(TOWN_PLACES.clothes), barber: make(TOWN_PLACES.barber) };
  builtFor = [env, art];
  return looks;
}

/** For the ground: the shops in place of their houses */
export function shopSwap(env: Env, art: ShopArt): HouseSwap {
  const all = shopLooks(env, art);
  return (kind, x) => {
    for (const p of Object.values(TOWN_PLACES)) if (p.house.kind === kind && Math.abs(p.house.x0 - x * SPRITE_SCALE) < 1) return all[p.id].facade;
    return null;
  };
}

/** World position of a sprite pixel of a shop's house art */
export function worldOf(p: TownPlace, f: Front, x: number, y: number): { x: number; y: number } {
  return { x: p.house.x0 + x * SPRITE_SCALE, y: p.house.bottom - (f.h - y) * SPRITE_SCALE };
}

export const DOOR_FRAME = { row: DOOR_ROW, inFrame: DOOR_IN_FRAME };
