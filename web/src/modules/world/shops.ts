import type { TownPlace } from '$shared/world.ts';

/**
 * The town's shops on the TV: a house of the square dressed up as a shop (an awning, a hanging
 * sign, a barber pole), with a shop window where the characters inside are seen, lit, behind the
 * glass. The houses themselves are the square's LPC art; these touches are drawn in its style, in
 * world units, every frame (the window shows who is inside).
 */

/** The colors of each shop: awning stripes, the light inside, the sign */
const LOOK = {
  clothes: { stripes: ['#b8433f', '#efe4cf'], light: ['#f4d9a6', '#a77a4c'], wood: '#5b3a24' },
  barber: { stripes: ['#2f5d9a', '#eef0f2'], light: ['#e6eef2', '#7d8f99'], wood: '#3c3f46' },
} as const;

/** Where the feet of a character inside go: below the window, so the glass shows it from the knees up */
export const insideFeet = (p: TownPlace) => p.window.y + p.window.h + 20;

/** The shop window's inside, the characters in it (drawn by `people`, clipped to the glass), the glass and the frame */
export function drawShop(g: CanvasRenderingContext2D, p: TownPlace, now: number, people: (g: CanvasRenderingContext2D) => void): void {
  const { x, y, w, h } = p.window;
  const c = LOOK[p.id];

  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  // A warm lit room, the floor darker
  const room = g.createLinearGradient(0, y, 0, y + h);
  room.addColorStop(0, c.light[0]);
  room.addColorStop(1, c.light[1]);
  g.fillStyle = room;
  g.fillRect(x, y, w, h);
  if (p.id === 'clothes') clothesRack(g, x, y, w);
  else barberMirror(g, x, y, w, h);
  people(g);
  // The glass: a cool tint and two slanted glints
  g.fillStyle = 'rgba(170,205,235,0.16)';
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (const [o, k] of [
    [0.18, 7],
    [0.34, 3],
  ] as const) {
    const gx = x + w * o;
    g.beginPath();
    g.moveTo(gx, y);
    g.lineTo(gx + k, y);
    g.lineTo(gx + k - h * 0.5, y + h);
    g.lineTo(gx - h * 0.5, y + h);
    g.fill();
  }
  g.restore();

  // The frame, a mullion per seat, the sill
  g.fillStyle = c.wood;
  g.fillRect(x - 3, y - 3, w + 6, 3);
  g.fillRect(x - 3, y, 3, h);
  g.fillRect(x + w, y, 3, h);
  for (let i = 1; i < p.seats.length; i++) g.fillRect(Math.round(x + (w * i) / p.seats.length) - 1, y, 2, h);
  g.fillStyle = '#c9c2b4';
  g.fillRect(x - 5, y + h, w + 10, 4);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x - 5, y + h + 4, w + 10, 2);

  awning(g, x - 8, y - 4, w + 16, c.stripes, now);
  if (p.id === 'clothes') hangingSign(g, p, now);
  else barberPole(g, p.door.x - 26, p.door.y - 4, now);
}

/** Who's inside the window, under the glass: a curtain drawn across while the look changes */
export function drawSwish(g: CanvasRenderingContext2D, p: TownPlace, seatX: number, t: number): void {
  // t from 0 to 1: closes, holds, opens
  const cover = t < 0.35 ? t / 0.35 : t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
  const half = p.window.w / p.seats.length / 2;
  const fold = half * cover;
  const c = p.id === 'clothes' ? ['#8e2f3a', '#b5434f'] : ['#3c5a86', '#5476a8'];
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? seatX - half : seatX + half - fold;
    for (let k = 0; k < fold; k += 4) {
      g.fillStyle = (k / 4) % 2 ? c[0] : c[1];
      g.fillRect(Math.round(x0 + k), p.window.y, Math.min(4, fold - k), p.window.h);
    }
  }
  // A few sparkles as it opens on the new look
  if (t > 0.6) {
    const a = 1 - (t - 0.6) / 0.4;
    g.fillStyle = `rgba(255,248,214,${a})`;
    for (let i = 0; i < 5; i++) {
      const sx = seatX + Math.sin(i * 2.4) * half * 0.8;
      const sy = p.window.y + 8 + ((i * 11) % (p.window.h - 14));
      const s = 2 + (i % 2);
      g.fillRect(sx - s, sy, s * 2 + 1, 1);
      g.fillRect(sx, sy - s, 1, s * 2 + 1);
    }
  }
}

/** Hair snipped at the barber: little bits falling by the head, the scissors flashing over it */
export function drawSnips(g: CanvasRenderingContext2D, x: number, headY: number, now: number, color: string): void {
  g.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const t = (((now / 1100 + i / 4) % 1) + 1) % 1;
    g.fillRect(Math.round(x - 10 + i * 6 + Math.sin((t + i) * 6) * 2), Math.round(headY + 6 + t * 22), 2, 1);
  }
  // The scissors, opening and closing
  const open = Math.abs(Math.sin(now / 160)) * 0.5;
  const sx = x + 13;
  const sy = headY + 2;
  g.strokeStyle = '#d7dce2';
  g.lineWidth = 1.5;
  g.beginPath();
  for (const s of [-1, 1]) {
    g.moveTo(sx, sy);
    g.lineTo(sx - 9 * Math.cos(open * s), sy - 9 * Math.sin(open * s));
  }
  g.stroke();
  g.beginPath();
  g.arc(sx + 3, sy - 2, 2, 0, Math.PI * 2);
  g.arc(sx + 3, sy + 2, 2, 0, Math.PI * 2);
  g.stroke();
}

/** The barber cutting: the scissors snapping along the cut line by the head (the cut hair is the TV's, from the old look's pixels) */
export function drawCut(g: CanvasRenderingContext2D, cutX: number, headY: number, now: number): void {
  const open = Math.abs(Math.sin(now / 90)) * 0.55;
  // Pointing down along the cut, riding up and down the hair
  const sx = cutX;
  const sy = headY - 10 + Math.sin(now / 260) * 5;
  g.strokeStyle = '#e3e7ec';
  g.lineWidth = 1.5;
  g.beginPath();
  for (const s of [-1, 1]) {
    g.moveTo(sx, sy);
    g.lineTo(sx + 10 * Math.sin(open * s), sy + 10 * Math.cos(open * s));
  }
  g.stroke();
  g.beginPath();
  g.arc(sx - 2, sy - 3, 2, 0, Math.PI * 2);
  g.arc(sx + 2, sy - 3, 2, 0, Math.PI * 2);
  g.stroke();
}

/** The back of the clothes shop: a rail with clothes in many colors */
function clothesRack(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  g.fillStyle = 'rgba(70,45,28,0.75)';
  g.fillRect(x + 2, y + 9, w - 4, 2);
  const colors = ['#4f7bb5', '#c24d5c', '#e0b850', '#5d9a6b', '#8a5cad', '#e7e2d6', '#30343b'];
  for (let i = 0, cx = x + 5; cx < x + w - 8; i++, cx += 9) {
    g.fillStyle = colors[i % colors.length];
    g.fillRect(cx, y + 11, 7, 13 + ((i * 5) % 7));
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(cx + 5, y + 11, 2, 13 + ((i * 5) % 7));
  }
}

/** The back of the barber's: a mirror in a frame and a shelf of bottles */
function barberMirror(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const mx = x + w / 2 - 14;
  g.fillStyle = '#6b4e33';
  g.fillRect(mx - 2, y + 4, 32, Math.round(h * 0.5) + 4);
  g.fillStyle = '#c7dde6';
  g.fillRect(mx, y + 6, 28, Math.round(h * 0.5));
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.fillRect(mx + 4, y + 8, 3, Math.round(h * 0.5) - 4);
  g.fillStyle = 'rgba(60,40,30,0.7)';
  g.fillRect(x + 2, y + h * 0.62, 12, 2);
  g.fillRect(x + w - 14, y + h * 0.62, 12, 2);
  const bottles = ['#4d9c8a', '#c46b4a', '#d9c06a'];
  for (let i = 0; i < 3; i++) {
    g.fillStyle = bottles[i];
    g.fillRect(x + 3 + i * 4, y + h * 0.62 - 6, 3, 6);
    g.fillRect(x + w - 13 + i * 4, y + h * 0.62 - 5, 3, 5);
  }
}

/** A striped awning over the window, its scalloped edge stirring a little */
function awning(g: CanvasRenderingContext2D, x: number, y: number, w: number, stripes: readonly string[], now: number): void {
  const top = y - 10;
  const n = Math.max(4, Math.round(w / 9));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = stripes[i % 2];
    // Slanted: wider at the bottom, as seen from above the street
    g.beginPath();
    g.moveTo(x + 3 + i * ((w - 6) / n), top);
    g.lineTo(x + 3 + (i + 1) * ((w - 6) / n), top);
    g.lineTo(x + (i + 1) * sw, y);
    g.lineTo(x + i * sw, y);
    g.fill();
    // The scallop
    const sway = Math.sin(now / 900 + i) * 0.6;
    g.beginPath();
    g.arc(x + (i + 0.5) * sw, y + sway, sw / 2, 0, Math.PI);
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(x, y, w, 1);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(x + 2, y + sw / 2 + 2, w - 4, 3);
}

/** The clothes shop's sign: a board on a bracket by the door, a shirt painted on it, swinging gently */
function hangingSign(g: CanvasRenderingContext2D, p: TownPlace, now: number): void {
  const bx = p.door.x + 24;
  const by = p.window.y - 2;
  g.fillStyle = '#2b2b30';
  g.fillRect(bx - 1, by - 2, 16, 2);
  const swing = Math.sin(now / 1300) * 0.06;
  g.save();
  g.translate(bx + 8, by);
  g.rotate(swing);
  g.fillStyle = '#2b2b30';
  g.fillRect(-6, 0, 1, 5);
  g.fillRect(5, 0, 1, 5);
  g.fillStyle = '#6b4a2e';
  g.fillRect(-10, 5, 20, 18);
  g.fillStyle = '#e8dcc0';
  g.fillRect(-9, 6, 18, 16);
  // A shirt
  g.fillStyle = '#b8433f';
  g.beginPath();
  g.moveTo(-3, 9);
  g.lineTo(-7, 11);
  g.lineTo(-6, 14);
  g.lineTo(-4, 13);
  g.lineTo(-4, 20);
  g.lineTo(4, 20);
  g.lineTo(4, 13);
  g.lineTo(6, 14);
  g.lineTo(7, 11);
  g.lineTo(3, 9);
  g.lineTo(1, 11);
  g.lineTo(-1, 11);
  g.closePath();
  g.fill();
  g.restore();
}

/** The barber's pole by the door, its stripes turning */
function barberPole(g: CanvasRenderingContext2D, x: number, bottom: number, now: number): void {
  const h = 34;
  const w = 8;
  const top = bottom - h;
  g.fillStyle = '#d9dde2';
  g.fillRect(x - w / 2 - 1, top - 4, w + 2, 4);
  g.fillRect(x - w / 2 - 1, bottom, w + 2, 3);
  g.save();
  g.beginPath();
  g.rect(x - w / 2, top, w, h);
  g.clip();
  g.fillStyle = '#f1f2f4';
  g.fillRect(x - w / 2, top, w, h);
  const shift = (now / 60) % 12;
  for (let k = -2; k < h / 6 + 2; k++) {
    g.fillStyle = k % 2 ? '#c8353a' : '#2f5d9a';
    g.beginPath();
    const yy = top + k * 6 - shift;
    g.moveTo(x - w / 2, yy + 8);
    g.lineTo(x + w / 2, yy);
    g.lineTo(x + w / 2, yy + 3);
    g.lineTo(x - w / 2, yy + 11);
    g.fill();
  }
  // Round glass: a shine down one side
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(x - w / 2 + 1, top, 2, h);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(x + w / 2 - 2, top, 2, h);
  g.restore();
}
