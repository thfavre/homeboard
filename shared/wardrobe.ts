// The wardrobe: everything the town's shop sells. Each item names an LPC sheet definition
// (assets/lpc/sheet_definitions/) and the colors it comes in; the server composites worn items
// into the avatar's sheet (server/modules/world/compose.ts). The catalog is curated by hand:
// only definitions whose art covers the town's animations on both bodies are in (checked with a
// probe script; items missing the sit or cheer art carry noSit/noCheer so the sim avoids those).
//
// A color id is one color ("navy") or two ("navy+gold"). The first colors the item; the second
// colors its extra layers (a feather, a trim) or, for art drawn in two materials (leather armor,
// a barbarian helmet), the second material.

/**
 * Where an item is worn; one item per slot. A dress replaces top and bottom, a costume head the
 * hat. Locked slots open once the guest owns a piece in every other slot their body can wear and
 * enough pieces in all; the secret slot shows nowhere until the guest owns a piece in every slot,
 * the locked ones too, and more pieces still (`openSlots`).
 */
export const SLOTS = [
  { id: 'top', name: 'Tops' },
  { id: 'bottom', name: 'Bottoms' },
  { id: 'feet', name: 'Feet' },
  { id: 'hat', name: 'Hats' },
  { id: 'face', name: 'Face' },
  { id: 'neck', name: 'Neck' },
  { id: 'dress', name: 'Dresses' },
  { id: 'back', name: 'Back' },
  { id: 'arms', name: 'Arms', locked: true },
  { id: 'shoulders', name: 'Shoulders', locked: true },
  { id: 'costume', name: 'Costumes', secret: true },
] as const;
export type Slot = (typeof SLOTS)[number]['id'];

/** The slots this body can wear (dresses are only drawn for the female body) */
export const slotsFor = (body: 'male' | 'female' | null) => SLOTS.filter((s) => s.id !== 'dress' || body === 'female');

/** How far a guest is from the locked slots: the open slots still without a piece, and the pieces owned */
export function unlockProgress(owned: readonly WornItem[], body: 'male' | 'female', minPieces: number): { unlocked: boolean; missing: Slot[]; pieces: number } {
  const have = new Set(owned.map((o) => itemById(o.id)?.slot));
  const missing = slotsFor(body)
    .filter((s) => !('locked' in s) && !('secret' in s) && !have.has(s.id))
    .map((s) => s.id);
  return { unlocked: !missing.length && owned.length >= minPieces, missing, pieces: owned.length };
}

export const isLockedSlot = (slot: Slot): boolean => SLOTS.some((s) => s.id === slot && 'locked' in s);
export const isSecretSlot = (slot: Slot): boolean => SLOTS.some((s) => s.id === slot && 'secret' in s);

/** The slots a guest can shop in: the plain ones, the locked ones once open, the secret one once found */
export function openSlots(owned: readonly WornItem[], body: 'male' | 'female', unlockPieces: number, secretPieces: number): Slot[] {
  const unlocked = unlockProgress(owned, body, unlockPieces).unlocked;
  const have = new Set(owned.map((o) => itemById(o.id)?.slot));
  const found = slotsFor(body).every((s) => 'secret' in s || have.has(s.id)) && owned.length >= secretPieces;
  return slotsFor(body)
    .filter((s) => ('secret' in s ? found : 'locked' in s ? unlocked : true))
    .map((s) => s.id);
}

export const TIERS = ['cheap', 'common', 'fancy', 'epic', 'legendary'] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_NAMES: Record<Tier, string> = { cheap: 'Cheap', common: 'Common', fancy: 'Fancy', epic: 'Epic', legendary: 'Legendary' };

export interface WardrobeItem {
  id: string;
  name: string;
  slot: Slot;
  /** Sheet definition under assets/lpc/sheet_definitions/, without .json */
  def: string;
  tier: Tier;
  /** Color ids the shop offers: palette colors or sheet variants, checked by the probe. The first
   *  is the item's own color (the one its art is drawn in, or reads as): the shop's picture and
   *  where a piece opens */
  colors: readonly string[];
  /** More art drawn with the item, in the second color of a two-color id */
  extras?: readonly ItemExtra[];
  /** Only these bodies have the art (dresses); everyone otherwise */
  bodies?: readonly ('male' | 'female')[];
  /** The art has no sit sheet: the sim keeps the wearer off benches and away from the cat */
  noSit?: true;
  /** The art has no emote or jump sheet: the wearer does not cheer */
  noCheer?: true;
  /** A costume head, drawn instead of the guest's head. It takes their hair and beard off unless
   *  `keepHair`; with `skin` its colors are skin tones and the whole body takes the one worn */
  head?: { keepHair?: true; skin?: true };
}

/** An extra layer of an item: a skull on a hat, a trim on a cape */
export interface ItemExtra {
  /** Sheet definition, like the item's */
  def: string;
  /** Its color when the item is worn in one color; without one it is only drawn in two-color ids
   *  (a plain kimono, or one with a trim). A function picks it from the item's color (a chain in
   *  the pendant's metal) */
  color?: string | ((itemColor: string) => string);
}

/** The LPC cloth palette (every recolorable garment comes in all of these) */
export const CLOTH = [
  'white', 'black', 'charcoal', 'gray', 'slate', 'sky', 'blue', 'navy', 'teal', 'bluegray',
  'forest', 'green', 'yellow', 'tan', 'orange', 'red', 'maroon', 'rose', 'pink', 'lavender',
  'purple', 'brown', 'leather', 'walnut',
] as const;

const METAL = ['gold', 'silver', 'bronze', 'brass', 'copper', 'steel', 'iron', 'ceramic'] as const;
/** Fur variants of the tails */
const FUR = ['fur_brown', 'fur_black', 'fur_grey', 'fur_white', 'fur_tan', 'fur_copper', 'fur_gold', 'pink'] as const;
/** Feather/membrane variants of the wings */
const WING = ['white', 'black', 'gray', 'blonde', 'red', 'blue', 'green', 'purple', 'pink', 'gold'] as const;
/** Frame colors of the glasses */
const FRAME = ['black', 'brown', 'gray', 'red', 'blue', 'pink', 'gold', 'silver'] as const;
/** Scale colors of the lizard tail and dragon wings */
const SCALE = ['green', 'blue', 'navy', 'red', 'orange', 'gold', 'purple', 'black', 'white'] as const;
/** Metal and gem pairs of the amulets (the swatch is the gem) */
const AMULET = ['gold_red', 'silver_blue', 'bronze_green', 'copper_orange', 'steel_purple', 'brass_yellow'] as const;
/** Gem colors of the gem pendants */
const GEM = ['blue', 'green', 'orange', 'purple', 'red', 'yellow'] as const;

/** The chain a charm, gem or amulet hangs from: the art hangs them below a necklace, and alone they
 *  float on the belly. In the piece's metal ("gold_red" hangs on gold); gems hang on gold */
const CHAIN: ItemExtra[] = [{ def: 'headwear/neck/neck_necklace_simple', color: (c) => ((METAL as readonly string[]).includes(c.split('_')[0]) ? c.split('_')[0] : 'gold') }];

/** Skin tones of the costume heads */
const MONSTER = ['green', 'bright_green', 'pale_green', 'zombie_green', 'dark_green'] as const;
const FUR_SKIN = ['fur_brown', 'fur_black', 'fur_grey', 'fur_white', 'fur_tan', 'fur_copper', 'fur_gold'] as const;

/** An extra piece in the item's own color (a visor or crest in the helmet's metal) */
const SAME = (c: string): string => c;

/** A color list with the item's own color moved first (a red Santa hat, a steel necklace) */
const startingWith = (color: string, list: readonly string[]): string[] => [color, ...list.filter((c) => c !== color)];

/** Swatch of every color id (display only; the art has its own ramps): a hex color, or for a
 *  two-color id a CSS gradient of both halves (filled in below the catalog), so use it as a
 *  background */
export const COLOR_HEX: Record<string, string> = {
  // cloth (a readable mid tone of each ramp)
  white: '#e5e6c7', black: '#22282a', charcoal: '#2a3034', gray: '#585561', slate: '#818b8b',
  sky: '#9fbbcb', blue: '#3c49ad', navy: '#322d6a', teal: '#156c99', bluegray: '#315b49',
  forest: '#134507', green: '#2f8136', yellow: '#d99431', tan: '#b78c41', orange: '#d75b1a',
  red: '#82171c', maroon: '#682121', rose: '#77372b', pink: '#ae424a', lavender: '#7141b2',
  purple: '#411357', brown: '#62351c', leather: '#704325', walnut: '#744b30',
  // metal
  gold: '#d9a732', silver: '#aeb4be', bronze: '#8c6a1e', brass: '#b08f36', copper: '#b46434',
  steel: '#726b7e', iron: '#4a4558', ceramic: '#d8cdb8',
  // fur and feathers
  fur_brown: '#6d4529', fur_black: '#2c2b38', fur_grey: '#9b9b9f', fur_white: '#f1f1ee',
  fur_tan: '#c7a05e', fur_copper: '#b65c20', fur_gold: '#d8ab51', blonde: '#d8ab51',
  // special variants
  base: '#3d3838', base_brown: '#62351c', sunglasses: '#16181c',
  crown_gold: '#d9a732', crown_red: '#ab1e1e', crown_blue: '#3c49ad', crown_gray: '#818b8b',
  tiara_gold: '#d9a732', tiara_silver: '#aeb4be', tiara_bronze: '#8c6a1e', tiara_purple: '#7141b2',
  base_black: '#22282a', base_gray: '#585561', base_red: '#82171c', base_teal: '#156c99', base_yellow: '#d99431',
  dark: '#2b2a33',
  // skin tones of the costume heads
  monarch: '#e08a1e', pixie: '#7fd4f0', lunar: '#9be0a0',
  bright_green: '#3f9a2f', dark_green: '#155a1c', pale_green: '#6e8a5c', zombie: '#b3a47e', zombie_green: '#5f9a85',
  light: '#e8b08f', amber: '#d9935c', jack: '#e0761f', skin: '#d9a07a',
  pirate: '#a08a4a', gold_red: '#c2242c', silver_blue: '#3c6cd0', bronze_green: '#2f9a3e', copper_orange: '#e0761f',
  steel_purple: '#8a3fc0', brass_yellow: '#e8c22a',
};

/** Display name of a color id ("base_brown" => "Base brown", "navy+gold" => "Navy and gold") */
export function colorName(id: string): string {
  return id
    .split('+')
    .map((part) => part.replace(/[_]/g, ' '))
    .join(' and ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** The two halves of a color id (the second is undefined for a one-color id) */
export const splitColor = (id: string): [string, string | undefined] => {
  const [main, accent] = id.split('+');
  return [main, accent];
};

/**
 * The layers a piece is drawn with: the item in the whole color id (art drawn in two materials
 * takes both halves), then each extra in the second color, or its own color for a one-color id.
 */
export function piecesOf(item: WardrobeItem, color: string): { def: string; color: string }[] {
  const [, accent] = splitColor(color);
  const out = [{ def: item.def, color }];
  for (const extra of item.extras ?? []) {
    const c = accent ?? (typeof extra.color === 'function' ? extra.color(color) : extra.color);
    if (c) out.push({ def: extra.def, color: c });
  }
  return out;
}

export const CATALOG: WardrobeItem[] = [
  // ------------------------------------------------------------ tops
  { id: 'tshirt', name: 'T-shirt', slot: 'top', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt', tier: 'cheap', colors: CLOTH },
  { id: 'vneck_tee', name: 'V-neck tee', slot: 'top', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt_vneck', tier: 'cheap', colors: CLOTH },
  { id: 'scoop_tee', name: 'Scoop tee', slot: 'top', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt_scoop', tier: 'cheap', colors: CLOTH },
  // Drawn for Homeboard from the tank top (scripts/make-bra.ts); white is what a bare top shows
  { id: 'bra', name: 'Bra', slot: 'top', def: 'torso/torso_clothes_bra', tier: 'cheap', colors: CLOTH, bodies: ['female'] },
  { id: 'tank_top', name: 'Tank top', slot: 'top', def: 'torso/shirts/sleeveless/torso_clothes_sleeveless2', tier: 'cheap', colors: CLOTH },
  { id: 'sleeveless_tee', name: 'Sleeveless tee', slot: 'top', def: 'torso/shirts/sleeveless/torso_clothes_sleeveless1', tier: 'cheap', colors: CLOTH },
  { id: 'vneck_tank', name: 'V-neck tank', slot: 'top', def: 'torso/shirts/sleeveless/torso_clothes_sleeveless2_vneck', tier: 'cheap', colors: CLOTH },
  { id: 'scoop_tank', name: 'Scoop tank', slot: 'top', def: 'torso/shirts/sleeveless/torso_clothes_sleeveless2_scoop', tier: 'cheap', colors: CLOTH },
  { id: 'buttoned_tee', name: 'Buttoned tee', slot: 'top', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt_buttoned', tier: 'common', colors: CLOTH },
  { id: 'buttoned_tank', name: 'Buttoned tank', slot: 'top', def: 'torso/shirts/sleeveless/torso_clothes_sleeveless2_buttoned', tier: 'common', colors: CLOTH },
  { id: 'sleeveless_polo', name: 'Sleeveless polo', slot: 'top', def: 'torso/shirts/sleeveless/torso_clothes_sleeveless2_polo', tier: 'common', colors: CLOTH },
  { id: 'suspenders', name: 'Suspenders', slot: 'top', def: 'torso/aprons/torso_aprons_suspenders', tier: 'common', colors: CLOTH },
  { id: 'shirt', name: 'Shirt', slot: 'top', def: 'torso/shirts/shortsleeve/torso_clothes_shortsleeve', tier: 'common', colors: CLOTH },
  { id: 'polo', name: 'Polo', slot: 'top', def: 'torso/shirts/shortsleeve/torso_clothes_shortsleeve_polo', tier: 'common', colors: CLOTH },
  { id: 'summer_cardigan', name: 'Summer cardigan', slot: 'top', def: 'torso/shirts/shortsleeve/torso_clothes_shortsleeve_cardigan', tier: 'common', colors: CLOTH },
  { id: 'sleeveless_cardigan', name: 'Sleeveless cardigan', slot: 'top', def: 'torso/shirts/sleeveless/torso_clothes_sleeveless2_cardigan', tier: 'common', colors: CLOTH },
  { id: 'longsleeve', name: 'Longsleeve', slot: 'top', def: 'torso/shirts/longsleeve/torso_clothes_longsleeve', tier: 'common', colors: CLOTH },
  { id: 'fitted_longsleeve', name: 'Fitted longsleeve', slot: 'top', def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2', tier: 'common', colors: CLOTH },
  { id: 'wide_neck_longsleeve', name: 'Wide-neck longsleeve', slot: 'top', def: 'torso/shirts/longsleeve/torso_clothes_longsleeve_scoop', tier: 'common', colors: CLOTH },
  { id: 'longsleeve_vneck', name: 'V-neck longsleeve', slot: 'top', def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_vneck', tier: 'common', colors: CLOTH },
  { id: 'longsleeve_scoop', name: 'Scoop longsleeve', slot: 'top', def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_scoop', tier: 'common', colors: CLOTH },
  { id: 'longsleeve_buttoned', name: 'Buttoned longsleeve', slot: 'top', def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_buttoned', tier: 'common', colors: CLOTH },
  { id: 'longsleeve_polo', name: 'Longsleeve polo', slot: 'top', def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_polo', tier: 'common', colors: CLOTH },
  { id: 'cardigan', name: 'Cardigan', slot: 'top', def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_cardigan', tier: 'fancy', colors: CLOTH },
  { id: 'overalls', name: 'Overalls', slot: 'top', def: 'torso/aprons/torso_aprons_overalls', tier: 'fancy', colors: startingWith('leather', CLOTH) },
  { id: 'leather_armor', name: 'Leather armor', slot: 'top', def: 'torso/armour/torso_armour_leather', tier: 'fancy', colors: ['leather+steel', 'brown+gold', 'black+silver', 'maroon+bronze', 'forest+brass', 'navy+silver', 'tan+copper'] },
  { id: 'chainmail', name: 'Chainmail', slot: 'top', def: 'torso/torso_chainmail', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'legion_armor', name: 'Legion armor', slot: 'top', def: 'torso/armour/torso_armour_legion', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'plate_armor', name: 'Plate armor', slot: 'top', def: 'torso/armour/torso_armour_plate', tier: 'legendary', colors: startingWith('steel', METAL) },

  // ------------------------------------------------------------ bottoms
  { id: 'shorts', name: 'Shorts', slot: 'bottom', def: 'legs/shorts/legs_shorts', tier: 'cheap', colors: CLOTH },
  { id: 'short_shorts', name: 'Short shorts', slot: 'bottom', def: 'legs/shorts/legs_shorts_short', tier: 'cheap', colors: CLOTH },
  { id: 'leggings', name: 'Leggings', slot: 'bottom', def: 'legs/leggings/legs_leggings', tier: 'cheap', colors: CLOTH },
  { id: 'fitted_leggings', name: 'Fitted leggings', slot: 'bottom', def: 'legs/leggings/legs_leggings2', tier: 'cheap', colors: CLOTH },
  { id: 'pants', name: 'Pants', slot: 'bottom', def: 'legs/pants/legs_pants', tier: 'common', colors: CLOTH },
  { id: 'slim_pants', name: 'Slim pants', slot: 'bottom', def: 'legs/pants/legs_pants2', tier: 'common', colors: CLOTH },
  { id: 'cuffed_pants', name: 'Cuffed pants', slot: 'bottom', def: 'legs/pants/legs_cuffed', tier: 'common', colors: CLOTH },
  { id: 'hose', name: 'Hose', slot: 'bottom', def: 'legs/leggings/legs_hose', tier: 'common', colors: CLOTH },
  { id: 'skirt', name: 'Skirt', slot: 'bottom', def: 'legs/skirts/legs_skirts_plain', tier: 'common', colors: CLOTH, noCheer: true },
  { id: 'straight_skirt', name: 'Straight skirt', slot: 'bottom', def: 'legs/skirts/legs_skirt_straight', tier: 'common', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },
  { id: 'dress_pants', name: 'Dress pants', slot: 'bottom', def: 'legs/pants/legs_formal', tier: 'fancy', colors: CLOTH },
  { id: 'striped_pants', name: 'Striped pants', slot: 'bottom', def: 'legs/pants/legs_formal_striped', tier: 'fancy', colors: CLOTH },
  { id: 'pantaloons', name: 'Pantaloons', slot: 'bottom', def: 'legs/pants/legs_pantaloons', tier: 'fancy', colors: CLOTH },
  { id: 'slit_skirt', name: 'Slit skirt', slot: 'bottom', def: 'legs/skirts/legs_skirts_slit', tier: 'fancy', colors: CLOTH, noSit: true, noCheer: true },
  { id: 'overskirt', name: 'Overskirt', slot: 'bottom', def: 'legs/skirts/legs_skirt_overskirt', tier: 'fancy', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },
  { id: 'legion_skirt', name: 'Legion skirt', slot: 'bottom', def: 'legs/skirts/legs_skirts_legion', tier: 'epic', colors: CLOTH },
  { id: 'belle_skirt', name: 'Belle skirt', slot: 'bottom', def: 'legs/skirts/legs_skirt_belle', tier: 'epic', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },
  { id: 'plate_greaves', name: 'Plate greaves', slot: 'bottom', def: 'legs/legs_armour', tier: 'legendary', colors: startingWith('steel', METAL) },

  // ------------------------------------------------------------ feet
  { id: 'sandals', name: 'Sandals', slot: 'feet', def: 'feet/feet_sandals', tier: 'cheap', colors: CLOTH },
  { id: 'slippers', name: 'Slippers', slot: 'feet', def: 'feet/feet_slippers', tier: 'cheap', colors: CLOTH },
  { id: 'shoes', name: 'Shoes', slot: 'feet', def: 'feet/shoes/feet_shoes_basic', tier: 'cheap', colors: CLOTH },
  { id: 'ankle_socks', name: 'Ankle socks', slot: 'feet', def: 'feet/socks/feet_socks_ankle', tier: 'cheap', colors: CLOTH },
  { id: 'high_socks', name: 'High socks', slot: 'feet', def: 'feet/socks/feet_socks_high', tier: 'cheap', colors: CLOTH },
  { id: 'tabi_socks', name: 'Tabi socks', slot: 'feet', def: 'feet/socks/feet_socks_tabi', tier: 'cheap', colors: startingWith('brown', CLOTH) },
  { id: 'dress_shoes', name: 'Dress shoes', slot: 'feet', def: 'feet/shoes/feet_shoes_revised', tier: 'common', colors: CLOTH },
  { id: 'sneakers', name: 'Sneakers', slot: 'feet', def: 'feet/shoes/feet_shoes_sara', tier: 'common', colors: CLOTH },
  { id: 'ghillies', name: 'Ghillies', slot: 'feet', def: 'feet/shoes/feet_shoes_ghillies', tier: 'common', colors: CLOTH },
  { id: 'boots', name: 'Boots', slot: 'feet', def: 'feet/boots/feet_boots_basic', tier: 'common', colors: CLOTH },
  { id: 'folded_boots', name: 'Folded boots', slot: 'feet', def: 'feet/boots/feet_boots_fold', tier: 'fancy', colors: CLOTH },
  { id: 'rimmed_boots', name: 'Rimmed boots', slot: 'feet', def: 'feet/boots/feet_boots_rim', tier: 'fancy', colors: CLOTH },
  { id: 'tall_boots', name: 'Tall boots', slot: 'feet', def: 'feet/boots/feet_boots_revised', tier: 'fancy', colors: CLOTH },
  { id: 'armored_boots', name: 'Armored boots', slot: 'feet', def: 'feet/feet_armour', tier: 'epic', colors: startingWith('steel', METAL) },

  // ------------------------------------------------------------ hats
  { id: 'headband', name: 'Headband', slot: 'hat', def: 'headwear/coverings/headbands/hat_headband_tied', tier: 'cheap', colors: CLOTH },
  { id: 'thick_headband', name: 'Thick headband', slot: 'hat', def: 'headwear/coverings/headbands/hat_headband_thick', tier: 'cheap', colors: CLOTH },
  { id: 'bandana', name: 'Bandana', slot: 'hat', def: 'headwear/coverings/bandana/hat_bandana', tier: 'cheap', colors: CLOTH },
  { id: 'bordered_bandana', name: 'Bordered bandana', slot: 'hat', def: 'headwear/coverings/bandana/hat_bandana2', tier: 'cheap', colors: CLOTH },
  { id: 'kerchief', name: 'Kerchief', slot: 'hat', def: 'headwear/coverings/headbands/hat_headband_kerchief', tier: 'cheap', colors: CLOTH },
  { id: 'hair_tie', name: 'Hair tie', slot: 'hat', def: 'headwear/coverings/headbands/hat_headband_hairtie', tier: 'cheap', colors: CLOTH },
  { id: 'sack_hood', name: 'Sack hood', slot: 'hat', def: 'headwear/coverings/hoods/hat_hood_sack_cloth', tier: 'cheap', colors: CLOTH },
  { id: 'sailor_bandana', name: 'Sailor bandana', slot: 'hat', def: 'headwear/coverings/bandana/hat_bandana_pirate', tier: 'common', colors: startingWith('black', CLOTH) },
  { id: 'hood', name: 'Hood', slot: 'hat', def: 'headwear/coverings/hoods/hat_hood_cloth', tier: 'common', colors: CLOTH },
  { id: 'hijab', name: 'Hijab', slot: 'hat', def: 'headwear/coverings/hoods/hat_hood_hijab', tier: 'common', colors: CLOTH },
  { id: 'leather_cap', name: 'Leather cap', slot: 'hat', def: 'headwear/hats/caps/hat_cap_leather', tier: 'common', colors: ['base', ...CLOTH] },
  { id: 'bonnie_cap', name: 'Bonnie cap', slot: 'hat', def: 'headwear/hats/caps/hat_cap_bonnie', tier: 'common', colors: CLOTH },
  { id: 'tilted_cap', name: 'Tilted cap', slot: 'hat', def: 'headwear/hats/caps/hat_cap_bonnie_tilt', tier: 'common', colors: CLOTH },
  { id: 'mail_coif', name: 'Mail coif', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_mail', tier: 'common', colors: startingWith('steel', METAL) },
  { id: 'bowler', name: 'Bowler', slot: 'hat', def: 'headwear/hats/formal/hat_formal_bowler', tier: 'fancy', colors: ['base', 'base_brown', ...CLOTH] },
  { id: 'tricorne', name: 'Tricorne', slot: 'hat', def: 'headwear/hats/tricorne/hat_tricorne', tier: 'fancy', colors: CLOTH },
  { id: 'captain_tricorne', name: 'Captain tricorne', slot: 'hat', def: 'headwear/hats/tricorne/hat_tricorne_captain', extras: [{ def: 'headwear/hats/tricorne/hat_tricorne_captain_trim', color: 'base' }], tier: 'fancy', colors: [...CLOTH, 'navy+gold', 'black+silver', 'red+gold', 'brown+brass', 'white+gold'] },
  { id: 'lieutenant_tricorne', name: 'Lieutenant tricorne', slot: 'hat', def: 'headwear/hats/tricorne/hat_tricorne_lieutenant', extras: [{ def: 'headwear/hats/tricorne/hat_tricorne_lieutenant_trim', color: 'base' }], tier: 'fancy', colors: [...CLOTH, 'navy+gold', 'black+silver', 'red+gold', 'brown+brass', 'white+gold'] },
  { id: 'bicorne', name: 'Bicorne', slot: 'hat', def: 'headwear/hats/athwart/hat_bicorne_athwart_basic', tier: 'fancy', colors: CLOTH },
  { id: 'foreaft_bicorne', name: 'Fore-and-aft bicorne', slot: 'hat', def: 'headwear/hats/foreaft/hat_bicorne_foreaft', tier: 'fancy', colors: CLOTH },
  { id: 'cavalier_hat', name: 'Cavalier hat', slot: 'hat', def: 'headwear/hats/caps/hat_cap_cavalier', extras: [{ def: 'headwear/hats/caps/hat_cap_cavalier_feather', color: 'white' }], tier: 'fancy', colors: [...CLOTH, 'black+red', 'brown+green', 'purple+yellow', 'green+yellow', 'navy+sky'] },
  { id: 'feathered_cap', name: 'Feathered cap', slot: 'hat', def: 'headwear/hats/caps/hat_cap_bonnie', extras: [{ def: 'headwear/hats/caps/hat_cap_bonnie_feather', color: 'white' }], tier: 'fancy', colors: [...CLOTH, 'black+red', 'brown+green', 'purple+yellow', 'green+yellow', 'navy+sky'] },
  { id: 'wide_brim_hat', name: 'Wide-brim hat', slot: 'hat', def: 'headwear/hats/magic/hat_magic_large', tier: 'fancy', colors: ['brown'] },
  { id: 'nasal_helm', name: 'Nasal helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_nasal', tier: 'fancy', colors: startingWith('steel', METAL) },
  { id: 'norman_helm', name: 'Norman helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_norman', tier: 'fancy', colors: startingWith('steel', METAL) },
  { id: 'kettle_helm', name: 'Kettle helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_kettle', tier: 'fancy', colors: ['steel+brown', 'iron+black', 'bronze+red', 'gold+maroon', 'silver+navy', 'copper+forest'] },
  { id: 'elf_hat', name: 'Elf hat', slot: 'hat', def: 'headwear/hats/holiday/hat_holiday_christmas', extras: [{ def: 'headwear/hats/holiday/hat_holiday_elf', color: 'white' }], tier: 'fancy', colors: [...startingWith('green', CLOTH), 'green+red', 'green+yellow', 'red+green'] },
  { id: 'christmas_hat', name: 'Christmas hat', slot: 'hat', def: 'headwear/hats/holiday/hat_holiday_christmas', tier: 'fancy', colors: startingWith('red', CLOTH) },
  { id: 'pirate_bandana', name: 'Pirate bandana', slot: 'hat', def: 'headwear/coverings/bandana/hat_bandana_pirate', extras: [{ def: 'headwear/coverings/bandana/hat_bandana_pirate_skull', color: 'white' }], tier: 'fancy', colors: [...startingWith('black', CLOTH), 'red+black', 'black+red', 'navy+yellow'] },
  { id: 'top_hat', name: 'Top hat', slot: 'hat', def: 'headwear/hats/formal/hat_formal_tophat', tier: 'epic', colors: ['base', 'base_brown', ...CLOTH] },
  { id: 'santa_hat', name: 'Santa hat', slot: 'hat', def: 'headwear/hats/holiday/hat_holiday_christmas', extras: [{ def: 'headwear/hats/holiday/hat_holiday_santa', color: 'white' }], tier: 'epic', colors: startingWith('red', CLOTH) },
  { id: 'pirate_hat', name: 'Pirate captain hat', slot: 'hat', def: 'headwear/hats/athwart/hat_bicorne_athwart_captain', extras: [{ def: 'headwear/hats/athwart/hat_bicorne_athwart_captain_skull', color: 'white' }], tier: 'epic', colors: [...startingWith('charcoal', CLOTH), 'black+red', 'navy+yellow', 'maroon+black'] },
  { id: 'admiral_hat', name: 'Admiral hat', slot: 'hat', def: 'headwear/hats/athwart/hat_bicorne_athwart_admiral', extras: [{ def: 'headwear/hats/athwart/hat_bicorne_athwart_admiral_trim', color: 'base' }], tier: 'epic', colors: [...CLOTH, 'navy+gold', 'black+silver', 'red+gold', 'brown+brass', 'white+gold'] },
  { id: 'commodore_hat', name: 'Commodore hat', slot: 'hat', def: 'headwear/hats/athwart/hat_bicorne_athwart_commodore', extras: [{ def: 'headwear/hats/athwart/hat_bicorne_athwart_commodore_trim', color: 'base' }], tier: 'epic', colors: [...CLOTH, 'navy+gold', 'black+silver', 'red+gold', 'brown+brass', 'white+gold'] },
  { id: 'morion', name: 'Morion', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_morion', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'barbarian_helmet', name: 'Barbarian helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_barbarian', tier: 'epic', colors: ['steel+brown', 'iron+black', 'bronze+red', 'gold+maroon', 'silver+navy', 'copper+forest'] },
  { id: 'horned_barbarian_helmet', name: 'Horned barbarian helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_barbarian_viking', tier: 'epic', colors: ['steel+brown', 'iron+black', 'bronze+red', 'gold+maroon', 'silver+navy', 'copper+forest'] },
  { id: 'viking_helmet', name: 'Viking helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_spangenhelm_viking', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'horned_helmet', name: 'Horned helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_horned', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'legion_helmet', name: 'Legion helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_legion', extras: [{ def: 'headwear/helmets/accessories/hat_accessory_plumage_legion', color: 'brown' }], tier: 'epic', colors: [...startingWith('steel', METAL), 'steel+red', 'gold+red', 'bronze+black', 'silver+blue'] },
  { id: 'gladiator_helmet', name: 'Gladiator helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_maximus', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'knight_helmet', name: 'Knight helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_armet', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'tiara', name: 'Tiara', slot: 'hat', def: 'headwear/hats/formal/hat_formal_tiara', tier: 'epic', colors: ['tiara_gold', 'tiara_silver', 'tiara_bronze', 'tiara_purple'] },
  { id: 'crown', name: 'Crown', slot: 'hat', def: 'headwear/hats/formal/hat_formal_crown', tier: 'legendary', colors: ['crown_gold', 'crown_red', 'crown_blue', 'crown_gray'] },
  // Helmets with a visor, a crest, wings, horns or a plume: the extra pieces in the helmet's metal,
  // or their own color (horns of bone, a red plume); two-color ids color the plume
  { id: 'open_armet', name: 'Open armet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_armet_simple', tier: 'fancy', colors: startingWith('steel', METAL) },
  { id: 'barbuta', name: 'Barbuta', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_barbuta', tier: 'fancy', colors: startingWith('steel', METAL) },
  { id: 'open_barbuta', name: 'Open barbuta', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_barbuta_simple', tier: 'fancy', colors: startingWith('steel', METAL) },
  { id: 'flattop_helm', name: 'Flat-top helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_flattop', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'horned_visor_helm', name: 'Horned visor helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_pointed', extras: [{ def: 'headwear/helmets/visors/hat_visor_horned', color: SAME }], tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'winged_helm', name: 'Winged helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_pointed', extras: [{ def: 'headwear/helmets/accessories/hat_accessory_wings', color: SAME }], tier: 'epic', colors: startingWith('silver', METAL) },
  { id: 'horned_spangenhelm', name: 'Horned spangenhelm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_spangenhelm', extras: [{ def: 'headwear/helmets/accessories/hat_accessory_horns_upward', color: 'ceramic' }], tier: 'epic', colors: startingWith('iron', METAL) },
  { id: 'ram_helm', name: 'Ram helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_barbuta', extras: [{ def: 'headwear/helmets/accessories/hat_accessory_horns_downward', color: 'ceramic' }], tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'imp_helm', name: 'Imp helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_bascinet', extras: [{ def: 'headwear/helmets/accessories/hat_accessory_horns_short', color: 'ceramic' }], tier: 'epic', colors: startingWith('iron', METAL) },
  { id: 'legion_plume_helm', name: 'Legion plume helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_bascinet', extras: [{ def: 'headwear/helmets/accessories/hat_accessory_plumage_legion', color: 'blue' }], tier: 'epic', colors: [...startingWith('steel', METAL), 'steel+red', 'gold+white', 'iron+black', 'silver+purple'] },
  { id: 'plumed_helm', name: 'Plumed helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_flattop', extras: [{ def: 'headwear/helmets/accessories/hat_accessory_plumage', color: 'red' }], tier: 'legendary', colors: [...startingWith('steel', METAL), 'steel+blue', 'gold+white', 'iron+black', 'silver+yellow'] },
  { id: 'centurion_helm', name: 'Centurion helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_close', extras: [{ def: 'headwear/helmets/accessories/hat_accessory_plumage_centurion', color: 'red' }], tier: 'legendary', colors: [...startingWith('gold', METAL), 'gold+black', 'steel+blue', 'silver+white', 'bronze+purple'] },
  { id: 'crested_sugarloaf', name: 'Crested sugarloaf', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_sugarloaf', extras: [{ def: 'headwear/helmets/accessories/hat_accessory_crest', color: SAME }], tier: 'legendary', colors: startingWith('gold', METAL) },
  { id: 'dark_knight_helm', name: 'Dark knight helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_bascinet', extras: [{ def: 'headwear/helmets/visors/hat_visor_horned', color: SAME }, { def: 'headwear/helmets/accessories/hat_accessory_horns_upward', color: 'black' }], tier: 'legendary', colors: startingWith('iron', METAL) },
  { id: 'trimmed_cap', name: 'Trimmed cap', slot: 'hat', def: 'headwear/hats/caps/hat_cap_bonnie', extras: [{ def: 'headwear/hats/caps/hat_cap_bonnie_trim', color: 'white' }], tier: 'common', colors: [...startingWith('navy', CLOTH), 'red+white', 'black+red', 'green+yellow', 'white+navy'] },
  { id: 'commodore_bicorne', name: 'Commodore bicorne', slot: 'hat', def: 'headwear/hats/foreaft/hat_bicorne_foreaft_commodore', extras: [{ def: 'headwear/hats/foreaft/hat_bicorne_foreaft_commodore_trim', color: 'base' }], tier: 'epic', colors: [...startingWith('navy', CLOTH), 'navy+gold', 'black+silver', 'red+gold', 'white+gold'] },
  { id: 'grand_admiral_hat', name: 'Grand admiral hat', slot: 'hat', def: 'headwear/hats/athwart/hat_bicorne_athwart_admiral', extras: [{ def: 'headwear/hats/athwart/hat_bicorne_athwart_admiral_trim', color: 'base' }, { def: 'headwear/hats/athwart/hat_bicorne_athwart_admiral_cockade', color: 'red' }], tier: 'legendary', colors: startingWith('navy', CLOTH) },
  // Horns grow from the head in the wearer's skin, or a tone of their own
  { id: 'ram_horns', name: 'Ram horns', slot: 'hat', def: 'head/appendages/head_horns_curled', tier: 'epic', colors: ['skin', 'zombie', 'fur_black', 'fur_white', 'bright_green', 'blue'] },
  { id: 'devil_horns', name: 'Devil horns', slot: 'hat', def: 'head/appendages/head_horns_backwards', tier: 'epic', colors: ['skin', 'zombie', 'fur_black', 'fur_white', 'bright_green', 'blue'] },
  { id: 'space_helmet', name: 'Space helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_xeon', tier: 'legendary', colors: startingWith('steel', METAL) },
  { id: 'great_helm', name: 'Great helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_greathelm', tier: 'legendary', colors: startingWith('steel', METAL) },
  { id: 'wizard_hat', name: 'Wizard hat', slot: 'hat', def: 'headwear/hats/magic/hat_magic_wizard', tier: 'legendary', colors: ['base_black', 'base_brown', 'base_gray', 'base_red', 'base_teal', 'base_yellow'] },
  { id: 'celestial_hat', name: 'Celestial hat', slot: 'hat', def: 'headwear/hats/magic/hat_magic_celestial_moon', extras: [{ def: 'headwear/hats/magic/hat_magic_celestial_moon_trim' }], tier: 'legendary', colors: [...CLOTH, 'navy+yellow', 'purple+yellow', 'black+white', 'blue+sky', 'maroon+yellow'] },
  { id: 'star_wizard_hat', name: 'Star wizard hat', slot: 'hat', def: 'headwear/hats/magic/hat_magic_celestial', extras: [{ def: 'headwear/hats/magic/hat_magic_celestial_trim' }], tier: 'legendary', colors: [...CLOTH, 'navy+yellow', 'purple+yellow', 'black+white', 'blue+sky', 'maroon+yellow'] },

  // ------------------------------------------------------------ face
  { id: 'small_eyepatch', name: 'Small eyepatch', slot: 'face', def: 'headwear/accessories/eyepatch/facial_eyepatch_small_left', tier: 'cheap', colors: CLOTH },
  { id: 'earring', name: 'Earring', slot: 'face', def: 'headwear/accessories/earrings/facial_earring_left', tier: 'cheap', colors: startingWith('gold', METAL) },
  // Ears are drawn in the wearer's own skin (or the costume's): their one color is "skin"
  { id: 'big_ears', name: 'Big ears', slot: 'face', def: 'head/ears/head_ears_big', tier: 'common', colors: ['skin'] },
  { id: 'elf_ears', name: 'Elf ears', slot: 'face', def: 'head/ears/head_ears_elven', tier: 'fancy', colors: ['skin'] },
  { id: 'long_ears', name: 'Long ears', slot: 'face', def: 'head/ears/head_ears_long', tier: 'fancy', colors: ['skin'] },
  { id: 'glasses', name: 'Glasses', slot: 'face', def: 'headwear/accessories/glasses/facial_glasses', tier: 'common', colors: FRAME },
  { id: 'round_glasses', name: 'Round glasses', slot: 'face', def: 'headwear/accessories/glasses/facial_glasses_round', tier: 'common', colors: FRAME },
  { id: 'nerd_glasses', name: 'Nerd glasses', slot: 'face', def: 'headwear/accessories/glasses/facial_glasses_nerd', tier: 'common', colors: FRAME },
  { id: 'secretary_glasses', name: 'Secretary glasses', slot: 'face', def: 'headwear/accessories/glasses/facial_glasses_secretary', tier: 'common', colors: FRAME },
  { id: 'halfmoon_glasses', name: 'Half-moon glasses', slot: 'face', def: 'headwear/accessories/glasses/facial_glasses_halfmoon', tier: 'fancy', colors: FRAME },
  { id: 'sunglasses', name: 'Sunglasses', slot: 'face', def: 'headwear/accessories/glasses/facial_glasses_sunglasses', tier: 'fancy', colors: ['sunglasses', ...FRAME] },
  { id: 'eyepatch', name: 'Eyepatch', slot: 'face', def: 'headwear/accessories/eyepatch/facial_eyepatch_left', tier: 'fancy', colors: ['base', 'black', 'brown', 'red'] },
  { id: 'strap_eyepatch', name: 'Strap eyepatch', slot: 'face', def: 'headwear/accessories/eyepatch/facial_eyepatch2_left', tier: 'fancy', colors: CLOTH },
  { id: 'plain_mask', name: 'Plain mask', slot: 'face', def: 'headwear/accessories/facial_mask_plain', tier: 'fancy', colors: ['dark', ...CLOTH, ...METAL] },
  { id: 'monocle', name: 'Monocle', slot: 'face', def: 'headwear/accessories/monocle/facial_monocle_left', tier: 'epic', colors: ['steel', 'gold', 'silver'] },

  // ------------------------------------------------------------ neck
  { id: 'necktie', name: 'Necktie', slot: 'neck', def: 'headwear/neck/neck_necktie', tier: 'common', colors: CLOTH },
  { id: 'bowtie', name: 'Bow tie', slot: 'neck', def: 'headwear/neck/neck_bowtie', tier: 'common', colors: CLOTH },
  { id: 'big_bowtie', name: 'Big bow tie', slot: 'neck', def: 'headwear/neck/neck_bowtie2', tier: 'common', colors: CLOTH },
  { id: 'scarf', name: 'Scarf', slot: 'neck', def: 'headwear/neck/neck_scarf', tier: 'common', colors: CLOTH },
  { id: 'beaded_necklace', name: 'Beaded necklace', slot: 'neck', def: 'headwear/neck/neck_necklace_beaded_small', tier: 'common', colors: startingWith('steel', METAL) },
  { id: 'cravat', name: 'Cravat', slot: 'neck', def: 'headwear/neck/neck_cravat', tier: 'fancy', colors: CLOTH },
  { id: 'jabot', name: 'Jabot', slot: 'neck', def: 'headwear/neck/neck_jabot', tier: 'fancy', colors: CLOTH },
  { id: 'large_beads', name: 'Large beaded necklace', slot: 'neck', def: 'headwear/neck/neck_necklace_beaded_large', tier: 'fancy', colors: startingWith('steel', METAL) },
  { id: 'necklace', name: 'Necklace', slot: 'neck', def: 'headwear/neck/neck_necklace_simple', tier: 'fancy', colors: startingWith('steel', METAL), noSit: true, noCheer: true },
  { id: 'chain', name: 'Chain', slot: 'neck', def: 'headwear/neck/neck_necklace_chain', tier: 'fancy', colors: startingWith('steel', METAL), noSit: true, noCheer: true },
  { id: 'pendant', name: 'Pendant', slot: 'neck', def: 'headwear/neck/neck_necklace', tier: 'fancy', colors: [...startingWith('steel', METAL), 'pirate'], noSit: true, noCheer: true },
  { id: 'ring_charm', name: 'Ring charm', slot: 'neck', def: 'headwear/neck/charms/neck_charm_ring', extras: CHAIN, tier: 'fancy', colors: startingWith('steel', METAL), noSit: true, noCheer: true },
  { id: 'box_charm', name: 'Box charm', slot: 'neck', def: 'headwear/neck/charms/neck_charm_box', extras: CHAIN, tier: 'fancy', colors: startingWith('steel', METAL), noSit: true, noCheer: true },
  { id: 'star_charm', name: 'Star charm', slot: 'neck', def: 'headwear/neck/charms/neck_charm_star', extras: CHAIN, tier: 'fancy', colors: startingWith('steel', METAL), noSit: true, noCheer: true },
  { id: 'pearl_pendant', name: 'Pearl pendant', slot: 'neck', def: 'headwear/neck/charms/neck_gem_pearl', extras: CHAIN, tier: 'epic', colors: GEM, noSit: true, noCheer: true },
  { id: 'round_gem', name: 'Round gem pendant', slot: 'neck', def: 'headwear/neck/charms/neck_gem_round', extras: CHAIN, tier: 'epic', colors: GEM, noSit: true, noCheer: true },
  { id: 'square_gem', name: 'Square gem pendant', slot: 'neck', def: 'headwear/neck/charms/neck_gem_princess', extras: CHAIN, tier: 'epic', colors: GEM, noSit: true, noCheer: true },
  { id: 'teardrop_gem', name: 'Teardrop gem pendant', slot: 'neck', def: 'headwear/neck/charms/neck_gem_pear', extras: CHAIN, tier: 'epic', colors: GEM, noSit: true, noCheer: true },
  { id: 'star_amulet', name: 'Star amulet', slot: 'neck', def: 'headwear/neck/charms/neck_amulet_star', extras: CHAIN, tier: 'legendary', colors: AMULET, noSit: true, noCheer: true },
  { id: 'cross_amulet', name: 'Cross amulet', slot: 'neck', def: 'headwear/neck/charms/neck_amulet_cross', extras: CHAIN, tier: 'legendary', colors: AMULET, noSit: true, noCheer: true },
  { id: 'drop_amulet', name: 'Drop amulet', slot: 'neck', def: 'headwear/neck/charms/neck_amulet_dangle', extras: CHAIN, tier: 'legendary', colors: AMULET, noSit: true, noCheer: true },
  { id: 'spider_amulet', name: 'Spider amulet', slot: 'neck', def: 'headwear/neck/charms/neck_amulet_spider', extras: CHAIN, tier: 'legendary', colors: AMULET, noSit: true, noCheer: true },

  // ------------------------------------------------------------ dresses (replace top and bottom)
  { id: 'slit_dress', name: 'Slit dress', slot: 'dress', def: 'torso/dresses/dress_slit', tier: 'fancy', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },
  { id: 'bodice_dress', name: 'Bodice dress', slot: 'dress', def: 'torso/dresses/dress_bodice', tier: 'fancy', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },
  { id: 'sash_dress', name: 'Sash dress', slot: 'dress', def: 'torso/dresses/dress_sash', tier: 'epic', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },
  { id: 'kimono', name: 'Kimono', slot: 'dress', def: 'torso/dresses/kimono/dress_kimono', extras: [{ def: 'torso/dresses/kimono/dress_kimono_trim' }], tier: 'epic', colors: [...CLOTH, 'black+red', 'white+red', 'navy+white', 'red+yellow', 'forest+tan', 'lavender+purple'], bodies: ['female'], noSit: true, noCheer: true },
  { id: 'split_kimono', name: 'Split kimono', slot: 'dress', def: 'torso/dresses/kimono/dress_kimono_split', extras: [{ def: 'torso/dresses/kimono/dress_kimono_split_trim' }], tier: 'epic', colors: [...CLOTH, 'black+red', 'white+red', 'navy+white', 'red+yellow', 'forest+tan', 'lavender+purple'], bodies: ['female'], noSit: true, noCheer: true },

  // ------------------------------------------------------------ back
  { id: 'cat_tail', name: 'Cat tail', slot: 'back', def: 'body/tails/tail_cat', tier: 'epic', colors: FUR },
  { id: 'fluffy_tail', name: 'Fluffy tail', slot: 'back', def: 'body/tails/tail_wolf_fluffy', tier: 'epic', colors: FUR },
  { id: 'wolf_tail', name: 'Wolf tail', slot: 'back', def: 'body/tails/tail_wolf', tier: 'epic', colors: FUR },
  { id: 'lizard_tail', name: 'Lizard tail', slot: 'back', def: 'body/tails/tail_lizard_alt', tier: 'epic', colors: SCALE },
  { id: 'tattered_cape', name: 'Tattered cape', slot: 'back', def: 'torso/cape/cape_tattered', tier: 'legendary', colors: CLOTH, noSit: true, noCheer: true },
  { id: 'cape', name: 'Cape', slot: 'back', def: 'torso/cape/cape_solid', tier: 'legendary', colors: CLOTH, noSit: true, noCheer: true },
  { id: 'trimmed_cape', name: 'Trimmed cape', slot: 'back', def: 'torso/cape/cape_solid', extras: [{ def: 'torso/cape/cape_trim', color: 'brown' }], tier: 'legendary', colors: [...CLOTH, 'red+yellow', 'navy+yellow', 'purple+yellow', 'black+red', 'forest+tan', 'maroon+white'], noSit: true, noCheer: true },
  // Walking art only: standing shows the walking pose, and the wearer neither sits nor cheers.
  // Expensive for it.
  { id: 'butterfly_wings', name: 'Butterfly wings', slot: 'back', def: 'body/wings/monarch/wings_monarch', tier: 'legendary', colors: ['monarch', 'blue', 'pink', 'purple', 'red', 'teal', 'white', 'yellow', 'black', 'gold', 'green'], noSit: true, noCheer: true },
  { id: 'fairy_wings', name: 'Fairy wings', slot: 'back', def: 'body/wings/pixie/wings_pixie', tier: 'legendary', colors: ['pixie', 'pink', 'lavender', 'sky', 'white', 'gold', 'green', 'purple'], noSit: true, noCheer: true },
  { id: 'luna_moth_wings', name: 'Luna moth wings', slot: 'back', def: 'body/wings/wings_lunar', tier: 'legendary', colors: ['lunar', 'pale_green', 'sky', 'pink', 'white', 'yellow', 'lavender'], noSit: true, noCheer: true },
  { id: 'angel_wings', name: 'Angel wings', slot: 'back', def: 'body/wings/wings_feathered', tier: 'legendary', colors: WING },
  { id: 'bat_wings', name: 'Bat wings', slot: 'back', def: 'body/wings/wings_bat', tier: 'legendary', colors: WING },
  { id: 'dragon_wings', name: 'Dragon wings', slot: 'back', def: 'body/wings/wings_lizard_alt', tier: 'legendary', colors: SCALE },

  // ------------------------------------------------------------ arms (locked at first)
  { id: 'cuffs', name: 'Cuffs', slot: 'arms', def: 'arms/wrists/wrists_cuffs', tier: 'cheap', colors: startingWith('white', CLOTH) },
  { id: 'lace_cuffs', name: 'Lace cuffs', slot: 'arms', def: 'arms/wrists/wrists_cuffs_lace', tier: 'common', colors: startingWith('white', CLOTH) },
  { id: 'gloves', name: 'Gloves', slot: 'arms', def: 'arms/arms_gloves', tier: 'common', colors: startingWith('steel', METAL) },
  { id: 'bracers', name: 'Bracers', slot: 'arms', def: 'arms/wrists/arms_bracers', tier: 'fancy', colors: [...startingWith('steel', METAL), 'leather', 'brown'] },

  // ------------------------------------------------------------ shoulders (locked at first)
  { id: 'bauldron', name: 'Bauldron', slot: 'shoulders', def: 'arms/bauldron', tier: 'common', colors: [...startingWith('leather', CLOTH), ...METAL] },
  { id: 'mantle', name: 'Mantle', slot: 'shoulders', def: 'arms/shoulders/shoulders_mantal', tier: 'fancy', colors: CLOTH },
  { id: 'epaulets', name: 'Epaulets', slot: 'shoulders', def: 'arms/shoulders/shoulders_epaulets', tier: 'epic', colors: [...startingWith('gold', METAL), ...CLOTH] },
  { id: 'pauldrons', name: 'Pauldrons', slot: 'shoulders', def: 'arms/shoulders/shoulders_pauldrons', tier: 'legendary', colors: startingWith('steel', METAL) },

  // ------------------------------------------------------------ costumes (a secret slot)
  // Whole heads, drawn instead of the guest's own
  { id: 'pig_head', name: 'Pig head', slot: 'costume', def: 'head/heads/farm/heads_pig', head: { skin: true }, tier: 'fancy', colors: ['light', 'amber', 'fur_tan', 'fur_white', 'fur_black'] },
  { id: 'rabbit_head', name: 'Rabbit head', slot: 'costume', def: 'head/heads/farm/heads_rabbit', head: { skin: true }, tier: 'fancy', colors: startingWith('fur_white', FUR_SKIN) },
  { id: 'mouse_head', name: 'Mouse head', slot: 'costume', def: 'head/heads/farm/heads_mouse', head: { skin: true }, tier: 'fancy', colors: startingWith('fur_grey', FUR_SKIN) },
  { id: 'sheep_head', name: 'Sheep head', slot: 'costume', def: 'head/heads/farm/heads_sheep', head: { skin: true }, tier: 'fancy', colors: startingWith('fur_white', FUR_SKIN) },
  { id: 'zombie_head', name: 'Zombie head', slot: 'costume', def: 'head/heads/undead/heads_zombie', head: { skin: true }, tier: 'fancy', colors: ['zombie', 'zombie_green', 'pale_green', 'green'] },
  { id: 'vampire_head', name: 'Vampire head', slot: 'costume', def: 'head/heads/undead/heads_vampire', head: { skin: true, keepHair: true }, tier: 'fancy', colors: ['pale_green', 'zombie', 'fur_white', 'light'] },
  { id: 'orc_head', name: 'Orc head', slot: 'costume', def: 'head/heads/fantasy/heads_orc_male', head: { skin: true, keepHair: true }, tier: 'fancy', colors: MONSTER },
  { id: 'goblin_head', name: 'Goblin head', slot: 'costume', def: 'head/heads/fantasy/heads_goblin', head: { skin: true }, tier: 'fancy', colors: startingWith('bright_green', MONSTER) },
  { id: 'skeleton_head', name: 'Skeleton head', slot: 'costume', def: 'head/heads/undead/heads_skeleton', head: {}, tier: 'epic', colors: ['white', 'tan', 'gray', 'black'] },
  { id: 'pumpkin_head', name: 'Pumpkin head', slot: 'costume', def: 'head/heads/undead/heads_jack', head: {}, tier: 'epic', colors: ['jack'] },
  { id: 'frankenstein_head', name: 'Frankenstein head', slot: 'costume', def: 'head/heads/undead/heads_frankenstein', head: { skin: true, keepHair: true }, tier: 'epic', colors: MONSTER },
  { id: 'wolf_head', name: 'Wolf head', slot: 'costume', def: 'head/heads/beast/heads_wolf_male', head: { skin: true }, tier: 'epic', colors: startingWith('fur_grey', FUR_SKIN) },
  { id: 'boar_head', name: 'Boar head', slot: 'costume', def: 'head/heads/beast/heads_boarman', head: { skin: true }, tier: 'epic', colors: FUR_SKIN },
  { id: 'lizard_head', name: 'Lizard head', slot: 'costume', def: 'head/heads/reptile/heads_lizard_male', head: { skin: true }, tier: 'epic', colors: [...MONSTER, 'blue'] },
  { id: 'troll_head', name: 'Troll head', slot: 'costume', def: 'head/heads/fantasy/heads_troll', head: { skin: true }, tier: 'epic', colors: ['blue', 'pale_green', 'zombie_green', 'green', 'fur_grey'] },
  { id: 'minotaur_head', name: 'Minotaur head', slot: 'costume', def: 'head/heads/beast/heads_minotaur', head: { skin: true }, tier: 'legendary', colors: FUR_SKIN },
  { id: 'alien_head', name: 'Alien head', slot: 'costume', def: 'head/heads/reptile/heads_alien', head: { skin: true }, tier: 'legendary', colors: ['bright_green', 'green', 'pale_green', 'zombie_green', 'blue', 'fur_grey'] },
];

// Two-color swatches: split corner to corner, the first color top left, the second bottom right
for (const item of CATALOG) {
  for (const id of item.colors) {
    const [main, accent] = splitColor(id);
    if (accent && !COLOR_HEX[id]) COLOR_HEX[id] = `linear-gradient(to bottom right, ${COLOR_HEX[main] ?? '#888'} 50%, ${COLOR_HEX[accent] ?? '#888'} 50%)`;
  }
}

export const itemById =(id: string): WardrobeItem | undefined => CATALOG.find((i) => i.id === id);

/**
 * What every guest owns and wears from the start, for free: white shorts, and a bra on a female
 * body. They are pieces like any other: "Nothing" in their slot takes them off.
 */
export function starterPieces(body: 'male' | 'female'): Outfit {
  return body === 'female' ? { bottom: { id: 'shorts', color: 'white' }, top: { id: 'bra', color: 'white' } } : { bottom: { id: 'shorts', color: 'white' } };
}

/** Costume heads the crown does not sit on (their ears are in the way); the others wear it on top */
const CROWNLESS_HEADS = new Set(['pig_head', 'rabbit_head', 'mouse_head']);

/**
 * Why the King cannot buy or put on this piece while he holds the title, or null if he can. Skirts
 * and dresses without sit or cheer art would leave him in his underwear on the throne; a few
 * costume heads cannot wear the crown; no hat replaces the crown. Neck and back pieces just vanish for a moment, so they stay allowed.
 */
export function notForTheKing(item: WardrobeItem | undefined): string | null {
  if (!item) return null;
  if ((item.slot === 'bottom' || item.slot === 'dress') && (item.noSit || item.noCheer)) {
    return 'Not fit for a King: you could not sit on your throne or greet your court in this';
  }
  if (item.slot === 'costume' && CROWNLESS_HEADS.has(item.id)) return 'Not fit for a King: the crown does not sit on this head';
  if (item.slot === 'hat') return 'The King keeps the crown: no other hat while you reign';
  return null;
}

/** The costume head an outfit wears, if any */
export function costumeOf(outfit: Outfit): { item: WardrobeItem; color: string } | null {
  const w = outfit.costume;
  const item = w && itemById(w.id);
  return item?.head && w ? { item, color: w.color } : null;
}

/** One worn or owned piece: a catalog item in one of its colors */
export interface WornItem {
  id: string;
  color: string;
}

/** What a guest wears: at most one item per slot, all owned */
export type Outfit = Partial<Record<Slot, WornItem>>;

/** The piece if it exists in the catalog in that color (and fits this body) */
export function validWorn(w: unknown, body?: 'male' | 'female'): (WornItem & { item: WardrobeItem }) | null {
  const o = w as Partial<WornItem> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || typeof o.color !== 'string') return null;
  const item = itemById(o.id);
  if (!item || !item.colors.includes(o.color)) return null;
  if (body && item.bodies && !item.bodies.includes(body)) return null;
  return { id: o.id, color: o.color, item };
}

/**
 * Check a whole outfit: every piece exists, sits in its own slot, and fits the body.
 * A dress replaces top and bottom, so those slots must be empty when one is worn.
 */
export function validOutfit(o: unknown, body: 'male' | 'female'): Outfit | null {
  if (!o || typeof o !== 'object') return null;
  const out: Outfit = {};
  for (const [slot, w] of Object.entries(o as Record<string, unknown>)) {
    if (w == null) continue;
    const worn = validWorn(w, body);
    if (!worn || worn.item.slot !== slot) return null;
    out[slot as Slot] = { id: worn.id, color: worn.color };
  }
  if (out.dress && (out.top || out.bottom)) return null;
  return out;
}
