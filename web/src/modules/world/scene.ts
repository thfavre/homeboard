import { BENCHES, GROUND, TOWN } from '$shared/world.ts';

/**
 * The look of the town: sky that follows the real time of day, a row of houses, trees, lampposts
 * and benches, plus the small life around the characters (birds that fly off when someone walks
 * too close, the cat, hearts and sleep bubbles). Everything is drawn in world units (1600x900).
 */

const HORIZON = 560;
/** Top of the ground band the houses stand on */
const STREET = 640;

/** A small random generator, so the town looks the same every frame */
function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: Rgb, alpha = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;

/** Sky keyframes over the day: hour, top color, bottom color, daylight 0..1 */
const SKY: { h: number; top: Rgb; low: Rgb; light: number }[] = [
  { h: 0, top: [8, 10, 26], low: [24, 28, 52], light: 0 },
  { h: 5, top: [10, 12, 30], low: [30, 32, 58], light: 0 },
  { h: 7, top: [48, 48, 92], low: [214, 120, 94], light: 0.45 },
  { h: 9, top: [92, 150, 210], low: [168, 206, 232], light: 1 },
  { h: 16, top: [86, 144, 206], low: [164, 200, 228], light: 1 },
  { h: 18.5, top: [70, 76, 134], low: [232, 134, 86], light: 0.55 },
  { h: 20.5, top: [16, 18, 40], low: [52, 44, 76], light: 0.1 },
  { h: 24, top: [8, 10, 26], low: [24, 28, 52], light: 0 },
];

export interface Daylight {
  top: Rgb;
  low: Rgb;
  /** 0 at night, 1 in full day */
  light: number;
  hour: number;
}

export function daylight(now: Date): Daylight {
  const hour = now.getHours() + now.getMinutes() / 60;
  let a = SKY[0];
  let b = SKY[SKY.length - 1];
  for (let i = 0; i < SKY.length - 1; i++) {
    if (hour >= SKY[i].h && hour <= SKY[i + 1].h) {
      a = SKY[i];
      b = SKY[i + 1];
      break;
    }
  }
  const t = (hour - a.h) / Math.max(0.01, b.h - a.h);
  return { top: mix(a.top, b.top, t), low: mix(a.low, b.low, t), light: lerp(a.light, b.light, t), hour };
}

// ------------------------------------------------------------ sky

export function drawSky(g: CanvasRenderingContext2D, day: Daylight, now: number): void {
  const grad = g.createLinearGradient(0, 0, 0, HORIZON + 40);
  grad.addColorStop(0, css(day.top));
  grad.addColorStop(1, css(day.low));
  g.fillStyle = grad;
  g.fillRect(0, 0, TOWN.w, HORIZON + 40);

  // Stars, twinkling, only while it is dark
  if (day.light < 0.5) {
    const a = (0.5 - day.light) * 2;
    const r = seeded(31);
    for (let i = 0; i < 90; i++) {
      const x = r() * TOWN.w;
      const y = r() * (HORIZON - 120);
      const tw = 0.55 + 0.45 * Math.sin(now / 900 + i * 1.7);
      g.fillStyle = `rgba(235,238,255,${(0.25 + 0.55 * r()) * tw * a})`;
      g.fillRect(x, y, i % 7 === 0 ? 3 : 2, i % 7 === 0 ? 3 : 2);
    }
  }

  // The sun and the moon ride the same arc: sun centered on 13 h, moon on 1 h
  const body = (centerH: number, radius: number, draw: (x: number, y: number) => void) => {
    const t = ((day.hour - centerH + 12 + 24) % 24) / 12 - 1; // -1..1 around its center
    if (Math.abs(t) > 0.56) return;
    const x = TOWN.w * (0.5 + t * 0.62);
    const y = 150 + Math.abs(t) * 320 + radius;
    draw(x, y);
  };
  body(13, 46, (x, y) => {
    const glow = g.createRadialGradient(x, y, 10, x, y, 130);
    glow.addColorStop(0, 'rgba(255,236,160,0.5)');
    glow.addColorStop(1, 'rgba(255,236,160,0)');
    g.fillStyle = glow;
    g.fillRect(x - 130, y - 130, 260, 260);
    g.fillStyle = '#ffe9a8';
    g.beginPath();
    g.arc(x, y, 42, 0, Math.PI * 2);
    g.fill();
  });
  body(1, 34, (x, y) => {
    g.fillStyle = '#e8eaf2';
    g.beginPath();
    g.arc(x, y, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(165,170,190,0.5)';
    for (const [cx, cy, cr] of [[-9, -6, 6], [8, 4, 4], [2, 12, 3]] as const) {
      g.beginPath();
      g.arc(x + cx, y + cy, cr, 0, Math.PI * 2);
      g.fill();
    }
  });

  // A few slow clouds, faint at night
  const r = seeded(97);
  for (let i = 0; i < 5; i++) {
    const speed = 6 + r() * 8;
    const y = 70 + r() * 220;
    const w = 150 + r() * 160;
    const x = ((r() * TOWN.w + (now / 1000) * speed) % (TOWN.w + w * 2)) - w;
    g.fillStyle = `rgba(255,255,255,${0.05 + 0.1 * day.light})`;
    for (const [dx, dy, rw, rh] of [[0, 0, w, 26], [w * 0.2, -14, w * 0.5, 20], [w * 0.55, -6, w * 0.35, 18]] as const) {
      g.beginPath();
      g.ellipse(x + dx + rw / 2, y + dy, rw / 2, rh, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// ------------------------------------------------------------ the town (cached)

let townCache: HTMLCanvasElement | null = null;

interface House {
  x: number;
  w: number;
  h: number;
  wall: string;
  roof: string;
  windows: { x: number; y: number }[];
}
let houses: House[] = [];
let trees: { x: number; y: number; s: number }[] = [];
let lamps: number[] = [];

/** Lay out the town once: houses along the street, trees and lampposts between them */
function layout(): void {
  if (houses.length) return;
  const r = seeded(4242);
  const walls = ['#a98f78', '#8f7a8f', '#7d8ba0', '#a08573', '#96a07d', '#9d8a9b'];
  const roofs = ['#7a4a3a', '#5a4a6a', '#4a5a6a', '#6a4a42', '#55604a'];
  let x = 30;
  while (x < TOWN.w - 170) {
    const w = 150 + r() * 110;
    const h = 130 + r() * 90;
    const windows: House['windows'] = [];
    for (let wy = STREET - h + 34; wy < STREET - 40; wy += 46) {
      for (let wx = x + 20; wx < x + w - 32; wx += 44) {
        if (r() < 0.85) windows.push({ x: wx, y: wy });
      }
    }
    houses.push({ x, w, h, wall: walls[Math.floor(r() * walls.length)], roof: roofs[Math.floor(r() * roofs.length)], windows });
    const gap = 26 + r() * 60;
    if (gap > 48 && r() < 0.8) trees.push({ x: x + w + gap / 2, y: STREET - 4, s: 0.9 + r() * 0.5 });
    x += w + gap;
  }
  lamps = [240, 640, 1060, 1430];
}

function drawHouse(g: CanvasRenderingContext2D, h: House): void {
  const top = STREET - h.h;
  g.fillStyle = h.wall;
  g.fillRect(h.x, top, h.w, h.h);
  // A darker side edge for a little depth
  g.fillStyle = 'rgba(0,0,0,0.14)';
  g.fillRect(h.x + h.w - 10, top, 10, h.h);
  g.fillStyle = h.roof;
  g.beginPath();
  g.moveTo(h.x - 10, top);
  g.lineTo(h.x + h.w + 10, top);
  g.lineTo(h.x + h.w - 18, top - 34);
  g.lineTo(h.x + 18, top - 34);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(h.x - 10, top - 2, h.w + 20, 5);
  // The door
  g.fillStyle = 'rgba(40,28,22,0.85)';
  g.fillRect(h.x + h.w / 2 - 14, STREET - 40, 28, 40);
  // Window frames (the glow at night is drawn live, over the cache)
  for (const w of h.windows) {
    g.fillStyle = 'rgba(30,26,34,0.75)';
    g.fillRect(w.x, w.y, 22, 28);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(w.x + 2, w.y + 2, 18, 11);
  }
}

function drawTree(g: CanvasRenderingContext2D, t: { x: number; y: number; s: number }): void {
  g.save();
  g.translate(t.x, t.y);
  g.scale(t.s, t.s);
  g.fillStyle = '#6a4a32';
  g.fillRect(-6, -34, 12, 34);
  g.fillStyle = '#3e6b3a';
  for (const [dx, dy, r] of [[0, -58, 30], [-20, -44, 22], [20, -44, 22], [0, -40, 26]] as const) {
    g.beginPath();
    g.arc(dx, dy, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.beginPath();
  g.arc(-10, -62, 14, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawBench(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.save();
  // The seat is where a character's feet land when it sits
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(0, 4, 46, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5d4433';
  g.fillRect(-44, -26, 88, 8); // backrest
  g.fillRect(-44, -10, 88, 8); // seat
  g.fillStyle = '#453225';
  g.fillRect(-40, -2, 7, 12);
  g.fillRect(33, -2, 7, 12);
  g.restore();
}

function drawLamp(g: CanvasRenderingContext2D, x: number): void {
  g.fillStyle = '#3a3f4a';
  g.fillRect(x - 4, STREET - 128, 8, 128);
  g.fillRect(x - 12, STREET - 134, 24, 10);
  g.fillStyle = '#20242c';
  g.fillRect(x - 10, STREET - 4, 20, 6);
}

/** The still parts of the town, drawn once */
export function townLayer(): HTMLCanvasElement {
  if (townCache) return townCache;
  layout();
  const c = document.createElement('canvas');
  c.width = TOWN.w;
  c.height = TOWN.h;
  const g = c.getContext('2d')!;

  // Distant hills behind the houses
  g.fillStyle = '#44584e';
  g.beginPath();
  g.moveTo(0, HORIZON + 40);
  for (let x = 0; x <= TOWN.w; x += 100) g.lineTo(x, HORIZON + 14 + 26 * Math.sin(x / 190));
  g.lineTo(TOWN.w, STREET);
  g.lineTo(0, STREET);
  g.closePath();
  g.fill();

  // The ground: grass with a worn path through the middle of the walking band
  g.fillStyle = '#4e7044';
  g.fillRect(0, STREET, TOWN.w, TOWN.h - STREET);
  const r = seeded(77);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,230,0.05)' : 'rgba(0,30,0,0.09)';
    g.fillRect(r() * TOWN.w, STREET + r() * (TOWN.h - STREET), 3, 3);
  }
  const pathY = (GROUND.y0 + GROUND.y1) / 2;
  g.fillStyle = '#8a7a5c';
  g.beginPath();
  g.moveTo(0, pathY - 46);
  for (let x = 0; x <= TOWN.w; x += 80) g.lineTo(x, pathY - 46 + 16 * Math.sin(x / 210 + 1));
  g.lineTo(TOWN.w, pathY + 52);
  for (let x = TOWN.w; x >= 0; x -= 80) g.lineTo(x, pathY + 52 + 14 * Math.sin(x / 180));
  g.closePath();
  g.fill();
  for (let i = 0; i < 700; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,240,0.06)' : 'rgba(60,40,20,0.1)';
    g.fillRect(r() * TOWN.w, pathY - 40 + r() * 86, 3, 3);
  }
  // A strip of sidewalk in front of the houses
  g.fillStyle = '#7b7f86';
  g.fillRect(0, STREET, TOWN.w, 18);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < TOWN.w; x += 56) g.fillRect(x, STREET, 2, 18);

  for (const h of houses) drawHouse(g, h);
  for (const t of trees) drawTree(g, t);
  for (const x of lamps) drawLamp(g, x);
  for (const b of BENCHES) drawBench(g, b.x, b.y);

  townCache = c;
  return c;
}

/** The parts of the town that follow the time of day: window light, lamp light, a night veil */
export function drawTownLight(g: CanvasRenderingContext2D, day: Daylight): void {
  layout();
  const dark = 1 - day.light;
  if (dark <= 0.05) return;
  // Lit windows
  const r = seeded(555);
  for (const h of houses) {
    for (const w of h.windows) {
      if (r() < 0.4) continue;
      g.fillStyle = `rgba(255,205,110,${0.5 * dark})`;
      g.fillRect(w.x + 2, w.y + 2, 18, 24);
    }
  }
  // Lampposts glow
  for (const x of lamps) {
    const glow = g.createRadialGradient(x, STREET - 124, 6, x, STREET - 124, 150);
    glow.addColorStop(0, `rgba(255,220,140,${0.4 * dark})`);
    glow.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = glow;
    g.fillRect(x - 150, STREET - 274, 300, 320);
    g.fillStyle = `rgba(255,230,160,${0.85 * dark})`;
    g.fillRect(x - 7, STREET - 132, 14, 8);
  }
  // The night lies over everything
  g.fillStyle = `rgba(10,12,34,${0.32 * dark})`;
  g.fillRect(0, HORIZON - 120, TOWN.w, TOWN.h - HORIZON + 120);
}

// ------------------------------------------------------------ birds

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** ground: hopping around. fly: scared, leaving. gone: waiting to come back */
  state: 'ground' | 'fly' | 'gone';
  until: number;
  hop: number;
  dir: 1 | -1;
  hue: number;
}

export class Birds {
  private birds: Bird[] = [];

  constructor(count = 7) {
    for (let i = 0; i < count; i++) this.birds.push(this.spawn(true));
  }

  private spawn(onGround: boolean): Bird {
    return {
      x: 60 + Math.random() * (TOWN.w - 120),
      y: GROUND.y0 + Math.random() * (GROUND.y1 - GROUND.y0),
      vx: 0,
      vy: 0,
      state: onGround ? 'ground' : 'gone',
      until: Date.now() + Math.random() * 4000,
      hop: Math.random() * 10,
      dir: Math.random() < 0.5 ? 1 : -1,
      hue: Math.random() < 0.25 ? 28 : 215,
    };
  }

  /** Walkers close to a bird scare it away */
  update(dt: number, now: number, people: { x: number; y: number }[]): void {
    for (const b of this.birds) {
      if (b.state === 'ground') {
        if (people.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < 95)) {
          b.state = 'fly';
          b.vx = (b.x < TOWN.w / 2 ? 1 : -1) * (120 + Math.random() * 120);
          b.vy = -(160 + Math.random() * 120);
          b.dir = b.vx > 0 ? 1 : -1;
          continue;
        }
        if (now > b.until) {
          // A little hop to a new spot nearby
          b.until = now + 900 + Math.random() * 3600;
          const a = Math.random() * Math.PI * 2;
          b.vx = Math.cos(a) * 30;
          b.vy = Math.sin(a) * 14;
          b.dir = b.vx > 0 ? 1 : -1;
          b.hop = 0.22;
        }
        if (b.hop > 0) {
          b.hop -= dt;
          b.x += b.vx * dt;
          b.y = Math.max(GROUND.y0, Math.min(GROUND.y1, b.y + b.vy * dt));
        }
      } else if (b.state === 'fly') {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy -= 30 * dt;
        if (b.y < -40 || b.x < -60 || b.x > TOWN.w + 60) {
          b.state = 'gone';
          b.until = now + 4000 + Math.random() * 9000;
        }
      } else if (now > b.until) {
        Object.assign(b, this.spawn(true), { state: 'ground' });
      }
    }
  }

  draw(g: CanvasRenderingContext2D, now: number): void {
    for (const b of this.birds) {
      if (b.state === 'gone') continue;
      g.save();
      g.translate(b.x, b.y);
      g.scale(b.dir, 1);
      const body = b.hue === 28 ? '#b07a4a' : '#6d7486';
      if (b.state === 'fly') {
        const flap = Math.sin(now / 55) > 0;
        g.fillStyle = body;
        g.fillRect(-7, -10, 14, 7);
        g.fillStyle = '#3c404c';
        if (flap) g.fillRect(-3, -16, 8, 6);
        else g.fillRect(-3, -7, 8, 6);
      } else {
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.beginPath();
        g.ellipse(0, 1, 7, 2.5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = body;
        g.fillRect(-6, -9, 12, 7);
        g.fillStyle = '#3c404c';
        g.fillRect(2, -13, 6, 5);
        g.fillStyle = '#e8b23a';
        g.fillRect(8, -11, 3, 2);
        // Pecking now and then
        if (Math.sin(now / 700 + b.hop * 40) > 0.75) {
          g.fillStyle = body;
          g.fillRect(4, -5, 4, 3);
        }
      }
      g.restore();
    }
  }
}

// ------------------------------------------------------------ the cat

export function drawCat(g: CanvasRenderingContext2D, cat: { x: number; y: number; dir: number; walk: boolean; hearts: boolean }, now: number): void {
  g.save();
  g.translate(cat.x, cat.y);
  if (cat.dir === 1) g.scale(-1, 1);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(0, 1, 14, 4, 0, 0, Math.PI * 2);
  g.fill();
  const step = cat.walk ? Math.sin(now / 90) * 2 : 0;
  g.fillStyle = '#c9803a';
  // Body, head, ears, legs, tail
  g.fillRect(-12, -14, 22, 10);
  g.beginPath();
  g.arc(12, -14, 7, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(8, -19);
  g.lineTo(10, -26);
  g.lineTo(13, -20);
  g.moveTo(13, -20);
  g.lineTo(16, -26);
  g.lineTo(17, -19);
  g.fill();
  g.fillRect(-10, -5, 4, 5 + step);
  g.fillRect(3, -5, 4, 5 - step);
  // Stripes
  g.fillStyle = '#a2652c';
  g.fillRect(-8, -14, 3, 6);
  g.fillRect(-2, -14, 3, 6);
  // The tail sways
  g.strokeStyle = '#c9803a';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-12, -12);
  g.quadraticCurveTo(-20, -16, -19, -24 + Math.sin(now / 420) * 3);
  g.stroke();
  // Eyes (closed and happy while petted)
  g.fillStyle = '#2a2a2a';
  if (cat.hearts) {
    g.fillRect(9, -15, 3, 1);
    g.fillRect(14, -15, 3, 1);
  } else {
    g.fillRect(10, -16, 2, 2);
    g.fillRect(14, -16, 2, 2);
  }
  g.restore();

  if (cat.hearts) {
    for (let i = 0; i < 3; i++) {
      const t = ((now / 900 + i / 3) % 1 + 1) % 1;
      const x = cat.x + Math.sin((t + i) * 9) * 10;
      const y = cat.y - 30 - t * 34;
      g.fillStyle = `rgba(240,90,120,${(1 - t) * 0.9})`;
      heart(g, x, y, 5);
    }
  }
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x, y + s);
  g.bezierCurveTo(x - s * 1.4, y - s * 0.4, x - s * 0.6, y - s * 1.3, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 0.6, y - s * 1.3, x + s * 1.4, y - s * 0.4, x, y + s);
  g.fill();
}

/** The Zzz over a sleeper */
export function drawZzz(g: CanvasRenderingContext2D, x: number, y: number, now: number, alpha: number): void {
  g.textAlign = 'center';
  for (let i = 0; i < 3; i++) {
    const t = ((now / 2600 + i / 3) % 1 + 1) % 1;
    g.font = `bold ${10 + t * 10}px system-ui, sans-serif`;
    g.fillStyle = `rgba(225,230,255,${(1 - t) * 0.8 * alpha})`;
    g.fillText('z', x + 14 + t * 18 + Math.sin((t + i) * 7) * 4, y - 20 - t * 34);
  }
}
