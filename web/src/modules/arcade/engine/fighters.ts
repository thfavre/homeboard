import type { ArcadePlayer } from '$shared/arcade.ts';
import type { SheetInfo, WorldState } from '$shared/world.ts';
import { enabled, hb } from '$lib/client.svelte.ts';
import type { Fighter } from './base.ts';

/**
 * The players' characters for the games: the sprite sheet of their town avatar (the same rows as
 * the TV's, see server/modules/world/compose.ts), or, for a guest without one (or with the town
 * off), a little stand-in in their color drawn here with the same rows.
 */

/** The rows of the stand-in, in the order of the avatar sheets (the ones the games use) */
const ROWS = ['walk', 'run', 'idleRight', 'idleDown', 'hurt', 'jump', 'emote', 'sit', 'walkDown', 'happy', 'dead', 'walkUp', 'walkLeft', 'idleUp', 'idleLeft'];
const BACK = new Set(['walkUp', 'idleUp']);
const SIDE = new Set(['walk', 'run', 'idleRight']);
const SIDE_LEFT = new Set(['walkLeft', 'idleLeft']);

function loadImage(src: string, ms = 4000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), ms);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/** Hair colors for the stand-in, picked from the player's color so each one keeps theirs */
const HAIR = [
  ['#3a2418', '#5a3a26'],
  ['#1e1a24', '#3a3444'],
  ['#c8902e', '#e8b85a'],
  ['#9a3a1e', '#c25a32'],
  ['#6a4a30', '#8a6a48'],
];

/** A color a shade lighter or darker (k: -1 to 1) */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (v: number) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * A little character in the town's style for a player without one: hair, a face, a shirt in their
 * color, trousers and shoes, seen from the front, the back and the sides, four frames a row (a step
 * cycle when walking, a breath when standing)
 */
async function standIn(color: string): Promise<{ img: HTMLImageElement; sheet: SheetInfo }> {
  const F = 64;
  const N = 4;
  const c = document.createElement('canvas');
  c.width = F * N;
  c.height = F * ROWS.length;
  const g = c.getContext('2d')!;
  const LINE = '#120c26';
  const SKIN = '#f2c8a0';
  const SKIN_D = '#d9a07a';
  const PANTS = '#34406e';
  const PANTS_D = '#262f54';
  const SHOE = '#2a2030';
  const [hair, hairL] = HAIR[parseInt(color.replace('#', ''), 16) % HAIR.length];
  const shirt = color;
  const shirtD = shade(color, -0.28);
  const shirtL = shade(color, 0.3);
  const px = (col: string, x: number, y: number, w = 1, h = 1) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  /** A box with a dark outline */
  const box = (col: string, x: number, y: number, w: number, h: number) => {
    px(LINE, x - 1, y - 1, w + 2, h + 2);
    px(col, x, y, w, h);
  };

  ROWS.forEach((row, r) => {
    for (let f = 0; f < N; f++) {
      const ox = f * F;
      const oy = r * F;
      if (row === 'dead') {
        // Lying flat, eyes closed
        box(PANTS, ox + 12, oy + 54, 14, 5);
        box(shirt, ox + 26, oy + 52, 14, 8);
        box(SKIN, ox + 41, oy + 50, 11, 10);
        px(hair, ox + 48, oy + 50, 4, 10);
        px(LINE, ox + 43, oy + 54, 3, 1);
        continue;
      }
      const walking = row.startsWith('walk') || row === 'run';
      const back = BACK.has(row);
      const side = SIDE.has(row) ? 1 : SIDE_LEFT.has(row) ? -1 : 0;
      // A step cycle when walking (legs apart, together, the other way, together), a breath standing
      const step = walking ? [-2, 0, 2, 0][f] : 0;
      const bob = walking ? (f % 2 ? 0 : 1) : f >= 2 ? 1 : 0;
      const y0 = oy + bob;
      const cx = ox + 32;
      // Shoes and legs
      box(SHOE, cx - 6 + step, oy + 57, 5, 3);
      box(SHOE, cx + 1 - step, oy + 57, 5, 3);
      box(PANTS, cx - 5 + step, y0 + 48, 4, 9 - bob);
      box(PANTS, cx + 1 - step, y0 + 48, 4, 9 - bob);
      px(PANTS_D, cx - 2 + step, y0 + 48, 1, 9 - bob);
      // Arms behind the body, swinging when walking
      const arms = row === 'emote' || row === 'jump' || row === 'happy';
      for (const sx of [-1, 1]) {
        const ax = cx + sx * 8 - (sx < 0 ? 3 : 0);
        const swing = walking ? sx * step : 0;
        if (arms) {
          box(shirt, ax, y0 + 28, 3, 8);
          box(SKIN, ax, y0 + 25, 3, 3);
        } else {
          box(shirt, ax, y0 + 37 + swing, 3, 7);
          box(SKIN, ax, y0 + 44 + swing, 3, 2);
        }
      }
      // The shirt: lit on top, shaded on the right, a collar
      box(shirt, cx - 7, y0 + 36, 14, 13);
      px(shirtL, cx - 7, y0 + 36, 14, 1);
      px(shirtD, cx + 5, y0 + 37, 2, 12);
      px(PANTS_D, cx - 7, y0 + 47, 14, 2);
      if (!back) px(SKIN_D, cx - 2, y0 + 36, 4, 2);
      // The head
      box(SKIN, cx - 7, y0 + 19, 14, 16);
      px(SKIN_D, cx - 7, y0 + 33, 14, 2);
      // Hair: over the top and the sides (all of it from the back)
      box(hair, cx - 8, y0 + 16, 16, 6);
      px(hairL, cx - 6, y0 + 17, 6, 1);
      if (back) {
        px(hair, cx - 7, y0 + 19, 14, 14);
        px(hairL, cx - 4, y0 + 22, 3, 1);
        continue;
      }
      if (side >= 0) px(hair, cx - 8, y0 + 19, 2, 7);
      if (side <= 0) px(hair, cx + 6, y0 + 19, 2, 7);
      px(hair, cx - 6 + (side > 0 ? 2 : 0), y0 + 21, side ? 8 : 12, 2);
      // The face
      const ex = side * 2;
      if (row === 'hurt') {
        px(LINE, cx - 5 + ex, y0 + 27, 3, 1);
        px(LINE, cx + 2 + ex, y0 + 27, 3, 1);
        px(LINE, cx - 1 + ex, y0 + 31, 2, 2);
      } else {
        const blink = !walking && f === 3;
        for (const exx of side ? [cx + (side > 0 ? 1 : -3) + ex] : [cx - 4, cx + 2]) {
          if (blink) px(LINE, exx, y0 + 27, 2, 1);
          else {
            px(LINE, exx, y0 + 25, 2, 3);
            px('#ffffff', exx, y0 + 25, 1, 1);
          }
        }
        px('#f0a090', cx - 6 + (side > 0 ? 4 : 0), y0 + 29, 2, 1);
        if (!side) px('#f0a090', cx + 4, y0 + 29, 2, 1);
        if (row === 'happy' || row === 'emote') {
          px(LINE, cx - 2 + ex, y0 + 31, 4, 1);
          px(LINE, cx - 3 + ex, y0 + 30, 1, 1);
          px(LINE, cx + 2 + ex, y0 + 30, 1, 1);
        } else px(SKIN_D, cx - 1 + ex, y0 + 31, 2, 1);
      }
    }
  });
  const img = await loadImage(c.toDataURL('image/png'));
  return {
    img: img!,
    sheet: { frame: F, rows: Object.fromEntries(ROWS.map((k, i) => [k, { row: i, frames: N }])), feet: 60, body: { top: 15, left: 22, right: 42 } },
  };
}

/** A player's character for the games, loaded (a stand-in when there is no avatar or it does not load) */
export async function loadFighter(p: ArcadePlayer): Promise<Fighter> {
  const world = enabled('world') ? (hb.modules.world as WorldState | undefined) : undefined;
  const c = world?.characters.find((x) => x.id === p.id);
  const sheet = c?.sheet ?? world?.sheet ?? null;
  if (c && sheet) {
    const img = await loadImage(c.url);
    if (img) return { ...p, img, sheet };
  }
  return { ...p, ...(await standIn(p.color)) };
}
