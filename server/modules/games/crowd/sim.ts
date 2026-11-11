import { AIM_CURVE, AIM_EASE, AIM_SPEED, ANIM, BODY, SPRITE_SCALE, WORLD, type CrowdAim, type Dir } from '../../../../shared/crowd.ts';
import { clamp, num } from '../../../core/util.ts';

/** Server ticks a second: the crowd moves and a frame goes to the TV each tick */
export const TICK_MS = 50;

/** One character of the crowd: a passer-by, or a player hidden in it */
export interface Actor {
  i: number;
  look: number;
  x: number;
  y: number;
  dir: Dir;
  anim: number;
  alive: boolean;
  /** The player hidden in it (null: a passer-by) */
  player: string | null;
  /** Passers-by: when they decide what to do next, whether they walk, and where to (Spy Hunt) */
  next: number;
  moving: boolean;
  tx: number;
  ty: number;
}

/** A sniper's crosshair: where it is, the stick that moves it, the shots left */
export interface Aim {
  id: string;
  x: number;
  y: number;
  sx: number;
  sy: number;
  /** Its speed now: it eases to what the stick asks, so it starts and stops smoothly */
  vx: number;
  vy: number;
  shots: number;
  /** Server time it can shoot again (reload, or the round not started) */
  readyAt: number;
  draw: boolean;
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** Facing from a move: the bigger of the two directions */
export const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 1 : 3) : dy < 0 ? 0 : 2);

/** Looks dealt evenly (every look before any comes back), in a random order */
export function dealLooks(count: number, looks: number): number[] {
  const out: number[] = [];
  while (out.length < count) {
    const round = Array.from({ length: looks }, (_, k) => k).sort(() => Math.random() - 0.5);
    out.push(...round);
  }
  return out.slice(0, count);
}

export function newActor(i: number, look: number, x: number, y: number, dir: Dir): Actor {
  return { i, look, x, y, dir, anim: ANIM.idle, alive: true, player: null, next: 0, moving: false, tx: x, ty: y };
}

export function newAim(id: string, readyAt: number, shots: number): Aim {
  return { id, x: rand(WORLD.w * 0.3, WORLD.w * 0.7), y: rand(WORLD.h * 0.4, WORLD.h * 0.65), sx: 0, sy: 0, vx: 0, vy: 0, shots, readyAt, draw: false };
}

/** A stick from a phone: x and y between -1 and 1, inside the circle */
export function stick(args: any): { x: number; y: number } {
  let x = clamp(num(args?.x, 0), -1, 1);
  let y = clamp(num(args?.y, 0), -1, 1);
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y };
}

/** Move a crosshair by its stick for `dt` seconds: slow near the middle of the stick for fine aiming, eased */
export function moveAim(a: Aim, dt: number): void {
  const len = Math.hypot(a.sx, a.sy);
  const speed = len < 0.06 ? 0 : AIM_SPEED * len ** AIM_CURVE;
  const tx = len ? (a.sx / len) * speed : 0;
  const ty = len ? (a.sy / len) * speed : 0;
  const k = Math.min(1, dt * AIM_EASE);
  a.vx += (tx - a.vx) * k;
  a.vy += (ty - a.vy) * k;
  // Let go: it stops (no slow drift onto someone else)
  if (!speed && Math.hypot(a.vx, a.vy) < 15) a.vx = a.vy = 0;
  a.x = clamp(a.x + a.vx * dt, 0, WORLD.w);
  a.y = clamp(a.y + a.vy * dt, 0, WORLD.h);
}

/** Inside one of these ellipses (with a margin, in world units)? */
export function blocked(x: number, y: number, obstacles: { x: number; y: number; rx: number; ry: number }[], margin = 0): boolean {
  return obstacles.some((o) => ((x - o.x) / (o.rx + margin)) ** 2 + ((y - o.y) / (o.ry + margin)) ** 2 < 1);
}

/** Push a character out of the obstacles it walked into, to their edge. True when it had to be */
export function keepOut(a: { x: number; y: number }, obstacles: { x: number; y: number; rx: number; ry: number }[]): boolean {
  let pushed = false;
  for (const o of obstacles) {
    let dx = (a.x - o.x) / o.rx;
    let dy = (a.y - o.y) / o.ry;
    const d = Math.hypot(dx, dy);
    if (d >= 1) continue;
    if (d < 1e-3) {
      dx = 1;
      dy = 0;
    }
    const len = d < 1e-3 ? 1 : d;
    a.x = o.x + (dx / len) * o.rx * 1.01;
    a.y = o.y + (dy / len) * o.ry * 1.01;
    pushed = true;
  }
  return pushed;
}

/** The character a shot at (x, y) hits: the one in front (lowest on the screen) whose body is there */
export function hitTest(actors: Actor[], x: number, y: number): Actor | null {
  const halfW = BODY.halfW * SPRITE_SCALE;
  const tall = (BODY.feetY - BODY.topY) * SPRITE_SCALE;
  let best: Actor | null = null;
  for (const a of actors) {
    if (!a.alive) continue;
    if (x < a.x - halfW || x > a.x + halfW || y < a.y - tall || y > a.y + 2 * SPRITE_SCALE) continue;
    if (!best || a.y > best.y) best = a;
  }
  return best;
}

/** The crowd for a frame: x, y, anim and facing of each character */
export function pack(actors: Actor[]): number[] {
  const out: number[] = [];
  for (const a of actors) out.push(Math.round(a.x), Math.round(a.y), a.anim, a.dir);
  return out;
}

export function aimOut(a: Aim, ready: boolean): CrowdAim {
  return { id: a.id, x: Math.round(a.x), y: Math.round(a.y), ready, ...(a.draw ? { draw: true } : {}) };
}
