// The Arcade: quick 1 vs 1 games played phone against phone. Both players get the same run (same
// seed: the same log, the same walls, the same sums) at the same time, see each other's ghost as
// they play, and the best score wins.
// The arcade itself is a building of the town, where the players' characters go to play.

export type ArcadeGameId = 'knife' | 'stack' | 'flap' | 'zig' | 'plank' | 'dodge' | 'whack' | 'maths' | 'slicer';

export interface ArcadeGameInfo {
  id: ArcadeGameId;
  name: string;
  tagline: string;
  /** How to play in 3 short steps */
  steps: string[];
  /** Two colors of the game's gradient */
  colors: [string, string];
  /** How it is played on the phone */
  control: 'tap' | 'hold' | 'swipe' | 'slide';
  /**
   * Lives: each mistake (a knife on a knife, a fall...) costs one and the run ends with the last, at
   * the latest after `seconds`. 0: the run lasts exactly `seconds` and mistakes only cost points or time.
   */
  lives: number;
  seconds: number;
  /** Most points a run can make in a second (fever and bonuses included), well above the best players: higher is refused */
  maxPerSec: number;
}

/** What every game's score counts */
export const ARCADE_UNIT = { one: 'point', many: 'points' };
/** Points are doubled this long once the fever bar is full */
export const ARCADE_FEVER_MS = 6000;

export const ARCADE_GAMES: ArcadeGameInfo[] = [
  {
    id: 'knife',
    name: 'Knife Throw',
    tagline: 'Throw knives into a spinning log, never on another knife',
    steps: ['Tap to throw a knife into the spinning log', 'A knife on a knife costs a life. Hit the apples for bonus points', 'Every log spins faster, and it changes its mind'],
    colors: ['#ff8a3d', '#c2410c'],
    control: 'tap',
    lives: 3,
    seconds: 90,
    maxPerSec: 14,
  },
  {
    id: 'stack',
    name: 'Tower Stack',
    tagline: 'Drop each floor right on top of the last one',
    steps: ['A floor slides over the tower: tap to drop it', 'What sticks out is cut off. Perfect drops score double', 'Miss the tower and you lose a life'],
    colors: ['#3dd6c6', '#3d6bff'],
    control: 'tap',
    lives: 3,
    seconds: 90,
    maxPerSec: 12,
  },
  {
    id: 'flap',
    name: 'Flap',
    tagline: 'Flap through the gaps between the chimneys',
    steps: ['Tap to flap your wings and go up', 'Fly through the gaps. Right through the middle scores more', 'Touch a chimney or the ground and you lose a life'],
    colors: ['#ffd23d', '#ff7a3d'],
    control: 'tap',
    lives: 3,
    seconds: 90,
    maxPerSec: 8,
  },
  {
    id: 'zig',
    name: 'Zig',
    tagline: 'Turn at every corner of the zigzag road',
    steps: ['You run along a zigzag road in the sky', 'Tap to turn at each corner, grab the gems', 'Off the road and you lose a life. It gets faster'],
    colors: ['#c879ff', '#ff3d8b'],
    control: 'tap',
    lives: 3,
    seconds: 90,
    maxPerSec: 16,
  },
  {
    id: 'plank',
    name: 'Plank',
    tagline: 'Grow a plank just long enough to reach the next roof',
    steps: ['Hold to grow a plank, let go to lay it down', 'It must reach the next roof: the gold mark scores double', 'Too short or too long and you fall: a life lost'],
    colors: ['#ffb84d', '#6a4dff'],
    control: 'hold',
    lives: 3,
    seconds: 90,
    maxPerSec: 8,
  },
  {
    id: 'dodge',
    name: 'Street Dash',
    tagline: 'Run up the street, dodge the crates, grab the coins',
    steps: ['Slide your finger left and right to steer', 'Coins score, gems score more', 'Bump into anything and you lose a life'],
    colors: ['#4dff9e', '#2f8bff'],
    control: 'slide',
    lives: 3,
    seconds: 60,
    maxPerSec: 18,
  },
  {
    id: 'whack',
    name: 'Pop Up',
    tagline: 'Bop the moles as they pop up, never the cat',
    steps: ['Moles pop out of the holes: tap them', 'Golden moles score 3', 'Tap the cat and you lose 3 points'],
    colors: ['#a3e635', '#ca8a04'],
    control: 'tap',
    lives: 0,
    seconds: 45,
    maxPerSec: 20,
  },
  {
    id: 'maths',
    name: 'Quick Maths',
    tagline: 'Solve as many sums as you can',
    steps: ['A sum shows up: tap the right answer', 'Quick answers fill the fever bar. A wrong one costs 2 seconds', 'Most points in 45 seconds wins'],
    colors: ['#4fd1a5', '#2f8bff'],
    control: 'tap',
    lives: 0,
    seconds: 45,
    maxPerSec: 10,
  },
  {
    id: 'slicer',
    name: 'Slicer',
    tagline: 'Slice everything that flies, never the bombs',
    steps: ['Fruit flies up: swipe across it to slice it', 'Several in one swipe score a combo, golden fruit scores 5', 'A bomb costs you 3 points'],
    colors: ['#ff5f6d', '#8b3dff'],
    control: 'swipe',
    lives: 0,
    seconds: 45,
    maxPerSec: 28,
  },
];

export const arcadeGame = (id: string) => ARCADE_GAMES.find((g) => g.id === id);
/** The games the host offers */
export const arcadeOffered = (settings: { off: ArcadeGameId[] } | undefined) => ARCADE_GAMES.filter((g) => !settings?.off.includes(g.id));
export const isArcadeGame = (id: unknown): id is ArcadeGameId => typeof id === 'string' && ARCADE_GAMES.some((g) => g.id === id);

/**
 * How many games a challenge is: the games are drawn at random (different ones while there are
 * enough), each one shown only when its round starts; who wins most of them takes the pot
 */
export const ARCADE_COUNTS = [1, 3, 5] as const;
export type ArcadeCount = (typeof ARCADE_COUNTS)[number];
export const isArcadeCount = (n: unknown): n is ArcadeCount => ARCADE_COUNTS.includes(n as ArcadeCount);
/** "One game", "Best of 3"... */
export const arcadeFormat = (count: number) => (count === 1 ? 'One game' : `Best of ${count}`);
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
  /** How many games (drawn when the challenge is accepted) */
  count: ArcadeCount;
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
  /** Lives left (games with lives) */
  lives: Record<string, number>;
  /** Players whose points are doubled right now */
  fever: string[];
  /** Players whose run is over */
  done: string[];
  /** The round's winner once it is over (null: a tie) */
  winner?: string | null;
}

export interface ArcadeMatch {
  id: string;
  players: [ArcadePlayer, ArcadePlayer];
  /** How many games; the ones to come stay secret (rounds has the ones played and the one being played) */
  count: ArcadeCount;
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
  /** The games the host took out of the draw (a new game is in it until taken out) */
  off: ArcadeGameId[];
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
  off: [],
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

/**
 * Where a player is in their run, sent to the other phone about 10 times a second: each game reads
 * its own numbers (the bird's height in Flap, the place on the road in Zig...)
 */
export interface ArcadeGhost {
  match: string;
  round: number;
  from: string;
  d: number[];
}
export const ARCADE_GHOST_MS = 100;

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
