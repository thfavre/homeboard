// Mini games: 1 vs 1 duels with a stake, or room games that anyone can join.

export type GameId = 'timer' | 'simon' | 'reflex' | 'circle' | 'bluff' | 'coin';
export type GameMode = 'duel' | 'room';

export interface GameInfo {
  id: GameId;
  name: string;
  tagline: string;
  /** Shown on the TV and the phones before the game starts */
  rules: string;
  modes: GameMode[];
  /** Uses the WLED lights (also shown on the TV) */
  lights?: boolean;
}

export const GAMES: GameInfo[] = [
  {
    id: 'timer',
    name: 'Blind Timer',
    tagline: 'Stop the clock at exactly 10 seconds, without seeing it',
    rules: 'The timer starts on GO and disappears. Tap STOP when you think 10.00 seconds have passed. Closest wins.',
    modes: ['duel', 'room'],
  },
  {
    id: 'simon',
    name: 'Light Simon',
    tagline: 'Repeat the color sequence of the lights',
    rules: 'Watch the lights, then tap the same colors in the same order. One more color every round. One mistake and you are out.',
    modes: ['duel', 'room'],
    lights: true,
  },
  {
    id: 'reflex',
    name: 'Color Reflex',
    tagline: 'Tap the color of the lights before anyone else',
    rules: 'When the lights change color, tap that color on your phone. Fastest right tap wins the round. Tap too early or the wrong color and you miss the round.',
    modes: ['duel', 'room'],
    lights: true,
  },
  {
    id: 'circle',
    name: 'Perfect Circle',
    tagline: 'Draw the roundest circle in one stroke',
    rules: 'Draw a circle with one finger, in one go. The closer it is to a perfect circle, the higher your score.',
    modes: ['duel', 'room'],
  },
  {
    id: 'bluff',
    name: 'Bluff',
    tagline: 'Share or steal the pot',
    rules: 'Both share: you split the pot and get a bonus. One steals: the thief takes everything. Both steal: nobody gets anything.',
    modes: ['duel'],
  },
  {
    id: 'coin',
    name: 'Coin Flip',
    tagline: 'Heads or tails, winner takes the pot',
    rules: 'The challenger picked a side. The coin decides.',
    modes: ['duel'],
  },
];

export const gameInfo = (id: string) => GAMES.find((g) => g.id === id);

/** Colors used by Light Simon and Color Reflex. `led` is what the WLED lights show. */
export const GAME_COLORS = [
  { id: 'red', name: 'Red', hex: '#ff3b5c', led: '#ff0000' },
  { id: 'green', name: 'Green', hex: '#2fd27a', led: '#00ff00' },
  { id: 'blue', name: 'Blue', hex: '#3d8bff', led: '#0000ff' },
  { id: 'yellow', name: 'Yellow', hex: '#ffd23d', led: '#ffb000' },
] as const;
export type GameColor = (typeof GAME_COLORS)[number]['id'];

export const BLIND_TARGET_MS = 10_000;

export interface GamePlayer {
  id: string;
  name: string;
  color: string;
}

export interface DuelInvite {
  id: string;
  game: GameId;
  from: GamePlayer;
  to: GamePlayer;
  stake: number;
  /** Coin flip: the challenger's side */
  side?: 'heads' | 'tails';
  expiresAt: number;
}

export type MatchPhase = 'lobby' | 'intro' | 'play' | 'result';

export interface MatchResultLine {
  id: string;
  /** Main figure, e.g. "10.04 s" or "92.3 %" */
  label: string;
  /** Smaller text under it */
  detail?: string;
}

export interface MatchResult {
  /** Winners in order. Several = tie (the pot is split) */
  winners: string[];
  /** Every player, best first */
  lines: MatchResultLine[];
  /** Money won by each player (pot share and rewards), by guest id */
  payouts: Record<string, number>;
  headline: string;
}

export interface MatchState {
  id: string;
  game: GameId;
  mode: GameMode;
  /** Who started it (null: the host) */
  starter: GamePlayer | null;
  players: GamePlayer[];
  stake: number;
  pot: number;
  phase: MatchPhase;
  endsAt: number | null;
  phaseMs: number;
  /** Game specific, see the *View types below */
  view: unknown;
  result: MatchResult | null;
}

export interface GamesState {
  invites: DuelInvite[];
  match: MatchState | null;
  /** WLED lights can show the game colors */
  lights: boolean;
  /** Guests online, to pick an opponent */
  online: GamePlayer[];
  settings: GamesSettings;
}

export interface GamesSettings {
  /** Games guests can start */
  enabled: GameId[];
  /** Highest stake a guest can put in a duel or a room game (hundredths, 0 = no limit) */
  maxStake: number;
  /** Show the light colors on the TV too (always shown when no light is reachable) */
  tvColors: boolean;
}

// ------------------------------------------------------------ per game views

export interface TimerView {
  /** Server time when the timer started */
  startAt: number | null;
  /** Ids of the players who stopped */
  stopped: string[];
  /** After the game: elapsed ms per player (null: did not stop) */
  times?: Record<string, number | null>;
}

export interface SimonView {
  round: number;
  /** 'show': lights play the sequence; 'input': players repeat it */
  step: 'show' | 'input' | 'between';
  length: number;
  /** Players still in */
  alive: string[];
  /** Players who finished the sequence this round */
  done: string[];
  /** Number of right taps per player this round */
  progress: Record<string, number>;
  /** TV only: color shown right now */
  flash?: GameColor | null;
}

export interface ReflexView {
  round: number;
  rounds: number;
  /** 'wait': lights are dark, 'go': color is on, 'won': someone got it */
  step: 'ready' | 'wait' | 'go' | 'won';
  scores: Record<string, number>;
  /** Players who cannot tap any more this round */
  out: string[];
  roundWinner: string | null;
  reactionMs: number | null;
  /** Shown once the round is decided (and to the TV during 'go') */
  color: GameColor | null;
}

export interface CircleView {
  /** Players who sent their drawing */
  done: string[];
  /** After the game: each drawing (normalised points, 0..1) and its score */
  drawings?: Record<string, { points: [number, number][]; score: number; note?: string }>;
}

export interface BluffView {
  chosen: string[];
  /** After the game */
  choices?: Record<string, 'share' | 'steal'>;
}

export interface CoinView {
  side: 'heads' | 'tails';
  /** Who called the side */
  caller: string;
  /** Set when the coin lands */
  outcome: 'heads' | 'tails' | null;
  flipAt: number | null;
}
