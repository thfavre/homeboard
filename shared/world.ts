// Avatar world: a living pixel town on the TV. Every guest designs an LPC-style character that
// wanders the town. The server simulates the town and sends frames to the TV; the phones hold the
// avatar editor. The sprites are composited on the server from the Universal LPC generator's art
// (see server/modules/world/compose.ts).

import { SPRITE_SCALE, SPY_OBSTACLES, SPY_SCENE, SQUARE_HOUSES, WORLD, houseRow, type HouseKind } from './crowd.ts';
import type { Outfit, Tier, WornItem } from './wardrobe.ts';

/**
 * The town is the crowd games' square for now (same size, same scene, same environment art), so
 * the world and the games look like one place. Once guests can buy houses the town gets its own map.
 */
export const TOWN = WORLD;
export const TOWN_SCENE = SPY_SCENE;
export const TOWN_OBSTACLES = SPY_OBSTACLES;
/** Benches characters can sit on: where the square's benches stand, and where a sitter's feet land */
export const BENCHES: { x: number; y: number }[] = [
  { x: 400, y: 178 },
  { x: 1200, y: 178 },
];

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

/** Where characters walk: the square below the sidewalk */
export const TOWN_AREA = { x0: 70, x1: 1530, y0: 190, y1: 875 };

/** The clothes shop (the big house near the middle) and the barber (the small one on the right) */
export const TOWN_PLACES: Record<PlaceId, TownPlace> = {
  clothes: place('clothes', 'Clothes shop', 'brickA', 860, 2),
  barber: place('barber', 'Barber', 'brickB', 1330, 1),
};

// ------------------------------------------------------------ the throne

/** The King's throne on the square, below the fountain: where its legs stand (world units) */
export const THRONE = { x: 800, y: 728 };
/** Where the King's feet land on the throne */
export const THRONE_SEAT = { x: THRONE.x, y: THRONE.y + 8 };
/** The throne is in the way like the fountain: an ellipse around its legs, the seat just in front of it */
export const THRONE_OBSTACLE = { x: THRONE.x, y: THRONE.y - 6, rx: 28, ry: 11 };
/** Where the faithful kneel before the throne, facing it: two rows on the carpet, an aisle in the middle */
export const PRAY_SPOTS: { x: number; y: number }[] = [
  ...[-92, -42, 42, 92].map((dx) => ({ x: THRONE.x + dx, y: THRONE.y + 62 })),
  ...[-92, -42, 42, 92].map((dx) => ({ x: THRONE.x + dx, y: THRONE.y + 108 })),
];
/** The royal carpet under the throne and the faithful, between the two lamp posts (world units, a whole number of carpet tiles) */
export const THRONE_CARPET = { x: THRONE.x, y0: THRONE.y - 40, tilesW: 6, tilesH: 4 };

/** What a character is doing, as sent in the frames (sleep lies down, pet crouches by the cat, inside is seen through a shop window, pray kneels before the throne) */
export const WANIM = { idle: 0, walk: 1, sit: 2, sleep: 3, pet: 4, cheer: 5, inside: 6, pray: 7 } as const;
export type WAnimId = (typeof WANIM)[keyof typeof WANIM];
/** Facing, in the order of the sprite sheets: up, left, down, right */
export type WDir = 0 | 1 | 2 | 3;

/** Numbers per character in a frame: x, y, anim, dir, alpha (0..100, fading out when leaving) */
export const FRAME_STRIDE = 5;

/**
 * One frame of the town for the TV. `ids` names the characters of `a` (FRAME_STRIDE numbers each).
 * The cat wanders too; `hearts` is set while someone pets it.
 */
export interface TownFrame {
  t: number;
  ids: string[];
  a: number[];
  cat: { x: number; y: number; dir: WDir; walk: boolean; hearts: boolean };
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
];

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
  /** What taking the title costs now */
  price: number;
}

export interface WorldState {
  characters: TownCharacter[];
  sheet: SheetInfo | null;
  shop?: ShopInfo;
  king?: KingInfo;
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
  kingBase?: number;
  kingStep?: number;
  kingRefundPct?: number;
  throneEveryMin?: number;
  throneMinSec?: number;
  throneMaxSec?: number;
  prayMinSec?: number;
  prayMaxSec?: number;
  /** Times the title changed hands (the price counts them) */
  kingSales?: number;
  wallets?: { id: string; name: string; color: string; balance: number }[];
}
