// What guests make happen in the town from their phone (the Actions tab of the avatar panel):
// a courier carrying a letter (and a little money) to another guest's character, and fireworks
// they design themselves, launched over the town at night. The server checks and stores them
// (server/modules/world/actions.ts); the TV and the phone's preview draw the fireworks with the
// same code (web/src/modules/world/fireworks.ts).

// ------------------------------------------------------------ letters

/** The paper a letter is written on */
export const PAPERS = [
  { id: 'parchment', name: 'Parchment' },
  { id: 'rose', name: 'Rose' },
  { id: 'sky', name: 'Sky' },
  { id: 'night', name: 'Night' },
] as const;
export type PaperId = (typeof PAPERS)[number]['id'];

/** The wax seal on the envelope */
export const SEALS = [
  { id: 'crimson', name: 'Crimson', color: '#a3242c' },
  { id: 'royal', name: 'Royal', color: '#3b3f9e' },
  { id: 'forest', name: 'Forest', color: '#2f6b3c' },
  { id: 'gold', name: 'Gold', color: '#b8892a' },
  { id: 'ink', name: 'Ink', color: '#26232b' },
] as const;
export type SealId = (typeof SEALS)[number]['id'];

/** The longest letter */
export const LETTER_MAX = 280;

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

/** The shapes a shell bursts into; `points` is how crazy it is (the price follows) */
export const FW_SHAPES = [
  { id: 'peony', name: 'Peony', points: 0 },
  { id: 'ring', name: 'Ring', points: 1 },
  { id: 'willow', name: 'Willow', points: 1 },
  { id: 'palm', name: 'Palm', points: 1 },
  { id: 'crossette', name: 'Crossette', points: 2 },
  { id: 'spiral', name: 'Spiral', points: 2 },
  { id: 'star', name: 'Star', points: 2 },
  { id: 'heart', name: 'Heart', points: 3 },
  { id: 'smile', name: 'Smile', points: 3 },
] as const;
export type FwShape = (typeof FW_SHAPES)[number]['id'];

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

/** The effects a shell can have on top of its shape, each worth a point */
export const FW_EFFECTS = [
  { id: 'crackle', name: 'Crackle', about: 'The stars pop in little white sparks as they die' },
  { id: 'glitter', name: 'Glitter', about: 'Glittering tails behind every star' },
  { id: 'strobe', name: 'Strobe', about: 'The stars blink on and off' },
  { id: 'echo', name: 'Echo', about: 'A second, smaller burst a moment later', points: 2 },
] as const;
export type FwEffect = (typeof FW_EFFECTS)[number]['id'];

/** One shell of a show */
export interface FwShell {
  shape: FwShape;
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
  effects: FwEffect[];
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

/** How many points a shell is worth: its shape, size, extra colors and effects, times how many go up at once */
export function shellPoints(s: FwShell): number {
  const shape = FW_SHAPES.find((x) => x.id === s.shape)?.points ?? 0;
  const size = s.size === 3 ? 3 : s.size === 2 ? 1 : 0;
  const colors = Math.max(0, s.colors.length - 1);
  const effects = s.effects.reduce((n, e) => n + ((FW_EFFECTS.find((x) => x.id === e) as { points?: number } | undefined)?.points ?? 1), 0);
  return (1 + shape + size + colors + effects) * Math.max(1, s.count);
}

/** What launching a show costs: a base price, plus so much per point of craziness */
export function fireworkCost(d: Pick<FwDesign, 'shells'>, prices: { base: number; perPoint: number }): number {
  return Math.round(prices.base + prices.perPoint * d.shells.reduce((n, s) => n + shellPoints(s), 0));
}

/** How long a shell takes to rise to its height (ms) */
export const riseMs = (s: Pick<FwShell, 'height'>) => 900 + s.height * 9;
/** How long its stars stay in the sky after the burst (ms) */
export const burstMs = (s: Pick<FwShell, 'shape' | 'effects' | 'size'>) =>
  (s.shape === 'willow' ? 4200 : s.shape === 'palm' ? 3000 : 2400) + s.size * 250 + (s.effects.includes('echo') ? 700 : 0) + (s.effects.includes('crackle') ? 500 : 0);

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

/** Every guest starts with this one */
export const BASIC_FIREWORK: Omit<FwDesign, 'id'> = {
  name: 'Basic',
  shells: [{ shape: 'peony', colors: ['gold'], size: 2, x: 50, height: 60, delay: 0, count: 1, effects: [] }],
};

/**
 * A new shell for the designer: the shape and size of the last one in another color, somewhere
 * else, so adding several reads as a show. No effects or extra copies: those are chosen (and paid)
 */
export function newShell(after?: FwShell): FwShell {
  if (!after) return { ...BASIC_FIREWORK.shells[0], colors: ['gold'], effects: [] };
  const next = FW_COLORS[(FW_COLORS.findIndex((c) => c.id === after.colors[0]) + 3) % FW_COLORS.length].id;
  return { ...after, colors: [next], effects: [], count: 1, x: after.x < 50 ? Math.min(85, after.x + 30) : Math.max(15, after.x - 30), delay: 700 };
}

const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

/** A design from the phone, cleaned up (null: not a design at all) */
export function validDesign(v: unknown, maxShells: number): Omit<FwDesign, 'id'> | null {
  const d = v as Partial<FwDesign> | null;
  if (!d || !Array.isArray(d.shells) || !d.shells.length) return null;
  const shells: FwShell[] = [];
  for (const raw of d.shells.slice(0, Math.max(1, maxShells))) {
    const s = raw as Partial<FwShell>;
    if (!FW_SHAPES.some((x) => x.id === s.shape)) return null;
    const colors = [...new Set((Array.isArray(s.colors) ? s.colors : []).filter((c): c is FwColor => FW_COLORS.some((x) => x.id === c)))].slice(0, 3);
    if (!colors.length) return null;
    const effects = [...new Set((Array.isArray(s.effects) ? s.effects : []).filter((e): e is FwEffect => FW_EFFECTS.some((x) => x.id === e)))];
    shells.push({
      shape: s.shape as FwShape,
      colors,
      size: clamp(s.size, 1, 3, 2) as 1 | 2 | 3,
      x: clamp(s.x, 0, 100, 50),
      height: clamp(s.height, 0, 100, 60),
      delay: clamp(s.delay, 0, FW_MAX_DELAY, 600),
      count: clamp(s.count, 1, FW_MAX_COUNT, 1),
      effects,
    });
  }
  const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, FW_NAME_MAX) : 'My fireworks';
  return { name, shells };
}

/** A show going up over the town (in the TV's state while it is on or waiting its turn) */
export interface FwShow {
  id: string;
  /** Server time it starts, and ends */
  at: number;
  ends: number;
  by: string;
  byName: string;
  design: FwDesign;
}

/** The host's options for the actions (the admin page) */
export interface ActionSettingsView {
  courier: boolean;
  courierFee: number;
  courierMaxCoins: number;
  fireworks: boolean;
  fireworkBase: number;
  fireworkPerPoint: number;
  fireworkShells: number;
  fireworkSaved: number;
}

/** What the phone needs to know about the actions (every guest's state) */
export interface ActionsInfo {
  courier: { on: boolean; fee: number; maxCoins: number };
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
