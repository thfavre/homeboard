import { BODY, FRAME_PX, SPRITE_SCALE } from '$shared/crowd.ts';
import { type SheetInfo, type WDir } from '$shared/world.ts';

/**
 * The poses of the town's places, made of the LPC rows the avatar sheets have (see
 * server/modules/world/compose.ts), and what the characters hold, drawn by hand: sitting on a seat
 * facing any way (the last frame of the sit rows is the chair sit), dancing at the cafe's party, an
 * angler's rod with its line and float and the fish, a glass at the party, the lamplighter's pole.
 */

type G = CanvasRenderingContext2D;
const S = SPRITE_SCALE;

/** A row of the sheet with at least this many frames, or null (a sheet made before it existed) */
function rowOf(img: HTMLImageElement, info: SheetInfo, key: string, frames = 1): { row: number; frames: number } | null {
  const row = info.rows[key];
  return row && row.frames >= frames && img.naturalHeight >= (row.row + 1) * (info.frame || FRAME_PX) ? row : null;
}

/** One frame of a row, feet at (x, y), mirrored when asked */
function drawFrame(g: G, img: HTMLImageElement, info: SheetInfo, row: number, frame: number, x: number, y: number, mirror = false): void {
  const p = info.frame || FRAME_PX;
  const size = FRAME_PX * S;
  if (!mirror) {
    g.drawImage(img, frame * p, row * p, p, p, Math.round(x - BODY.centerX * S), Math.round(y - BODY.feetY * S), size, size);
    return;
  }
  g.save();
  g.translate(Math.round(x), 0);
  g.scale(-1, 1);
  g.drawImage(img, frame * p, row * p, p, p, Math.round(-BODY.centerX * S), Math.round(y - BODY.feetY * S), size, size);
  g.restore();
}

const SIT_ROWS: Record<WDir, string> = { 0: 'sitUp', 1: 'sitLeft', 2: 'sit', 3: 'sitRight' };

/**
 * Sitting on a seat (the fountain's rim, a log, a cafe chair) facing `dir`, sitting down over the
 * first moments like on a bench; or on the ground (`ground`), legs out (the sit rows' first frame).
 * False: the sheet has no sit art for it.
 */
export function drawPerched(g: G, img: HTMLImageElement, info: SheetInfo, x: number, y: number, dir: WDir, since: number, ground = false): boolean {
  const row = rowOf(img, info, SIT_ROWS[dir], 3) ?? rowOf(img, info, 'sit', 3);
  if (!row) return false;
  drawFrame(g, img, info, row.row, ground ? 0 : Math.min(row.frames - 1, Math.floor(since / 150)), x, y);
  return true;
}

/**
 * The dance's steps, one a beat: an emote frame or a jump frame (facing the front), or the side
 * emote (mirrored to face right), and how high the step lifts (sprite pixels)
 */
const STEPS: { row: string; frame: number; mirror?: boolean; up?: number }[] = [
  { row: 'emote', frame: 2 },
  { row: 'emote', frame: 0, up: 1 },
  { row: 'jump', frame: 2, up: 2 },
  { row: 'emote', frame: 2 },
  { row: 'emoteLeft', frame: 1 },
  { row: 'emoteLeft', frame: 2, up: 1 },
  { row: 'emoteLeft', frame: 1, mirror: true },
  { row: 'emoteLeft', frame: 2, mirror: true, up: 1 },
];
const BEAT_MS = 280;

/** Dancing at the party, a step every beat; each dancer is a few steps off the others. False: nothing to draw it with */
export function drawDancing(g: G, img: HTMLImageElement, info: SheetInfo, x: number, y: number, now: number, phase: number): boolean {
  const beat = Math.floor((now + phase) / BEAT_MS);
  const step = STEPS[((beat % STEPS.length) + STEPS.length) % STEPS.length];
  const row = rowOf(img, info, step.row, step.frame + 1) ?? rowOf(img, info, 'emote', 3);
  if (!row) return false;
  drawFrame(g, img, info, row.row, Math.min(step.frame, row.frames - 1), x, y - (step.up ?? 0) * S, step.mirror);
  return true;
}

// ------------------------------------------------------------ what they hold

const WOOD = { line: '#2a1610', dark: '#4a2a1c', mid: '#6b3d22', light: '#85502c' };

/** A line in world units, `w` sprite pixels thick */
function stroke(g: G, color: string, w: number, ...pts: number[]): void {
  g.strokeStyle = color;
  g.lineWidth = w * S;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
}

/**
 * An angler facing the water (the front), the rod in both hands held up to one side (`side`), its
 * line down to the float on the water. Waiting the float rocks gently; on a bite (`bite`: ms into it)
 * it dips again and again and the rod's tip bends down, rings spreading on the water.
 */
export function drawRod(g: G, x: number, y: number, side: 1 | -1, now: number, bite: number | null): void {
  const hand = { x: x + side * 5 * S, y: y - 26 * S };
  const pull = bite === null ? 0 : (Math.sin(bite / 70) * 0.5 + 0.5) * 6;
  const tip = { x: x + side * 22 * S, y: y - (50 - pull) * S };
  const float = { x: tip.x + side * 3 * S, y: y + (19 + (bite === null ? Math.sin(now / 600) * 0.6 : pull * 0.5)) * S };
  // The line, then the rod over it: dark wood, lighter along its top, thinner to the tip
  stroke(g, 'rgba(235,235,225,0.75)', 0.5, tip.x, tip.y, float.x, float.y - 2 * S);
  const mid = { x: (hand.x + tip.x) / 2, y: (hand.y + tip.y) / 2 - pull * S * 0.6 };
  stroke(g, WOOD.line, 2, hand.x, hand.y, mid.x, mid.y, tip.x, tip.y);
  stroke(g, WOOD.light, 1, hand.x, hand.y, mid.x, mid.y, tip.x, tip.y);
  // The reel by the hands
  g.fillStyle = '#a8b3b8';
  g.fillRect(Math.round(hand.x - side * 2 * S), Math.round(hand.y - 1 * S), 2 * S, 2 * S);
  // The float: red over white, and rings on the water around it now and then (all the time on a bite)
  const t = bite === null ? (now % 2600) / 2600 : (bite % 500) / 500;
  if (bite !== null || t < 0.5) {
    const k = bite === null ? t * 2 : t;
    g.strokeStyle = `rgba(200,236,240,${0.7 * (1 - k)})`;
    g.lineWidth = S * 0.8;
    g.beginPath();
    g.ellipse(float.x, float.y + S, (3 + k * 7) * S, (1 + k * 2.5) * S, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#f2f2ee';
  g.fillRect(Math.round(float.x - S), Math.round(float.y - S), 2 * S, 2 * S);
  g.fillStyle = '#d23a2c';
  g.fillRect(Math.round(float.x - S), Math.round(float.y - 2.5 * S), 2 * S, 1.6 * S);
}

/** A small fish: silver with a blue-grey back, a darker tail, an eye (sprite pixels, facing right) */
const FISH = ['..bbbbb..t', '.bbbbbbbtt', 'besssssstt', '.ssssssstt', '..sssss..t'];
const FISH_COLORS: Record<string, string> = { b: '#56708a', s: '#c4d2da', e: '#121820', t: '#3f566e' };

function fish(g: G, x: number, y: number, flip: boolean, tilt: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  if (flip) g.scale(-1, 1);
  FISH.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const color = FISH_COLORS[row[c]];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect((c - 5) * S, (r - 2.5) * S, S, S);
    }
  });
  g.restore();
}

/**
 * The catch: the fish flies up out of the water on the line in an arc, then is held up overhead
 * (the arms up of the emote), wriggling, a few drops falling off it. `t`: ms since the catch began.
 */
export function drawCatch(g: G, x: number, y: number, side: 1 | -1, t: number): void {
  const fly = Math.min(1, t / 380);
  const from = { x: x + side * 25 * S, y: y + 19 * S };
  const to = { x, y: y - 66 * S };
  const fx = from.x + (to.x - from.x) * fly;
  const fy = from.y + (to.y - from.y) * fly - Math.sin(fly * Math.PI) * 26 * S;
  if (fly < 1) {
    // The splash where it came out
    g.fillStyle = `rgba(200,236,240,${0.8 * (1 - fly)})`;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      g.fillRect(Math.round(from.x + Math.cos(a) * (4 + fly * 10) * S), Math.round(from.y - Math.sin(a) * (2 + fly * 12) * S), S, S);
    }
  }
  fish(g, fx, fy, side < 0, fly < 1 ? fly * 6 : Math.sin(t / 90) * 0.35);
  if (fly >= 1) {
    g.fillStyle = 'rgba(200,236,240,0.85)';
    for (let i = 0; i < 3; i++) {
      const d = ((t / 600 + i / 3) % 1) * 22;
      g.fillRect(Math.round(to.x + (i - 1) * 4 * S), Math.round(to.y + (3 + d) * S), S * 0.8, S);
    }
  }
}

/**
 * A glass at the party, in the hand toward the one they talk to: a pint of amber beer with a head of
 * foam, raised to the mouth for a sip now and then
 */
export function drawGlass(g: G, x: number, y: number, dir: WDir, now: number, phase: number): void {
  const side = dir === 1 ? -1 : 1;
  const t = ((now + phase) % 5200) / 5200;
  const sip = t > 0.82 ? Math.sin(((t - 0.82) / 0.18) * Math.PI) : 0;
  const gx = Math.round(x + side * (8 - sip * 3) * S);
  const gy = Math.round(y - (27 + sip * 19) * S);
  const w = 3 * S;
  const h = 5 * S;
  g.fillStyle = '#3b2a1a';
  g.fillRect(gx - w / 2 - S * 0.5, gy - h, w + S, h + S * 0.5);
  g.fillStyle = '#e0a03a';
  g.fillRect(gx - w / 2, gy - h + S, w, h - S);
  g.fillStyle = '#f6c86a';
  g.fillRect(gx - w / 2, gy - h + S, S, h - S);
  g.fillStyle = '#f4efe2';
  g.fillRect(gx - w / 2, gy - h, w, S * 1.3);
}

/**
 * The lamplighter's pole, from the hands up to the lamp in front (to its right), a small flame at
 * its tip for lighting it at nightfall, a snuffer's cap for putting it out in the morning
 */
export function drawPole(g: G, x: number, y: number, lighting: boolean, now: number): void {
  const hand = { x: x + 6 * S, y: y - 28 * S };
  const tip = { x: x + 20 * S, y: y - 62 * S };
  stroke(g, WOOD.line, 2, hand.x - 2 * S, hand.y + 6 * S, tip.x, tip.y);
  stroke(g, WOOD.light, 1, hand.x - 2 * S, hand.y + 6 * S, tip.x, tip.y);
  if (lighting) {
    const f = 1 + Math.sin(now / 70) * 0.25;
    const glow = g.createRadialGradient(tip.x, tip.y - S, 0, tip.x, tip.y - S, 9 * S);
    glow.addColorStop(0, 'rgba(255,200,110,0.45)');
    glow.addColorStop(1, 'rgba(255,200,110,0)');
    g.fillStyle = glow;
    g.fillRect(tip.x - 9 * S, tip.y - 10 * S, 18 * S, 18 * S);
    g.fillStyle = '#f39c3a';
    g.fillRect(Math.round(tip.x - S), Math.round(tip.y - 3 * S * f), 2 * S, 3 * S * f);
    g.fillStyle = '#ffe8a0';
    g.fillRect(Math.round(tip.x - S * 0.5), Math.round(tip.y - 2 * S * f), S, 2 * S * f);
  } else {
    g.fillStyle = '#5c5f68';
    g.beginPath();
    g.moveTo(tip.x - 2.5 * S, tip.y + S);
    g.lineTo(tip.x + 2.5 * S, tip.y + S);
    g.lineTo(tip.x, tip.y - 3 * S);
    g.fill();
  }
}
