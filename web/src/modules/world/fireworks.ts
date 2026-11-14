import { MAX_ROCKETS, burstMs, burstX, fwHex, riseMs, rowOffset, samplePath, shellTimes, type FwDesign, type FwPoint, type FwShell } from '$shared/worldActions.ts';

/**
 * Fireworks, drawn from nothing but the design and the time since the show started: every star's
 * place is worked out from its start speed (slowed by the air, pulled down by gravity), so a TV
 * that joins late picks a show up mid-way. A shell's stars burst into the shape its guest drew on
 * the phone (or a round burst), and its particles set how they look: short sparks, glittering or
 * hanging tails, comets, crackling, blinking, splitting or spinning. Each burst lights the sky
 * around it with a flash.
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
}

interface Burst {
  stars: Star[];
  /** The air slows the stars this much (1/s), gravity pulls them down this much (units/s²) */
  drag: number;
  gravity: number;
  /** Twirl: the burst turns this fast (rad/s) */
  spin: number;
  /** The stars draw a shape: a little bigger, so its lines read from across the room */
  drawn: boolean;
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

const SIZE = [0, 0.7, 1, 1.38];

/** The points of a drawn shape where its stars go (empty: a round burst) */
export function shapePoints(s: Pick<FwShell, 'strokes' | 'size'>): FwPoint[] {
  return s.strokes.length ? samplePath(s.strokes, 0.07, 46 + s.size * 14) : [];
}

/** The stars of one shell's burst */
function makeBurst(s: FwShell, seed: number): Burst {
  const r = rng(seed);
  const size = SIZE[s.size];
  const colors = s.colors.map(fwHex);
  const pick = (i: number, n: number) => colors[Math.floor((i / n) * colors.length) % colors.length];
  const stars: Star[] = [];
  const speed = 230 * size;
  const shape = shapePoints(s);
  let drag = 1.6;
  let gravity = 55;
  if (shape.length) {
    // A drawn shape is in the start speeds: slowed evenly, the stars draw it out and hold it
    drag = 2.2;
    gravity = s.particles === 'willow' ? 30 : 20;
    shape.forEach(([x, y], i) => stars.push({ vx: x * speed * 1.25, vy: y * speed * 1.25, color: pick(i, shape.length), seed: r() }));
  } else {
    // Round: the stars spread over a ball seen from the front
    const n = Math.round(72 * (0.75 + 0.25 * s.size) * (s.particles === 'split' ? 0.25 : 1));
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const v = speed * (s.particles === 'split' ? 0.9 : Math.sqrt(1 - (r() * 0.95) ** 2));
      stars.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: pick(i, n), seed: r() });
    }
    if (s.particles === 'willow') {
      drag = 2.6;
      gravity = 38;
    } else if (s.particles === 'comets') {
      drag = 1.2;
      gravity = 70;
    }
  }
  return { stars, drag, gravity, spin: s.particles === 'twirl' ? 2.4 * (r() < 0.5 ? -1 : 1) : 0, drawn: shape.length > 0 };
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
function burstOf(s: FwShell, key: string): Burst {
  const k = `${key}|${s.particles}|${s.size}|${s.colors.join(',')}|${s.strokes.length}|${s.strokes.reduce((n, st) => n + st.length, 0)}|${s.strokes[0]?.[0]?.join(',') ?? ''}`;
  let b = bursts.get(k);
  if (!b) {
    if (bursts.size > 400) bursts.clear();
    let h = 2166136261;
    for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
    bursts.set(k, (b = makeBurst(s, h)));
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
  g.globalCompositeOperation = 'lighter';
  g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  g.globalCompositeOperation = 'source-over';
}

/** How each kind of particle draws its tail: how many points, how far apart (s), how big the star */
const TAILS: Record<FwShell['particles'], { n: number; gap: number; r: number }> = {
  sparks: { n: 6, gap: 0.02, r: 2 },
  glitter: { n: 12, gap: 0.035, r: 2 },
  comets: { n: 12, gap: 0.03, r: 2.8 },
  crackle: { n: 5, gap: 0.02, r: 2 },
  strobe: { n: 3, gap: 0.02, r: 2.2 },
  willow: { n: 16, gap: 0.05, r: 1.8 },
  split: { n: 6, gap: 0.02, r: 2 },
  twirl: { n: 8, gap: 0.025, r: 2 },
};

/** Draw one burst, `t` seconds after it went off at the origin */
function drawBurst(g: G, s: FwShell, b: Burst, t: number, life: number): void {
  const p = s.particles;
  const tail = TAILS[p];
  if (t < 0.3) flash(g, 0, 0, 130 * SIZE[s.size], fwHex(s.colors[0]), 0.55 * (1 - t / 0.3));
  for (const st of b.stars) {
    const own = life * (0.8 + 0.2 * st.seed);
    if (t > own) {
      // Crackle: the dying star pops in a few white sparks
      if (p === 'crackle' && t < own + 0.45) {
        const [px, py] = at(st.vx, st.vy, own, b);
        const pr = rng(Math.floor(st.seed * 1e6) + Math.floor(t * 20));
        for (let k = 0; k < 3; k++) if (pr() < 0.6) dot(g, px + (pr() - 0.5) * 22, py + (pr() - 0.5) * 22, 1.3, '#ffffff', 1 - (t - own) / 0.45);
      }
      continue;
    }
    // Bright at first (near white), fading over the last part of its life
    let alpha = t < own * 0.55 ? 1 : 1 - (t - own * 0.55) / (own * 0.45);
    if (p === 'strobe' && t > 0.5 && Math.floor(t * 14 + st.seed * 7) % 2) alpha *= 0.12;
    const hot = t < 0.18;
    const color = hot ? '#ffffff' : st.color;
    const r = (hot ? 2.6 : tail.r) * (b.drawn ? 1.35 : 1);
    const tracks: { vx: number; vy: number; ox: number; oy: number; tt: number }[] = [];
    const SPLIT = 0.55 + st.seed * 0.15;
    if (p === 'split' && t > SPLIT) {
      // Splitting: four pieces go on from where the star was
      const [ox, oy] = at(st.vx, st.vy, SPLIT, b);
      for (const [px, py] of [
        [st.vy, -st.vx],
        [-st.vy, st.vx],
        [st.vx * 0.9, st.vy * 0.9],
        [-st.vx * 0.3, -st.vy * 0.3],
      ])
        tracks.push({ vx: px * 0.7, vy: py * 0.7, ox, oy, tt: t - SPLIT });
    } else tracks.push({ vx: st.vx, vy: st.vy, ox: 0, oy: 0, tt: t });
    for (const tr of tracks) {
      for (let k = tail.n; k >= 0; k--) {
        const back = Math.max(0, tr.tt - k * tail.gap);
        const [px, py] = at(tr.vx, tr.vy, back, b);
        const fade = 1 - k / (tail.n + 1.5);
        if (k > 0 && (p === 'glitter' || p === 'willow')) {
          // A golden tail that twinkles (the willow's hangs long and dim)
          const twinkle = Math.sin((st.seed * 50 + back * 40) * 3) > 0.2 ? 0.9 : 0.15;
          dot(g, tr.ox + px, tr.oy + py, r * (1 - k / (tail.n + 2)), '#ffd27a', alpha * fade * (p === 'willow' ? 0.7 : twinkle));
        } else {
          dot(g, tr.ox + px, tr.oy + py, r * (1 - k / (tail.n + 2)), k > 0 && p === 'comets' ? '#ffb45a' : color, alpha * fade);
        }
      }
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

/** Where rocket `k` of `n` stands, across its launch spot (world units from its middle) */
const rocketOffset = rowOffset;

/**
 * The rockets planted at a launch spot, their foot at (x, y), side by side: each standing (0), its
 * fuse burning (1) or gone up (-1). A red tube with a white band and a cone, on a little stick.
 */
export function drawPadRockets(g: G, x: number, y: number, states: number[], now: number): void {
  const n = states.length;
  states.forEach((st, k) => {
    if (st < 0) return;
    const rx = Math.round(x + rocketOffset(k, n));
    // (in sprite pixels of the town, 1.35 world units each, like the characters)
    const p = 1.35;
    const top = y - 21 * p;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(rx - 4 * p, y - p, 9 * p, 2 * p);
    // The stick, the tube with its band, the cone
    g.fillStyle = '#6b4a2a';
    g.fillRect(rx, y - 8 * p, p, 8 * p);
    g.fillStyle = '#3a2014';
    g.fillRect(rx - 3 * p, top + 4 * p, 7 * p, 10 * p);
    g.fillStyle = k % 2 ? '#2f5fb3' : '#c0342c';
    g.fillRect(rx - 2 * p, top + 5 * p, 5 * p, 8 * p);
    g.fillStyle = '#f2ead8';
    g.fillRect(rx - 2 * p, top + 8 * p, 5 * p, 2 * p);
    g.fillStyle = '#e8c35a';
    g.beginPath();
    g.moveTo(rx - 3 * p, top + 4.5 * p);
    g.lineTo(rx + 0.5 * p, top);
    g.lineTo(rx + 4 * p, top + 4.5 * p);
    g.fill();
    if (st === 1) {
      // The fuse fizzing at the tube's foot
      for (let i = 0; i < 6; i++) {
        const a = now / 60 + i * 1.7 + k;
        dot(g, rx + 0.5 * p + Math.cos(a) * (3 + (i % 3) * 2), top + 14 * p + Math.sin(a * 1.3) * 3, 1.3, i % 2 ? '#fff2b0' : '#ffb347', 0.95);
      }
      g.globalAlpha = 1;
    }
  });
}

/** The state of each rocket planted for a show, `ms` after it started (see drawPadRockets) */
export function padStates(design: Pick<FwDesign, 'shells'>, ms: number): number[] {
  const times = shellTimes(design);
  const n = Math.min(MAX_ROCKETS, design.shells.length);
  return Array.from({ length: n }, (_, k) => {
    // The shell the rocket stands for: the first of its share of the show
    const at = times[Math.floor((k * design.shells.length) / n)];
    return ms >= at ? -1 : ms >= at - 1200 ? 1 : 0;
  });
}

/**
 * Draw a show `ms` after it started. Returns how bright the sky is from its bursts right now (0..1,
 * for a light over the scene).
 */
export function drawShow(g: G, design: Pick<FwDesign, 'shells'>, ms: number, sky: Sky, key = '', pad: { x: number; y: number } | null = null): number {
  const times = shellTimes(design);
  let light = 0;
  // (the stars are painted plainly: in light they would add up to white where a drawn shape packs
  // them close; only the flashes light up what is behind)
  g.save();
  design.shells.forEach((s, i) => {
    const t0 = ms - times[i];
    const rise = riseMs(s);
    const life = (burstMs(s) - (s.particles === 'crackle' ? 500 : 0)) / 1000;
    if (t0 < 0 || t0 > rise + burstMs(s)) return;
    for (let c = 0; c < s.count; c++) {
      // Several at once fan out around x, a little apart in time and height
      const spread = s.count > 1 ? (c / (s.count - 1) - 0.5) * Math.min(0.5, 0.12 * s.count) : 0;
      const tc = t0 - c * 90;
      if (tc < 0) continue;
      // From the launch spot on the ground when there is one (bursting left or right of it), else from behind the roofs
      const bx = pad ? Math.max(40, Math.min(sky.w - 40, burstX(pad.x, s.x, sky.w) + spread * sky.w * 0.5)) : Math.max(0.04, Math.min(0.96, s.x / 100 + spread)) * sky.w;
      const by = sky.low + (sky.high - sky.low) * (s.height / 100) + (c % 2) * 18 * sky.unit;
      const lx = pad ? pad.x + rocketOffset(Math.floor((i * Math.min(MAX_ROCKETS, design.shells.length)) / design.shells.length), Math.min(MAX_ROCKETS, design.shells.length)) : (s.x / 100) * sky.w + spread * sky.w * 0.35;
      if (tc < rise) {
        drawRocket(g, lx, pad ? pad.y - 26 : sky.ground, bx, by, tc / rise, s.particles === 'glitter', sky.unit);
        continue;
      }
      const t = (tc - rise) / 1000;
      // The burst, in world units scaled to this sky
      g.save();
      g.translate(bx, by);
      g.scale(sky.unit, sky.unit);
      drawBurst(g, s, burstOf(s, `${key}|${i}|${c}`), t, life);
      g.restore();
      if (t < 0.4) light = Math.max(light, (1 - t / 0.4) * (0.4 + 0.2 * s.size));
    }
  });
  g.restore();
  g.globalAlpha = 1;
  return Math.min(1, light);
}
