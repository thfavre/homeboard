// The wardrobe: everything the town's shop sells. Each item names an LPC sheet definition
// (assets/lpc/sheet_definitions/) and the colors it comes in; the server composites worn items
// into the avatar's sheet (server/modules/world/compose.ts). The catalog is curated by hand:
// only definitions whose art covers the town's animations on both bodies are in (checked with a
// probe script; items missing the sit or cheer art carry noSit/noCheer so the sim avoids those).

/** Where an item is worn; one item per slot. A dress replaces top and bottom. */
export const SLOTS = [
  { id: 'top', name: 'Tops' },
  { id: 'bottom', name: 'Bottoms' },
  { id: 'feet', name: 'Feet' },
  { id: 'hat', name: 'Hats' },
  { id: 'face', name: 'Face' },
  { id: 'neck', name: 'Neck' },
  { id: 'dress', name: 'Dresses' },
  { id: 'back', name: 'Back' },
] as const;
export type Slot = (typeof SLOTS)[number]['id'];

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
  /** Only these bodies have the art (dresses); everyone otherwise */
  bodies?: readonly ('male' | 'female')[];
  /** The art has no sit sheet: the sim keeps the wearer off benches and away from the cat */
  noSit?: true;
  /** The art has no emote or jump sheet: the wearer does not cheer */
  noCheer?: true;
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
/** Metal and gem pairs of the amulets (the swatch is the gem) */
const AMULET = ['gold_red', 'silver_blue', 'bronze_green', 'copper_orange', 'steel_purple', 'brass_yellow'] as const;
/** Gem colors of the gem pendants */
const GEM = ['blue', 'green', 'orange', 'purple', 'red', 'yellow'] as const;

/** A color list with the item's own color moved first (a red Santa hat, a steel necklace) */
const startingWith = (color: string, list: readonly string[]): string[] => [color, ...list.filter((c) => c !== color)];

/** Swatch hex for every color id above (display only; the art has its own ramps) */
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
  pirate: '#a08a4a', gold_red: '#c2242c', silver_blue: '#3c6cd0', bronze_green: '#2f9a3e', copper_orange: '#e0761f',
  steel_purple: '#8a3fc0', brass_yellow: '#e8c22a',
};

/** Display name of a color id ("base_brown" => "Base brown") */
export function colorName(id: string): string {
  return id.replace(/[_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export const CATALOG: WardrobeItem[] = [
  // ------------------------------------------------------------ tops
  { id: 'tshirt', name: 'T-shirt', slot: 'top', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt', tier: 'cheap', colors: CLOTH },
  { id: 'vneck_tee', name: 'V-neck tee', slot: 'top', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt_vneck', tier: 'cheap', colors: CLOTH },
  { id: 'scoop_tee', name: 'Scoop tee', slot: 'top', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt_scoop', tier: 'cheap', colors: CLOTH },
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
  { id: 'overalls', name: 'Overalls', slot: 'top', def: 'torso/aprons/torso_aprons_overalls', tier: 'fancy', colors: CLOTH },
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
  { id: 'captain_tricorne', name: 'Captain tricorne', slot: 'hat', def: 'headwear/hats/tricorne/hat_tricorne_captain', tier: 'fancy', colors: CLOTH },
  { id: 'lieutenant_tricorne', name: 'Lieutenant tricorne', slot: 'hat', def: 'headwear/hats/tricorne/hat_tricorne_lieutenant', tier: 'fancy', colors: CLOTH },
  { id: 'bicorne', name: 'Bicorne', slot: 'hat', def: 'headwear/hats/athwart/hat_bicorne_athwart_basic', tier: 'fancy', colors: CLOTH },
  { id: 'foreaft_bicorne', name: 'Fore-and-aft bicorne', slot: 'hat', def: 'headwear/hats/foreaft/hat_bicorne_foreaft', tier: 'fancy', colors: CLOTH },
  { id: 'cavalier_hat', name: 'Cavalier hat', slot: 'hat', def: 'headwear/hats/caps/hat_cap_cavalier', tier: 'fancy', colors: CLOTH },
  { id: 'wide_brim_hat', name: 'Wide-brim hat', slot: 'hat', def: 'headwear/hats/magic/hat_magic_large', tier: 'fancy', colors: ['brown'] },
  { id: 'nasal_helm', name: 'Nasal helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_nasal', tier: 'fancy', colors: startingWith('steel', METAL) },
  { id: 'norman_helm', name: 'Norman helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_norman', tier: 'fancy', colors: startingWith('steel', METAL) },
  { id: 'elf_hat', name: 'Elf hat', slot: 'hat', def: 'headwear/hats/holiday/hat_holiday_elf', tier: 'fancy', colors: startingWith('green', CLOTH) },
  { id: 'christmas_hat', name: 'Christmas hat', slot: 'hat', def: 'headwear/hats/holiday/hat_holiday_christmas', tier: 'fancy', colors: startingWith('red', CLOTH) },
  { id: 'pirate_bandana', name: 'Pirate bandana', slot: 'hat', def: 'headwear/coverings/bandana/hat_bandana_pirate_skull', tier: 'fancy', colors: startingWith('red', CLOTH) },
  { id: 'top_hat', name: 'Top hat', slot: 'hat', def: 'headwear/hats/formal/hat_formal_tophat', tier: 'epic', colors: ['base', 'base_brown', ...CLOTH] },
  { id: 'santa_hat', name: 'Santa hat', slot: 'hat', def: 'headwear/hats/holiday/hat_holiday_santa', tier: 'epic', colors: startingWith('red', CLOTH) },
  { id: 'pirate_hat', name: 'Pirate captain hat', slot: 'hat', def: 'headwear/hats/athwart/hat_bicorne_athwart_captain_skull', tier: 'epic', colors: startingWith('charcoal', CLOTH) },
  { id: 'admiral_hat', name: 'Admiral hat', slot: 'hat', def: 'headwear/hats/athwart/hat_bicorne_athwart_admiral', tier: 'epic', colors: CLOTH },
  { id: 'commodore_hat', name: 'Commodore hat', slot: 'hat', def: 'headwear/hats/athwart/hat_bicorne_athwart_commodore', tier: 'epic', colors: CLOTH },
  { id: 'morion', name: 'Morion', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_morion', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'viking_helmet', name: 'Viking helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_spangenhelm_viking', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'horned_helmet', name: 'Horned helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_horned', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'legion_helmet', name: 'Legion helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_legion', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'gladiator_helmet', name: 'Gladiator helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_maximus', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'knight_helmet', name: 'Knight helmet', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_armet', tier: 'epic', colors: startingWith('steel', METAL) },
  { id: 'tiara', name: 'Tiara', slot: 'hat', def: 'headwear/hats/formal/hat_formal_tiara', tier: 'epic', colors: ['tiara_gold', 'tiara_silver', 'tiara_bronze', 'tiara_purple'] },
  { id: 'crown', name: 'Crown', slot: 'hat', def: 'headwear/hats/formal/hat_formal_crown', tier: 'legendary', colors: ['crown_gold', 'crown_red', 'crown_blue', 'crown_gray'] },
  { id: 'great_helm', name: 'Great helm', slot: 'hat', def: 'headwear/helmets/helmets/hat_helmet_greathelm', tier: 'legendary', colors: startingWith('steel', METAL) },
  { id: 'wizard_hat', name: 'Wizard hat', slot: 'hat', def: 'headwear/hats/magic/hat_magic_wizard', tier: 'legendary', colors: ['base_black', 'base_brown', 'base_gray', 'base_red', 'base_teal', 'base_yellow'] },
  { id: 'celestial_hat', name: 'Celestial hat', slot: 'hat', def: 'headwear/hats/magic/hat_magic_celestial_moon', tier: 'legendary', colors: CLOTH },
  { id: 'star_wizard_hat', name: 'Star wizard hat', slot: 'hat', def: 'headwear/hats/magic/hat_magic_celestial', tier: 'legendary', colors: CLOTH },

  // ------------------------------------------------------------ face
  { id: 'small_eyepatch', name: 'Small eyepatch', slot: 'face', def: 'headwear/accessories/eyepatch/facial_eyepatch_small_left', tier: 'cheap', colors: CLOTH },
  { id: 'earring', name: 'Earring', slot: 'face', def: 'headwear/accessories/earrings/facial_earring_left', tier: 'cheap', colors: ['base', ...METAL] },
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
  { id: 'ring_charm', name: 'Ring charm', slot: 'neck', def: 'headwear/neck/charms/neck_charm_ring', tier: 'fancy', colors: startingWith('steel', METAL), noSit: true, noCheer: true },
  { id: 'box_charm', name: 'Box charm', slot: 'neck', def: 'headwear/neck/charms/neck_charm_box', tier: 'fancy', colors: startingWith('steel', METAL), noSit: true, noCheer: true },
  { id: 'star_charm', name: 'Star charm', slot: 'neck', def: 'headwear/neck/charms/neck_charm_star', tier: 'fancy', colors: startingWith('steel', METAL), noSit: true, noCheer: true },
  { id: 'pearl_pendant', name: 'Pearl pendant', slot: 'neck', def: 'headwear/neck/charms/neck_gem_pearl', tier: 'epic', colors: GEM, noSit: true, noCheer: true },
  { id: 'round_gem', name: 'Round gem pendant', slot: 'neck', def: 'headwear/neck/charms/neck_gem_round', tier: 'epic', colors: GEM, noSit: true, noCheer: true },
  { id: 'square_gem', name: 'Square gem pendant', slot: 'neck', def: 'headwear/neck/charms/neck_gem_princess', tier: 'epic', colors: GEM, noSit: true, noCheer: true },
  { id: 'teardrop_gem', name: 'Teardrop gem pendant', slot: 'neck', def: 'headwear/neck/charms/neck_gem_pear', tier: 'epic', colors: GEM, noSit: true, noCheer: true },
  { id: 'star_amulet', name: 'Star amulet', slot: 'neck', def: 'headwear/neck/charms/neck_amulet_star', tier: 'legendary', colors: AMULET, noSit: true, noCheer: true },
  { id: 'cross_amulet', name: 'Cross amulet', slot: 'neck', def: 'headwear/neck/charms/neck_amulet_cross', tier: 'legendary', colors: AMULET, noSit: true, noCheer: true },
  { id: 'drop_amulet', name: 'Drop amulet', slot: 'neck', def: 'headwear/neck/charms/neck_amulet_dangle', tier: 'legendary', colors: AMULET, noSit: true, noCheer: true },
  { id: 'spider_amulet', name: 'Spider amulet', slot: 'neck', def: 'headwear/neck/charms/neck_amulet_spider', tier: 'legendary', colors: AMULET, noSit: true, noCheer: true },

  // ------------------------------------------------------------ dresses (replace top and bottom)
  { id: 'slit_dress', name: 'Slit dress', slot: 'dress', def: 'torso/dresses/dress_slit', tier: 'fancy', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },
  { id: 'bodice_dress', name: 'Bodice dress', slot: 'dress', def: 'torso/dresses/dress_bodice', tier: 'fancy', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },
  { id: 'sash_dress', name: 'Sash dress', slot: 'dress', def: 'torso/dresses/dress_sash', tier: 'epic', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },
  { id: 'kimono', name: 'Kimono', slot: 'dress', def: 'torso/dresses/kimono/dress_kimono', tier: 'epic', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },
  { id: 'split_kimono', name: 'Split kimono', slot: 'dress', def: 'torso/dresses/kimono/dress_kimono_split', tier: 'epic', colors: CLOTH, bodies: ['female'], noSit: true, noCheer: true },

  // ------------------------------------------------------------ back
  { id: 'cat_tail', name: 'Cat tail', slot: 'back', def: 'body/tails/tail_cat', tier: 'epic', colors: FUR },
  { id: 'fluffy_tail', name: 'Fluffy tail', slot: 'back', def: 'body/tails/tail_wolf_fluffy', tier: 'epic', colors: FUR },
  { id: 'tattered_cape', name: 'Tattered cape', slot: 'back', def: 'torso/cape/cape_tattered', tier: 'epic', colors: CLOTH, noSit: true, noCheer: true },
  { id: 'cape', name: 'Cape', slot: 'back', def: 'torso/cape/cape_solid', tier: 'epic', colors: CLOTH, noSit: true, noCheer: true },
  { id: 'trimmed_cape', name: 'Trimmed cape', slot: 'back', def: 'torso/cape/cape_trim', tier: 'legendary', colors: startingWith('brown', CLOTH), noSit: true, noCheer: true },
  { id: 'angel_wings', name: 'Angel wings', slot: 'back', def: 'body/wings/wings_feathered', tier: 'legendary', colors: WING },
  { id: 'bat_wings', name: 'Bat wings', slot: 'back', def: 'body/wings/wings_bat', tier: 'legendary', colors: WING },
];

export const itemById = (id: string): WardrobeItem | undefined => CATALOG.find((i) => i.id === id);

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
