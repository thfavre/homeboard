import { SPRITE_SCALE, SQUARE_HOUSES } from '$shared/crowd.ts';
import { CAFE, CAFE_ART } from '$shared/world.ts';
import { houseArt, type Env } from '../games/crowd/scene.ts';
import { awning, type ShopArt } from './shopfronts.ts';

/**
 * The cafe, on the paneled house between the clothes shop and the barber. Built once from the
 * house's art: its small window walled up and a wide cafe window put in, framed in painted cream wood,
 * "CAFE" in gold on the glass, a green awning over it (the LPC awnings sheet), a box of flowers under
 * the sill; the porch and its door stay the house's own. Behind the glass a cozy room: striped
 * wallpaper over wood panels, shelves of bottles, two pendant lamps, the counter with its coffee
 * machine. On a party night the room goes dark, a mirror ball turns, colored beams sweep over the
 * dancers, and the light spills out over the terrace.
 *
 * Everything is in sprite pixels of the house's art (160 x 160, x from its left, y from its top);
 * the TV draws it SPRITE_SCALE world units a pixel, like the rest of the square.
 */

type G = CanvasRenderingContext2D;
const S = SPRITE_SCALE;
const ART = 160;
/** The house's art is drawn this far above the top of the screen (sprite pixels) */
const TOP = ART - SQUARE_HOUSES.bottom;
const GLASS = CAFE_ART.glass;
/** The window's frame around the glass, the bar across under its small top panes, the two mullions */
const FRAME = { x0: GLASS.x0 - 2, x1: GLASS.x1 + 2, y0: GLASS.y0 - 2, y1: GLASS.y1 + 2 };
const TRANSOM = GLASS.y0 + 8;
const MULLIONS = [GLASS.x0 + 26, GLASS.x0 + 52];

/** The painted cream wood of the houses' windows, the gold of the shops' signs, the awning's green */
const CREAM = { line: '#5a5248', dark: '#a39c90', mid: '#e6e0d0', light: '#f4efe2' };
const GOLD = { o: '#794117', m: '#d19428', l: '#f3c35f', h: '#fdd082' };
const WOOD = { line: '#2a1610', dark: '#4a2a1c', mid: '#6b3d22', light: '#85502c' };
/** The green awning's middle piece in the awnings sheet */
const AWNING_CUT: [number, number, number, number] = [256, 119, 32, 18];

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

/** Letters in a 3 x 5 pixel font, for the gold lettering on the glass */
const LETTERS: Record<string, string[]> = {
  C: ['###', '#..', '#..', '#..', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  F: ['###', '#..', '##.', '#..', '#..'],
  E: ['###', '#..', '##.', '#..', '###'],
};

export interface CafeArt {
  /** The whole house with the cafe's front, in place of the paneled house in the ground (the glass dark) */
  house: HTMLCanvasElement;
  /** What stands in front of the room and whoever is in it: the window's frame and lettering, the awning, the flower box */
  front: HTMLCanvasElement;
  /** The room behind the glass, the glass's size */
  room: HTMLCanvasElement;
}

let built: CafeArt | null = null;

/** The cafe's art, built once the square's and the shops' sheets are there */
export function cafeArt(env: Env, shops: ShopArt): CafeArt {
  if (built) return built;
  const [img, cut] = houseArt(env, 'paneled');
  const [house, g] = canvas(ART, ART);
  g.drawImage(img, cut[0], cut[1], cut[2], cut[3], 0, 0, cut[2], cut[3]);
  // Wall up the old window: the siding's planks, copied from the bare wall at its left
  for (let x = FRAME.x0 - 2; x < FRAME.x1 + 3; x++) {
    const sx = 10 + ((x - 10) % 16 + 16) % 16;
    g.drawImage(house, sx, 66, 1, 62, x, 66, 1, 62);
  }
  const [front, fg] = canvas(ART, ART);
  buildFront(fg, shops);
  const room = buildRoom();
  // In the ground the glass shows the room (the TV draws it again every frame, with the light of the moment)
  g.drawImage(room, GLASS.x0, GLASS.y0);
  g.drawImage(front, 0, 0);
  built = { house, front, room };
  return built;
}

/** The window's frame, the gold lettering, the awning over it and the flower box under its sill */
function buildFront(g: G, shops: ShopArt): void {
  // The frame: outline, the cream wood lit at the top left, in shade at the bottom right
  px(g, CREAM.line, FRAME.x0 - 1, FRAME.y0 - 1, FRAME.x1 - FRAME.x0 + 2, FRAME.y1 - FRAME.y0 + 2);
  px(g, CREAM.mid, FRAME.x0, FRAME.y0, FRAME.x1 - FRAME.x0, FRAME.y1 - FRAME.y0);
  px(g, CREAM.light, FRAME.x0, FRAME.y0, FRAME.x1 - FRAME.x0, 1);
  px(g, CREAM.light, FRAME.x0, FRAME.y0, 1, FRAME.y1 - FRAME.y0);
  px(g, CREAM.dark, FRAME.x0, FRAME.y1 - 1, FRAME.x1 - FRAME.x0, 1);
  px(g, CREAM.dark, FRAME.x1 - 1, FRAME.y0, 1, FRAME.y1 - FRAME.y0);
  // The glass is cut out: the room shows through it
  g.clearRect(GLASS.x0, GLASS.y0, GLASS.x1 - GLASS.x0, GLASS.y1 - GLASS.y0);
  // The bar under the small top panes, and the mullions
  px(g, CREAM.line, GLASS.x0, TRANSOM, GLASS.x1 - GLASS.x0, 3);
  px(g, CREAM.mid, GLASS.x0, TRANSOM, GLASS.x1 - GLASS.x0, 2);
  px(g, CREAM.light, GLASS.x0, TRANSOM, GLASS.x1 - GLASS.x0, 1);
  for (const x of MULLIONS) {
    px(g, CREAM.line, x - 1, GLASS.y0, 4, GLASS.y1 - GLASS.y0);
    px(g, CREAM.mid, x, GLASS.y0, 2, GLASS.y1 - GLASS.y0);
    px(g, CREAM.light, x, GLASS.y0, 1, GLASS.y1 - GLASS.y0);
  }
  for (let x = GLASS.x0 + 6; x < GLASS.x1 - 4; x += 7) {
    if (MULLIONS.some((m) => Math.abs(x - m) < 4)) continue;
    px(g, CREAM.line, x, GLASS.y0, 1, TRANSOM - GLASS.y0);
  }
  // CAFE in gold on the middle pane, with a dark edge under each stroke so it reads on the glass
  const word = 'CAFE';
  const lx = Math.round((MULLIONS[0] + 2 + MULLIONS[1]) / 2 - (word.length * 4 - 1) / 2);
  const ly = TRANSOM + 6;
  [...word].forEach((ch, i) => {
    LETTERS[ch].forEach((row, r) => {
      for (let c = 0; c < 3; c++) {
        if (row[c] !== '#') continue;
        px(g, GOLD.o, lx + i * 4 + c, ly + r + 1);
        px(g, r === 0 ? GOLD.h : r < 3 ? GOLD.l : GOLD.m, lx + i * 4 + c, ly + r);
      }
    });
  });
  // A thin gold line under the word
  px(g, GOLD.m, lx, ly + 7, word.length * 4 - 1, 1);
  // The sill
  px(g, CREAM.line, FRAME.x0 - 3, FRAME.y1, FRAME.x1 - FRAME.x0 + 6, 3);
  px(g, CREAM.light, FRAME.x0 - 2, FRAME.y1, FRAME.x1 - FRAME.x0 + 4, 1);
  px(g, CREAM.dark, FRAME.x0 - 2, FRAME.y1 + 1, FRAME.x1 - FRAME.x0 + 4, 1);
  // The flower box under it: dark wood, red and pink flowers and leaves poking over its edge
  const bx0 = FRAME.x0 + 6;
  const bx1 = FRAME.x1 - 6;
  const by = FRAME.y1 + 3;
  px(g, WOOD.line, bx0, by, bx1 - bx0, 6);
  px(g, WOOD.mid, bx0 + 1, by + 1, bx1 - bx0 - 2, 4);
  px(g, WOOD.light, bx0 + 1, by + 1, bx1 - bx0 - 2, 1);
  for (let x = bx0 + 2; x < bx1 - 2; x += 3) {
    const k = (x * 7) % 5;
    px(g, '#2f6a2c', x, by - 2, 2, 2);
    px(g, '#4f8c37', x + 1, by - 3, 1, 1);
    if (k < 3) {
      px(g, k === 0 ? '#e0503f' : k === 1 ? '#f29bb8' : '#f5d36a', x, by - 4 - (k % 2), 2, 2);
      px(g, '#fff4d8', x, by - 4 - (k % 2), 1, 1);
    }
  }
  // The awning over the window, its shadow on the frame below it
  const aw = FRAME.x1 - FRAME.x0 + 8;
  px(g, 'rgba(20,10,20,0.3)', FRAME.x0 - 4, CAFE_ART.awning + AWNING_CUT[3], aw, 3);
  awning(g, shops.awnings, AWNING_CUT, FRAME.x0 - 4, CAFE_ART.awning, aw);
}

/**
 * The room behind the glass (the glass's size): striped wallpaper over wood panels, a shelf of
 * bottles, two pendant lamps, the counter with its coffee machine and cups
 */
function buildRoom(): HTMLCanvasElement {
  const w = GLASS.x1 - GLASS.x0;
  const h = GLASS.y1 - GLASS.y0;
  const [c, g] = canvas(w, h);
  px(g, '#c88f5c', 0, 0, w, h);
  for (let x = 1; x < w; x += 5) px(g, '#b47b4b', x, 0, 2, h);
  // The wood panels on the lower wall
  px(g, WOOD.line, 0, 21, w, 1);
  px(g, WOOD.mid, 0, 22, w, h - 22);
  for (let x = 3; x < w; x += 9) {
    px(g, WOOD.dark, x, 24, 7, 9);
    px(g, WOOD.light, x, 24, 7, 1);
  }
  // A shelf of bottles, left
  px(g, WOOD.line, 3, 15, 20, 2);
  px(g, WOOD.light, 3, 15, 20, 1);
  const bottles = ['#2f6a3a', '#7a2a2a', '#3a4a8a', '#c0a050', '#2f6a3a', '#8a5a2a'];
  bottles.forEach((color, i) => {
    const x = 4 + i * 3;
    px(g, color, x, 10, 2, 5);
    px(g, color, x + (i % 2 ? 0 : 1), 8, 1, 2);
    px(g, 'rgba(255,255,255,0.4)', x, 11, 1, 2);
  });
  // The counter, right: wood with a light top, the coffee machine and cups on it
  px(g, WOOD.line, 46, 19, w - 46, h - 19);
  px(g, '#8a5a32', 47, 21, w - 47, h - 21);
  px(g, '#d9c8a8', 46, 18, w - 46, 2);
  px(g, '#5a6070', 52, 10, 10, 8);
  px(g, '#a8b0bc', 53, 11, 8, 6);
  px(g, '#e8ecf0', 53, 11, 3, 1);
  px(g, '#2a2c34', 55, 15, 3, 2);
  for (const x of [66, 70, 74]) {
    px(g, '#f4f1ea', x, 16, 3, 2);
    px(g, '#5b3a24', x, 16, 3, 1);
  }
  // The pendant lamps: a cord, a dark green shade, warm light under it
  for (const x of [16, 62]) {
    px(g, '#2a2626', x, 0, 1, 4);
    px(g, '#26402c', x - 3, 4, 7, 3);
    px(g, '#3f6339', x - 2, 4, 5, 1);
    px(g, '#ffe6a8', x - 2, 7, 5, 1);
  }
  return c;
}

/** Where a dancer's feet go: below the window, so the glass shows them from the waist up */
export const DANCE_FEET = CAFE.window.y + CAFE.window.h + 24;

/** The house's art on the screen (world units) */
const at = (x: number, y: number) => ({ x: (CAFE.house.art + x) * S, y: (y - TOP) * S });

/** The colors of the party's lights, taking turns */
const PARTY = ['#ff4f7b', '#ffd23f', '#3fe0d0', '#8a6bff', '#ff8a3f', '#4fa8ff'];

/**
 * The cafe every frame: the room behind the glass, dark and swept by colored beams on a party night,
 * dim when it is closed at night; the dancers in it (drawn by `people`, clipped to the glass); the
 * glass's sheen; then the frame, the lettering, the awning and the flowers in front of them.
 */
export function drawCafe(g: G, art: CafeArt, now: number, dark: number, party: boolean, people: (g: G) => void): void {
  const { x, y, w, h } = CAFE.window;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.drawImage(art.room, x, y, w, h);
  if (party) {
    g.fillStyle = 'rgba(22,10,40,0.78)';
    g.fillRect(x, y, w, h);
    // Spots on the back wall, from the mirror ball, wandering round
    for (let i = 0; i < 14; i++) {
      const a = now / 1400 + i * 2.1;
      const sx = x + w / 2 + Math.cos(a) * w * (0.2 + (i % 4) * 0.1);
      const sy = y + h * 0.35 + Math.sin(a * 1.3) * h * 0.25;
      g.fillStyle = `${PARTY[i % PARTY.length]}88`;
      g.fillRect(Math.round(sx), Math.round(sy), S * 1.5, S * 1.5);
    }
  } else if (dark > 0) {
    // Closed for the night: only a lamp left on
    g.fillStyle = `rgba(16,12,30,${0.55 * Math.min(1, dark * 1.6)})`;
    g.fillRect(x, y, w, h);
  }
  people(g);
  if (party) {
    // Beams from the ball sweeping over the dancers, a color a beat
    const beat = Math.floor(now / 560);
    const bx = x + w / 2;
    const by = y + 3 * S;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + Math.sin(now / 900 + i * 2.1) * 0.9;
      g.fillStyle = `${PARTY[(beat + i * 2) % PARTY.length]}40`;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + Math.cos(a - 0.16) * h * 2, by + Math.sin(a - 0.16) * h * 2);
      g.lineTo(bx + Math.cos(a + 0.16) * h * 2, by + Math.sin(a + 0.16) * h * 2);
      g.fill();
    }
    // A flash on the beat, fading
    const t = (now % 560) / 560;
    g.fillStyle = `${PARTY[beat % PARTY.length]}${Math.round((1 - t) * 0x30).toString(16).padStart(2, '0')}`;
    g.fillRect(x, y, w, h);
    g.globalCompositeOperation = 'source-over';
    // The mirror ball, glinting
    g.fillStyle = '#c8ccd8';
    g.beginPath();
    g.arc(bx, by, 3 * S, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(bx - S + Math.sin(now / 150) * S), Math.round(by - S), S, S);
    g.fillStyle = '#7a7e8c';
    g.fillRect(Math.round(bx - S / 2), y, S * 0.6, 1.5 * S);
  }
  // The glass's sheen: a pale streak across each pane
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.beginPath();
  g.moveTo(x + w * 0.12, y);
  g.lineTo(x + w * 0.24, y);
  g.lineTo(x + w * 0.08, y + h);
  g.lineTo(x - w * 0.04, y + h);
  g.fill();
  g.restore();
  const o = at(0, 0);
  g.drawImage(art.front, o.x, o.y, ART * S, ART * S);
}

/**
 * After the night veil: the cafe's light. At night the window glows warm (closed: dimmer); on a
 * party night colored light pulses in the window and the doorway and spills over the terrace.
 */
export function drawCafeLight(g: G, dark: number, party: boolean, now: number): void {
  const { x, y, w, h } = CAFE.window;
  if (party) {
    const beat = Math.floor(now / 560);
    const t = (now % 560) / 560;
    const color = PARTY[beat % PARTY.length];
    const pulse = 0.55 + 0.45 * (1 - t);
    const level = 0.35 + 0.65 * dark;
    g.fillStyle = `${color}${Math.round(0x30 * pulse * level).toString(16).padStart(2, '0')}`;
    g.fillRect(x, y, w, h);
    // The doorway in the porch
    const d = at(CAFE_ART.door - 12, 80);
    g.fillStyle = `${PARTY[(beat + 3) % PARTY.length]}${Math.round(0x40 * pulse * level).toString(16).padStart(2, '0')}`;
    g.fillRect(d.x, d.y, 24 * S, 46 * S);
    // Pools of colored light on the terrace, drifting
    for (let i = 0; i < 3; i++) {
      const px0 = x + w * (0.2 + i * 0.4) + Math.sin(now / 1500 + i * 2) * 30;
      const py0 = y + h + 120 + Math.cos(now / 1900 + i) * 14;
      const c = PARTY[(beat + i * 2) % PARTY.length];
      g.save();
      g.translate(px0, py0);
      g.scale(1, 0.38);
      const pool = g.createRadialGradient(0, 0, 0, 0, 0, 90);
      pool.addColorStop(0, `${c}${Math.round(0x2a * level * pulse).toString(16).padStart(2, '0')}`);
      pool.addColorStop(1, `${c}00`);
      g.fillStyle = pool;
      g.beginPath();
      g.arc(0, 0, 90, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    return;
  }
  if (dark <= 0.02) return;
  g.fillStyle = `rgba(255,214,150,${0.1 * dark})`;
  g.fillRect(x, y, w, h);
}
