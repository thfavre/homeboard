// Light Party: a pack of short mini games played on one upright light strip, one after the other.
// Each mini game starts with its rules (everyone presses "Got it"), and gives points by place.

export type PartyMiniId = 'count' | 'stack' | 'match';

export interface PartyMiniInfo {
  id: PartyMiniId;
  name: string;
  tagline: string;
  /** How to play in 3 short steps, on the TV and the phones */
  steps: string[];
  /** Two colors of its gradient */
  colors: [string, string];
}

export const PARTY_MINIS: PartyMiniInfo[] = [
  {
    id: 'count',
    name: 'Color Count',
    tagline: 'How many of each color? Look fast',
    steps: ['Dots of 3 colors light up the strip for a few seconds', 'Then one color is asked: how many were there?', 'Pick from 5 answers. Closest wins, then the fastest'],
    colors: ['#ff3b5c', '#3d8bff'],
  },
  {
    id: 'stack',
    name: 'Stack',
    tagline: 'Remember the tower of blocks',
    steps: ['Blocks fall and stack up to the top of the strip', 'Remember the colors before the tower falls', 'Rebuild it from the bottom on your phone, in 20 seconds'],
    colors: ['#ffb627', '#2fd27a'],
  },
  {
    id: 'match',
    name: 'Color Match',
    tagline: 'Remember one color, then make it again',
    steps: ['The whole strip glows one color for a few seconds', 'Make the same color on your phone', 'The strip shows each guess under the real one'],
    colors: ['#ff5fc8', '#8b3dff'],
  },
];

export const partyMini = (id: string) => PARTY_MINIS.find((g) => g.id === id);

/** Colors of the dots and blocks. `led` is what the strip shows. */
export const PARTY_COLORS = [
  { id: 'red', name: 'Red', hex: '#ff3b5c', led: '#ff0000' },
  { id: 'green', name: 'Green', hex: '#2fd27a', led: '#00ff00' },
  { id: 'blue', name: 'Blue', hex: '#3d8bff', led: '#0000ff' },
  { id: 'yellow', name: 'Yellow', hex: '#ffd23d', led: '#ffa000' },
] as const;
export type PartyColor = (typeof PARTY_COLORS)[number]['id'];
export const partyColor = (id: string) => PARTY_COLORS.find((c) => c.id === id);

/** Points by place in a mini game (1st, 2nd, 3rd), then this for anyone who played */
export const PARTY_POINTS = [5, 3, 2];
export const PARTY_POINTS_REST = 1;

/** Stack: time to rebuild the tower */
export const STACK_INPUT_SEC = 20;

/** A color of Color Match: hue in degrees (0 to 360), saturation 0 to 1, always at full brightness */
export interface HueSat {
  h: number;
  s: number;
}

/** CSS of a Color Match color */
export const hueSatCss = (c: HueSat) => `hsl(${Math.round(c.h)} 100% ${Math.round(100 - c.s * 50)}%)`;

/** RGB (0 to 255) of a color at full brightness */
export function hueSatRgb(c: HueSat): [number, number, number] {
  const h = (((c.h % 360) + 360) % 360) / 60;
  const s = Math.min(1, Math.max(0, c.s));
  const f = (n: number) => {
    const k = (n + h) % 6;
    return 255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

/** Score of a Color Match guess, 0 to 100: how close the two colors are on the color wheel */
export function hueSatScore(target: HueSat, guess: HueSat): number {
  const p = (c: HueSat) => [c.s * Math.cos((c.h * Math.PI) / 180), c.s * Math.sin((c.h * Math.PI) / 180)];
  const [ax, ay] = p(target);
  const [bx, by] = p(guess);
  const d = Math.hypot(ax - bx, ay - by);
  return Math.round(Math.max(0, 1 - d / 1.1) * 1000) / 10;
}

/** One line of a mini game's results */
export interface PartyLine {
  id: string;
  /** What they did: "Picked 27", "7 of 10", "92.4 %" */
  label: string;
  /** Place in this mini game (1: best), null: did not play */
  place: number | null;
  points: number;
}

export interface CountView {
  kind: 'count';
  /** show: dots on the strip. ask: phones pick an answer. reveal: the answer */
  phase: 'show' | 'ask' | 'reveal';
  /** The 3 colors on the strip */
  colors: PartyColor[];
  /** From the question on: the color asked and the 5 answers */
  ask?: PartyColor;
  options?: number[];
  /** Players who answered (not what) */
  answered: string[];
  /** Reveal: the real count of each color, and every pick */
  counts?: Partial<Record<PartyColor, number>>;
  picks?: Record<string, number | null>;
}

export interface StackView {
  kind: 'stack';
  /** drop: blocks fall and stack up. memo: remember them. fall: the tower falls. input: rebuild it. reveal: the answer */
  phase: 'drop' | 'memo' | 'fall' | 'input' | 'reveal';
  /** Blocks in the tower */
  blocks: number;
  /** Colors a block can be */
  colors: PartyColor[];
  /** Blocks placed so far per player (not which) */
  progress: Record<string, number>;
  done: string[];
  /** Reveal: the tower, bottom first, every answer and how many are right from the bottom */
  tower?: PartyColor[];
  answers?: Record<string, PartyColor[]>;
  correct?: Record<string, number>;
}

export interface MatchView {
  kind: 'match';
  /** show: the strip glows the color. input: phones make it. reveal: each guess in turn on the strip */
  phase: 'show' | 'input' | 'reveal';
  done: string[];
  /** Reveal: the color, the guesses and their scores, the order they are shown in and the one shown now (-1: before the first, order.length: all shown) */
  target?: HueSat;
  guesses?: Record<string, HueSat | null>;
  scores?: Record<string, number>;
  order?: string[];
  showing?: number;
}

export type PartyMiniView = CountView | StackView | MatchView;

export interface PartyView {
  /** The mini games of this party, in order */
  lineup: PartyMiniId[];
  /** The one being played */
  index: number;
  /** lineup: the games are shown. rules: the current one's rules. play: it is played. score: its results */
  step: 'lineup' | 'rules' | 'play' | 'score';
  /** Rules: players who pressed Got it */
  ready: string[];
  /** Points so far */
  totals: Record<string, number>;
  /** The current mini game (play and score) */
  mini: PartyMiniView | null;
  /** Score: its results, best first */
  lines: PartyLine[] | null;
  /** Pixels of the strip (null: none reachable) */
  leds: number | null;
}
