import { SPRITE_SCALE } from '$shared/crowd.ts';
import { ARCADE_GAMES, arcadeGame, type ArcadeMatch, type ArcadeState } from '$shared/arcade.ts';
import type { TownPlace } from '$shared/world.ts';
import { enabled, hb, serverNow } from '$lib/client.svelte.ts';

/**
 * The town's arcade, on the small brick house by the town hall: a deep purple shopfront, two arcade
 * machines behind the window, and a marquee over the gable with ARCADE in neon and an LED screen
 * that shows the scores of the matches being played (one after the other when there are several,
 * sliding), or the party's best scores when nobody plays.
 *
 * All in sprite pixels of the house's art (x from its left, y from its top), drawn one pixel at a
 * time like the other shops (shopfronts.ts), SPRITE_SCALE world units a pixel on the TV.
 */

const S = SPRITE_SCALE;

/** Painted wood, deep purple, lit from the top left */
export const ARCADE_PAINT = { line: '#120c26', dark: '#21173f', mid: '#33265e', light: '#4b3a86', shine: '#7462c4' };
const NEON = { pink: '#ff4fb0', pinkGlow: 'rgba(255,79,176,', cyan: '#4fe8ff', cyanGlow: 'rgba(79,232,255,', gold: '#ffd23d' };

/** The marquee over the gable: its board, the ARCADE band and the LED screen in it */
export const MARQUEE = { x: 8, y: 66, w: 128, h: 60 };
const TITLE = { y: 70, h: 16 };
export const SCREEN = { x: 14, y: 89, w: 116, h: 32 };

// ------------------------------------------------------------ a 5 x 7 pixel font

const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '*': ['.....', '..#..', '#.#.#', '.###.', '#.#.#', '..#..', '.....'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
};

/** Letters the font has: the rest of a name goes (accents lose theirs) */
function clean(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split('')
    .filter((c) => FONT[c])
    .join('');
}

const textWidth = (s: string, k = 1) => (s.length ? s.length * 6 * k - k : 0);

/** Text in the pixel font, `k` pixels a font pixel, top left at x, y */
function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, k = 1): void {
  g.fillStyle = color;
  for (let i = 0; i < s.length; i++) {
    const glyph = FONT[s[i]];
    if (!glyph) continue;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (glyph[r][c] === '#') g.fillRect(x + (i * 6 + c) * k, y + r * k, k, k);
  }
}

function px(g: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1): void {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

// ------------------------------------------------------------ the building (in the ground, built once)

/** The glass of the window and the door's top left, as frontOf gives them */
interface ArcadeFront {
  w: number;
  h: number;
  glass: { x: number; y: number; w: number; h: number };
  door: { x: number; y: number };
}

/**
 * The arcade on the small brick house: a purple shopfront round the window with a pink neon tube
 * along it, a dark glass door in the house's doorway, the marquee's board standing over the gable on
 * two iron legs (its lights and screen are drawn live, see drawArcadeLive)
 */
export function buildArcade(g: CanvasRenderingContext2D, f: ArcadeFront): void {
  const P = ARCADE_PAINT;
  const { glass: gl, door } = f;
  const beam = (x: number, y: number, w: number, h: number) => {
    px(g, P.mid, x, y, w, h);
    px(g, P.line, x, y, w, 1);
    px(g, P.line, x, y + h - 1, w, 1);
    if (h > 2) px(g, P.shine, x, y + 1, w, 1);
    if (h > 3) px(g, P.dark, x, y + h - 2, w, 1);
  };
  const post = (x: number, y: number, w: number, h: number) => {
    px(g, P.mid, x, y, w, h);
    px(g, P.line, x, y, 1, h);
    px(g, P.line, x + w - 1, y, 1, h);
    if (w > 2) px(g, P.shine, x + 1, y, 1, h);
    if (w > 3) px(g, P.dark, x + w - 2, y, 1, h);
  };
  const panel = (x: number, y: number, w: number, h: number) => {
    px(g, P.mid, x, y, w, h);
    px(g, P.dark, x, y, w, 1);
    px(g, P.dark, x, y, 1, h);
    px(g, P.light, x, y + h - 1, w, 1);
    px(g, P.light, x + w - 1, y, 1, h);
  };

  // The window's shopfront, down to the ground
  const x0 = gl.x - 4;
  const x1 = gl.x + gl.w + 4;
  px(g, P.mid, x0, gl.y - 6, x1 - x0, f.h - gl.y + 6);
  beam(x0 - 1, gl.y - 7, x1 - x0 + 2, 4);
  beam(x0, gl.y - 3, x1 - x0, 3);
  post(x0, gl.y, 4, gl.h);
  post(x1 - 4, gl.y, 4, gl.h);
  beam(x0 - 2, gl.y + gl.h, x1 - x0 + 4, 3);
  post(x0, gl.y + gl.h + 3, x1 - x0, f.h - gl.y - gl.h - 3);
  const ph = f.h - gl.y - gl.h - 8;
  const pw = Math.floor((x1 - x0 - 10) / 2);
  panel(x0 + 3, gl.y + gl.h + 5, pw, ph);
  panel(x1 - 3 - pw, gl.y + gl.h + 5, pw, ph);
  // A joystick and a button painted on the panels
  for (const cx of [x0 + 3 + pw / 2, x1 - 3 - pw / 2]) {
    const cy = gl.y + gl.h + 5 + ph / 2;
    px(g, P.line, Math.round(cx) - 1, Math.round(cy) - 4, 2, 5);
    px(g, NEON.pink, Math.round(cx) - 2, Math.round(cy) - 6, 4, 3);
    px(g, NEON.cyan, Math.round(cx) + 3, Math.round(cy) - 1, 2, 2);
  }
  px(g, 'rgba(20,10,20,0.35)', x0 - 2, gl.y + gl.h + 3, x1 - x0 + 4, 1);
  px(g, 'rgba(20,10,20,0.25)', x1 + 1, gl.y - 6, 1, f.h - gl.y + 6);
  // The neon tube round the glass (it glows at night, see drawArcadeLight)
  px(g, '#ff9fd5', gl.x - 1, gl.y - 1, gl.w + 2, 1);
  px(g, '#ff9fd5', gl.x - 1, gl.y + gl.h, gl.w + 2, 1);
  px(g, '#ff9fd5', gl.x - 1, gl.y, 1, gl.h);
  px(g, '#ff9fd5', gl.x + gl.w, gl.y, 1, gl.h);

  // The doorway: a glowing pink fanlight over the dark door (drawn by the TV, it opens)
  const top = 133;
  const fan = g.createLinearGradient(0, top, 0, door.y);
  fan.addColorStop(0, '#ff7ac8');
  fan.addColorStop(1, '#8a2a9e');
  g.fillStyle = fan;
  g.fillRect(door.x, top, 32, door.y - top - 1);
  for (const mx of [door.x + 10, door.x + 21]) px(g, P.line, mx, top, 1, door.y - top - 1);
  beam(door.x, door.y - 2, 32, 2);
  px(g, '#1a0f24', door.x, door.y, 32, 48);

  // The marquee's legs, on the roof down to the wall
  const m = MARQUEE;
  for (const lx of [m.x + 14, m.x + m.w - 16]) {
    px(g, '#0f1218', lx, m.y + m.h, 3, 132 - m.y - m.h);
    px(g, '#4b4b60', lx + 1, m.y + m.h, 1, 132 - m.y - m.h);
  }
  // The board: a dark frame with rivets, the title band and the screen's well
  px(g, '#0d0a1c', m.x, m.y, m.w, m.h);
  px(g, P.light, m.x + 1, m.y + 1, m.w - 2, 1);
  px(g, P.mid, m.x + 1, m.y + 2, m.w - 2, m.h - 3);
  px(g, P.dark, m.x + 1, m.y + m.h - 2, m.w - 2, 1);
  for (let x = m.x + 4; x < m.x + m.w - 2; x += 8) {
    px(g, P.shine, x, m.y + 3, 1, 1);
    px(g, P.shine, x, m.y + m.h - 4, 1, 1);
  }
  px(g, '#140c28', m.x + 4, TITLE.y, m.w - 8, TITLE.h);
  px(g, P.line, SCREEN.x - 2, SCREEN.y - 2, SCREEN.w + 4, SCREEN.h + 4);
  px(g, '#05030a', SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h);
  // Its shadow on the roof
  px(g, 'rgba(10,5,20,0.35)', m.x + 2, m.y + m.h, m.w - 4, 2);
}

/** What is seen through the window: a dark room in neon light, two machines on the back wall (glass-sized) */
export function buildArcadeRoom(f: ArcadeFront, seats: number[]): HTMLCanvasElement {
  const { w, h } = f.glass;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const wall = g.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, '#2a1650');
  wall.addColorStop(1, '#120a26');
  g.fillStyle = wall;
  g.fillRect(0, 0, w, h);
  // A neon strip along the ceiling, stars on the wall, a checkered floor
  px(g, NEON.cyan, 0, 1, w, 1);
  px(g, 'rgba(79,232,255,0.25)', 0, 2, w, 2);
  for (let i = 0; i < 14; i++) px(g, 'rgba(255,255,255,0.35)', (i * 23) % w, 5 + ((i * 11) % 12), 1, 1);
  for (let x = 0; x < w; x += 4) for (let y = h - 6; y < h; y += 3) px(g, (x / 4 + (y - h) / 3) % 2 ? '#2a1d45' : '#1a1030', x, y, 4, 3);
  // The machines, one at each place inside
  for (const sx of seats) cabinet(g, Math.round(sx) - 9, 8);
  return c;
}

/** An arcade machine, 18 x 34: a lit marquee, the screen (drawn live), the control panel */
function cabinet(g: CanvasRenderingContext2D, x: number, y: number): void {
  // The body, lit from the left
  px(g, '#0d0a1c', x, y, 18, 34);
  px(g, '#3a2a6e', x + 1, y + 1, 16, 32);
  px(g, '#5a46a8', x + 1, y + 1, 2, 32);
  px(g, '#24184a', x + 15, y + 1, 2, 32);
  // The marquee on top
  px(g, NEON.gold, x + 2, y + 2, 14, 4);
  px(g, '#fff3b0', x + 3, y + 3, 6, 1);
  // The screen's frame (the screen itself is drawn live)
  px(g, '#05030a', x + 3, y + 8, 12, 10);
  // The control panel: a joystick, two buttons
  px(g, '#1a1030', x + 1, y + 20, 16, 4);
  px(g, '#e8e8f0', x + 5, y + 19, 1, 2);
  px(g, NEON.pink, x + 4, y + 18, 3, 1);
  px(g, NEON.cyan, x + 10, y + 21, 2, 1);
  px(g, NEON.gold, x + 13, y + 21, 2, 1);
}

// ------------------------------------------------------------ live: the cabinets' screens, the marquee

const arcade = () => (enabled('arcade') ? (hb.modules.arcade as ArcadeState | undefined) : undefined);
/** The matches the screen shows: being played, or just over */
const showing = () => arcade()?.matches ?? [];

/** The machines' screens behind the glass: the game the match plays, or an attract mode */
export function drawCabinetScreens(g: CanvasRenderingContext2D, p: TownPlace, now: number): void {
  const m = showing().find((x) => x.phase !== 'result');
  const game = m ? arcadeGame(m.rounds[m.rounds.length - 1].game) : null;
  p.seats.forEach((sx, i) => {
    const x = p.window.x + (Math.round((sx - p.window.x) / S) - 9 + 3) * S;
    const y = p.window.y + (8 + 8) * S;
    const colors = game ? game.colors : (['#3d8bff', '#ff4fb0'] as const);
    const t = Math.floor(now / 140) + i * 3;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 6; c++) {
        const on = (Math.sin(t * 0.7 + r * 1.3 + c * 2.1 + i) + 1) / 2;
        g.fillStyle = on > 0.6 ? colors[(r + c + t) % 2] : '#0a0618';
        g.fillRect(x + c * 2 * S, y + r * 2 * S, 2 * S, 2 * S);
      }
    }
  });
}

/** A canvas the size of the marquee, drawn again every frame */
let board: HTMLCanvasElement | null = null;
function boardCanvas(): HTMLCanvasElement {
  if (!board) {
    board = document.createElement('canvas');
    board.width = MARQUEE.w;
    board.height = MARQUEE.h;
  }
  return board;
}

/** A short name for the screen: a game's first word, a player's name cut to fit */
const SHORT: Record<string, string> = { knife: 'KNIFE', stack: 'STACK', flap: 'FLAP', zig: 'ZIG', maths: 'MATHS', slicer: 'SLICER' };
const shortGame = (id: string) => SHORT[id] ?? clean(arcadeGame(id)?.name ?? '').slice(0, 6);
const shortName = (name: string, max = 6) => clean(name.trim().split(/\s+/)[0] ?? '').slice(0, max) || '?';

/** One match on the screen (x: left of the screen in the board canvas) */
function drawMatch(g: CanvasRenderingContext2D, m: ArcadeMatch, x: number, y: number, now: number): void {
  const r = m.rounds[m.rounds.length - 1];
  const [a, b] = m.players;
  const W = SCREEN.w;
  // Names over the scores, in each player's color
  text(g, shortName(a.name), x + 3, y + 3, a.color);
  const nb = shortName(b.name);
  text(g, nb, x + W - 3 - textWidth(nb), y + 3, b.color);
  // The middle: the game, and what is going on
  const blink = Math.floor(now / 450) % 2 === 0;
  let mid = shortGame(r.game);
  let midColor = NEON.cyan;
  if (m.phase === 'ready') [mid, midColor] = [blink ? 'READY' : shortGame(r.game), NEON.gold];
  else if (m.phase === 'play' && m.startsAt && serverNow() < m.startsAt) [mid, midColor] = [String(Math.max(1, Math.ceil((m.startsAt - serverNow()) / 1000))), NEON.gold];
  text(g, mid, x + Math.round((W - textWidth(mid)) / 2), y + 3, midColor);
  if (m.count > 1) {
    const wins = `${m.wins[a.id] ?? 0}-${m.wins[b.id] ?? 0}`;
    text(g, wins, x + Math.round((W - textWidth(wins)) / 2), y + 13, '#9a8cff');
  }
  if (m.phase === 'result' || m.phase === 'round') {
    const who = m.phase === 'result' ? m.winner : r.winner;
    const line = who === null || who === undefined ? 'TIE' : `${shortName(m.players.find((p) => p.id === who)!.name, 8)} WINS`;
    text(g, line, x + Math.round((W - textWidth(line, 1)) / 2), y + 22, blink ? NEON.gold : '#ffffff');
    // The scores of the round stay small on the sides
    text(g, String(r.scores[a.id] ?? 0), x + 3, y + 13, '#ffffff');
    const sb = String(r.scores[b.id] ?? 0);
    text(g, sb, x + W - 3 - textWidth(sb), y + 13, '#ffffff');
    return;
  }
  // The scores, big
  const sa = String(r.scores[a.id] ?? 0);
  const sb = String(r.scores[b.id] ?? 0);
  text(g, sa, x + 3, y + 13, r.done.includes(a.id) ? '#8a86a0' : '#ffffff', 2);
  text(g, sb, x + W - 3 - textWidth(sb, 2), y + 13, r.done.includes(b.id) ? '#8a86a0' : '#ffffff', 2);
}

/** Nobody plays: the best scores of the party scroll by between the arcade's own calls (nothing of the world outside the town) */
function drawIdle(g: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  const recs = arcade()?.records ?? {};
  const parts = ['CHALLENGERS WANTED', 'INSERT COIN'];
  for (const gm of ARCADE_GAMES) {
    const r = recs[gm.id];
    if (r) parts.push(`BEST ${shortGame(gm.id)} ${r.score} ${shortName(r.name, 8)}`);
  }
  parts.push('1 VS 1 WHO DARES?');
  const line = parts.join('  *  ') + '  *  ';
  const wLine = textWidth(line, 2) + 12;
  const off = Math.floor(now / 28) % wLine;
  g.save();
  g.beginPath();
  g.rect(x, y, SCREEN.w, SCREEN.h);
  g.clip();
  // In from the right, the copy before it leaving on the left
  const base = x + SCREEN.w - off;
  for (const at of [base, base - wLine]) text(g, line, at, y + 9, NEON.cyan, 2);
  g.restore();
}

/** The marquee: ARCADE in neon (its letters lighting up in turn now and then), the LED screen */
function drawBoard(now: number): HTMLCanvasElement {
  const c = boardCanvas();
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  const m = MARQUEE;
  // ARCADE, 2 pixels a font pixel, pink, a chase of light now and then
  const word = 'ARCADE';
  const tw = textWidth(word, 2);
  const tx = Math.round((m.w - tw) / 2);
  const chase = Math.floor(now / 120) % 40;
  for (let i = 0; i < word.length; i++) {
    const lit = chase < word.length ? i <= chase : true;
    text(g, word[i], tx + i * 12, TITLE.y - m.y + 1, lit ? (chase === i ? '#ffffff' : NEON.pink) : '#6a2a55', 2);
  }
  // Bulbs along the board's edges, running
  for (let i = 0, x = 3; x < m.w - 3; x += 6, i++) {
    const on = (i + Math.floor(now / 200)) % 3 === 0;
    px(g, on ? NEON.gold : '#5a4a20', x, 1, 2, 1);
    px(g, on ? NEON.gold : '#5a4a20', m.w - 1 - x - 2, m.h - 2, 2, 1);
  }
  // The screen
  const sx = SCREEN.x - m.x;
  const sy = SCREEN.y - m.y;
  const settings = arcade()?.settings;
  const list = settings?.townScreen ? showing() : [];
  if (!list.length) drawIdle(g, sx, sy, now);
  else {
    const period = Math.max(2, settings?.screenSec ?? 5) * 1000;
    const slide = 400;
    const k = Math.floor(now / period);
    const into = now % period;
    const cur = list[k % list.length];
    g.save();
    g.beginPath();
    g.rect(sx, sy, SCREEN.w, SCREEN.h);
    g.clip();
    if (list.length > 1 && into > period - slide) {
      // Sliding to the next match
      const t = (into - (period - slide)) / slide;
      const off = Math.round(t * t * (3 - 2 * t) * SCREEN.w);
      drawMatch(g, cur, sx - off, sy, now);
      drawMatch(g, list[(k + 1) % list.length], sx + SCREEN.w - off, sy, now);
    } else drawMatch(g, cur, sx, sy, now);
    g.restore();
    // Which match this is, in dots along the bottom
    if (list.length > 1) list.forEach((_, i) => px(g, i === k % list.length ? '#ffffff' : '#4a3a70', sx + SCREEN.w / 2 - list.length * 2 + i * 4, sy + SCREEN.h - 2, 2, 1));
  }
  // LED rows: a faint dark line every other pixel row over the screen
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = sy; y < sy + SCREEN.h; y += 2) g.fillRect(sx, y, SCREEN.w, 1);
  return c;
}

/** World position of a sprite pixel of the house's art */
const worldAt = (p: TownPlace, h: number, x: number, y: number) => ({ x: p.house.x0 + x * S, y: p.house.bottom - (h - y) * S });

/** The marquee on the TV, every frame (`h`: the height of the house's art) */
export function drawArcadeLive(g: CanvasRenderingContext2D, p: TownPlace, h: number, now: number): void {
  const c = drawBoard(now);
  const o = worldAt(p, h, MARQUEE.x, MARQUEE.y);
  g.drawImage(c, 0, 0, c.width, c.height, o.x, o.y, c.width * S, c.height * S);
}

/** In the evening, over the night veil: the marquee lit again, glowing, and the pink tube round the window */
export function drawArcadeLight(g: CanvasRenderingContext2D, p: TownPlace, h: number, now: number, dark: number): void {
  const o = worldAt(p, h, MARQUEE.x, MARQUEE.y);
  const w = MARQUEE.w * S;
  const hh = MARQUEE.h * S;
  // A glow round the board
  const glow = g.createRadialGradient(o.x + w / 2, o.y + hh / 2, 10, o.x + w / 2, o.y + hh / 2, w * 0.75);
  glow.addColorStop(0, `${NEON.pinkGlow}${0.28 * dark})`);
  glow.addColorStop(1, `${NEON.pinkGlow}0)`);
  g.fillStyle = glow;
  g.fillRect(o.x - w * 0.3, o.y - hh * 0.6, w * 1.6, hh * 2.2);
  g.globalAlpha = Math.min(1, 0.55 + dark * 0.6);
  drawArcadeLive(g, p, h, now);
  g.globalAlpha = 1;
  // The window's neon tube
  const { x, y, w: ww, h: wh } = p.window;
  g.strokeStyle = `${NEON.pinkGlow}${0.7 * dark})`;
  g.lineWidth = 2;
  g.strokeRect(x - S / 2, y - S / 2, ww + S, wh + S);
  g.strokeStyle = `${NEON.pinkGlow}${0.18 * dark})`;
  g.lineWidth = 8;
  g.strokeRect(x - S / 2, y - S / 2, ww + S, wh + S);
}
