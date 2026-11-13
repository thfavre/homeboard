import { BODY, FRAME_PX, SPRITE_SCALE } from '$shared/crowd.ts';
import { type SheetInfo, type WDir } from '$shared/world.ts';

/**
 * Two characters chatting in the town, without anything drawn over their heads: the one speaking
 * talks with the hands (the LPC emote's first frames, a hand on the hip and the other out), the
 * other listens and nods now and then, and both laugh together with a little hop (the emote's last
 * frame). The emote row of the sheets faces left; facing right it is drawn mirrored.
 */

type G = CanvasRenderingContext2D;
const S = SPRITE_SCALE;

/** A row of the sheet with at least this many frames, or null (a sheet made before it existed) */
function rowOf(img: HTMLImageElement, info: SheetInfo, key: string, frames: number): { row: number; frames: number } | null {
  const row = info.rows[key];
  return row && row.frames >= frames && img.naturalHeight >= (row.row + 1) * (info.frame || FRAME_PX) ? row : null;
}

/** One frame of a row, feet at (x, y), mirrored to face right when asked */
function drawFrame(g: G, img: HTMLImageElement, info: SheetInfo, row: number, frame: number, x: number, y: number, mirror: boolean): void {
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

/**
 * The gestures of a speaker, one after the other: standing, a hand out, the hand on the hip... Each
 * is held a little while, the lengths vary so two speakers never move in step (ms, then the pose: -1
 * standing, else the emote frame)
 */
const TALK: [number, number][] = [
  [420, 0],
  [300, -1],
  [520, 1],
  [380, 0],
  [460, -1],
  [340, 1],
  [300, 0],
  [560, -1],
];
const TALK_MS = TALK.reduce((t, [ms]) => t + ms, 0);

/** Talking with the hands, facing who listens (left or right). False: nothing to draw it with */
export function drawTalking(g: G, img: HTMLImageElement, info: SheetInfo, x: number, y: number, dir: WDir, now: number, phase: number): boolean {
  const emote = rowOf(img, info, 'emoteLeft', 3);
  const stand = rowOf(img, info, dir === 3 ? 'idleRight' : 'idleLeft', 1);
  if (!emote || !stand) return false;
  let t = (((now + phase) % TALK_MS) + TALK_MS) % TALK_MS;
  let pose = TALK[0][1];
  for (const [ms, p] of TALK) {
    pose = p;
    if (t < ms) break;
    t -= ms;
  }
  if (pose < 0) drawFrame(g, img, info, stand.row, 0, x, y, false);
  else drawFrame(g, img, info, emote.row, pose, x, y, dir === 3);
  return true;
}

/** How often a listener nods, and how long the head stays down */
const NOD_EVERY_MS = 1500;
const NOD_MS = 200;

/**
 * How far down a listener is drawn right now: one sprite pixel while nodding, two nods in a row
 * now and then, else nothing
 */
export function nodDip(now: number, phase: number): number {
  const t = (((now + phase) % (NOD_EVERY_MS * 2)) + NOD_EVERY_MS * 2) % (NOD_EVERY_MS * 2);
  const down = t < NOD_MS || (t > NOD_MS * 2 && t < NOD_MS * 3) || (t > NOD_EVERY_MS && t < NOD_EVERY_MS + NOD_MS);
  return down ? S : 0;
}

/** How long one hop of a laugh takes */
const HOP_MS = 260;

/** Laughing: hopping with an arm up, facing the other one. False: nothing to draw it with */
export function drawLaughing(g: G, img: HTMLImageElement, info: SheetInfo, x: number, y: number, dir: WDir, since: number): boolean {
  const emote = rowOf(img, info, 'emoteLeft', 3);
  if (!emote) return false;
  const hop = Math.floor(since / HOP_MS) % 2 === 0;
  drawFrame(g, img, info, emote.row, hop ? 2 : 0, x, y - (hop ? S : 0), dir === 3);
  return true;
}
