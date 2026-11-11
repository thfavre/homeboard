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

/**
 * Walking speed of everyone at 100% (world units a second). The race: about 40 s to the line nonstop, and
 * with their stops the passers-by get there after about a minute and a quarter. The spy game: quicker.
 */
export const RACE_WALK_UPS = 34;
export const SPY_WALK_UPS = 60;
/** The walking speed of a setting in % (everyone, players and passers-by) */
export const walkSpeed = (percent: number, base: number) => base * Math.max(0.1, (Number(percent) || 100) / 100);
/** About how long a race round lasts at a walking speed in %: when the first passer-by gets to the line */
export const raceRoundSec = (percent: number) => Math.round((75 * 100) / Math.max(1, percent));
/** Settings the host can pick: walking speed in %, running speed in times walking, passers-by (race, spy) */
export const CROWD_LIMITS = { walk: [25, 300], run: [1.1, 4], raceNpcs: [0, 1000], spyNpcs: [0, 500], shots: [1, 500] } as const;
/** Shots setting for "as many as you like" (saved as 0), and how the views send it (-1: JSON has no Infinity) */
export const UNLIMITED_SHOTS = 0;
export const shotsOut = (n: number) => (Number.isFinite(n) ? n : -1);
/** The shots of a setting: 0 is unlimited */
export const shotsOf = (setting: number) => (setting > 0 ? setting : Infinity);

/**
 * Crosshair speed at full stick (world units a second: the width of the screen in about 2.5 s). The stick
 * is curved for fine aiming near the middle, and the crosshair eases into its speed (EASE: how quickly, a second).
 */
export const AIM_SPEED = 640;
export const AIM_CURVE = 2.2;
export const AIM_EASE = 10;
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
  /** The round: the TV never blends two frames of different rounds (everyone goes back to the start) */
  r: number;
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
  why: 'crossed' | 'npc' | 'none' | 'time' | null;
  /** From the reveal on: the character of each player */
  reveal?: Record<string, number>;
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
export const SMOKE_RADIUS = 280;
/** A suitcase is touched within this distance of its middle */
export const CASE_RADIUS = 46;
/** The four suitcases of the basic map, one in each corner */
export const SPY_CASES: { x: number; y: number }[] = [
  { x: 190, y: 250 },
  { x: 1410, y: 250 },
  { x: 190, y: 800 },
  { x: 1410, y: 800 },
];
/**
 * The fixed things on the spy square, in world units (the TV draws them, the server makes people walk
 * around them): the fountain in the middle, the trees and the lamp posts. `y` is where they stand.
 */
export const SPY_SCENE = {
  fountain: { x: 800, y: 545 },
  trees: [
    { x: 430, y: 440 },
    { x: 1170, y: 440 },
    { x: 480, y: 780 },
    { x: 1120, y: 780 },
  ],
  lamps: [
    { x: 620, y: 300 },
    { x: 980, y: 300 },
    { x: 300, y: 610 },
    { x: 1300, y: 610 },
    { x: 660, y: 830 },
    { x: 940, y: 830 },
  ],
};
/** Where nobody can stand: an ellipse on the ground around each of them */
export const SPY_OBSTACLES: { x: number; y: number; rx: number; ry: number }[] = [
  { x: SPY_SCENE.fountain.x, y: SPY_SCENE.fountain.y, rx: 74, ry: 34 },
  ...SPY_SCENE.trees.map((t) => ({ x: t.x, y: t.y, rx: 20, ry: 10 })),
  ...SPY_SCENE.lamps.map((l) => ({ x: l.x, y: l.y, rx: 12, ry: 7 })),
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
  soundVolume: number;
}

/** The recommended settings of each game (the defaults of a new install, and what "Reset" puts back) */
export const CROWD_DEFAULTS = { crowdNpcs: 30, crowdWalk: 100, crowdRun: 2, crowdShots: 1, crowdReloadSec: 2, crowdRounds: 3 };
export const SPY_DEFAULTS = {
  spyNpcs: 30,
  spyWalk: 100,
  spyShots: 3,
  spyReloadSec: 2,
  spyRounds: 3,
  spyMinutes: 3,
  spyNeeded: 4,
  spyCollectMin: 2,
  spyCollectMax: 5,
  spyLooks: 3,
  spyDrawFadeSec: 4,
  spyGadgets: SPY_GADGETS.map((g) => g.id) as SpyGadget[],
};
/** Shared by both games: the Spotify volume during them, the sounds, the light flashes */
export const SNIPER_DEFAULTS = { sniperMusic: 35, sniperSounds: 80, sniperLights: true };

/** Points of a Spy Hunt round */
export const SPY_POINTS = { escape: 3, kill: 2, time: 1 };

/** Sent back to a phone that asks what it is in a Spy Hunt round */
export interface SpyMe {
  role: 'spy' | 'sniper';
  gadget: SpyGadget | null;
  used: boolean;
}

// ------------------------------------------------------------ the row of houses

/** A small random generator, so a place is the same every time */
export function seeded(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** The houses along the top of a place, in the order they come in a row, with their width (sprite pixels) */
export const HOUSE_KINDS = [
  { kind: 'brickA', w: 208 },
  { kind: 'paneled', w: 160 },
  { kind: 'brickB', w: 144 },
] as const;
export type HouseKind = (typeof HOUSE_KINDS)[number]['kind'];

/** The house row of the spy square (and the town): the seed its houses are picked with, and their bottom (sprite pixels) */
export const SQUARE_HOUSES = { seed: 8, bottom: 92 };

/**
 * Where each house of a row stands: its kind and left edge in sprite pixels, from the left of the
 * place to `width` (sprite pixels). The server uses it too, to know where the town's doors are.
 */
export function houseRow(seed: number, width: number): { kind: HouseKind; x: number; w: number }[] {
  const r = seeded(seed);
  const out: { kind: HouseKind; x: number; w: number }[] = [];
  let x = -Math.floor(r() * 60);
  let k = Math.floor(r() * 3);
  while (x < width) {
    const h = HOUSE_KINDS[k % HOUSE_KINDS.length];
    out.push({ kind: h.kind, x, w: h.w });
    x += h.w + 6;
    k += 1;
  }
  return out;
}
