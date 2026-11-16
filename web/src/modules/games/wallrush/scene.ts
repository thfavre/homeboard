import { drawPoseShape, type PoseShape } from '$shared/wallrush.ts';
import { GH, GRID, GW } from './tracker.ts';

// The neon look: a dark corridor running to the horizon, glowing walls rushing out of it, and the
// player as a glowing silhouette standing at the front. Drawn on a 2D canvas, in fake 3D.

export const NEON = {
  cyan: '#00e5ff',
  magenta: '#ff2bd6',
  violet: '#8b3dff',
  red: '#ff3355',
  green: '#3dff9b',
};

/** The wall, in world units */
const WALL = { x0: -1.3, x1: 1.3, y0: 0, y1: 1.34 };
/** Pixels per world unit in a wall picture */
const WALL_RES = 360;
/** How far away a wall starts (it looks this many times smaller + 1) */
const DEPTH = 7;

export interface Look {
  /** Where the corridor runs to */
  vx: number;
  vy: number;
  /** Floor line at the player, and pixels per world unit there */
  floor: number;
  unit: number;
}

export function look(w: number, h: number): Look {
  return { vx: w / 2, vy: h * 0.34, floor: h * 0.95, unit: Math.min(h * 0.64, w * 0.36) };
}

/** A world point at a depth (0: where the player stands, 1: far end; below 0: past the player) */
export function project(l: Look, x: number, y: number, z: number) {
  const s = 1 / (1 + z * DEPTH);
  return { x: l.vx + x * l.unit * s, y: l.vy + (l.floor - l.vy) * s - y * l.unit * s, s };
}

/**
 * A wall with its hole cut out and a glowing rim round the hole, drawn once per wall. The rim alone
 * is also kept: it shows where the hole will be, at the player's feet, as the wall gets near.
 */
export function wallPicture(shape: PoseShape, margin: number): { pic: HTMLCanvasElement; rim: HTMLCanvasElement } {
  const w = Math.round((WALL.x1 - WALL.x0) * WALL_RES);
  const h = Math.round((WALL.y1 - WALL.y0) * WALL_RES);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const map = (p: { x: number; y: number }) => ({ x: (p.x - WALL.x0) * WALL_RES, y: (WALL.y1 - p.y) * WALL_RES });

  // The panel: see-through glass with a grid, edged in neon
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255, 43, 214, 0.5)');
  grad.addColorStop(1, 'rgba(139, 61, 255, 0.38)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255, 255, 255, 0.09)';
  g.lineWidth = 2;
  for (let x = 0; x <= w; x += WALL_RES / 10) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  for (let y = h; y >= 0; y -= WALL_RES / 10) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  g.strokeStyle = NEON.magenta;
  g.lineWidth = 10;
  g.shadowColor = NEON.magenta;
  g.shadowBlur = 24;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.shadowBlur = 0;

  // The hole
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = g.strokeStyle = '#000';
  drawPoseShape(g, shape, margin, map, WALL_RES);

  // Its rim: the hole a bit bigger, minus the hole
  const rim = document.createElement('canvas');
  rim.width = w;
  rim.height = h;
  const r = rim.getContext('2d')!;
  r.fillStyle = r.strokeStyle = NEON.cyan;
  drawPoseShape(r, shape, margin + 0.014, map, WALL_RES);
  r.globalCompositeOperation = 'destination-out';
  drawPoseShape(r, shape, margin, map, WALL_RES);

  g.globalCompositeOperation = 'source-over';
  g.shadowColor = NEON.cyan;
  g.shadowBlur = 30;
  g.drawImage(rim, 0, 0);
  g.shadowBlur = 0;
  g.drawImage(rim, 0, 0);
  return { pic: c, rim };
}

/**
 * The corridor: floor grid lines rushing towards the player, neon rails on both sides. `pulse` (0 to 1)
 * flashes it on the beat of the music.
 */
export function drawCorridor(g: CanvasRenderingContext2D, l: Look, w: number, h: number, t: number, speed: number, tint: string, pulse = 0): void {
  const bg = g.createRadialGradient(l.vx, l.vy, 0, l.vx, l.vy, Math.max(w, h) * 0.75);
  bg.addColorStop(0, pulse > 0 ? `rgb(${42 + 50 * pulse}, ${11 + 10 * pulse}, ${77 + 60 * pulse})` : '#2a0b4d');
  bg.addColorStop(0.45, '#0d0420');
  bg.addColorStop(1, '#030108');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  g.save();
  g.lineCap = 'round';
  g.shadowBlur = 14;

  // Lines along the floor, out to the sides
  g.strokeStyle = g.shadowColor = `rgba(0, 229, 255, ${0.35 + 0.4 * pulse})`;
  g.lineWidth = 2 + 2 * pulse;
  for (let x = -3; x <= 3; x += 0.5) {
    const a = project(l, x, 0, 1.6);
    const b = project(l, x, 0, -0.06);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  // Lines across the floor, coming at the player
  const step = 0.18;
  const shift = (t * speed) % step;
  for (let z = 1.6 - shift; z > -0.06; z -= step) {
    const a = project(l, -3, 0, z);
    const b = project(l, 3, 0, z);
    g.globalAlpha = Math.min(1, (1.6 - z) * 1.5) * (0.7 + 0.3 * pulse);
    g.lineWidth = Math.max(1, (3 + 3 * pulse) * a.s);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  g.globalAlpha = 1;

  // Rails: two glowing lines high on each side
  g.strokeStyle = g.shadowColor = tint;
  g.lineWidth = 4 + 5 * pulse;
  g.shadowBlur = 14 + 30 * pulse;
  for (const x of [-1.9, 1.9]) {
    for (const y of [0, 1.5]) {
      const a = project(l, x, y, 1.6);
      const b = project(l, x, y, -0.05);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
  }
  g.restore();
}

/** A wall at a depth, faded in from the horizon (alpha 0 to 1), maybe shaking */
export function drawWall(g: CanvasRenderingContext2D, l: Look, pic: HTMLCanvasElement, z: number, alpha: number, shake = 0): void {
  const a = project(l, WALL.x0, WALL.y1, z);
  const b = project(l, WALL.x1, WALL.y0, z);
  g.save();
  g.globalAlpha = Math.max(0, Math.min(1, alpha));
  const dx = shake ? (Math.random() - 0.5) * shake : 0;
  g.drawImage(pic, a.x + dx, a.y, b.x - a.x, b.y - a.y);
  g.restore();
}

/** The player's silhouette: cyan where they fit, red where they stick out (when a hole is near) */
export class Silhouette {
  private c = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private img: ImageData;

  constructor() {
    this.c.width = GW;
    this.c.height = GH;
    this.g = this.c.getContext('2d')!;
    this.img = this.g.createImageData(GW, GH);
  }

  /**
   * `hole`: the hole to show against (null: all cyan). `warn`: 0 to 1, how red the parts out turn.
   * `fits`: 0 to 1, how green the body turns (the player fits the coming hole)
   */
  paint(cells: Uint8Array, hole: Uint8Array | null, warn: number, fits = 0): void {
    const d = this.img.data;
    const ir = Math.round(61 * fits);
    const ig = Math.round(229 + (255 - 229) * fits);
    const ib = Math.round(255 + (155 - 255) * fits);
    // Cyan to red through pink (a straight blend goes grey half way)
    const r = Math.round(255 * Math.min(1, warn * 2));
    const gr = Math.round(229 + (51 - 229) * warn);
    const b = Math.round(255 + (85 - 255) * warn);
    for (let i = 0; i < cells.length; i++) {
      const o = i * 4;
      if (!cells[i]) {
        d[o + 3] = 0;
        continue;
      }
      if (hole && !hole[i]) {
        d[o] = r;
        d[o + 1] = gr;
        d[o + 2] = b;
      } else {
        d[o] = ir;
        d[o + 1] = ig;
        d[o + 2] = ib;
      }
      d[o + 3] = 255;
    }
    this.g.putImageData(this.img, 0, 0);
  }

  draw(g: CanvasRenderingContext2D, l: Look, alpha = 1): void {
    const a = project(l, GRID.x0, GRID.y1, 0);
    const w = (GRID.x1 - GRID.x0) * l.unit;
    const h = (GRID.y1 - GRID.y0) * l.unit;
    g.save();
    g.globalAlpha = alpha;
    g.imageSmoothingEnabled = true;
    // A soft glow under a sharper body
    g.filter = 'blur(14px)';
    g.globalCompositeOperation = 'lighter';
    g.drawImage(this.c, a.x, a.y, w, h);
    g.filter = 'blur(1.5px)';
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = alpha * 0.85;
    g.drawImage(this.c, a.x, a.y, w, h);
    g.restore();
  }
}

/** Sparks: bursts of glowing bits when a wall is passed or hit */
export class Sparks {
  private list: { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }[] = [];

  /** A burst at (x, y), screen pixels */
  burst(x: number, y: number, n: number, colors: string[], speed: number, size = 6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.9);
      const max = 0.5 + Math.random() * 0.7;
      this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.25, life: max, max, color: colors[i % colors.length], size: size * (0.5 + Math.random()) });
    }
  }

  /** Bits flying out along an outline (the rim of a hole), screen pixels */
  along(points: { x: number; y: number }[], colors: string[], speed: number, size = 5): void {
    for (const p of points) this.burst(p.x, p.y, 1, colors, speed, size);
  }

  draw(g: CanvasRenderingContext2D, dt: number): void {
    if (!this.list.length) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    this.list = this.list.filter((p) => (p.life -= dt) > 0);
    for (const p of this.list) {
      p.vy += 900 * dt;
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      g.globalAlpha = k;
      // Added light, no blur: hundreds of them stay cheap
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.restore();
  }
}

/** Points on the outline of a hole (world units), for sparks to fly from */
export function holeOutline(hole: Uint8Array, gw: number, gh: number, every = 9): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let n = 0;
  for (let j = 1; j < gh - 1; j++) {
    for (let i = 1; i < gw - 1; i++) {
      const k = j * gw + i;
      if (!hole[k] || (hole[k - 1] && hole[k + 1] && hole[k - gw] && hole[k + gw])) continue;
      if (n++ % every) continue;
      out.push({ x: GRID.x0 + (i + 0.5) / GRID.res, y: GRID.y1 - (j + 0.5) / GRID.res });
    }
  }
  return out;
}
