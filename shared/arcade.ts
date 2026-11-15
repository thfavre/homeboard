// The Arcade: quick 1 vs 1 games played phone against phone. Both players get the same run (same
// seed: the same log, the same walls, the same sums) at the same time, and the best score wins.
// The arcade itself is a building of the town, where the players' characters go to play.

export type ArcadeGameId = 'knife' | 'stack' | 'flap' | 'zig' | 'maths' | 'slicer';

export interface ArcadeGameInfo {
  id: ArcadeGameId;
  name: string;
  tagline: string;
  /** How to play in 3 short steps */
  steps: string[];
  /** Two colors of the game's gradient */
  colors: [string, string];
  /**
   * The run ends on the first mistake (a knife on a knife, a fall...), at the latest after `seconds`.
   * Otherwise it lasts exactly `seconds` and mistakes only cost points or time.
   */
  oneLife: boolean;
  seconds: number;
  /** What the score counts, plural (one: singular) */
  unit: string;
  one: string;
  /** Most points a run can make in a second, well above the best players: higher is refused */
  maxPerSec: number;
}

export const ARCADE_GAMES: ArcadeGameInfo[] = [
  {
    id: 'knife',
    name: 'Knife Throw',
    tagline: 'Throw knives into a spinning log, never on another knife',
    steps: ['Tap to throw a knife into the spinning log', 'Hit a knife already in it and you are out', 'Every log spins faster, and it changes its mind'],
    colors: ['#ff8a3d', '#c2410c'],
    oneLife: true,
    seconds: 90,
    unit: 'knives',
    one: 'knife',
    maxPerSec: 6,
  },
  {
    id: 'stack',
    name: 'Tower Stack',
    tagline: 'Drop each block right on top of the last one',
    steps: ['A block slides over the tower: tap to drop it', 'What sticks out is cut off, so aim well', 'Miss the tower and it is over. Perfect drops keep the width'],
    colors: ['#3dd6c6', '#3d6bff'],
    oneLife: true,
    seconds: 90,
    unit: 'floors',
    one: 'floor',
    maxPerSec: 5,
  },
  {
    id: 'flap',
    name: 'Flap',
    tagline: 'Flap through the gaps, do not touch a thing',
    steps: ['Tap to flap your wings and go up', 'Fly through the gaps in the walls', 'Touch a wall or the ground and you are out'],
    colors: ['#ffd23d', '#ff7a3d'],
    oneLife: true,
    seconds: 90,
    unit: 'walls',
    one: 'wall',
    maxPerSec: 3,
  },
  {
    id: 'zig',
    name: 'Zig',
    tagline: 'Turn at every corner of the zigzag path',
    steps: ['Your ball runs along a zigzag path', 'Tap to turn at each corner', 'Off the path and you fall. It gets faster'],
    colors: ['#c879ff', '#ff3d8b'],
    oneLife: true,
    seconds: 90,
    unit: 'turns',
    one: 'turn',
    maxPerSec: 6,
  },
  {
    id: 'maths',
    name: 'Quick Maths',
    tagline: 'Solve as many sums as you can',
    steps: ['A sum shows up: tap the right answer', 'A wrong answer costs you 2 seconds', 'Most right answers in 45 seconds wins'],
    colors: ['#4fd1a5', '#2f8bff'],
    oneLife: false,
    seconds: 45,
    unit: 'answers',
    one: 'answer',
    maxPerSec: 4,
  },
  {
    id: 'slicer',
    name: 'Slicer',
    tagline: 'Slice everything that flies, never the bombs',
    steps: ['Fruit flies up: swipe across it to slice it', 'Several in one swipe score a combo', 'A bomb costs you 3 points'],
    colors: ['#ff5f6d', '#8b3dff'],
    oneLife: false,
    seconds: 45,
    unit: 'points',
    one: 'point',
    maxPerSec: 12,
  },
];

export const arcadeGame = (id: string) => ARCADE_GAMES.find((g) => g.id === id);
export const isArcadeGame = (id: unknown): id is ArcadeGameId => typeof id === 'string' && ARCADE_GAMES.some((g) => g.id === id);

/** A Mix is this many different games drawn at random; the first to win most of them takes it */
export const ARCADE_MIX_ROUNDS = 3;
/** Time the challenged guest has to answer */
export const ARCADE_INVITE_MS = 60_000;
/** Time to read the rules before a round (it starts sooner once both pressed Ready) */
export const ARCADE_READY_MS = 20_000;
/** The 3, 2, 1 before a round */
export const ARCADE_COUNTDOWN_MS = 3500;
/** A round's result on the phones before the next one */
export const ARCADE_ROUND_MS = 5000;
/** Scores still accepted this long after a round's time is up (they travel) */
export const ARCADE_GRACE_MS = 2500;

export interface ArcadePlayer {
  id: string;
  name: string;
  color: string;
}

export interface ArcadeInvite {
  id: string;
  from: ArcadePlayer;
  to: ArcadePlayer;
  /** One game, or the games of a Mix in the order they are played */
  games: ArcadeGameId[];
  mix: boolean;
  stake: number;
  expiresAt: number;
}

/**
 * ready: the rules of the round, until both pressed Ready. play: the countdown (until startsAt),
 * then the game. round: who won the round. result: who won the match.
 */
export type ArcadePhase = 'ready' | 'play' | 'round' | 'result';

export interface ArcadeRound {
  game: ArcadeGameId;
  /** Both phones build the same run from it */
  seed: number;
  scores: Record<string, number>;
  /** Players whose run is over */
  done: string[];
  /** The round's winner once it is over (null: a tie) */
  winner?: string | null;
}

export interface ArcadeMatch {
  id: string;
  players: [ArcadePlayer, ArcadePlayer];
  games: ArcadeGameId[];
  mix: boolean;
  stake: number;
  pot: number;
  /** The rounds so far, the one being played last */
  rounds: ArcadeRound[];
  wins: Record<string, number>;
  phase: ArcadePhase;
  ready: string[];
  /** The game starts then, after the countdown (play) */
  startsAt: number | null;
  /** The phase ends then at the latest */
  endsAt: number | null;
  /** Who won the match (result; null: a tie) */
  winner?: string | null;
  /** What each player got back (result) */
  payouts?: Record<string, number>;
}

/** The best score of each game this party */
export interface ArcadeRecord {
  name: string;
  color: string;
  score: number;
}

export interface ArcadeSettings {
  /** The games offered */
  games: ArcadeGameId[];
  /** Highest bet (0: no limit) */
  maxStake: number;
  /** The players' characters walk into the arcade in the town while they play */
  townWalk: boolean;
  /** The arcade's screen in the town shows the scores of the matches */
  townScreen: boolean;
  /** Seconds the score screen shows each match when several are played at once */
  screenSec: number;
  /** Sounds and vibration on the phones while playing */
  sounds: boolean;
}

export const ARCADE_DEFAULTS: ArcadeSettings = {
  games: ARCADE_GAMES.map((g) => g.id),
  maxStake: 0,
  townWalk: true,
  townScreen: true,
  screenSec: 5,
  sounds: true,
};

export interface ArcadeState {
  invites: ArcadeInvite[];
  matches: ArcadeMatch[];
  records: Partial<Record<ArcadeGameId, ArcadeRecord>>;
  /** Guests one can challenge (not on the TV) */
  online: (ArcadePlayer & { balance: number })[];
  /** Guests already playing or with a challenge waiting, here or in the Games */
  busy: string[];
  settings: ArcadeSettings;
}

/** A small random generator from a seed: both phones draw the same numbers */
export function arcadeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
