// What guests make happen in the town from their phone (the Actions tab of the avatar panel):
// a courier carrying a letter (and a little money) to another guest's character, and fireworks
// they design themselves, launched over the town at night. The server checks and stores them
// (server/modules/world/actions.ts); the TV and the phone's preview draw the fireworks with the
// same code (web/src/modules/world/fireworks.ts).

// ------------------------------------------------------------ letters

/**
 * The paper a letter is written on. Plain papers come with the courier; fancy and luxe ones cost
 * extra, at the prices the host sets (courierPaperFancy, courierPaperLuxe).
 */
export const PAPERS = [
  { id: 'parchment', name: 'Parchment', tier: 'plain' },
  { id: 'sky', name: 'Sky', tier: 'plain' },
  { id: 'kraft', name: 'Kraft', tier: 'plain' },
  { id: 'mint', name: 'Mint', tier: 'plain' },
  { id: 'rose', name: 'Rose', tier: 'fancy' },
  { id: 'lavender', name: 'Lavender', tier: 'fancy' },
  { id: 'confetti', name: 'Confetti', tier: 'fancy' },
  { id: 'night', name: 'Night', tier: 'luxe' },
  { id: 'gilded', name: 'Gilded', tier: 'luxe' },
  { id: 'royal', name: 'Royal', tier: 'luxe' },
] as const;
export type PaperId = (typeof PAPERS)[number]['id'];
export type PaperTier = (typeof PAPERS)[number]['tier'];

/** What a paper costs on top of the courier */
export function paperPrice(id: PaperId, prices: { fancy: number; luxe: number }): number {
  const tier = PAPERS.find((p) => p.id === id)?.tier ?? 'plain';
  return tier === 'fancy' ? prices.fancy : tier === 'luxe' ? prices.luxe : 0;
}

/** The wax seal on the envelope */
export const SEALS = [
  { id: 'crimson', name: 'Crimson', color: '#a3242c' },
  { id: 'royal', name: 'Royal', color: '#3b3f9e' },
  { id: 'forest', name: 'Forest', color: '#2f6b3c' },
  { id: 'gold', name: 'Gold', color: '#b8892a' },
  { id: 'ink', name: 'Ink', color: '#26232b' },
] as const;
export type SealId = (typeof SEALS)[number]['id'];

/** The longest letter, in characters and in lines (it fits its page) */
export const LETTER_MAX = 280;
export const LETTER_LINES = 8;

/** A letter's text as it is kept: trimmed, at most LETTER_LINES lines and LETTER_MAX characters */
export function letterText(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\r/g, '').split('\n').slice(0, LETTER_LINES).join('\n').trim().slice(0, LETTER_MAX);
}

export interface Letter {
  id: string;
  from: string;
  fromName: string;
  fromColor: string;
  to: string;
  toName: string;
  text: string;
  /** Money in the envelope (the town's money) */
  coins: number;
  paper: PaperId;
  seal: SealId;
  sentAt: number;
  /** When the courier handed it over (null: still on the way) */
  deliveredAt: number | null;
  /** When the one it is for opened it (null: not yet) */
  readAt: number | null;
}

/** A guest's letters: the ones received (delivered, newest first) and the ones sent */
export interface Mailbox {
  inbox: Letter[];
  sent: Letter[];
}

// ------------------------------------------------------------ fireworks

/**
 * What the stars of a shell do once it bursts: their look in the sky. `points` is how crazy it is
 * (the price follows).
 */
export const FW_PARTICLES = [
  { id: 'sparks', name: 'Sparks', about: 'Bright stars, short tails', points: 0 },
  { id: 'glitter', name: 'Glitter', about: 'Twinkling golden tails', points: 1 },
  { id: 'comets', name: 'Comets', about: 'Thick fiery streaks', points: 1 },
  { id: 'crackle', name: 'Crackle', about: 'Pop in white sparks', points: 1 },
  { id: 'strobe', name: 'Strobe', about: 'Blink on and off', points: 1 },
  { id: 'willow', name: 'Willow', about: 'Long tails that hang', points: 2 },
  { id: 'split', name: 'Split', about: 'Each star splits in four', points: 2 },
  { id: 'twirl', name: 'Twirl', about: 'The burst spins round', points: 2 },
] as const;
export type FwParticle = (typeof FW_PARTICLES)[number]['id'];

/** The colors of the stars */
export const FW_COLORS = [
  { id: 'gold', hex: '#ffcf5a' },
  { id: 'orange', hex: '#ff8a2a' },
  { id: 'red', hex: '#ff3b3b' },
  { id: 'pink', hex: '#ff6fc8' },
  { id: 'violet', hex: '#a46bff' },
  { id: 'blue', hex: '#4a7dff' },
  { id: 'cyan', hex: '#45e3ff' },
  { id: 'green', hex: '#4dff7a' },
  { id: 'lime', hex: '#d4ff45' },
  { id: 'white', hex: '#fff7e8' },
] as const;
export type FwColor = (typeof FW_COLORS)[number]['id'];
export const fwHex = (c: string) => FW_COLORS.find((x) => x.id === c)?.hex ?? '#ffffff';

/** A point of a drawing, in -1..1 across the burst (y down) */
export type FwPoint = [number, number];

/**
 * One shell of a show. Its stars burst into the shape drawn on the phone (`strokes`, each a line
 * drawn with the finger; none: a round burst), in its colors and particles.
 */
export interface FwShell {
  strokes: FwPoint[][];
  particles: FwParticle;
  /** 1 to 3 colors */
  colors: FwColor[];
  /** 1 small, 2 medium, 3 large */
  size: 1 | 2 | 3;
  /** Where it goes up across the town and how high it bursts (0..100) */
  x: number;
  height: number;
  /** Fired this long after the one before (ms; the first after the show starts) */
  delay: number;
  /** This many go up together, fanned out around x (1..5) */
  count: number;
}

export interface FwDesign {
  id: string;
  name: string;
  shells: FwShell[];
}

/** The longest gap between two shells, the most of one shell at once, the longest name */
export const FW_MAX_DELAY = 4000;
export const FW_MAX_COUNT = 5;
export const FW_NAME_MAX = 32;
/** A drawing keeps at most this many lines, of at most this many points each */
export const FW_MAX_STROKES = 30;
export const FW_STROKE_POINTS = 160;

/** How many points a shell is worth: a drawn shape, its size, extra colors and particles, times how many go up at once */
export function shellPoints(s: FwShell): number {
  const drawn = s.strokes.length ? 2 : 0;
  const size = s.size === 3 ? 3 : s.size === 2 ? 1 : 0;
  const colors = Math.max(0, s.colors.length - 1);
  const particles = FW_PARTICLES.find((p) => p.id === s.particles)?.points ?? 0;
  return (1 + drawn + size + colors + particles) * Math.max(1, s.count);
}

/** What launching a show costs: a base price, plus so much per point of craziness */
export function fireworkCost(d: Pick<FwDesign, 'shells'>, prices: { base: number; perPoint: number }): number {
  return Math.round(prices.base + prices.perPoint * d.shells.reduce((n, s) => n + shellPoints(s), 0));
}

/** How long a shell takes to rise to its height (ms) */
export const riseMs = (s: Pick<FwShell, 'height'>) => 900 + s.height * 9;
/** How long its stars stay in the sky after the burst (ms) */
export const burstMs = (s: Pick<FwShell, 'particles' | 'size'>) =>
  (s.particles === 'willow' ? 4200 : s.particles === 'comets' ? 3000 : 2400) + s.size * 250 + (s.particles === 'crackle' ? 500 : 0);

/** When each shell of a show goes up (ms after the show starts) */
export function shellTimes(d: Pick<FwDesign, 'shells'>): number[] {
  let t = 0;
  return d.shells.map((s, i) => (t += i === 0 ? Math.min(s.delay, 1000) : s.delay));
}

/** How long a whole show lasts (ms) */
export function showMs(d: Pick<FwDesign, 'shells'>): number {
  const at = shellTimes(d);
  return d.shells.reduce((end, s, i) => Math.max(end, at[i] + riseMs(s) + burstMs(s)), 0);
}

/**
 * Points every `step` along the lines of a drawing (the stars of a drawn burst sit there), at most
 * `max` of them: a longer drawing gets its points further apart
 */
export function samplePath(strokes: FwPoint[][], step: number, max: number): FwPoint[] {
  const len = strokes.reduce((n, st) => n + st.slice(1).reduce((m, p, i) => m + Math.hypot(p[0] - st[i][0], p[1] - st[i][1]), 0), 0);
  const gap = Math.max(step, len / max);
  const out: FwPoint[] = [];
  for (const st of strokes) {
    if (!st.length) continue;
    out.push(st[0]);
    let carry = 0;
    for (let i = 1; i < st.length; i++) {
      const [ax, ay] = st[i - 1];
      const [bx, by] = st[i];
      const d = Math.hypot(bx - ax, by - ay);
      if (!d) continue;
      let t = gap - carry;
      while (t <= d) {
        out.push([ax + ((bx - ax) * t) / d, ay + ((by - ay) * t) / d]);
        t += gap;
      }
      carry = d - (t - gap);
    }
  }
  return out.slice(0, max);
}

/** Ready-made shapes to start a drawing from (or to fire as they are) */
const arc = (n: number, r: number, cx = 0, cy = 0, from = 0, to = Math.PI * 2): FwPoint[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as FwPoint;
  });
export const FW_TEMPLATES: { id: string; name: string; strokes: FwPoint[][] }[] = [
  { id: 'burst', name: 'Round', strokes: [] },
  { id: 'ring', name: 'Ring', strokes: [arc(40, 0.8)] },
  {
    id: 'heart',
    name: 'Heart',
    strokes: [
      Array.from({ length: 49 }, (_, i) => {
        const t = (i / 48) * Math.PI * 2;
        return [(16 * Math.sin(t) ** 3) / 19, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 19 - 0.05] as FwPoint;
      }),
    ],
  },
  {
    id: 'star',
    name: 'Star',
    strokes: [
      Array.from({ length: 11 }, (_, k) => {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 ? 0.36 : 0.85;
        return [Math.cos(a) * r, Math.sin(a) * r + 0.05] as FwPoint;
      }),
    ],
  },
  { id: 'smile', name: 'Smile', strokes: [arc(36, 0.8), arc(5, 0.07, -0.3, -0.25), arc(5, 0.07, 0.3, -0.25), arc(14, 0.45, 0, 0.02, 0.2 * Math.PI, 0.8 * Math.PI)] },
  {
    id: 'spiral',
    name: 'Spiral',
    strokes: [Array.from({ length: 60 }, (_, i) => [Math.cos(i * 0.3) * (0.05 + i * 0.0135), Math.sin(i * 0.3) * (0.05 + i * 0.0135)] as FwPoint)],
  },
];

/** Every guest starts with this one */
export const BASIC_FIREWORK: Omit<FwDesign, 'id'> = {
  name: 'Basic',
  shells: [{ strokes: [], particles: 'sparks', colors: ['gold'], size: 2, x: 50, height: 60, delay: 0, count: 1 }],
};

/**
 * A new shell for the designer: round, in another color than the last one and somewhere else, so
 * adding several reads as a show
 */
export function newShell(after?: FwShell): FwShell {
  if (!after) return structuredClone(BASIC_FIREWORK.shells[0]);
  const next = FW_COLORS[(FW_COLORS.findIndex((c) => c.id === after.colors[0]) + 3) % FW_COLORS.length].id;
  return { strokes: [], particles: 'sparks', colors: [next], size: after.size, count: 1, height: after.height, x: after.x < 50 ? Math.min(85, after.x + 30) : Math.max(15, after.x - 30), delay: 700 };
}

const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

/** A drawing from the phone, cleaned up: numbers in -1..1, a few lines of a few points */
function validStrokes(v: unknown): FwPoint[][] {
  if (!Array.isArray(v)) return [];
  const out: FwPoint[][] = [];
  for (const st of v.slice(0, FW_MAX_STROKES)) {
    if (!Array.isArray(st)) continue;
    const pts: FwPoint[] = [];
    for (const p of st.slice(0, FW_STROKE_POINTS)) {
      const x = Number(Array.isArray(p) ? p[0] : NaN);
      const y = Number(Array.isArray(p) ? p[1] : NaN);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([Math.round(Math.max(-1, Math.min(1, x)) * 1000) / 1000, Math.round(Math.max(-1, Math.min(1, y)) * 1000) / 1000]);
    }
    if (pts.length) out.push(pts);
  }
  return out;
}

/** A design from the phone, cleaned up (null: not a design at all) */
export function validDesign(v: unknown, maxShells: number): Omit<FwDesign, 'id'> | null {
  const d = v as Partial<FwDesign> | null;
  if (!d || !Array.isArray(d.shells) || !d.shells.length) return null;
  const shells: FwShell[] = [];
  for (const raw of d.shells.slice(0, Math.max(1, maxShells))) {
    const s = raw as Partial<FwShell>;
    const colors = [...new Set((Array.isArray(s.colors) ? s.colors : []).filter((c): c is FwColor => FW_COLORS.some((x) => x.id === c)))].slice(0, 3);
    if (!colors.length) return null;
    shells.push({
      strokes: validStrokes(s.strokes),
      particles: FW_PARTICLES.find((p) => p.id === s.particles)?.id ?? 'sparks',
      colors,
      size: clamp(s.size, 1, 3, 2) as 1 | 2 | 3,
      x: clamp(s.x, 0, 100, 50),
      height: clamp(s.height, 0, 100, 60),
      delay: clamp(s.delay, 0, FW_MAX_DELAY, 600),
      count: clamp(s.count, 1, FW_MAX_COUNT, 1),
    });
  }
  const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, FW_NAME_MAX) : 'My fireworks';
  return { name, shells };
}

/** A show going up over the town (in the TV's state while it is on or waiting its turn) */
export interface FwShow {
  id: string;
  /** Server time it starts, and ends (0: its rockets are still being set up) */
  at: number;
  ends: number;
  by: string;
  byName: string;
  design: FwDesign;
  /** Where in the town the rockets go up from (null: not known yet) */
  pad: { x: number; y: number } | null;
  /** Launched in the day: set up once night falls */
  forNight?: true;
}

/** The most rockets planted for a show (one per shell, up to this) */
export const MAX_ROCKETS = 6;

/** Where a shell bursts across the town: left or right of its launch spot by its `x` (0..100, 50 above it) */
export const burstX = (padX: number, x: number, w: number) => Math.max(60, Math.min(w - 60, padX + (x - 50) * 11));

/** The host's options for the actions (the admin page) */
export interface ActionSettingsView {
  courier: boolean;
  courierFee: number;
  courierMaxCoins: number;
  /** What a fancy and a luxe paper cost on top of the courier */
  courierPaperFancy: number;
  courierPaperLuxe: number;
  fireworks: boolean;
  fireworkBase: number;
  fireworkPerPoint: number;
  fireworkShells: number;
  fireworkSaved: number;
}

/** What the phone needs to know about the actions (every guest's state) */
export interface ActionsInfo {
  courier: { on: boolean; fee: number; maxCoins: number; papers: { fancy: number; luxe: number } };
  fireworks: {
    on: boolean;
    base: number;
    perPoint: number;
    maxShells: number;
    /** It is dark enough to launch now */
    night: boolean;
    /** When night falls next (server time; null: it is night, or never: no day and night in the town) */
    nightAt: number | null;
    /** The shows waiting or on: the last one ends then (server time; 0: the sky is free) */
    busyUntil: number;
  };
}
