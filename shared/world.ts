// Avatar world: a living pixel town on the TV. Every guest designs an LPC-style character that
// wanders the town. The server simulates the town and sends frames to the TV; the phones hold the
// avatar editor. The sprites are composited on the server from the Universal LPC generator's art
// (see server/modules/world/compose.ts).

import { SPY_OBSTACLES, SPY_SCENE, WORLD } from './crowd.ts';
import type { Outfit, Tier, WornItem } from './wardrobe.ts';

/**
 * The town is the crowd games' square for now (same size, same scene, same environment art), so
 * the world and the games look like one place. Once guests can buy houses the town gets its own map.
 */
export const TOWN = WORLD;
export const TOWN_SCENE = SPY_SCENE;
export const TOWN_OBSTACLES = SPY_OBSTACLES;
/** Where characters walk: the square below the sidewalk */
export const TOWN_AREA = { x0: 70, x1: 1530, y0: 190, y1: 875 };
/** Benches characters can sit on: where the square's benches stand, and where a sitter's feet land */
export const BENCHES: { x: number; y: number }[] = [
  { x: 400, y: 178 },
  { x: 1200, y: 178 },
];

/** What a character is doing, as sent in the frames (sleep lies down, pet crouches by the cat) */
export const WANIM = { idle: 0, walk: 1, sit: 2, sleep: 3, pet: 4, cheer: 5 } as const;
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
}

export interface WorldState {
  characters: TownCharacter[];
  sheet: SheetInfo | null;
  shop?: ShopInfo;
  /** Guest: the own choices (to edit again), set once the avatar exists */
  mine?: AvatarChoices | null;
  /** Admin only */
  sleepAfterMin?: number;
  fadeAfterMin?: number;
  earnPerMin?: number;
  startMoney?: number;
  wallets?: { id: string; name: string; color: string; balance: number }[];
}
