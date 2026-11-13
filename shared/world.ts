// Avatar world: a living pixel town on the TV. Every guest designs an LPC-style character that
// wanders the town. The server simulates the town and sends frames to the TV; the phones hold the
// avatar editor. The sprites are composited on the server from the Universal LPC generator's art
// (see server/modules/world/compose.ts).

import { SPRITE_SCALE, SPY_OBSTACLES, SPY_SCENE, SQUARE_HOUSES, WORLD, houseRow, type HouseKind } from './crowd.ts';
import type { Outfit, Tier, WornItem } from './wardrobe.ts';

/**
 * The town is built on the crowd games' square (same size, same houses, same environment art), so
 * the world and the games look like one place. It has its own things on it though: in the bottom
 * right corner the paving gives way to grass along a slant, with a campfire on it, and a river
 * runs across that corner and out under the town's right edge into the river by the castle; a cafe
 * with its terrace, a notice board by the town hall, trees of different sizes.
 */
export const TOWN = WORLD;
/**
 * What stands on the town's square (world units, `y` where it stands): the fountain, the trees (each
 * `size` times the art's size, `stem` the share of its trunk showing under the leaves) and the lamp
 * posts, in the order the lamplighter knows them
 */
export const TOWN_SCENE = {
  fountain: SPY_SCENE.fountain,
  trees: [
    { x: 430, y: 440, size: 1.12 },
    { x: 1170, y: 440, size: 1.18, stem: 0.62 },
    { x: 480, y: 780, size: 0.97 },
    { x: 1120, y: 780, size: 1.24 },
  ],
  lamps: [
    { x: 300, y: 610 },
    { x: 620, y: 300 },
    { x: 980, y: 300 },
    { x: 1300, y: 610 },
    { x: 940, y: 830 },
    { x: 660, y: 830 },
  ],
};
/** Where characters walk: the square below the sidewalk (but the far side of the river, see brookSide) */
export const TOWN_AREA = { x0: 70, x1: 1530, y0: 190, y1: 875 };

/**
 * The grass in the bottom right corner: the paving ends along a slant from `bottom` on the town's
 * bottom edge to `edge` high on its right edge (sprite pixels)
 */
export const TOWN_GRASS = { bottom: 830, edge: 247 };
/**
 * The town's river: its middle, from below the bottom edge across the grass corner and out under
 * the town's right edge, bending into the river by the castle (sprite pixels; past the town's
 * width is the riverside), and its half width. It flows that way, into the other river.
 */
export const TOWN_BROOK = {
  points: [
    [1050, 682],
    [1062, 660],
    [1098, 604],
    [1134, 548],
    [1164, 506],
    [1190, 484],
    [1215, 480],
    [1250, 487],
    [1300, 500],
  ] as [number, number][],
  hw: 16,
};

/**
 * Where a point stands to the town's river (world units): its distance from the river's middle,
 * negative on the town's side, positive in the water's far half and beyond it. The water reaches
 * BROOK_HW either side of the middle.
 */
export const BROOK_HW = TOWN_BROOK.hw * SPRITE_SCALE;
export function brookSide(x: number, y: number): number {
  const S = SPRITE_SCALE;
  let best = Infinity;
  let side = -1;
  const p = TOWN_BROOK.points;
  for (let i = 1; i < p.length; i++) {
    const ax = p[i - 1][0] * S;
    const ay = p[i - 1][1] * S;
    const dx = p[i][0] * S - ax;
    const dy = p[i][1] * S - ay;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < best) {
      best = d;
      // The town's side is left of the way the river flows
      side = (x - ax) * -dy + (y - ay) * dx < 0 ? -1 : 1;
    }
  }
  return side * best;
}

/**
 * A place to sit, and the way the sitter faces. x and y are where the sitter's FEET land, not the
 * seat: the sit pose (the sit rows' last frame) draws the bottom about 13 sprite pixels above the
 * feet and, sitting sideways, about 3 pixels behind them (on the ground, the first frame: lower).
 * Place the feet so that point lands on the seat's art (a bench: feet 2 world units below the
 * bench's bottom), and look at it on the TV before keeping it.
 */
export interface Seat {
  x: number;
  y: number;
  dir: WDir;
  /** Sitting on the ground (legs out), not on something */
  ground?: boolean;
}

/** Places on the fountain's rim: two on its front, one on each side facing out */
export const FOUNTAIN_SEATS: Seat[] = [
  { x: 758, y: 586, dir: 2 },
  { x: 842, y: 586, dir: 2 },
  { x: 717, y: 553, dir: 1 },
  { x: 883, y: 553, dir: 3 },
];

/** The campfire on the grass in the bottom right corner: the fire pit, two logs by it (behind and right) and the places around it (on the ground on its left) */
export const CAMPFIRE = { x: 1400, y: 712 };
export const FIRE_LOGS = [
  { x: 1467, y: 717, along: 'y' as const },
  { x: 1400, y: 661, along: 'x' as const },
];
export const FIRE_SEATS: Seat[] = [
  { x: 1346, y: 720, dir: 3, ground: true },
  { x: 1469, y: 726, dir: 1 },
  { x: 1382, y: 672, dir: 2 },
  { x: 1418, y: 672, dir: 2 },
];

/** The notice board at the foot of the town hall, left of its door and steps, and where its readers stand (facing it) */
export const NOTICE_BOARD = { x: 148, y: 304 };

/**
 * The town's own benches, where each stands (the middle of its bottom): in front of the potted tree
 * right of the barber, in place of the square's bench at `instead` (it would stand before the cafe's
 * porch; the square's other one is behind the town hall), and on the square at the top left of the
 * fountain
 */
export const TOWN_BENCHES = {
  list: [
    { x: 1450, y: 184 },
    { x: 676, y: 468 },
  ],
  instead: 1200,
};
export const BOARD_SPOTS = [
  { x: 130, y: 334 },
  { x: 168, y: 334 },
];

/**
 * Where an angler stands by the river, facing it (to the right), back on the grass: the rod is long,
 * its float lands in the middle of the water (see drawRod in web/src/modules/world/poses.ts)
 */
export const FISH_SPOTS: { x: number; y: number; side: 1 | -1 }[] = [
  { x: 1353, y: 870, side: 1 },
  { x: 1398, y: 800, side: 1 },
  { x: 1498, y: 660, side: 1 },
];

/**
 * The cafe's front on the paneled house, in sprite pixels of the house's art (160 x 160, see
 * web/src/modules/world/cafe.ts): the glass of its wide window, the top of the awning over it, the
 * middle of the porch's doorway and where one stands in it
 */
export const CAFE_ART = { glass: { x0: 10, x1: 90, y0: 87, y1: 124 }, awning: 69, door: 128, doorFoot: 142 };

/**
 * The cafe, in the paneled house between the clothes shop and the barber (world units): its big
 * window (where the dancers are seen on a party night), the porch door, where one stands before it,
 * the places inside the window, its two terrace tables with a chair on each side, and the spots on
 * the terrace where the party stands outside with a drink, in twos facing each other
 */
export const CAFE = (() => {
  const S = SPRITE_SCALE;
  const h = houseRow(SQUARE_HOUSES.seed, Math.ceil(WORLD.w / S)).find((r) => r.kind === 'paneled' && Math.abs((r.x + r.w / 2) * S - 1110) < 120)!;
  /** The house's art is 160 pixels high: its rows from the top of the screen down are 68 lower in the art */
  const top = 160 - SQUARE_HOUSES.bottom;
  const window = { x: (h.x + CAFE_ART.glass.x0) * S, y: (CAFE_ART.glass.y0 - top) * S, w: (CAFE_ART.glass.x1 - CAFE_ART.glass.x0) * S, h: (CAFE_ART.glass.y1 - CAFE_ART.glass.y0) * S };
  const doorX = (h.x + CAFE_ART.door) * S;
  const tables = [
    { x: 1036, y: 236 },
    { x: 1166, y: 236 },
  ];
  return {
    house: { x0: h.x * S, x1: (h.x + h.w) * S, art: h.x },
    window,
    door: { x: doorX, y: (CAFE_ART.doorFoot - top) * S },
    front: { x: doorX, y: TOWN_AREA.y0 + 4 },
    inside: [0.14, 0.38, 0.62, 0.86].map((k) => window.x + window.w * k),
    tables,
    seats: tables.flatMap((t): Seat[] => [
      { x: t.x - 40, y: t.y + 2, dir: 3 },
      { x: t.x + 40, y: t.y + 2, dir: 1 },
    ]),
    terrace: [
      { x: 1012, y: 284, dir: 3 as WDir },
      { x: 1052, y: 284, dir: 1 as WDir },
      { x: 1085, y: 322, dir: 3 as WDir },
      { x: 1125, y: 322, dir: 1 as WDir },
      { x: 1180, y: 284, dir: 3 as WDir },
      { x: 1220, y: 284, dir: 1 as WDir },
    ],
  };
})();
/**
 * The town hall in the top left corner of the square (drawn by the TV, web/src/modules/world/townHall.ts):
 * its left edge, top edge, width and height in sprite pixels, down past the sidewalk onto the square.
 * It stands over the first two houses of the row, as wide as both, so none of them shows. Its top
 * lies one tile of the square (32 sprite pixels) above the screen: the TV draws the whole building,
 * so a screen showing more above the town (another ratio) will show its roof whole.
 */
export const TOWN_HALL = (() => {
  const [, second] = houseRow(SQUARE_HOUSES.seed, Math.ceil(WORLD.w / SPRITE_SCALE));
  return { x: 0, y: -32, w: second.x + second.w, h: 254 };
})();

/**
 * The part of the square the town hall's front and steps stand on: three flat ellipses side by side
 * whose lower edges follow the bottom of the plinth and, in the middle, of the steps. The left one stops
 * short of the square's left edge, leaving a narrow way up it (going around the hall there would
 * otherwise lead out of the square); the right one reaches the building's right edge. Nobody walks
 * over them.
 */
function townHallFootprint(): { x: number; y: number; rx: number; ry: number }[] {
  const S = SPRITE_SCALE;
  const right = (TOWN_HALL.x + TOWN_HALL.w) * S;
  const mid = (TOWN_HALL.x + TOWN_HALL.w / 2) * S;
  const ry = 70;
  const bottom = TOWN_HALL.y + TOWN_HALL.h;
  const steps = bottom * S + 3;
  const y = steps - ry;
  // How wide an ellipse is at the bottom of the plinth (14 sprite pixels above the steps' bottom), for its width there
  const plinth = Math.sqrt(1 - (((bottom - 14) * S - y) / ry) ** 2);
  const side = (x: number, to: number) => ({ x, y, rx: Math.abs(to - x) / plinth, ry });
  return [side(TOWN_AREA.x0 + 100, TOWN_AREA.x0 + 30), { x: mid, y, rx: 140, ry }, side((mid + right) / 2 - 10, right)];
}

/**
 * Where nobody can stand: an ellipse on the ground around the fountain, the trees, the lamp posts,
 * the town hall's front, the notice board, the bench by the fountain, the cafe's tables, the campfire and its logs
 */
export const TOWN_OBSTACLES: { x: number; y: number; rx: number; ry: number }[] = [
  SPY_OBSTACLES[0],
  ...TOWN_SCENE.trees.map((t) => ({ x: t.x, y: t.y, rx: Math.round(20 * t.size), ry: 10 })),
  ...TOWN_SCENE.lamps.map((l) => ({ x: l.x, y: l.y, rx: 12, ry: 7 })),
  ...townHallFootprint(),
  { x: NOTICE_BOARD.x, y: NOTICE_BOARD.y, rx: 30, ry: 7 },
  // The bench by the fountain (the one on the sidewalk stands off the square)
  { x: TOWN_BENCHES.list[1].x, y: TOWN_BENCHES.list[1].y - 9, rx: 40, ry: 7 },
  ...CAFE.tables.map((t) => ({ x: t.x, y: t.y, rx: 22, ry: 8 })),
  { x: CAMPFIRE.x, y: CAMPFIRE.y, rx: 25, ry: 12 },
  ...FIRE_LOGS.map((l) => (l.along === 'y' ? { x: l.x, y: l.y, rx: 6, ry: 25 } : { x: l.x, y: l.y, rx: 30, ry: 4 })),
];
/**
 * The benches characters can sit on, where a sitter's feet land: 2 below each bench's bottom (see
 * Seat and TOWN_BENCHES)
 */
export const BENCHES: { x: number; y: number }[] = TOWN_BENCHES.list.map((b) => ({ x: b.x, y: b.y + 2 }));

// ------------------------------------------------------------ the shops

/** The places a character walks into when its guest changes their look on the phone */
export type PlaceId = 'clothes' | 'barber';

/**
 * A shop of the town: one of the square's houses, dressed up as a shop on the TV. All in world
 * units: `door` is where a character goes in, `front` where it stands before the door on the square,
 * `window` the shop window on the wall where the ones inside are seen, `seats` the x of each place
 * inside (as many as the shop takes at once; the others queue at the door).
 */
export interface TownPlace {
  id: PlaceId;
  name: string;
  house: { kind: HouseKind; x0: number; x1: number; bottom: number };
  door: { x: number; y: number };
  front: { x: number; y: number };
  window: { x: number; y: number; w: number; h: number };
  seats: number[];
}

/**
 * Where the door and the shop window are on the shop built on each kind of house (sprite pixels: x
 * from the left of the house's art, heights up from its bottom). The TV builds the shopfronts
 * (web/src/modules/world/shopfronts.ts) on these same numbers.
 */
export const SHOPFRONTS: Partial<Record<HouseKind, { door: number; doorUp: number; win: { x0: number; x1: number; top: number; bottom: number } }>> = {
  // The clothes shop: the door on the left at the top of the steps, a wide display window on the right
  brickA: { door: 42, doorUp: 25, win: { x0: 66, x1: 118, top: 71, bottom: 31 } },
  // The barber: the window on the left, the door in the house's own doorway
  brickB: { door: 89, doorUp: 4, win: { x0: 18, x1: 60, top: 60, bottom: 22 } },
};

/** A shop in the house of this kind nearest to `nearX` (world units) */
function place(id: PlaceId, name: string, kind: HouseKind, nearX: number, seats: number): TownPlace {
  const S = SPRITE_SCALE;
  const row = houseRow(SQUARE_HOUSES.seed, Math.ceil(WORLD.w / S)).filter((h) => h.kind === kind);
  const h = row.reduce((a, b) => (Math.abs((b.x + b.w / 2) * S - nearX) < Math.abs((a.x + a.w / 2) * S - nearX) ? b : a));
  const f = SHOPFRONTS[kind]!;
  const bottom = SQUARE_HOUSES.bottom * S;
  const window = { x: (h.x + f.win.x0) * S, y: bottom - f.win.top * S, w: (f.win.x1 - f.win.x0) * S, h: (f.win.top - f.win.bottom) * S };
  const doorX = (h.x + f.door) * S;
  return {
    id,
    name,
    house: { kind, x0: h.x * S, x1: (h.x + h.w) * S, bottom },
    door: { x: doorX, y: bottom - f.doorUp * S + 2 },
    front: { x: doorX, y: TOWN_AREA.y0 + 2 },
    window,
    seats: Array.from({ length: seats }, (_, i) => window.x + (window.w * (i + 0.5)) / seats),
  };
}

/** The clothes shop (the big house near the middle) and the barber (the small one on the right) */
export const TOWN_PLACES: Record<PlaceId, TownPlace> = {
  clothes: place('clothes', 'Clothes shop', 'brickA', 860, 2),
  barber: place('barber', 'Barber', 'brickB', 1330, 1),
};

// ------------------------------------------------------------ the throne room

/**
 * The throne room: a hall beyond a river off the right edge of the town, out of the TV's normal
 * view. For the King's ceremony the camera moves over to it: the King crosses the bridge and walks
 * up the red carpet to the throne at its far end and sits, and everyone else kneels on both sides
 * of the carpet, facing the throne. The hall stands on the grass, which shows above and below it.
 *
 * These are the hall's measures in sprite pixels, from its top left corner. The TV builds the hall
 * on them (web/src/modules/world/throneRoom.ts) and the town's life walks by them.
 */
export const HALL_ART = {
  /** Its width: a third of the town's */
  w: 396,
  /** The top of the back wall (its face, seen from inside), and its foot */
  top: 64,
  wall: 192,
  /** The front wall's outer edge along the bottom of the hall (its walk lies above it, its face below) */
  front: 580,
  /** The red carpet, from the hall's open side to the throne: its top and bottom edge */
  carpet: { y0: 366, y1: 442 },
  /**
   * The dais the throne stands on: three steps, the widest first, each `rise` higher than the one
   * before. `x` is a step's left edge (the stairs face the carpet), y0 and y1 its back and front;
   * all three run to the right wall.
   */
  dais: [
    { x: 246, y0: 300, y1: 508 },
    { x: 262, y0: 312, y1: 496 },
    { x: 278, y0: 324, y1: 484 },
  ],
  rise: 6,
  /** The left edge of the right wall */
  east: 380,
  /** The throne, seen from the side and facing left: the middle of its legs */
  throne: { x: 338, y: 414 },
};

/**
 * The riverside between the town and the hall, in sprite pixels from the town's right edge: grass,
 * a river winding down the whole screen and a stone bridge over it on the carpet's line. Nobody
 * wades through the water: whoever has to get across takes the bridge.
 */
export const RIVERSIDE_ART = {
  w: 190,
  /** The band the river winds down in, its banks included (clear of the town's last house, which sticks out over the grass) */
  river: { x0: 40, x1: 176 },
  /** The bridge's deck between its two parapets: its top and bottom edge */
  bridge: { y0: 368, y1: 440 },
};
/** Where the riverside lies in the world: from the town's right edge on (world units) */
export const RIVERSIDE = { x0: TOWN.w, w: RIVERSIDE_ART.w * SPRITE_SCALE };
/**
 * The river as walkers see it (world units): the band of x they only cross on the bridge, and the y
 * their feet keep to on it
 */
export const CROSSING = {
  x0: RIVERSIDE.x0 + RIVERSIDE_ART.river.x0 * SPRITE_SCALE,
  x1: RIVERSIDE.x0 + RIVERSIDE_ART.river.x1 * SPRITE_SCALE,
  y0: (RIVERSIDE_ART.bridge.y0 + 12) * SPRITE_SCALE,
  y1: (RIVERSIDE_ART.bridge.y1 - 4) * SPRITE_SCALE,
};

/** Where the hall lies in the world: beyond the riverside (world units) */
export const HALL = { x0: RIVERSIDE.x0 + RIVERSIDE.w, w: HALL_ART.w * SPRITE_SCALE };
/** How far the camera moves to the right for the ceremony: over the riverside, until the hall's right wall meets the screen's edge (world units) */
export const HALL_PAN = HALL.x0 + HALL.w - TOWN.w;

/** A point of the hall's art in world units */
const hallPoint = (px: number, py: number) => ({ x: HALL.x0 + px * SPRITE_SCALE, y: py * SPRITE_SCALE });

/** The middle line of the red carpet (world units): the King walks up it */
export const CARPET_Y = ((HALL_ART.carpet.y0 + HALL_ART.carpet.y1) / 2) * SPRITE_SCALE;
/** Where the carpet starts, at the hall's open side, and the foot of the dais stairs */
export const CARPET_START = HALL.x0 + 14;
export const DAIS_FOOT = hallPoint(HALL_ART.dais[0].x, 0).x;
/** Where the throne's legs stand, and where the King's feet land on it (the seat is high: the feet rest on its footstool) */
export const THRONE = hallPoint(HALL_ART.throne.x, HALL_ART.throne.y);
export const THRONE_SEAT = { x: THRONE.x - 1, y: THRONE.y - 13 * SPRITE_SCALE };
/** Where the King stands until the court opens: on the dais, before the throne and its footstool, facing the hall */
export const THRONE_STAND = { x: THRONE.x - 58, y: THRONE.y - 2 };

/** How many rows of people there can be on each side of the carpet, and how many places a row has inside the hall */
export const PRAY_ROWS = 3;
export const PRAY_HALL_COLS = 5;

/**
 * Where everyone kneels, facing the throne: `rows` rows on each side of the carpet (1 to PRAY_ROWS),
 * each a lane running from the foot of the dais back through the hall and, when the hall is full,
 * out onto the square. The places come in the order they are given out: the ones nearest the
 * throne first, so whoever arrives first goes furthest in and nobody has to walk past anyone.
 */
export function praySpots(rows: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const side = ((HALL_ART.carpet.y1 - HALL_ART.carpet.y0) / 2) * SPRITE_SCALE + 30;
  for (let col = 0; col < PRAY_HALL_COLS * 2; col++) {
    for (let row = 0; row < Math.max(1, Math.min(PRAY_ROWS, rows)); row++) {
      for (const s of [-1, 1]) {
        // A little off the lines along the lane, so the crowd does not kneel like a drill square
        const k = row * 20 + col * 2 + (s + 1) / 2;
        const x = Math.round(DAIS_FOOT - 42 - col * 60 - (row % 2) * 24 + ((k * 37) % 9) - 4);
        const y = Math.round(CARPET_Y + s * (side + row * 56));
        // Not where a lamp post or a tree of the square stands, nor in the river
        if (TOWN_OBSTACLES.some((o) => Math.abs(x - o.x) < o.rx + 26 && Math.abs(y - o.y) < o.ry + 22)) continue;
        if (x > CROSSING.x0 - 24 && x < CROSSING.x1 + 24) continue;
        out.push({ x, y });
      }
    }
  }
  return out;
}

/**
 * How high above the floor a character at (x, y) stands (world units): the steps of the dais, as a
 * ramp from the foot of the stairs to the top step. The TV draws the character that much higher.
 */
export function hallLift(x: number, y: number): number {
  const { dais, rise } = HALL_ART;
  const px = (x - HALL.x0) / SPRITE_SCALE;
  const py = y / SPRITE_SCALE;
  if (px < dais[0].x || py < dais[0].y0 || py > dais[0].y1) return 0;
  const top = dais[dais.length - 1].x + 8;
  return Math.min(1, (px - dais[0].x) / (top - dais[0].x)) * dais.length * rise * SPRITE_SCALE;
}

/**
 * What a character is doing, as sent in the frames (sleep lies down, pet crouches by the cat, inside
 * is seen through a shop window, pray kneels before the throne). In a chat: talk is the one speaking
 * (talking with the hands), listen the other one (nodding now and then), laugh both at once.
 * perch sits facing the way the character faces (the fountain's rim, a log by the fire, a cafe
 * chair; plain sit always faces the front, and sit facing left is the King on his throne). fish
 * waits with a rod, bite is a fish pulling at the line, catch holds the fish up. dance is seen
 * through the cafe's window (x the place in it, y the window's bottom), drink stands with a glass,
 * light holds a lamplighter's pole up to the lamp in front, kindle kneels by the campfire to light it.
 */
export const WANIM = {
  idle: 0,
  walk: 1,
  sit: 2,
  sleep: 3,
  pet: 4,
  cheer: 5,
  inside: 6,
  pray: 7,
  talk: 8,
  listen: 9,
  laugh: 10,
  perch: 11,
  fish: 12,
  bite: 13,
  catch: 14,
  dance: 15,
  drink: 16,
  light: 17,
  kindle: 18,
} as const;
export type WAnimId = (typeof WANIM)[keyof typeof WANIM];
/** Facing, in the order of the sprite sheets: up, left, down, right */
export type WDir = 0 | 1 | 2 | 3;

/** Numbers per character in a frame: x, y, anim, dir, alpha (0..100, fading out when leaving) */
export const FRAME_STRIDE = 5;

/**
 * One frame of the town for the TV. `ids` names the characters of `a` (FRAME_STRIDE numbers each).
 * The cat wanders too; `hearts` is set while someone pets it. `cam` is where the camera looks: 0 the
 * town, 1 moved over to the throne room (HALL_PAN to the right), anything between on its way.
 */
export interface TownFrame {
  t: number;
  ids: string[];
  a: number[];
  cat: { x: number; y: number; dir: WDir; walk: boolean; hearts: boolean };
  cam: number;
  /** How dark it is in the town: 0 in the day, 1 at night (see darknessAt) */
  dark?: number;
  /** The lamp posts that are lit, one bit each in the order of TOWN_SCENE.lamps */
  lamps?: number;
  /** A party is on at the cafe */
  party?: boolean;
  /** The campfire burns */
  fire?: boolean;
}

// ------------------------------------------------------------ the cafe's party night

/**
 * The cafe's party, on its own every `everyDays` town days from nightfall for `hours` town hours
 * (counted from the night the town's clock started on, so the same nights on every server start).
 * `on`: one is on at `minute` (town minutes, see townMinutes); `night` names it (each party's
 * own number); `startsIn`: town minutes until the next one starts.
 */
export function partyAt(minute: number, dusk: string, everyDays: number, hours: number): { on: boolean; night: number; startsIn: number } {
  const every = Math.max(1, Math.round(everyDays)) * 1440;
  const since = minute - minuteOf(dusk);
  const start = Math.floor(since / every) * every;
  const on = since - start < hours * 60;
  return { on, night: start / 1440, startsIn: on ? 0 : start + every - since };
}

// ------------------------------------------------------------ day and night

/**
 * How the town's own clock runs: a whole day every `dayMin` real minutes, the night (from dusk to
 * dawn, "HH:MM") going by `nightSpeed` times faster than the day, so the day lasts longer
 */
export interface TownClock {
  dayMin: number;
  dusk: string;
  dawn: string;
  nightSpeed: number;
}

/** The share of a day's real time spent in its daylight part, and the day's and the night's length (town minutes) */
function clockParts(c: TownClock): { share: number; day: number; night: number } {
  const day = minutesFrom(minuteOf(c.dawn), minuteOf(c.dusk));
  const night = 1440 - day;
  // No night (or no day): the clock runs evenly
  if (!day || !night) return { share: day ? 1 : 0, day: day || 1440, night };
  return { share: day / (day + night / Math.max(0.1, c.nightSpeed)), day, night };
}

/**
 * The town's own clock: minutes into its days, from real time (the same on every server start).
 * Each day begins at dawn; its daylight takes the larger share of the real time, its night the rest.
 */
export function townMinutes(now: number, c: TownClock): number {
  const { share, day, night } = clockParts(c);
  const cycles = now / (Math.max(1, c.dayMin) * 60_000);
  const k = Math.floor(cycles);
  const p = cycles - k;
  const base = k * 1440 + minuteOf(c.dawn);
  return p < share ? base + (p / share) * day : base + day + ((p - share) / (1 - share)) * night;
}

/** When (real time, ms) the town's clock shows `minute` (counted as townMinutes counts) */
export function realAt(minute: number, c: TownClock): number {
  const { share, day, night } = clockParts(c);
  const rel = minute - minuteOf(c.dawn);
  const k = Math.floor(rel / 1440);
  const r = rel - k * 1440;
  const p = r < day ? (r / day) * share : share + ((r - day) / night) * (1 - share);
  return (k + p) * Math.max(1, c.dayMin) * 60_000;
}

/** A minute of the day as "HH:MM" */
export function clockOf(minute: number): string {
  const m = Math.floor(((minute % 1440) + 1440) % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** The town's day: a short one that goes round in a few minutes, on its own clock (off: always day) */
export interface DayNight {
  on: boolean;
  /** When night falls and when the day comes back on the town's clock ("HH:MM", 24 hours) */
  dusk: string;
  dawn: string;
  /** The light changes over this long, half before and half after each of those times (minutes) */
  twilightMin: number;
}

/** Minutes since midnight of a time of day "HH:MM" (0 when it is not one) */
export function minuteOf(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  return m ? (Number(m[1]) * 60 + Number(m[2])) % 1440 : 0;
}

/** Minutes from `a` forward to `b` on the clock face (0..1439) */
export const minutesFrom = (a: number, b: number) => (((b - a) % 1440) + 1440) % 1440;

/**
 * How dark it is at a minute of the day (0 in the day, 1 at night): half dark right at dusk and at
 * dawn, fading over the twilight around each. A twilight longer than the day or the night is cut
 * down to fit.
 */
export function darknessAt(d: DayNight, minute: number): number {
  if (!d.on) return 0;
  const dusk = minuteOf(d.dusk);
  const dawn = minuteOf(d.dawn);
  const night = minutesFrom(dusk, dawn);
  if (night === 0) return 0;
  const twilight = Math.max(1, Math.min(d.twilightMin, night, 1440 - night));
  const sinceDusk = minutesFrom(dusk, minute);
  // Inside the night: how far from its nearest end; outside: how far from it (negative)
  const edge = sinceDusk < night ? Math.min(sinceDusk, night - sinceDusk) : -Math.min(minutesFrom(minute, dusk), sinceDusk - night);
  return Math.max(0, Math.min(1, 0.5 + edge / twilight));
}

// ------------------------------------------------------------ the avatar

/** What a guest picks. Every value must come from the catalog below. */
export interface AvatarChoices {
  body: 'male' | 'female';
  skin: string;
  hair: string;
  hairColor: string;
  beard: string;
  eyes: string;
}

export const DEFAULT_CHOICES: AvatarChoices = {
  body: 'male',
  skin: 'light',
  hair: 'plain',
  hairColor: 'dark_brown',
  beard: 'none',
  eyes: 'brown',
};

/** Human skin tones of the LPC body palette */
export const SKINS = ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black'] as const;

export const EYE_COLORS = ['brown', 'blue', 'green', 'gray', 'purple', 'red', 'orange', 'yellow'] as const;

export const HAIR_COLORS = [
  'black', 'raven', 'dark_brown', 'chestnut', 'light_brown', 'blonde', 'platinum', 'sandy',
  'ginger', 'redhead', 'strawberry', 'gray', 'white', 'pink', 'purple', 'blue', 'green', 'red',
] as const;

/** Hair styles (def: the generator's sheet definition under sheet_definitions/) */
export const HAIR_STYLES: { id: string; name: string; def: string | null }[] = [
  { id: 'none', name: 'Bald', def: null },
  { id: 'plain', name: 'Plain', def: 'hair/short/hair_plain' },
  { id: 'parted', name: 'Parted', def: 'hair/short/hair_parted3' },
  { id: 'swoop', name: 'Swoop', def: 'hair/short/hair_swoop' },
  { id: 'messy', name: 'Messy', def: 'hair/short/hair_messy1' },
  { id: 'bedhead', name: 'Bedhead', def: 'hair/short/hair_bedhead' },
  { id: 'pixie', name: 'Pixie', def: 'hair/short/hair_pixie' },
  { id: 'buzzcut', name: 'Buzzcut', def: 'hair/bald/hair_buzzcut' },
  { id: 'balding', name: 'Balding', def: 'hair/bald/hair_balding' },
  { id: 'mohawk', name: 'Mohawk', def: 'hair/bald/hair_shorthawk' },
  { id: 'spiked', name: 'Spiked', def: 'hair/spiky/hair_spiked' },
  { id: 'bob', name: 'Bob', def: 'hair/bob/hair_bob' },
  { id: 'lob', name: 'Long bob', def: 'hair/bob/hair_lob' },
  { id: 'curly', name: 'Curly', def: 'hair/curly/hair_curly_short' },
  { id: 'curls', name: 'Big curls', def: 'hair/curly/hair_curls_large' },
  { id: 'afro', name: 'Afro', def: 'hair/afro/hair_afro' },
  { id: 'cornrows', name: 'Cornrows', def: 'hair/afro/hair_cornrows' },
  { id: 'dreads', name: 'Dreadlocks', def: 'hair/afro/hair_dreadlocks_short' },
  { id: 'ponytail', name: 'Ponytail', def: 'hair/braids/hair_ponytail' },
  { id: 'highpony', name: 'High ponytail', def: 'hair/braids/hair_high_ponytail' },
  { id: 'halfup', name: 'Half up', def: 'hair/braids/hair_half_up' },
  { id: 'pigtails', name: 'Pigtails', def: 'hair/pigtails/hair_pigtails' },
  { id: 'straight', name: 'Long straight', def: 'hair/long/hair_long_straight' },
  { id: 'wavy', name: 'Long wavy', def: 'hair/long/hair_wavy' },
  { id: 'longmessy', name: 'Long messy', def: 'hair/long/hair_long_messy' },
  { id: 'princess', name: 'Princess', def: 'hair/xlong/hair_princess' },
  { id: 'topknot', name: 'Topknot', def: 'hair/braids/hair_topknot_short' },
  { id: 'long_topknot', name: 'Long topknot', def: 'hair/braids/hair_topknot_long' },
  { id: 'bun', name: 'Bun', def: 'hair/braids/hair_bangs_bun' },
  { id: 'side_braid', name: 'Side braid', def: 'hair/braids/hair_braid' },
  { id: 'braid', name: 'Long braid', def: 'hair/braids/hair_braid2' },
  { id: 'over_shoulder', name: 'Over the shoulder', def: 'hair/braids/hair_shoulderl' },
  { id: 'bunches', name: 'Bunches', def: 'hair/pigtails/hair_bunches' },
  { id: 'flat_top', name: 'Flat top', def: 'hair/afro/hair_flat_top_fade' },
  { id: 'natural', name: 'Natural', def: 'hair/afro/hair_natural' },
  { id: 'twists', name: 'Twists', def: 'hair/afro/hair_twists_fade' },
  { id: 'long_dreads', name: 'Long dreadlocks', def: 'hair/afro/hair_dreadlocks_long' },
  { id: 'tight_curls', name: 'Tight curls', def: 'hair/curly/hair_jewfro' },
  { id: 'long_curly', name: 'Long curly', def: 'hair/curly/hair_curly_long' },
  { id: 'cowlick', name: 'Cowlick', def: 'hair/short/hair_cowlick' },
  { id: 'quiff', name: 'Quiff', def: 'hair/short/hair_cowlick_tall' },
  { id: 'curtains', name: 'Curtains', def: 'hair/short/hair_curtains' },
  { id: 'idol', name: 'Idol', def: 'hair/short/hair_idol' },
  { id: 'spiky_messy', name: 'Spiky messy', def: 'hair/short/hair_messy2' },
  { id: 'half_messy', name: 'Half messy', def: 'hair/spiky/hair_halfmessy' },
  { id: 'mop', name: 'Mop', def: 'hair/short/hair_mop' },
  { id: 'unkempt', name: 'Unkempt', def: 'hair/short/hair_unkempt' },
  { id: 'long_bangs', name: 'Long bangs', def: 'hair/long/hair_bangslong2' },
  { id: 'long_curtains', name: 'Long curtains', def: 'hair/long/hair_curtains_long' },
  { id: 'center_part', name: 'Center part', def: 'hair/long/hair_long_center_part' },
  { id: 'very_long', name: 'Very long', def: 'hair/xlong/hair_sara' },
  { id: 'xlong', name: 'Extra long', def: 'hair/xlong/hair_xlong' },
  { id: 'xlong_wavy', name: 'Extra long wavy', def: 'hair/xlong/hair_xlong_wavy' },
];

export const BEARDS: { id: string; name: string; def: string | null }[] = [
  { id: 'none', name: 'None', def: null },
  { id: 'shadow', name: 'Stubble', def: 'hair/beards/beards_5oclock_shadow' },
  { id: 'trimmed', name: 'Trimmed', def: 'hair/beards/beards_trimmed' },
  { id: 'medium', name: 'Beard', def: 'hair/beards/beards_medium' },
  { id: 'full', name: 'Full beard', def: 'hair/beards/beards_beard' },
  { id: 'mustache', name: 'Mustache', def: 'hair/mustaches/beards_mustache' },
  { id: 'chevron', name: 'Chevron', def: 'hair/mustaches/beards_chevron' },
  { id: 'handlebar', name: 'Handlebar', def: 'hair/mustaches/beards_handlebar' },
  { id: 'winter', name: 'Winter beard', def: 'hair/beards/beards_winter' },
  { id: 'bigstache', name: 'Big mustache', def: 'hair/mustaches/beards_bigstache' },
  { id: 'french', name: 'French', def: 'hair/mustaches/beards_french' },
  { id: 'horseshoe', name: 'Horseshoe', def: 'hair/mustaches/beards_horseshoe' },
  { id: 'lampshade', name: 'Lampshade', def: 'hair/mustaches/beards_lampshade' },
  { id: 'walrus', name: 'Walrus', def: 'hair/mustaches/beards_walrus' },
];

/**
 * A random look to start the editor with, so the town is not full of the same face. Every part
 * is drawn from its list; only male bodies get facial hair, and half of them stay clean shaven.
 */
export function randomChoices(): AvatarChoices {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
  const body = pick(['male', 'female'] as const);
  return {
    body,
    skin: pick(SKINS),
    hair: pick(HAIR_STYLES).id,
    hairColor: pick(HAIR_COLORS),
    beard: body === 'male' && Math.random() < 0.5 ? pick(BEARDS.slice(1)).id : 'none',
    eyes: pick(EYE_COLORS),
  };
}

/** The picks that exist; anything else is refused by the server */
export function validChoices(c: unknown): AvatarChoices | null {
  const o = c as Partial<AvatarChoices> | null;
  if (!o || typeof o !== 'object') return null;
  if (o.body !== 'male' && o.body !== 'female') return null;
  if (!SKINS.includes(o.skin as (typeof SKINS)[number])) return null;
  if (!HAIR_STYLES.some((h) => h.id === o.hair)) return null;
  if (!HAIR_COLORS.includes(o.hairColor as (typeof HAIR_COLORS)[number])) return null;
  if (!BEARDS.some((b) => b.id === o.beard)) return null;
  if (!EYE_COLORS.includes(o.eyes as (typeof EYE_COLORS)[number])) return null;
  return { body: o.body, skin: o.skin!, hair: o.hair!, hairColor: o.hairColor!, beard: o.beard!, eyes: o.eyes! };
}

// ------------------------------------------------------------ states

/** Rows and frame counts of a composited sheet, measured once (same for every avatar) */
export interface SheetInfo {
  frame: number;
  rows: Record<string, { row: number; frames: number }>;
  feet: number;
  body: { top: number; left: number; right: number };
}

/** One character on the TV */
export interface TownCharacter {
  id: string;
  name: string;
  color: string;
  /** The composited sprite sheet */
  url: string;
  /** Its measurements (rows, where the head and feet are): every look has its own */
  sheet?: SheetInfo;
}

/** The parts of a look that cost money to change once the avatar exists (body and skin never change) */
export const LOOK_PARTS = ['hair', 'hairColor', 'beard', 'eyes'] as const;
export type LookPart = (typeof LOOK_PARTS)[number];
export const LOOK_PART_NAMES: Record<LookPart, string> = { hair: 'Hair style', hairColor: 'Hair color', beard: 'Facial hair', eyes: 'Eyes' };

/** What changing from one look to another costs: the price of each part that differs */
export function lookCost(before: AvatarChoices, after: AvatarChoices, prices: Record<LookPart, number>): number {
  return LOOK_PARTS.reduce((sum, part) => sum + (before[part] !== after[part] ? prices[part] : 0), 0);
}

/** The town's shop as everyone sees it: its own money, prices by tier and for look changes */
export interface ShopInfo {
  currencyName: string;
  prices: Record<Tier, number>;
  look: Record<LookPart, number>;
  /** Pieces to own (with one in every open slot) before the locked slots open */
  unlockPieces: number;
  /** Pieces to own (with one in every slot, the locked ones too) before the secret slot shows */
  secretPieces: number;
}

/** What a guest owns and wears, fetched per guest (the shared state cannot carry it) */
export interface WardrobeMine {
  balance: number;
  owned: WornItem[];
  outfit: Outfit;
  /** The saved outfits, one per slot (null: empty), without pieces that cannot be worn anymore */
  saved: (Outfit | null)[];
}

/**
 * The King of the town: one guest at a time holds the title, and anyone can buy it from them. The
 * price rises each time it changes hands.
 */
export interface KingInfo {
  /** The title can be bought (admin setting) */
  on: boolean;
  /** Who holds it (null: nobody yet) */
  id: string | null;
  /** When they took it */
  since: number;
  /** What taking the title cost when this was sent; `pricing` says how it moves (see kingPriceAt) */
  price: number;
  pricing: KingPricing;
  /** The ceremony in the throne room, when it is held on its own: every so many days, at this time (HH:MM). Null: only when the host starts it */
  ceremony: { everyDays: number; time: string } | null;
  /** The monarchy: every reign so far, the oldest first (the last one is still going while its `to` is null) */
  reigns: Reign[];
}

/**
 * How the title's price moves: when the title changes hands it goes up to `start` (what was just
 * paid, times a factor) at `at`, then drops by `dropPerMin` every minute, never below `floor` (the
 * starting price)
 */
export interface KingPricing {
  start: number;
  at: number;
  dropPerMin: number;
  floor: number;
}

/** What taking the title costs at a given time (server time) */
export function kingPriceAt(p: KingPricing, now: number): number {
  return Math.max(p.floor, Math.round(p.start - p.dropPerMin * Math.max(0, Math.floor((now - p.at) / 60_000))));
}

/** One reign: who held the title (as they were called then), from when to when, and what they paid for it */
export interface Reign {
  id: string;
  name: string;
  color: string;
  from: number;
  /** Null: still reigning */
  to: number | null;
  paid: number;
}

/** Why a ceremony that is due has not started yet: the King is not in the town, a game is on the TV, or no TV is open */
export type CeremonyHold = 'king' | 'game' | 'tv';

/** How much faster the town's time can run (the TV's button goes round them) */
export const TOWN_SPEEDS = [1, 2, 4] as const;

/**
 * The town's own time (ms) at a real time `now`: real time plus how far it ran ahead, `ahead` at
 * the real time `at`, running `speed` times faster since (see WorldState.warp)
 */
export function townTime(now: number, warp: { speed: number; ahead: number; at: number } | undefined): number {
  return warp ? now + warp.ahead + (warp.speed - 1) * (now - warp.at) : now;
}

export interface WorldState {
  characters: TownCharacter[];
  /** The town's own time: how many times faster than real time it runs, and how far ahead it was at real time `at` (see townTime) */
  warp?: { speed: number; ahead: number; at: number };
  sheet: SheetInfo | null;
  shop?: ShopInfo;
  king?: KingInfo;
  /** The town's own day: on or off (always day), and how many real minutes a whole day takes (the TV's town hall clock follows it) */
  day?: { on: boolean } & TownClock;
  /** Guest: the own choices (to edit again), set once the avatar exists */
  mine?: AvatarChoices | null;
  /** Admin only */
  sleepAfterMin?: number;
  fadeAfterMin?: number;
  earnPerMin?: number;
  startMoney?: number;
  shopVisits?: boolean;
  visitMinSec?: number;
  visitMaxSec?: number;
  finishWithinSec?: number;
  wrapMinSec?: number;
  wrapMaxSec?: number;
  quickMinSec?: number;
  quickMaxSec?: number;
  chat?: boolean;
  chatChancePct?: number;
  chatMinSec?: number;
  chatMaxSec?: number;
  kingBase?: number;
  kingRise?: number;
  kingDropPerMin?: number;
  kingRefundPct?: number;
  ceremonyAuto?: boolean;
  ceremonyEveryDays?: number;
  ceremonyTime?: string;
  ceremonySec?: number;
  ceremonyGraceSec?: number;
  dayCycle?: boolean;
  dayMin?: number;
  nightSpeed?: number;
  dusk?: string;
  dawn?: string;
  twilightMin?: number;
  nightSleep?: boolean;
  bedtimeSpreadMin?: number;
  nightOwlPct?: number;
  /** Things to do in the town, each on or off: the cafe's terrace, the fountain's rim, the notice board, fishing, the campfire, the lamplighter */
  cafe?: boolean;
  fountainSit?: boolean;
  noticeBoard?: boolean;
  fishing?: boolean;
  /** What a caught fish brings its angler (the town's money) */
  fishReward?: number;
  campfire?: boolean;
  lamplighter?: boolean;
  /** The cafe's party night: on its own every so many town days, from nightfall for so many town hours, and the share of the town that stays up for it (percent) */
  party?: boolean;
  partyEveryDays?: number;
  partyHours?: number;
  partyGoersPct?: number;
  /** A party is on now; else when the next one starts on its own (server time, null: none to come) */
  partyOn?: boolean;
  partyNext?: number | null;
  /** How dark the town is right now (0 day, 1 night), and how many characters sleep for the night */
  darkNow?: number;
  nightSleepers?: number;
  /** The ceremony that is on right now: everyone gathering, the King holding court, everyone leaving (null: none) */
  ceremonyPhase?: 'gather' | 'court' | 'leave' | null;
  /** When the next one is due on its own (server time; in the past: due now), and what holds it back then */
  ceremonyNext?: number | null;
  ceremonyHold?: CeremonyHold | null;
  /** Times the title changed hands (the price counts them) */
  kingSales?: number;
  wallets?: { id: string; name: string; color: string; balance: number }[];
}
