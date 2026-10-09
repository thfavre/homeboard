// Mini games: 1 vs 1 duels with a stake, or room games that anyone can join.

export type GameId = 'timer' | 'simon' | 'reflex' | 'circle' | 'bluff' | 'coin' | 'rhythm';
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
  /** Played on a light only: no full screen on the TV, just a small card above the main widget */
  lightOnly?: boolean;
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
    steps: ['Watch the colors the lights play', 'Tap them back in the same order', 'One more each round. One slip and you are out'],
    colors: ['#8b7cff', '#3d8bff'],
  },
  {
    id: 'reflex',
    name: 'Color Reflex',
    tagline: 'Tap the color of the lights before anyone else',
    rules: 'When the lights change color, tap that color on your phone as fast as you can. Your times add up over the rounds and stay secret until the end. Too early, wrong color or no tap: a 3 second penalty. Lowest total wins.',
    modes: ['duel', 'room'],
    lights: true,
    steps: ['The lights go dark... then change color', 'Tap that color as fast as you can', 'Times revealed at the end: lowest total wins'],
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
  {
    id: 'rhythm',
    name: 'Rhythm Rain',
    tagline: 'Hit the notes when they reach the top of the light',
    rules: 'Colored notes climb the light strip from the bottom. Tap the same color on your phone when a note crosses the zone near the top: green is perfect, orange is good, red is just in time. Hits in a row raise your multiplier, a missed note resets it, and a tap with no note of that color in the zone costs points: mashing every key does not pay. Highest score wins.',
    modes: ['duel'],
    lights: true,
    lightOnly: true,
    steps: ['Notes climb the light strip from the bottom', 'Tap their color when they cross the zone at the top', 'Green is perfect. Keep the streak going for x4'],
    colors: ['#3dff9b', '#8b3dff'],
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
  /** Rhythm Rain level, 1 to 10 */
  difficulty?: number;
  /** Rhythm Rain played on one of the host's songs (costs the music price) */
  song?: { key: string; title: string; artist: string };
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

/**
 * A prize the winner plays with for a while after the game, until the time is up or they close it.
 * lights: Color Reflex, they pick the color of every light. scratch: Perfect Circle, their best circle
 * becomes a vinyl they scratch from the phone, live on the TV (in place of the music's "Up next").
 */
export type Perk = { guest: GamePlayer; until: number; totalMs: number } & (
  | { kind: 'lights'; color: GameColor | null }
  | { kind: 'scratch'; drawing: CircleDrawing }
);

/** 33 1/3 turns a minute, in radians a second: the speed of the scratch record left alone */
export const RECORD_SPEED = (100 / 3 / 60) * 2 * Math.PI;

/** Scratch moves, phone to TV: the record angle (radians, unbounded) and whether a finger is on it */
export interface ScratchMove {
  angle: number;
  touching: boolean;
}

export interface GamesState {
  invites: DuelInvite[];
  match: MatchState | null;
  perk: Perk | null;
  /** Admin only: the WLED lights, to pick the scratch light */
  lightDevices?: { id: string; name: string; online: boolean }[];
  /** WLED lights can show the game colors */
  lights: boolean;
  /** The host's songs for Rhythm Rain with music */
  rhythmSongs: RhythmSongInfo[];
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
  /** Rounds of Color Reflex */
  reflexRounds: number;
  /** Seconds the Color Reflex winner controls the lights (0: off) */
  reflexPerkSec: number;
  /** Seconds the Perfect Circle winner scratches their circle on the TV (0: off) */
  circlePerkSec: number;
  /** WLED light that turns with the scratch record ('' = none) */
  scratchLight: string;
  /** Colors in the first sequence of Light Simon */
  simonStart: number;
  /** WLED light the Rhythm Rain notes climb ('' = the TV only) */
  rhythmLight: string;
  /** The rhythm light's first LED is at the top (the notes go the other way) */
  rhythmReverse: boolean;
  /** Length of a Rhythm Rain song in seconds */
  rhythmSec: number;
  /** Rhythm Rain note speed for every level, in percent (100 = as designed) */
  rhythmSpeed: number;
  /** BeatSaver maps (keys) guests can play Rhythm Rain on, with their song and notes */
  rhythmSongs: string[];
  /** The music starts this many ms early, to make up for the TV's sound delay (-500 to 500) */
  rhythmAudioOffset: number;
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

/** One round of one player: the reaction time, or why it was missed (then it counts as the penalty) */
export interface ReflexTap {
  ms: number | null;
  miss?: 'early' | 'wrong' | 'none';
}

export interface ReflexView {
  round: number;
  rounds: number;
  /** 'wait': lights are dark, 'go': color is on, 'done': round over, 'reveal': the TV shows the times */
  step: 'ready' | 'wait' | 'go' | 'done' | 'reveal';
  /** Players who tapped this round (no result, that stays secret) */
  tapped: string[];
  /** The round color: the TV gets it during 'go', the phones once the round is over */
  color: GameColor | null;
  /** A miss counts as this many ms */
  penaltyMs: number;
  /** From the reveal on: every round of every player */
  taps?: Record<string, ReflexTap[]>;
  /** Reveal timing (server time): round r at revealAt + r * stepMs, player i of it cascadeMs * i later */
  revealAt?: number;
  stepMs?: number;
  cascadeMs?: number;
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

// ------------------------------------------------------------ Rhythm Rain

/** The keys, left to right (a level uses the first few). `led` is what the light strip shows. */
export const RHYTHM_COLORS = [
  { id: 'green', name: 'Green', hex: '#2fd27a', led: '#00ff00' },
  { id: 'red', name: 'Red', hex: '#ff3b5c', led: '#ff0000' },
  { id: 'yellow', name: 'Yellow', hex: '#ffd23d', led: '#ffb000' },
  { id: 'blue', name: 'Blue', hex: '#3d8bff', led: '#0000ff' },
  { id: 'orange', name: 'Orange', hex: '#ff7a2f', led: '#ff3c00' },
  { id: 'purple', name: 'Purple', hex: '#a35bff', led: '#8c00ff' },
  { id: 'cyan', name: 'Cyan', hex: '#2fe0e0', led: '#00ffd0' },
  { id: 'pink', name: 'Pink', hex: '#ff5fc8', led: '#ff0080' },
] as const;
export type RhythmColor = (typeof RHYTHM_COLORS)[number]['id'];

/**
 * The 10 levels picked with the challenge: how many colors, how long a note takes to climb to the
 * zone (shorter = faster), the tempo, and `busy`: the song starts already dense.
 */
export const RHYTHM_LEVELS = [
  { lanes: 1, travelMs: 2000, bpm: [90, 100], busy: 0, help: '1 color, slow. Just feel the beat.' },
  { lanes: 2, travelMs: 2000, bpm: [95, 105], busy: 0, help: '2 colors, slow.' },
  { lanes: 2, travelMs: 1600, bpm: [108, 118], busy: 0, help: '2 colors, faster.' },
  { lanes: 3, travelMs: 1900, bpm: [100, 110], busy: 0, help: '3 colors, steady.' },
  { lanes: 3, travelMs: 1550, bpm: [110, 120], busy: 0, help: '3 colors, faster.' },
  { lanes: 4, travelMs: 1800, bpm: [105, 115], busy: 0, help: '4 colors, steady. The classic.' },
  { lanes: 4, travelMs: 1500, bpm: [112, 122], busy: 0, help: '4 colors, faster.' },
  { lanes: 4, travelMs: 1300, bpm: [118, 126], busy: 1, help: '4 colors, fast, and busy from the start.' },
  { lanes: 4, travelMs: 1100, bpm: [124, 132], busy: 1, help: '4 colors, very fast. For real guitar heroes.' },
  { lanes: 8, travelMs: 1200, bpm: [118, 126], busy: 1, help: '8 colors on two rows of keys, fast. Good luck.' },
] as const;
export const RHYTHM_DEFAULT_LEVEL = 5;
export const rhythmLevel = (n: number) => RHYTHM_LEVELS[Math.min(10, Math.max(1, Math.round(n || RHYTHM_DEFAULT_LEVEL))) - 1];

/**
 * Timing of Rhythm Rain. A note climbs from the bottom of the strip to the middle of the hit zone
 * (the level's travel time), then goes on to the top. The zone is drawn with the windows below:
 * green within `perfectMs` of the middle, orange within `goodMs`, red within `okMs`.
 */
export const RHYTHM = {
  perfectMs: 70,
  goodMs: 140,
  okMs: 210,
  /** Middle of the hit zone, from the bottom of the strip (0 to 1) */
  zoneAt: 0.8,
  /** Time before the first note reaches the zone */
  leadMs: 4000,
};

export type RhythmGrade = 'perfect' | 'good' | 'ok' | 'miss';
export const RHYTHM_POINTS: Record<RhythmGrade, number> = { perfect: 100, good: 60, ok: 30, miss: 0 };
/** A tap with no note of that color in the zone: mashing every key loses more than it wins */
export const RHYTHM_WRONG_PENALTY = 50;
/** x1, then one more every 8 hits in a row, up to x4 */
export const rhythmMultiplier = (combo: number) => Math.min(4, 1 + Math.floor(combo / 8));

export interface RhythmNote {
  /** Server time it crosses the middle of the zone */
  at: number;
  color: RhythmColor;
}

export const rhythmGradeOf = (gapMs: number): RhythmGrade => {
  const g = Math.abs(gapMs);
  return g <= RHYTHM.perfectMs ? 'perfect' : g <= RHYTHM.goodMs ? 'good' : g <= RHYTHM.okMs ? 'ok' : 'miss';
};

/** The note a tap of `color` at server time `at` hits (index), or -1: the closest one of that color in the zone not hit yet */
export function rhythmTarget(notes: RhythmNote[], at: number, color: RhythmColor, hit: (i: number) => boolean): number {
  let found = -1;
  let gap = Infinity;
  for (let i = 0; i < notes.length; i++) {
    const d = Math.abs(notes[i].at - at);
    if (notes[i].at - at > RHYTHM.okMs) break;
    if (d <= RHYTHM.okMs && d < gap && notes[i].color === color && !hit(i)) {
      found = i;
      gap = d;
    }
  }
  return found;
}

export interface RhythmScore {
  score: number;
  combo: number;
  bestCombo: number;
  perfect: number;
  good: number;
  ok: number;
  /** Notes that went by */
  missed: number;
  /** Taps with no note of that color in the zone */
  wrong: number;
  /** Latest judgement, for the TV pop */
  last: { grade: RhythmGrade; at: number; seq: number } | null;
}

export interface RhythmView {
  /** Every note of the song, sorted (the lights show them anyway) */
  notes: RhythmNote[];
  bpm: number;
  /** Level 1 to 10, its keys (left to right) and the time a note takes to climb to the zone */
  difficulty: number;
  lanes: RhythmColor[];
  travelMs: number;
  /** Server time of the first beat of the count-in, and the end of the song */
  startAt: number;
  endAt: number;
  scores: Record<string, RhythmScore>;
  /** Pixels of the light the notes climb (null: no light set or reachable) */
  leds: number | null;
  /** Played on a song: the TV plays `url` from `offsetMs` into it at server time `at`, for `durationMs` */
  music: { url: string; title: string; artist: string; at: number; offsetMs: number; durationMs: number } | null;
  /** With music: waiting for the TV to have the song ready (no notes yet) */
  loading: boolean;
}

export interface RhythmSongInfo {
  key: string;
  status: 'loading' | 'ready' | 'error';
  title?: string;
  artist?: string;
  /** The audio file */
  url?: string;
  error?: string;
}
