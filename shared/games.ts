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
  /** How to play in 3 short steps, for the phones */
  steps: string[];
  /** Two colors of the game's gradient */
  colors: [string, string];
}

export const GAMES: GameInfo[] = [
  {
    id: 'timer',
    name: 'Blind Timer',
    tagline: 'Stop the clock at the target time, without seeing it',
    rules: 'A target time between 8 and 30 seconds is drawn. The timer starts on GO and is hidden: tap STOP when you think the target time has passed. The closest wins the round; the most rounds won wins the game (a tie goes to the smallest total gap).',
    modes: ['duel', 'room'],
    steps: ['A target between 8 and 30 seconds is drawn', 'GO: the clock starts and stays hidden. Tap STOP when you feel it', 'Closest wins the round. Most rounds won wins the game'],
    colors: ['#ff5f6d', '#ffa64d'],
  },
  {
    id: 'simon',
    name: 'Light Simon',
    tagline: 'Repeat the color sequence of the lights',
    rules: 'Watch the lights, then tap the same colors in the same order. One more color every round. One mistake and you are out.',
    modes: ['duel', 'room'],
    lights: true,
    steps: ['Watch the lights: one color to start', 'Tap them back in the same order', 'One more each round. One slip and you are out'],
    colors: ['#8b7cff', '#3d8bff'],
  },
  {
    id: 'reflex',
    name: 'Color Reflex',
    tagline: 'Tap the color of the lights before anyone else',
    rules: 'When the lights change color, tap that color on your phone. Fastest right tap wins the round. Tap too early or the wrong color and you miss the round.',
    modes: ['duel', 'room'],
    lights: true,
    steps: ['The lights go dark... then change color', 'Tap that color before anyone else', 'Too early or wrong: you miss the round. 5 rounds'],
    colors: ['#ffd23d', '#ff6a3d'],
  },
  {
    id: 'circle',
    name: 'Perfect Circle',
    tagline: 'Draw the roundest circle in one stroke',
    rules: 'Draw your circles with one finger, one stroke each, within one minute: each is sent when you lift your finger. The rounder, the higher the score. The TV reveals them all and the best total wins.',
    modes: ['duel', 'room'],
    steps: ['You have one minute to draw your circles, one stroke each', 'Each circle is sent when you lift your finger', 'The TV reveals them all: the best total wins'],
    colors: ['#2fd2c4', '#3d8bff'],
  },
  {
    id: 'bluff',
    name: 'Bluff',
    tagline: 'Share or steal the pot',
    rules: 'Both share: you split the pot and get a bonus. One steals: the thief takes everything. Both steal: nobody gets anything.',
    modes: ['duel'],
    steps: ['Talk it over, then choose in secret', 'Both share: split the pot, plus a bonus', 'One steals: takes it all. Both steal: nobody wins'],
    colors: ['#ff3b8d', '#8b3dff'],
  },
  {
    id: 'coin',
    name: 'Coin Flip',
    tagline: 'Heads or tails, winner takes the pot',
    rules: 'The TV picks who calls heads or tails. The other one flips the coin from their phone. The coin decides.',
    modes: ['duel'],
    steps: ['The TV picks who calls heads or tails', 'The other one swipes the coin up to the TV', 'The right side takes the whole pot'],
    colors: ['#ffc861', '#ff8a3a'],
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

/** Blind Timer target: a whole number of seconds drawn for each game */
export const BLIND_TARGET_SEC = { min: 8, max: 30 };

export interface GamePlayer {
  id: string;
  name: string;
  color: string;
}

/** Time the challenged guest has to answer */
export const DUEL_INVITE_MS = 60_000;

export interface DuelInvite {
  id: string;
  game: GameId;
  from: GamePlayer;
  to: GamePlayer;
  stake: number;
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
  /** Paid by the house to the winner of a room game, on top of the pot (split on a tie) */
  prize: number;
  phase: MatchPhase;
  endsAt: number | null;
  phaseMs: number;
  /** Game specific, see the *View types below */
  view: unknown;
  result: MatchResult | null;
  /** Rules screen: players who pressed Ready (it starts once everyone is) */
  ready: string[];
}

export interface GamesState {
  invites: DuelInvite[];
  match: MatchState | null;
  /** WLED lights can show the game colors */
  lights: boolean;
  /** Guests online with their balance, to pick an opponent who can match the bet */
  online: (GamePlayer & { balance: number })[];
  settings: GamesSettings;
}

export interface GamesSettings {
  /** Games guests can start */
  enabled: GameId[];
  /** Highest stake a guest can put in a duel or a room game (hundredths, 0 = no limit) */
  maxStake: number;
  /** Show the light colors on the TV too (always shown when no light is reachable) */
  tvColors: boolean;
  /** Rounds of Blind Timer */
  timerRounds: number;
  /** Circles each player draws in Perfect Circle */
  circleCount: number;
}

// ------------------------------------------------------------ per game views

export interface TimerRound {
  /** Time to stop at (ms) */
  target: number;
  /** Elapsed ms per player (null: did not stop) */
  times: Record<string, number | null>;
  /** Closest player(s) of this round */
  winners: string[];
}

export interface TimerView {
  round: number;
  rounds: number;
  /** countdown and running: before and after GO (from startAt), reveal: this round's times */
  step: 'countdown' | 'running' | 'reveal';
  /** Time to stop at this round (ms) */
  target: number;
  /** Server time of GO */
  startAt: number;
  /** Rounds already revealed (the current one included during its reveal). Nobody sees who stopped before. */
  history: TimerRound[];
  /** Total distance to the targets so far (ms) per player, over the revealed rounds (breaks ties) */
  totals: Record<string, number>;
  /** Rounds won so far per player: the most rounds won wins the game */
  wins: Record<string, number>;
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

export interface CircleDrawing {
  /** Normalised points (the shorter side of the pad is 1) */
  points: [number, number][];
  score: number;
  note?: string;
}

export interface CircleView {
  /** Circles each player draws */
  count: number;
  /** draw: everyone draws at their own pace, reveal: the TV shows the circles one by one */
  step: 'draw' | 'reveal';
  /** Circles sent so far per player */
  progress: Record<string, number>;
  /** From the reveal on: every player's circles, and the sum of their scores */
  drawings?: Record<string, CircleDrawing[]>;
  totals?: Record<string, number>;
  /** Reveal timing (server time): one circle every stepMs, in turns (1st circle of everyone, then 2nd...) */
  revealAt?: number;
  stepMs?: number;
}

export interface BluffView {
  chosen: string[];
  /** After the game */
  choices?: Record<string, 'share' | 'steal'>;
}

export type CoinSide = 'heads' | 'tails';

export interface CoinView {
  /** draw: the TV picks the caller. call: they pick a side. toss: the flipper swipes. flight: the coin is in the air. */
  step: 'draw' | 'call' | 'toss' | 'flight';
  /** Who calls the side (the result of the draw) */
  caller: string;
  /** Who flips the coin */
  flipper: string;
  drawAt: number | null;
  drawMs: number;
  /** The caller's side, once called */
  side: CoinSide | null;
  flipAt: number | null;
  /** How hard the coin was swiped (0 to 1) */
  power: number;
  /** Set when the coin lands */
  outcome: CoinSide | null;
}
