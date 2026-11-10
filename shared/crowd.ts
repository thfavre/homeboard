// Crowd Race and Spy Hunt: a crowd of characters on the TV, players hidden among them, snipers aiming
// from the phones. The server moves everyone; the TV draws the crowd from frames sent 20 times a second.

/** The field, in world units: the TV scales it to its screen (16:9) */
export const WORLD = { w: 1600, h: 900 };
/** Size of a sprite frame (px) and world units per sprite pixel */
export const FRAME_PX = 64;
export const SPRITE_SCALE = 1.35;
/**
 * The body inside a 64 px frame (sprite pixels, from the frame's top left): the feet, and the box a shot
 * must land in. The world position of a character is the middle of its feet.
 */
export const BODY = { feetY: 61, centerX: 31, halfW: 11, topY: 14 };
/** Character looks: 12 different people for the race, 6 suits of one person for the spy game */
export const RACE_LOOKS = 12;
export const SUIT_LOOKS = 6;

/** What a character is doing, as sent in the frames */
export const ANIM = { idle: 0, walk: 1, run: 2, dead: 3, win: 4, cheer: 5, sit: 6 } as const;
export type AnimId = (typeof ANIM)[keyof typeof ANIM];
/** Facing, in the order of the sprite sheets: up, left, down, right */
export type Dir = 0 | 1 | 2 | 3;

/** Walking speed of everyone (world units a second); running is a multiple of it */
export const CROWD_SPEEDS = [
  { id: 'slow', name: 'Slow', ups: 46 },
  { id: 'normal', name: 'Normal', ups: 60 },
  { id: 'fast', name: 'Fast', ups: 80 },
] as const;
export type CrowdSpeed = (typeof CROWD_SPEEDS)[number]['id'];
export const crowdSpeed = (id: unknown) => CROWD_SPEEDS.find((s) => s.id === id) ?? CROWD_SPEEDS[1];
export const RUN_FACTORS = [1.5, 2, 2.5, 3] as const;

/** Crosshair speed at full stick (world units a second); the stick is curved for fine aiming near the middle */
export const AIM_SPEED = 1150;
export const AIM_CURVE = 1.7;
/** A crosshair's radius on the TV (world units) */
export const AIM_RADIUS = 34;

/** Players a game takes */
export const CROWD_MIN_PLAYERS = 2;
export const CROWD_MAX_PLAYERS = 10;

/** One crosshair in a frame */
export interface CrowdAim {
  id: string;
  x: number;
  y: number;
  /** Can shoot now (loaded, shots left, not blinded) */
  ready: boolean;
  /** Spy Hunt: drawing with it (the TV leaves a fading trail) */
  draw?: boolean;
}

/** Something that happened, for the sounds and the effects on the TV */
export type CrowdEvent =
  | { k: 'shot'; by: string; x: number; y: number; hit: number }
  | { k: 'kill'; actor: number; by: string; victim: string | null }
  | { k: 'go' }
  | { k: 'cross'; actor: number; player: string | null }
  | { k: 'gadget'; g: SpyGadget; x: number; y: number; actor?: number }
  | { k: 'case'; i: number }
  | { k: 'end' };

/**
 * One frame of the crowd for the TV: per character x, y, anim, dir (flat, rounded), the crosshairs, and
 * what happened since the last frame. `t`: server time.
 */
export interface CrowdFrame {
  t: number;
  a: number[];
  aims: CrowdAim[];
  ev: CrowdEvent[];
}

/** A shot that took someone out, for the feed on the TV */
export interface CrowdKill {
  at: number;
  by: string;
  /** The player taken out, or null for a passer-by */
  victim: string | null;
}

// ------------------------------------------------------------ Crowd Race

export interface CrowdRaceView {
  /** ready: everyone on the start line. race: go. reveal: the round is over, who was who */
  step: 'ready' | 'race' | 'reveal';
  round: number;
  rounds: number;
  /** Server time the race starts (the end of 'ready') */
  goAt: number;
  /** Server time the reveal ends */
  revealUntil: number;
  startX: number;
  finishX: number;
  /** TV only: the look of each character */
  looks?: number[];
  /** Shots left and when each player can shoot again (server time) */
  shots: Record<string, number>;
  readyAt: Record<string, number>;
  reloadMs: number;
  /** Players still in this round */
  alive: string[];
  /** Rounds won */
  points: Record<string, number>;
  /** Kills this round, and over the game */
  kills: CrowdKill[];
  totalKills: Record<string, number>;
  /** Round result: the winner (null: a passer-by got there first, or nobody) and why */
  winner: string | null;
  why: 'crossed' | 'npc' | 'last' | 'none' | 'time' | null;
  /** From the reveal on: the character of each player */
  reveal?: Record<string, number>;
  musicVolume: number;
  soundVolume: number;
}

// ------------------------------------------------------------ Spy Hunt

export const SPY_GADGETS = [
  { id: 'flashbang', name: 'Flashbang', help: 'Blinds every sniper for a few seconds: no aiming, no shooting' },
  { id: 'smoke', name: 'Smoke', help: 'A thick cloud where you stand, for a few seconds' },
  { id: 'decoy', name: 'Decoy', help: 'You jump into another character somewhere else. The one you leave falls down' },
] as const;
export type SpyGadget = (typeof SPY_GADGETS)[number]['id'];
export const FLASHBANG_MS = 3200;
export const SMOKE_MS = 8000;
export const SMOKE_RADIUS = 190;
/** A suitcase is touched within this distance of its middle */
export const CASE_RADIUS = 46;
/** The four suitcases of the basic map, one in each corner */
export const SPY_CASES: { x: number; y: number }[] = [
  { x: 190, y: 250 },
  { x: 1410, y: 250 },
  { x: 190, y: 800 },
  { x: 1410, y: 800 },
];
/** Where characters walk: the whole field but the strip at the top (the score) */
export const SPY_AREA = { x0: 70, x1: 1530, y0: 175, y1: 875 };
export const RACE_AREA = { y0: 190, y1: 870 };

export interface SpyView {
  /** pick: the spy picks a gadget and finds their character. hunt: the snipers can shoot. reveal: who was the spy */
  step: 'pick' | 'hunt' | 'reveal';
  round: number;
  rounds: number;
  /** Server time of the next step (end of pick, end of hunt, end of reveal) */
  until: number;
  huntMs: number;
  spy: string;
  /** TV only: the look of each character */
  looks?: number[];
  /** Suitcases: open once collected (a touched one stays closed until then) */
  cases: { x: number; y: number; open: boolean }[];
  needed: number;
  shots: Record<string, number>;
  readyAt: Record<string, number>;
  reloadMs: number;
  /** The spy's gadget: picked, and when it was used (the kind shows once used) */
  gadget: { picked: boolean; used: SpyGadget | null };
  smoke: { x: number; y: number; until: number } | null;
  /** Snipers are blinded until then */
  blindUntil: number;
  points: Record<string, number>;
  kills: CrowdKill[];
  /** How the round ended */
  outcome: 'shot' | 'cases' | 'time' | 'ammo' | null;
  shooter: string | null;
  /** From the reveal on: the spy's character */
  reveal?: number;
  drawFadeMs: number;
  musicVolume: number;
  soundVolume: number;
}

/** Points of a Spy Hunt round */
export const SPY_POINTS = { escape: 3, kill: 2, time: 1 };

/** Sent back to a phone that asks what it is in a Spy Hunt round */
export interface SpyMe {
  role: 'spy' | 'sniper';
  gadget: SpyGadget | null;
  used: boolean;
}
