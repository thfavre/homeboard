import { burstMs, fwHex, riseMs, shellTimes, type FwDesign, type FwShell } from '$shared/worldActions.ts';

/**
 * Fireworks, drawn from nothing but the design and the time since the show started: every star's
 * place is worked out from its start speed (slowed by the air, pulled down by gravity), so the TV
 * and the phone's preview draw the same show, and a TV that joins late picks it up mid-way. Drawn
 * in light (additive), with a flash at each burst.
 */

type G = CanvasRenderingContext2D;

/** Where the show happens: rockets go up from `ground` (y), burst between `low` and `high`, across `w`; `unit` scales the stars and bursts */
export interface Sky {
  w: number;
  ground: number;
  low: number;
  high: number;
  unit: number;
}

/** A star of a burst: its start speed (units a second), color, and its own small variations */
interface Star {
  vx: number;
  vy: number;
  color: string;
  /** 0..1, its own: lifetime, blink and crackle differ per star */
  seed: number;
  /** Crossette: splits in four at this time (s), its pieces going off this way */
  split?: number;
}

interface Burst {
  stars: Star[];
  /** The air slows the stars this much (1/s), gravity pulls them down this much (units/s²) */
  drag: number;
  gravity: number;
  /** Spiral: the burst turns this fast (rad/s) */
  spin: number;
}

/** A small seeded random generator: the same shell always bursts the same way */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The outline of a shape as points around it, about one unit across */
function outline(shape: FwShell['shape'], n: number, r: () => number): [number, number][] {
  const pts: [number, number][] = [];
  if (shape === 'heart') {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push([(16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]);
    }
  } else if (shape === 'star') {
    const tips: [number, number][] = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rad = k % 2 ? 0.42 : 1;
      tips.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    for (let i = 0; i < n; i++) {
      const p = (i / n) * 10;
      const k = Math.floor(p);
      const f = p - k;
      const [ax, ay] = tips[k];
      const [bx, by] = tips[(k + 1) % 10];
      pts.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
    }
  } else if (shape === 'smile') {
    const face = Math.round(n * 0.55);
    for (let i = 0; i < face; i++) {
      const a = (i / face) * Math.PI * 2;
      pts.push([Math.cos(a), Math.sin(a)]);
    }
    for (const ex of [-0.36, 0.36]) for (let i = 0; i < 5; i++) pts.push([ex + (r() - 0.5) * 0.12, -0.32 + (r() - 0.5) * 0.12]);
    const mouth = n - pts.length;
    for (let i = 0; i < mouth; i++) {
      const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, mouth - 1));
      pts.push([Math.cos(a) * 0.58, 0.02 + Math.sin(a) * 0.5]);
    }
  } else {
    // A ring, seen tilted
    const tilt = r() * Math.PI;
    const flat = 0.35 + r() * 0.35;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a);
      const y = Math.sin(a) * flat;
      pts.push([x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)]);
    }
  }
  return pts;
}

const SIZE = [0, 0.7, 1, 1.38];

/** The stars of one shell's burst (the echo is a smaller, white-tinged one) */
function makeBurst(s: FwShell, seed: number, echo: boolean): Burst {
  const r = rng(seed);
  const size = SIZE[s.size] * (echo ? 0.5 : 1);
  const colors = echo ? ['#ffffff', fwHex(s.colors[0])] : s.colors.map(fwHex);
  const pick = (i: number, n: number) => colors[Math.floor((i / n) * colors.length) % colors.length];
  const stars: Star[] = [];
  let drag = 1.6;
  let gravity = 55;
  let spin = 0;
  const speed = 230 * size;
  const n = Math.round((s.shape === 'palm' ? 56 : s.shape === 'crossette' ? 12 : 72) * (echo ? 0.6 : 1) * (0.75 + 0.25 * s.size));
  switch (s.shape) {
    case 'ring':
    case 'heart':
    case 'star':
    case 'smile': {
      // The shape is in the start speeds: slowed evenly, the stars draw it out and hold it
      drag = 2.2;
      gravity = 22;
      for (const [i, [x, y]] of outline(s.shape, n, r).entries()) stars.push({ vx: x * speed * 1.25, vy: y * speed * 1.25, color: pick(i, n), seed: r() });
      break;
    }
    case 'willow': {
      drag = 2.6;
      gravity = 38;
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const v = speed * (0.8 + r() * 0.3);
        stars.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: pick(i, n), seed: r() });
      }
      break;
    }
    case 'palm': {
      // A few thick arms, each a bundle of stars
      drag = 1.2;
      gravity = 70;
      const arms = 7;
      for (let i = 0; i < n; i++) {
        const arm = i % arms;
        const a = (arm / arms) * Math.PI * 2 - Math.PI / 2 + (r() - 0.5) * 0.12;
        const v = speed * (0.75 + r() * 0.45);
        stars.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: pick(arm, arms), seed: r() });
      }
      break;
    }
    case 'crossette': {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.2;
        stars.push({ vx: Math.cos(a) * speed * 0.9, vy: Math.sin(a) * speed * 0.9, color: pick(i, n), seed: r(), split: 0.6 + r() * 0.2 });
      }
      break;
    }
    case 'spiral': {
      // Arms of stars at growing speeds, the whole burst turning: a pinwheel
      spin = 2.4 * (r() < 0.5 ? -1 : 1);
      const arms = 4;
      for (let i = 0; i < n; i++) {
        const f = (Math.floor(i / arms) + 1) / Math.ceil(n / arms);
        const a = ((i % arms) / arms) * Math.PI * 2 + f * 1.3;
        const v = speed * (0.25 + 0.85 * f);
        stars.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: pick(i % arms, arms), seed: r() });
      }
      break;
    }
    default: {
      // Peony: a round burst, the stars spread over a ball seen from the front
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const v = speed * Math.sqrt(1 - (r() * 0.95) ** 2);
        stars.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: pick(i, n), seed: r() });
      }
    }
  }
  return { stars, drag, gravity, spin };
}

/** Where a star is t seconds after its burst (relative to the burst) */
function at(vx: number, vy: number, t: number, b: Burst): [number, number] {
  const k = b.drag;
  const f = (1 - Math.exp(-k * t)) / k;
  let x = vx * f;
  let y = vy * f;
  if (b.spin) {
    // (turning fast at first, slower as it spreads)
    const a = b.spin * t * Math.exp(-0.4 * t);
    [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  }
  return [x, y + (b.gravity * (t - f)) / k];
}

/** Bursts are made once per shell, kept while they are drawn */
const bursts = new Map<string, Burst>();
function burstOf(s: FwShell, key: string, echo: boolean): Burst {
  const k = `${key}|${echo ? 'e' : ''}|${s.shape}|${s.size}|${s.colors.join(',')}`;
  let b = bursts.get(k);
  if (!b) {
    if (bursts.size > 400) bursts.clear();
    let h = 2166136261;
    for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
    bursts.set(k, (b = makeBurst(s, h, echo)));
  }
  return b;
}

/** A dot of light */
function dot(g: G, x: number, y: number, r: number, color: string, alpha: number): void {
  if (alpha <= 0.01) return;
  g.globalAlpha = Math.min(1, alpha);
  g.fillStyle = color;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** The flash of a burst lighting the sky around it */
function flash(g: G, x: number, y: number, radius: number, color: string, alpha: number): void {
  if (alpha <= 0.01) return;
  const grad = g.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = Math.min(1, alpha);
  g.fillStyle = grad;
  g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** Draw one burst, `t` seconds after it went off at (x, y) */
function drawBurst(g: G, s: FwShell, b: Burst, x: number, y: number, t: number, life: number, u: number): void {
  const glitter = s.effects.includes('glitter') || s.shape === 'willow';
  // Points along each star's tail, close enough to read as a streak
  const trail = glitter ? 12 : s.shape === 'palm' ? 10 : 6;
  const gap = glitter ? 0.035 : 0.02;
  const strobe = s.effects.includes('strobe');
  const crackle = s.effects.includes('crackle');
  if (t < 0.3) flash(g, x, y, 130 * SIZE[s.size] * u, fwHex(s.colors[0]), 0.55 * (1 - t / 0.3));
  for (const st of b.stars) {
    const own = life * (0.8 + 0.2 * st.seed);
    if (t > own) {
      // Crackle: the dying star pops in a few white sparks
      if (crackle && t < own + 0.45) {
        const [px, py] = at(st.vx, st.vy, own, b);
        const pr = rng(Math.floor(st.seed * 1e6) + Math.floor(t * 20));
        for (let k = 0; k < 3; k++) if (pr() < 0.6) dot(g, x + px + (pr() - 0.5) * 22 * u, y + py + (pr() - 0.5) * 22 * u, 1.3 * u, '#ffffff', 1 - (t - own) / 0.45);
      }
      continue;
    }
    // Bright at first (near white), fading over the last part of its life
    let alpha = t < own * 0.55 ? 1 : 1 - (t - own * 0.55) / (own * 0.45);
    if (strobe && t > 0.5 && Math.floor(t * 14 + st.seed * 7) % 2) alpha *= 0.12;
    const hot = t < 0.18;
    const color = hot ? '#ffffff' : st.color;
    const r = (hot ? 2.6 : 2) * u;
    let ox = 0;
    let oy = 0;
    let tt = t;
    if (st.split !== undefined && t > st.split) {
      // A crossette star splits: its four pieces go on from where it was
      [ox, oy] = at(st.vx, st.vy, st.split, b);
      tt = t - st.split;
      const pieces: [number, number][] = [
        [st.vy, -st.vx],
        [-st.vy, st.vx],
        [st.vx * 0.9, st.vy * 0.9],
        [-st.vx * 0.3, -st.vy * 0.3],
      ];
      for (const [px, py] of pieces) {
        for (let k = trail; k >= 0; k--) {
          const [qx, qy] = at(px * 0.7, py * 0.7, Math.max(0, tt - k * gap), b);
          dot(g, x + ox + qx, y + oy + qy, r * (1 - k / (trail + 2)), color, alpha * (1 - k / (trail + 1)));
        }
      }
      continue;
    }
    for (let k = trail; k >= 0; k--) {
      const back = Math.max(0, tt - k * gap);
      const [px, py] = at(st.vx, st.vy, back, b);
      // Glitter: the tail twinkles gold, the star keeps its color
      const tail = k > 0 && glitter;
      const twinkle = tail ? (Math.sin((st.seed * 50 + back * 40) * 3) > 0.2 ? 0.9 : 0.15) : 1;
      dot(g, x + ox + px, y + oy + py, r * (1 - k / (trail + 2)), tail ? '#ffd27a' : color, alpha * twinkle * (1 - k / (trail + 1.5)));
    }
  }
}

/** The rocket going up, with its sparks trailing */
function drawRocket(g: G, x0: number, y0: number, x1: number, y1: number, u01: number, glitter: boolean, u: number): void {
  const ease = (p: number) => 1 - (1 - p) ** 2;
  const n = glitter ? 10 : 6;
  for (let k = n; k >= 0; k--) {
    const p = Math.max(0, u01 - k * 0.025);
    const e = ease(p);
    const x = x0 + (x1 - x0) * e + Math.sin(p * 30) * 1.5 * u;
    const y = y0 + (y1 - y0) * e;
    const spark = k > 0 && glitter && Math.sin(k * 7 + p * 90) > 0.3;
    dot(g, x, y, (k ? 1.4 : 2.4) * u, spark ? '#fff2c4' : k ? '#ffb45a' : '#fff7e0', (1 - k / (n + 1)) * (k ? 0.75 : 1));
  }
}

/** The dots of a shape's icon for the phone's designer, in -1..1 */
export function shapeIcon(shape: FwShell['shape']): [number, number][] {
  const r = rng(7);
  switch (shape) {
    case 'ring':
    case 'heart':
    case 'star':
    case 'smile':
      return outline(shape, shape === 'smile' ? 30 : 20, r).map(([x, y]) => [x * 0.85, y * 0.85]);
    case 'willow': {
      // Drooping arcs from the middle
      const out: [number, number][] = [];
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI + (k / 6) * Math.PI;
        for (let i = 1; i <= 3; i++) out.push([Math.cos(a) * i * 0.27, Math.sin(a) * i * 0.2 + (i * i * 0.07)]);
      }
      return out;
    }
    case 'palm': {
      const out: [number, number][] = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
        for (let i = 1; i <= 3; i++) out.push([Math.cos(a) * i * 0.28, Math.sin(a) * i * 0.28 + i * i * 0.03]);
      }
      return out;
    }
    case 'crossette': {
      const out: [number, number][] = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const [cx, cy] = [Math.cos(a) * 0.55, Math.sin(a) * 0.55];
        out.push([cx, cy], [cx + 0.17, cy], [cx - 0.17, cy], [cx, cy + 0.17], [cx, cy - 0.17]);
      }
      return out;
    }
    case 'spiral': {
      const out: [number, number][] = [];
      for (let arm = 0; arm < 3; arm++) {
        for (let i = 1; i <= 6; i++) {
          const a = (arm / 3) * Math.PI * 2 + i * 0.42;
          out.push([Math.cos(a) * i * 0.15, Math.sin(a) * i * 0.15]);
        }
      }
      return out;
    }
    default: {
      const out: [number, number][] = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        for (const d of [0.45, 0.85]) out.push([Math.cos(a) * d, Math.sin(a) * d]);
      }
      return out;
    }
  }
}

/**
 * Draw a show `ms` after it started. Returns how bright the sky is from its bursts right now (0..1,
 * for a light over the scene).
 */
export function drawShow(g: G, design: Pick<FwDesign, 'shells'>, ms: number, sky: Sky, key = ''): number {
  const times = shellTimes(design);
  let light = 0;
  g.save();
  g.globalCompositeOperation = 'lighter';
  design.shells.forEach((s, i) => {
    const t0 = ms - times[i];
    const rise = riseMs(s);
    const life = (burstMs(s) - (s.effects.includes('echo') ? 700 : 0) - (s.effects.includes('crackle') ? 500 : 0)) / 1000;
    if (t0 < 0 || t0 > rise + burstMs(s)) return;
    for (let c = 0; c < s.count; c++) {
      // Several at once fan out around x, a little apart in time and height
      const spread = s.count > 1 ? (c / (s.count - 1) - 0.5) * Math.min(0.5, 0.12 * s.count) : 0;
      const lag = c * 90;
      const tc = t0 - lag;
      if (tc < 0) continue;
      const bx = (Math.max(0.04, Math.min(0.96, s.x / 100 + spread))) * sky.w;
      const by = sky.low + (sky.high - sky.low) * (s.height / 100) + (c % 2) * 18 * sky.unit;
      const lx = (s.x / 100) * sky.w + spread * sky.w * 0.35;
      if (tc < rise) {
        drawRocket(g, lx, sky.ground, bx, by, tc / rise, s.effects.includes('glitter'), sky.unit);
        continue;
      }
      const t = (tc - rise) / 1000;
      // The burst, in world units scaled to this sky
      g.save();
      g.translate(bx, by);
      g.scale(sky.unit, sky.unit);
      drawBurst(g, s, burstOf(s, `${key}|${i}|${c}`, false), 0, 0, t, life, 1);
      if (s.effects.includes('echo') && t > 0.55) drawBurst(g, s, burstOf(s, `${key}|${i}|${c}`, true), 0, 0, t - 0.55, life * 0.7, 1);
      g.restore();
      if (t < 0.4) light = Math.max(light, (1 - t / 0.4) * (0.4 + 0.2 * s.size));
    }
  });
  g.restore();
  g.globalAlpha = 1;
  return Math.min(1, light);
}
