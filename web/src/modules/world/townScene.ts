import { SPRITE_SCALE } from '$shared/crowd.ts';
import { CAFE, CAMPFIRE, FIRE_LOGS, NOTICE_BOARD, TOWN_BENCHES, TOWN_SCENE, type WDir } from '$shared/world.ts';
import { CUT, fountain, put, sidewalkProps, still, tree, type Env, type Prop } from '../games/crowd/scene.ts';

/**
 * What stands up on the town's square, drawn in depth order with the characters: the fountain, the
 * trees (each its own size), the lamp posts (lit one by one by the lamplighter), the sidewalk's
 * benches and plants, the notice board by the town hall, the cafe's tables with their chairs and
 * parasols and its chalkboard, the campfire on the grass with its logs. The board, the cafe's
 * furniture and the campfire are drawn here by hand, one sprite pixel at a time, lit from the top left.
 */

type G = CanvasRenderingContext2D;
const S = SPRITE_SCALE;

/** What the props need to know of the town right now (set by the TV every frame) */
export const townNow = { dark: 0, lamps: 0, party: false, fire: false, parasols: 0 };

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

/** Draw a small canvas of sprite pixels with its bottom middle at (x, y) in world units */
function stand(g: G, c: HTMLCanvasElement, x: number, y: number, mirror = false): void {
  const w = c.width * S;
  const h = c.height * S;
  if (!mirror) {
    g.drawImage(c, Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
    return;
  }
  g.save();
  g.translate(Math.round(x), 0);
  g.scale(-1, 1);
  g.drawImage(c, Math.round(-w / 2), Math.round(y - h), Math.round(w), Math.round(h));
  g.restore();
}

/** A soft shadow on the ground, an ellipse around (x, y) in world units */
function shadow(g: G, x: number, y: number, rx: number, ry: number, a = 0.25): void {
  g.fillStyle = `rgba(10,10,25,${a})`;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

const WOOD = { line: '#2a1610', dark: '#4a2a1c', mid: '#6b3d22', light: '#85502c', pale: '#a8703e' };
const IRON = { line: '#16171d', dark: '#2b2d36', mid: '#454956', light: '#6d7385' };
const PAPER = ['#f4efe2', '#efe2bf', '#f3d98a', '#c8dcec', '#f2c7c0'];
/** The cafe's green, the awning's (LPC awnings sheet) */
const AWNING = { line: '#2c4428', dark: '#3f6339', mid: '#5f8f4e', light: '#82b26a', cream: '#efe6cf', creamDark: '#cfc3a4' };

// ------------------------------------------------------------ the lamp posts

/** When each lamp last switched (TV time), to fade its light in and out */
const lampSwitch = TOWN_SCENE.lamps.map(() => ({ lit: false, at: -Infinity }));

/** How lit a lamp is now, 0 to 1: it flares up over a moment when lit, and dims when put out */
export function lampLevel(i: number, now: number): number {
  const s = lampSwitch[i];
  const lit = !!(townNow.lamps & (1 << i));
  if (lit !== s.lit) {
    s.lit = lit;
    s.at = now;
  }
  const k = Math.min(1, (now - s.at) / 700);
  return lit ? (k < 0.3 ? k * 3.3 * (1 + Math.sin(k * 40) * 0.2) : 1) : 1 - k;
}

function lampPost(env: Env, i: number, x: number, y: number): Prop {
  const ly = y - 82;
  return {
    y,
    draw(g, now) {
      const level = lampLevel(i, now);
      put(g, env['lamp-post'], level > 0.5 ? CUT.lamp : CUT.lampOff, x, y + 4);
      if (level <= 0) return;
      // A warm glow around the light, breathing a little
      const glow = g.createRadialGradient(x, ly, 0, x, ly, 46);
      glow.addColorStop(0, `rgba(255,210,120,${(0.32 + 0.05 * Math.sin(now / 700 + x)) * level})`);
      glow.addColorStop(1, 'rgba(255,210,120,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(x, ly, 46, 0, Math.PI * 2);
      g.fill();
    },
  };
}

// ------------------------------------------------------------ the notice board

/** The board: two posts, a little shingled roof, a frame of dark wood round cork, notices pinned on it */
function buildBoard(): HTMLCanvasElement {
  const [c, g] = canvas(38, 44);
  // The posts
  for (const x of [5, 30]) {
    px(g, WOOD.line, x - 1, 26, 5, 18);
    px(g, WOOD.mid, x, 26, 3, 18);
    px(g, WOOD.light, x, 26, 1, 18);
    px(g, WOOD.dark, x + 2, 26, 1, 18);
  }
  // The roof: two rows of shingles over a ridge plank, lit along the top
  px(g, WOOD.line, 0, 3, 38, 6);
  px(g, '#7b2f22', 1, 4, 36, 4);
  for (let x = 1; x < 37; x += 4) {
    px(g, '#9e4630', x, 4, 3, 1);
    px(g, '#5c2218', x + 3, 4, 1, 4);
  }
  px(g, WOOD.line, 3, 1, 32, 3);
  px(g, WOOD.light, 4, 1, 30, 1);
  px(g, WOOD.mid, 4, 2, 30, 1);
  px(g, 'rgba(14,10,24,0.35)', 2, 9, 34, 2);
  // The frame and the cork
  px(g, WOOD.line, 2, 9, 34, 21);
  px(g, WOOD.mid, 3, 10, 32, 19);
  px(g, WOOD.light, 3, 10, 32, 1);
  px(g, '#b98a5a', 4, 11, 30, 17);
  for (let y = 11; y < 28; y++) for (let x = 4 + (y % 2); x < 34; x += 3) px(g, '#a8794c', x, y);
  px(g, 'rgba(14,10,24,0.25)', 4, 11, 30, 2);
  // The notices: sheets of paper with lines of writing, a red or blue pin at the top of each
  const notes = [
    [6, 13, 8, 10, 0],
    [15, 12, 9, 7, 2],
    [26, 13, 6, 8, 3],
    [15, 20, 7, 6, 1],
    [24, 22, 8, 5, 4],
    [6, 24, 6, 3, 2],
  ];
  for (const [x, y, w, h, k] of notes) {
    px(g, 'rgba(14,10,24,0.3)', x + 1, y + 1, w, h);
    px(g, PAPER[k], x, y, w, h);
    for (let ly = y + 2; ly < y + h - 1; ly += 2) px(g, 'rgba(60,50,60,0.45)', x + 1, ly, w - 2 - ((ly * 7) % 3), 1);
    px(g, k % 2 ? '#3a6ad0' : '#d23a2c', x + Math.floor(w / 2), y, 1, 1);
  }
  return c;
}

function noticeBoard(): Prop {
  const art = buildBoard();
  const { x, y } = NOTICE_BOARD;
  return {
    y,
    ground: (g) => shadow(g, x + 4, y + 1, 30, 6),
    draw: (g) => stand(g, art, x, y + 2),
  };
}

// ------------------------------------------------------------ the cafe's terrace

/** A round bistro table: a marble top on an iron stem and foot */
function buildTable(): HTMLCanvasElement {
  const [c, g] = canvas(38, 23);
  px(g, IRON.line, 13, 21, 12, 2);
  px(g, IRON.mid, 14, 21, 10, 1);
  px(g, IRON.line, 18, 9, 2, 13);
  px(g, IRON.light, 18, 9, 1, 12);
  // The top, seen from above: an ellipse, its rim in shade
  g.fillStyle = '#9d978c';
  g.beginPath();
  g.ellipse(19, 6, 18.5, 5.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ece8de';
  g.beginPath();
  g.ellipse(19, 5.4, 17.2, 4.5, 0, 0, Math.PI * 2);
  g.fill();
  px(g, '#fbf9f3', 7, 2, 12, 1);
  px(g, '#c9c3b6', 6, 10, 26, 1);
  return c;
}

/** A bistro chair seen from the side, facing right: a curved iron back on its left, a wooden seat, thin legs */
function buildChair(): HTMLCanvasElement {
  const [c, g] = canvas(17, 31);
  // The back: an iron frame curving over at the top, a bar across it
  px(g, IRON.line, 1, 2, 3, 16);
  px(g, IRON.light, 2, 2, 1, 15);
  px(g, IRON.line, 2, 0, 5, 3);
  px(g, IRON.light, 3, 1, 3, 1);
  px(g, IRON.line, 4, 6, 1, 9);
  px(g, IRON.line, 3, 9, 3, 1);
  // The seat: a wooden plank on its iron rim
  px(g, WOOD.line, 1, 16, 15, 4);
  px(g, WOOD.light, 2, 16, 13, 1);
  px(g, WOOD.mid, 2, 17, 13, 2);
  px(g, IRON.line, 1, 20, 15, 1);
  // The legs, a little splayed, and the bar between them
  for (const [x, dx] of [
    [2, -1],
    [13, 1],
  ]) {
    px(g, IRON.line, x, 21, 2, 6);
    px(g, IRON.line, x + dx, 27, 2, 4);
    px(g, IRON.mid, x, 21, 1, 1);
  }
  px(g, IRON.dark, 4, 25, 9, 1);
  return c;
}

/** A parasol from above: a wide low cone in green and cream stripes, scalloped at its edge; or furled at night */
function buildParasol(open: boolean): HTMLCanvasElement {
  if (!open) {
    const [c, g] = canvas(6, 26);
    px(g, AWNING.line, 1, 2, 4, 20);
    px(g, AWNING.mid, 2, 3, 2, 18);
    px(g, AWNING.light, 2, 3, 1, 17);
    px(g, AWNING.cream, 2, 9, 2, 2);
    px(g, AWNING.cream, 2, 15, 2, 2);
    px(g, IRON.line, 2, 0, 2, 2);
    px(g, IRON.line, 2, 22, 2, 4);
    return c;
  }
  const W = 50;
  const [c, g] = canvas(W, 18);
  const cx = W / 2;
  for (let y = 2; y < 15; y++) {
    const k = (y - 1) / 13;
    const half = Math.round(3 + k * 21);
    for (let x = cx - half; x < cx + half; x++) {
      // The stripes fan out from the top, like the panels of the canopy
      const a = Math.atan2(x - cx + 0.5, y + 4);
      const panel = Math.floor((a + Math.PI) / (Math.PI / 9)) % 2;
      const lit = x < cx ? 0 : 1;
      const color = panel ? (lit ? AWNING.creamDark : AWNING.cream) : lit ? AWNING.dark : AWNING.mid;
      px(g, color, x, y);
    }
    px(g, AWNING.line, cx - half - 1, y);
    px(g, AWNING.line, cx + half, y);
  }
  // The scalloped valance hanging from its edge
  for (let x = cx - 24; x < cx + 24; x++) {
    const a = Math.atan2(x - cx + 0.5, 18);
    const panel = Math.floor((a + Math.PI) / (Math.PI / 9)) % 2;
    const drop = (x - cx + 24) % 6 < 4 ? 2 : 1;
    px(g, panel ? AWNING.creamDark : AWNING.dark, x, 15, 1, drop);
    px(g, AWNING.line, x, 15 + drop, 1, 1);
  }
  px(g, AWNING.line, cx - 2, 0, 4, 2);
  px(g, '#d9c26a', cx - 1, 0, 2, 1);
  return c;
}

/** The cafe's chalkboard on the sidewalk: an A-frame of wood, a cup drawn in chalk, lines of the day's menu */
function buildChalkboard(): HTMLCanvasElement {
  const [c, g] = canvas(16, 21);
  px(g, WOOD.line, 1, 0, 14, 19);
  px(g, WOOD.mid, 2, 1, 12, 17);
  px(g, '#26302c', 3, 2, 10, 14);
  // The cup and its steam
  px(g, '#e8e8e0', 5, 7, 5, 4);
  px(g, '#e8e8e0', 10, 8, 1, 2);
  px(g, '#c9b089', 6, 7, 3, 1);
  px(g, '#e8e8e0', 6, 4, 1, 2);
  px(g, '#e8e8e0', 8, 3, 1, 2);
  px(g, '#e8e8e0', 4, 12, 8, 1);
  px(g, '#cfd6cf', 4, 14, 5, 1);
  px(g, '#e08a8a', 10, 14, 2, 1);
  px(g, WOOD.line, 2, 18, 2, 3);
  px(g, WOOD.line, 12, 18, 2, 3);
  return c;
}

/** The cups on the cafe's tables, in front of who sits there: white with coffee, a wisp of steam in the day */
export function drawCup(g: G, x: number, y: number, dir: WDir, now: number, phase: number): void {
  const side = dir === 1 ? -1 : 1;
  const cx = Math.round(x + side * 15 * S);
  const cy = Math.round(y - 17 * S);
  g.fillStyle = '#f4f1ea';
  g.fillRect(cx - 1.5 * S, cy - 2 * S, 3 * S, 2 * S);
  g.fillRect(cx + (side > 0 ? 1.5 : -2.5) * S, cy - 1.6 * S, S, S);
  g.fillStyle = '#5b3a24';
  g.fillRect(cx - S, cy - 2 * S, 2 * S, S * 0.7);
  if (townNow.dark < 0.4) {
    const t = ((now + phase) % 2400) / 2400;
    g.fillStyle = `rgba(255,255,255,${0.35 * (1 - t)})`;
    g.fillRect(Math.round(cx + Math.sin(t * 6) * S), Math.round(cy - (3 + t * 8) * S), S, S * 2);
  }
}

/** When each parasol last opened or folded (TV time), to show it opening and folding */
const parasolSwitch: { open: boolean; at: number }[] = [];

/** How far a parasol is open now, 0 (folded) to 1: it unfolds and folds over a moment */
function parasolLevel(i: number, now: number): number {
  const s = (parasolSwitch[i] ??= { open: false, at: -Infinity });
  const open = !!(townNow.parasols & (1 << i));
  if (open !== s.open) {
    s.open = open;
    s.at = now;
  }
  const k = Math.min(1, (now - s.at) / 700);
  return open ? k : 1 - k;
}

function cafeTable(table: HTMLCanvasElement, chair: HTMLCanvasElement, parasol: HTMLCanvasElement, furled: HTMLCanvasElement, x: number, y: number, i: number): Prop[] {
  return [
    {
      y,
      ground(g) {
        shadow(g, x, y + 1, 34, 8);
        // The chairs, either side, facing the table: drawn on the ground, under whoever sits on them
        stand(g, chair, x - 38, y + 2);
        stand(g, chair, x + 38, y + 2, true);
      },
      draw(g) {
        stand(g, table, x, y + 1);
        // The parasol's pole, up to its canopy (drawn over the heads, see below)
        g.fillStyle = IRON.line;
        g.fillRect(Math.round(x - S / 2), Math.round(y - 56 * S), S, 42 * S);
      },
    },
    {
      // The canopy over the table, over the heads of who sits there: opened in the morning and folded
      // around nightfall by someone (see the sim), unfolding and folding over a moment
      y: y + 8,
      draw(g, now) {
        const level = parasolLevel(i, now);
        const open = level >= 1;
        if (level <= 0) stand(g, furled, x, y - 30 * S);
        else if (open) stand(g, parasol, x, y - 50 * S);
        else {
          // Half way: the canopy narrow and high, spreading as it opens (or closing up)
          const w = parasol.width * S * (0.2 + 0.8 * level);
          const h = parasol.height * S * (0.6 + 0.4 * level);
          g.drawImage(parasol, Math.round(x - w / 2), Math.round(y - 50 * S - h - (1 - level) * 6 * S), Math.round(w), Math.round(h));
        }
        if (!open || !townNow.party || townNow.dark < 0.2) return;
        // On a party night: a string of little colored lights along its edge, twinkling
        const colors = ['#ff6a6a', '#ffd36a', '#6affb0', '#6ab8ff', '#e07aff'];
        for (let i = 0; i < 9; i++) {
          const lx = x + (i - 4) * 5.3 * S;
          const ly = y - (50 - 1 - Math.abs(i - 4) * 0.4) * S;
          const on = (Math.floor(now / 400) + i) % 3 !== 0;
          g.fillStyle = on ? colors[i % colors.length] : 'rgba(80,70,90,0.8)';
          g.fillRect(Math.round(lx - S / 2), Math.round(ly), S, S);
        }
      },
    },
  ];
}

// ------------------------------------------------------------ the bench facing right

/** The wood of the city sheet's bench, dark to light */
const BENCH = { line: '#412c18', dark: '#5a3615', shade: '#714f29', mid: '#876437', light: '#a57a44', shine: '#d2a066' };
/** The bench facing right, in its art (sprite pixels): its size, and the middle of its seat */
export const SIDE_BENCH = { w: 22, h: 46, seat: { x: 12, y: 24 } };

/**
 * A park bench seen from the side, facing right (the city sheet has it only facing the front):
 * its seat runs front to back, planks lit from the top left, the backrest's boards along its left
 * edge, the seat's end and legs in shade at the front
 */
export function buildSideBench(): HTMLCanvasElement {
  const { w, h } = SIDE_BENCH;
  const [c, g] = canvas(w, h);
  // The legs: the back ones under the backrest, the front ones under the seat's front end
  for (const [x, y0] of [
    [3, 31],
    [16, 37],
    [6, 37],
  ] as const) {
    px(g, BENCH.line, x, y0, 3, h - y0);
    px(g, BENCH.shade, x + 1, y0, 1, h - y0 - 1);
  }
  // The seat from above: planks running front to back, its outer edge lit, its front end in shade
  px(g, BENCH.line, 5, 11, 15, 27);
  px(g, BENCH.mid, 6, 12, 13, 24);
  for (const x of [9, 12, 15]) px(g, BENCH.shade, x, 12, 1, 24);
  px(g, BENCH.light, 6, 12, 13, 1);
  px(g, BENCH.shine, 7, 12, 1, 23);
  px(g, BENCH.light, 10, 13, 1, 22);
  px(g, BENCH.light, 13, 13, 1, 22);
  px(g, BENCH.light, 16, 13, 1, 22);
  px(g, BENCH.dark, 6, 36, 13, 2);
  px(g, BENCH.shade, 18, 12, 1, 24);
  // The backrest along the left edge: two posts and three boards between them, standing up over the seat
  px(g, BENCH.line, 1, 0, 6, 36);
  px(g, BENCH.mid, 2, 1, 4, 34);
  for (let y = 3; y < 34; y += 7) {
    px(g, BENCH.light, 2, y, 4, 1);
    px(g, BENCH.dark, 2, y + 5, 4, 1);
  }
  px(g, BENCH.shine, 2, 1, 1, 33);
  px(g, BENCH.dark, 5, 1, 1, 34);
  return c;
}

// ------------------------------------------------------------ the campfire

/** The fire pit seen from above: a ring of stones, ash and charred wood inside */
function buildPit(): HTMLCanvasElement {
  const [c, g] = canvas(40, 18);
  g.fillStyle = '#2e2826';
  g.beginPath();
  g.ellipse(20, 9, 15, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4a423e';
  g.beginPath();
  g.ellipse(20, 10, 11, 4, 0, 0, Math.PI * 2);
  g.fill();
  // Two charred logs crossing
  px(g, '#1a1110', 12, 9, 16, 2);
  px(g, '#3a2418', 12, 9, 16, 1);
  px(g, '#1a1110', 17, 6, 6, 7);
  px(g, '#3a2418', 18, 6, 4, 1);
  // The stones around, lit at the top
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.round(20 + Math.cos(a) * 17 - 2);
    const y = Math.round(9 + Math.sin(a) * 7 - 1);
    px(g, '#343043', x, y, 5, 4);
    px(g, i % 3 ? '#8a8494' : '#a8a1ad', x + 1, y, 3, 2);
    px(g, '#c7c0c8', x + 1, y, 2, 1);
  }
  return c;
}

/** A log lying on the grass, seen from above: bark with dark grain, its cut end a light ring (along x or along y, the cut end toward the front) */
function buildLog(along: 'x' | 'y'): HTMLCanvasElement {
  /** The bark across the log, from its lit side to its shaded one: round, lit from the top left */
  const ROUND = [WOOD.line, WOOD.light, WOOD.pale, WOOD.light, WOOD.mid, WOOD.mid, WOOD.mid, WOOD.dark, WOOD.dark, WOOD.line];
  const thick = ROUND.length;
  const long = along === 'x' ? 48 : 40;
  const [c, g] = canvas(along === 'x' ? long : thick, along === 'x' ? thick + 1 : long);
  const ring = (x: number, y: number, w: number, h: number) => {
    px(g, WOOD.line, x, y, w, h);
    px(g, '#c9a36a', x + 1, y + 1, w - 2, h - 2);
    px(g, '#e0c08a', x + 1, y + 1, w - 2, 1);
    px(g, '#a8803e', x + Math.floor(w / 2) - 1, y + Math.floor(h / 2) - 1, 2, 2);
  };
  if (along === 'x') {
    ROUND.forEach((color, k) => px(g, color, 2, k, long - 4, 1));
    // The bark's grain, and a knot
    for (let x = 6; x < long - 6; x += 5) px(g, WOOD.dark, x, 3 + (x % 3), 3, 1);
    px(g, WOOD.line, 20, 4, 2, 2);
    ring(0, 0, 5, thick);
    ring(long - 5, 0, 5, thick);
  } else {
    ROUND.forEach((color, k) => px(g, color, k, 0, 1, long - 6));
    for (let y = 3; y < long - 9; y += 5) px(g, WOOD.dark, 4 + (y % 3), y, 1, 3);
    px(g, WOOD.line, 5, 16, 2, 2);
    // The cut end toward the front
    ring(0, long - 8, thick, 8);
  }
  return c;
}

/** When the campfire last caught or went out (TV time), to let it grow from small flames and die down */
const fireSwitch = { lit: false, at: -Infinity };
/** How brightly the campfire burns now, 0 to 1: it grows over a few seconds once lit, and dies down when it goes out */
export function fireLevel(now: number): number {
  if (townNow.fire !== fireSwitch.lit) {
    fireSwitch.lit = townNow.fire;
    fireSwitch.at = now;
  }
  const t = (now - fireSwitch.at) / 1000;
  return fireSwitch.lit ? Math.min(1, 0.15 + t / 5) : Math.max(0, 1 - t / 4);
}

/** Lighting the fire: sparks from the flint jumping onto the pit's kindling, a first wisp of smoke */
export function drawKindling(g: G, now: number): void {
  const { x, y } = CAMPFIRE;
  for (let i = 0; i < 5; i++) {
    const t = ((now / 420 + i / 5) % 1 + 1) % 1;
    if ((Math.floor(now / 140) + i) % 3 === 0) continue;
    g.fillStyle = `rgba(255,${200 + i * 10},110,${1 - t})`;
    g.fillRect(Math.round(x - 8 * S + Math.sin(i * 5.1) * 5 * S), Math.round(y - (2 + t * 9) * S), S, S);
  }
  for (let i = 0; i < 3; i++) {
    const t = ((now / 1800 + i / 3) % 1 + 1) % 1;
    g.fillStyle = `rgba(210,210,215,${0.35 * (1 - t)})`;
    g.beginPath();
    g.arc(x + Math.sin(t * 4 + i) * 4 * S, y - (4 + t * 30) * S, (2 + t * 4) * S, 0, Math.PI * 2);
    g.fill();
  }
}

function campfire(): Prop[] {
  const pit = buildPit();
  const logs = FIRE_LOGS.map((l) => ({ ...l, art: buildLog(l.along) }));
  const { x, y } = CAMPFIRE;
  return [
    {
      y,
      ground(g) {
        shadow(g, x, y + 4, 34, 10, 0.2);
        stand(g, pit, x, y + 10);
        for (const l of logs) {
          shadow(g, l.x + 3, l.y + (l.along === 'x' ? 6 : 26), l.along === 'x' ? 32 : 7, l.along === 'x' ? 4 : 6, 0.25);
          stand(g, l.art, l.x, l.y + (l.along === 'x' ? 6 : 26));
        }
      },
      draw(g, now) {
        const level = fireLevel(now);
        if (level <= 0) return;
        // The flames: tongues of fire licking up, each flickering on its own, yellow in their heart
        const tongues = [
          [-7, 9, 0],
          [-3, 15, 1.7],
          [1, 18, 3.1],
          [5, 13, 4.4],
          [8, 8, 5.9],
        ];
        for (const [dx, h0, ph] of tongues) {
          const h = (h0 + Math.sin(now / 90 + ph) * 3 + Math.sin(now / 37 + ph * 2) * 1.5) * level;
          const sway = Math.sin(now / 140 + ph) * 1.2;
          for (const [color, k, w] of [
            ['#c2402a', 1, 4],
            ['#f39c3a', 0.72, 3],
            ['#ffe08a', 0.4, 2],
          ] as const) {
            const fh = Math.max(1, Math.round(h * k));
            g.fillStyle = color;
            g.beginPath();
            g.moveTo(x + (dx - w) * S, y - 1 * S);
            g.quadraticCurveTo(x + (dx + sway * 0.5) * S, y - fh * 0.6 * S, x + (dx + sway) * S, y - fh * S);
            g.quadraticCurveTo(x + (dx + sway * 0.5) * S, y - fh * 0.6 * S, x + (dx + w) * S, y - 1 * S);
            g.fill();
          }
        }
        // Sparks rising and fading
        for (let i = 0; i < 6; i++) {
          const t = ((now / 1300 + i / 6) % 1 + 1) % 1;
          g.fillStyle = `rgba(255,${180 + i * 10},90,${(1 - t) * level})`;
          g.fillRect(Math.round(x + (Math.sin(i * 7.3 + t * 5) * 8 + (i - 3) * 2) * S), Math.round(y - (14 + t * 40) * S), S, S);
        }
      },
    },
  ];
}

/** The campfire's light at night, over the dark: a warm flickering glow on the grass and the faces around it */
export function drawFireLight(g: G, dark: number, now: number): void {
  const level = fireLevel(now) * dark;
  if (level <= 0.02) return;
  const { x, y } = CAMPFIRE;
  const flicker = 1 + Math.sin(now / 80) * 0.05 + Math.sin(now / 31) * 0.03;
  const r = 170 * flicker;
  const glow = g.createRadialGradient(x, y - 14, 0, x, y - 14, r);
  glow.addColorStop(0, `rgba(255,170,80,${0.32 * level})`);
  glow.addColorStop(0.5, `rgba(255,140,60,${0.12 * level})`);
  glow.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(x, y - 14, r, 0, Math.PI * 2);
  g.fill();
}

// ------------------------------------------------------------ all of them

/** Everything that stands up on the town's square (`keep`: which of the sidewalk's benches and plants to keep, by their x) */
export function townProps(env: Env, keep: (x: number) => boolean): Prop[] {
  const out: Prop[] = [fountain(env, TOWN_SCENE.fountain.x, TOWN_SCENE.fountain.y)];
  TOWN_SCENE.trees.forEach((t, k) => out.push(tree(env, t.x, t.y, k % 2 === 1, k * 1.7, t.size, 'stem' in t ? t.stem : 1)));
  TOWN_SCENE.lamps.forEach((l, i) => out.push(lampPost(env, i, l.x, l.y)));
  // The sidewalk's benches and plants, but the bench before the cafe's porch: the town's own benches instead
  out.push(...sidewalkProps(env, (x) => keep(x) && x !== TOWN_BENCHES.instead));
  const side = buildSideBench();
  for (const b of TOWN_BENCHES.list) {
    if (b.dir === 2) out.push(still(env.magecity, CUT.bench, b.x, b.y));
    else
      out.push({
        // (sorted a little up its length: who sits on it is drawn over it)
        y: b.y - 16,
        ground: (g) => shadow(g, b.x + 2, b.y - 3, 16, 7),
        draw: (g) => stand(g, side, b.x, b.y, b.dir === 1),
      });
  }
  out.push(noticeBoard());
  const table = buildTable();
  const chair = buildChair();
  const parasol = buildParasol(true);
  const furled = buildParasol(false);
  CAFE.tables.forEach((t, i) => out.push(...cafeTable(table, chair, parasol, furled, t.x, t.y, i)));
  const board = buildChalkboard();
  out.push({ y: 164, draw: (g) => stand(g, board, CAFE.door.x - 58, 165) });
  out.push(...campfire());
  return out;
}
