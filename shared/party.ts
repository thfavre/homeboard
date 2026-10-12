// Light Party: a pack of short mini games played on one upright light strip, one after the other.
// Each mini game starts with its rules (everyone presses "Got it"), and gives points by place.

export type PartyMiniId = 'count' | 'stack' | 'match';

/**
 * A setting of a mini game, a whole number. The admin page shows a stepper for it and the server keeps
 * it between `min` and `max` on a multiple of `step`: adding one is a line here, then reading it with
 * `partyOption` in the mini game.
 */
export interface PartyOption {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Shown after the value: 's', '%' */
  unit?: string;
}

export interface PartyMiniInfo {
  id: PartyMiniId;
  name: string;
  tagline: string;
  /** How to play in 3 short steps, on the TV and the phones */
  steps: string[];
  /** Two colors of its gradient */
  colors: [string, string];
  options: PartyOption[];
}

export const PARTY_MINIS: PartyMiniInfo[] = [
  {
    id: 'count',
    name: 'Color Count',
    tagline: 'How many of each color? Look fast',
    steps: ['Colored dots light up the strip for a few seconds', 'Then one color is asked: how many were there?', 'Pick an answer. Closest wins, then the fastest'],
    colors: ['#ff3b5c', '#3d8bff'],
    options: [
      { key: 'colors', label: 'Colors on the strip', hint: 'One of them is asked', min: 2, max: 4, step: 1, default: 3 },
      { key: 'most', label: 'Most dots of one color', hint: 'Each color gets between a few and this many (fewer on a short strip)', min: 6, max: 80, step: 2, default: 40 },
      { key: 'showSec', label: 'Dots on for', hint: 'Time to look at them', min: 3, max: 30, step: 1, default: 10, unit: 's' },
      { key: 'answers', label: 'Answers to pick from', hint: 'On the phones, the right one among them', min: 3, max: 6, step: 1, default: 5 },
      { key: 'spread', label: 'Gap between answers', hint: 'In % of the right answer: smaller is harder', min: 5, max: 30, step: 1, default: 12, unit: '%' },
      { key: 'answerSec', label: 'Time to answer', hint: '', min: 5, max: 30, step: 1, default: 15, unit: 's' },
    ],
  },
  {
    id: 'stack',
    name: 'Stack',
    tagline: 'Remember the tower of blocks',
    steps: ['Blocks fall and stack up to the top of the strip', 'Remember the colors before the tower falls', 'Rebuild it from the bottom on your phone'],
    colors: ['#ffb627', '#2fd27a'],
    options: [
      { key: 'blocks', label: 'Blocks in the tower', hint: 'They fill the strip from the floor to the top: more blocks are smaller', min: 3, max: 20, step: 1, default: 10 },
      { key: 'floor', label: 'Floor height', hint: 'Where the blocks land, in % of the strip from the bottom', min: 0, max: 80, step: 5, default: 50, unit: '%' },
      { key: 'colors', label: 'Block colors', hint: 'Fewer colors is easier', min: 2, max: 4, step: 1, default: 4 },
      { key: 'fallMs', label: 'Fall time', hint: 'Time a block takes to fall the whole strip: shorter is faster', min: 300, max: 2000, step: 50, default: 750, unit: ' ms' },
      { key: 'memoSec', label: 'Time to remember', hint: 'Once the tower is built, before it falls', min: 3, max: 30, step: 1, default: 8, unit: 's' },
      { key: 'inputSec', label: 'Time to rebuild it', hint: '', min: 10, max: 60, step: 5, default: 20, unit: 's' },
    ],
  },
  {
    id: 'match',
    name: 'Color Match',
    tagline: 'Remember one color, then make it again',
    steps: ['The whole strip glows one color for a few seconds', 'Make the same color on your phone', 'The strip shows each guess above the real one'],
    colors: ['#ff5fc8', '#8b3dff'],
    options: [
      { key: 'showSec', label: 'Color on for', hint: 'Time to look at it', min: 2, max: 15, step: 1, default: 5, unit: 's' },
      { key: 'pale', label: 'Palest color', hint: 'How white the color can be, in %: 0 = always full colors', min: 0, max: 60, step: 5, default: 45, unit: '%' },
      { key: 'inputSec', label: 'Time to make it', hint: '', min: 10, max: 60, step: 5, default: 20, unit: 's' },
      { key: 'brightness', label: 'Strip brightness', hint: 'The whole strip is lit at once: keep it under what the power supply gives', min: 20, max: 100, step: 10, default: 70, unit: '%' },
      { key: 'split', label: 'Split height', hint: 'Reveal: the real color below this height (in %), the guesses above', min: 20, max: 80, step: 5, default: 50, unit: '%' },
      { key: 'guessSec', label: 'Each guess shown for', hint: 'Reveal, one player at a time', min: 2, max: 8, step: 1, default: 3, unit: 's' },
    ],
  },
];

export const partyMini = (id: string) => PARTY_MINIS.find((g) => g.id === id);

/** Settings of the whole party (not of one mini game) */
export const PARTY_GENERAL: PartyOption[] = [
  { key: 'rulesSec', label: 'Time to read the rules', hint: 'Each mini game starts sooner once everyone pressed Got it', min: 10, max: 90, step: 5, default: 30, unit: 's' },
  { key: 'resultsSec', label: 'Results shown for', hint: 'After each mini game', min: 4, max: 30, step: 1, default: 9, unit: 's' },
  { key: 'idleGlow', label: 'Glow between games', hint: 'How bright the strip breathes while the rules and results show, in %. 0 = dark', min: 0, max: 60, step: 5, default: 30, unit: '%' },
];

/** The options set by the host, by mini game ('general' for the party). Missing ones are at their default. */
export type PartyOptions = Partial<Record<PartyMiniId | 'general', Record<string, number>>>;

export const partyOptionList = (mini: PartyMiniId | 'general') => (mini === 'general' ? PARTY_GENERAL : (partyMini(mini)?.options ?? []));

/** A setting's value, kept in its range */
export function partyOption(all: PartyOptions | undefined, mini: PartyMiniId | 'general', key: string): number {
  const o = partyOptionList(mini).find((x) => x.key === key);
  if (!o) throw new Error(`Unknown Light Party option ${mini}.${key}`);
  const raw = Number(all?.[mini]?.[key]);
  if (!Number.isFinite(raw)) return o.default;
  return Math.min(o.max, Math.max(o.min, o.min + Math.round((raw - o.min) / o.step) * o.step));
}

/** Only known settings, each in its range (what the admin sends) */
export function cleanPartyOptions(raw: unknown): PartyOptions {
  const out: PartyOptions = {};
  const src = (raw && typeof raw === 'object' ? raw : {}) as PartyOptions;
  for (const mini of ['general', ...PARTY_MINIS.map((g) => g.id)] as (PartyMiniId | 'general')[]) {
    const values: Record<string, number> = {};
    for (const o of partyOptionList(mini)) if (src[mini]?.[o.key] !== undefined) values[o.key] = partyOption(src, mini, o.key);
    if (Object.keys(values).length) out[mini] = values;
  }
  return out;
}

/** Colors of the dots and blocks, in the order they are used (2 colors: red and green...). `led` is what the strip shows. */
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
