/**
 * Builds the characters of the crowd games (Crowd Race, and the spy game) from the Universal LPC
 * Spritesheet Character Generator: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
 *
 *   npx tsx scripts/crowd-sprites.ts
 *
 * Each character is a list of items (body, head, hair, clothes...). The script reads each item's sheet
 * definition, downloads its sprite sheets, swaps its colors (LPC items are drawn in one base palette and
 * recolored), stacks the layers in their z order and keeps the animations the games use. Downloads are
 * cached in the system temp folder, so a second run is quick.
 *
 * Only art the games may use without sharing alike: every layer must have a credit line with OGA-BY,
 * CC0 or CC-BY among its licenses (the script stops otherwise). The credits go to CREDITS.txt.
 *
 * Output, in web/public/crowd/: one PNG per character, 64 px frames, 13 columns, the rows in ROWS below;
 * characters.json (rows, frame counts, the characters, where the feet and the body are in a frame);
 * CREDITS.txt.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

const REPO = 'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/';
const CACHE = join(tmpdir(), 'homeboard-lpc-cache');
const OUT = join(import.meta.dirname, '..', 'web', 'public', 'crowd');
const FRAME = 64;
const COLUMNS = 13;

/** Animations every layer must have */
const NEEDED = ['walk', 'run', 'idle', 'hurt', 'jump', 'emote', 'sit'] as const;
type Anim = (typeof NEEDED)[number];
/** Rows of an LPC sheet with four directions */
const DIR = { up: 0, left: 1, down: 2, right: 3 } as const;

type Face = 'happy' | 'closed';
/**
 * The rows of an output sheet. `dir`: the row of the LPC sheet (hurt has only one). `face`: an expression
 * drawn over the head. `last`: only the last frame (the dead body, eyes closed).
 */
const ROWS: { key: string; row: number; anim: Anim; dir: number; face?: Face; last?: boolean }[] = [
  { key: 'walk', row: 0, anim: 'walk', dir: DIR.right },
  { key: 'run', row: 1, anim: 'run', dir: DIR.right },
  { key: 'idleRight', row: 2, anim: 'idle', dir: DIR.right },
  { key: 'idleDown', row: 3, anim: 'idle', dir: DIR.down },
  { key: 'hurt', row: 4, anim: 'hurt', dir: 0 },
  { key: 'jump', row: 5, anim: 'jump', dir: DIR.down },
  { key: 'emote', row: 6, anim: 'emote', dir: DIR.down },
  { key: 'sit', row: 7, anim: 'sit', dir: DIR.down },
  { key: 'walkDown', row: 8, anim: 'walk', dir: DIR.down },
  { key: 'happy', row: 9, anim: 'idle', dir: DIR.down, face: 'happy' },
  { key: 'dead', row: 10, anim: 'hurt', dir: 0, face: 'closed', last: true },
  { key: 'walkUp', row: 11, anim: 'walk', dir: DIR.up },
  { key: 'walkLeft', row: 12, anim: 'walk', dir: DIR.left },
  { key: 'idleUp', row: 13, anim: 'idle', dir: DIR.up },
  { key: 'idleLeft', row: 14, anim: 'idle', dir: DIR.left },
];
const SHEET_ROWS = Math.max(...ROWS.map((r) => r.row)) + 1;

// ------------------------------------------------------------ the characters

type Body = 'male' | 'female';
/**
 * One item: its sheet definition (under sheet_definitions/, without .json) and its color. For an item
 * recolored from a palette, `color` is a variant of its material's palette (cloth: navy, red...; hair:
 * blonde...); for an item drawn in several files, it is the file's name. `eyes`: the eye color of a head.
 */
interface Item {
  def: string;
  color?: string;
  eyes?: string;
}
interface Character {
  file: string;
  name: string;
  body: Body;
  /** Skin: a variant of the body palette (light, amber, olive, taupe, bronze, brown, black) */
  skin: string;
  items: Item[];
}

const head = (body: Body, eyes = 'brown'): Item => ({ def: `head/heads/human/heads_human_${body}`, eyes });
const shoes = (color: string): Item => ({ def: 'feet/shoes/feet_shoes_basic', color });

/** The race: twelve people who look nothing alike */
const CROWD: Character[] = [
  { file: 'c00.png', name: 'Red t-shirt, blond hair', body: 'male', skin: 'light', items: [head('male', 'blue'), { def: 'hair/short/hair_plain', color: 'blonde' }, { def: 'torso/shirts/shortsleeve/torso_clothes_tshirt', color: 'red' }, { def: 'legs/pants/legs_pants2', color: 'navy' }, shoes('black')] },
  { file: 'c01.png', name: 'Green sweater, afro', body: 'male', skin: 'brown', items: [head('male'), { def: 'hair/afro/hair_afro', color: 'black' }, { def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2', color: 'forest' }, { def: 'legs/pants/legs_pants2', color: 'tan' }, shoes('brown')] },
  { file: 'c02.png', name: 'Yellow top, long red hair', body: 'female', skin: 'light', items: [head('female', 'green'), { def: 'hair/long/hair_long_straight', color: 'redhead' }, { def: 'torso/shirts/shortsleeve/torso_clothes_tshirt_scoop', color: 'yellow' }, { def: 'legs/leggings/legs_leggings', color: 'black' }, shoes('white')] },
  { file: 'c03.png', name: 'Gray cardigan, beard, glasses', body: 'male', skin: 'olive', items: [head('male'), { def: 'hair/bald/hair_buzzcut', color: 'dark_brown' }, { def: 'hair/beards/beards_trimmed', color: 'dark_brown' }, { def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_cardigan', color: 'gray' }, { def: 'legs/pants/legs_pants2', color: 'blue' }, shoes('black'), { def: 'headwear/accessories/glasses/facial_glasses', color: 'black' }] },
  { file: 'c04.png', name: 'Blue polo, black bob', body: 'female', skin: 'taupe', items: [head('female'), { def: 'hair/bob/hair_bob', color: 'black' }, { def: 'torso/shirts/shortsleeve/torso_clothes_shortsleeve_polo', color: 'blue' }, { def: 'legs/shorts/legs_shorts', color: 'tan' }, shoes('white')] },
  { file: 'c05.png', name: 'Orange tank top, curly hair', body: 'male', skin: 'bronze', items: [head('male'), { def: 'hair/curly/hair_curly_short', color: 'black' }, { def: 'torso/shirts/sleeveless/torso_clothes_sleeveless2', color: 'orange' }, { def: 'legs/shorts/legs_shorts', color: 'navy' }, shoes('brown')] },
  { file: 'c06.png', name: 'Purple top, blond hair half up', body: 'female', skin: 'light', items: [head('female', 'blue'), { def: 'hair/braids/hair_half_up', color: 'blonde' }, { def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_scoop', color: 'purple' }, { def: 'legs/pants/legs_pants2', color: 'charcoal' }, shoes('black')] },
  { file: 'c07.png', name: 'White shirt, suspenders, mustache', body: 'male', skin: 'light', items: [head('male'), { def: 'hair/short/hair_parted3', color: 'chestnut' }, { def: 'hair/mustaches/beards_chevron', color: 'chestnut' }, { def: 'torso/shirts/shortsleeve/torso_clothes_tshirt_buttoned', color: 'white' }, { def: 'torso/aprons/torso_aprons_suspenders', color: 'black' }, { def: 'legs/pants/legs_pants2', color: 'charcoal' }, shoes('black')] },
  { file: 'c08.png', name: 'Teal v-neck, red hat', body: 'male', skin: 'black', items: [head('male'), { def: 'hair/bald/hair_buzzcut', color: 'black' }, { def: 'headwear/hats/caps/hat_cap_leather', color: 'red' }, { def: 'torso/shirts/shortsleeve/torso_clothes_tshirt_vneck', color: 'teal' }, { def: 'legs/pants/legs_pants2', color: 'gray' }, shoes('white')] },
  { file: 'c09.png', name: 'Pink cardigan, long wavy hair', body: 'female', skin: 'brown', items: [head('female'), { def: 'hair/long/hair_wavy', color: 'dark_brown' }, { def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_cardigan', color: 'pink' }, { def: 'legs/leggings/legs_leggings', color: 'navy' }, shoes('brown')] },
  { file: 'c10.png', name: 'Blue overalls, ginger beard', body: 'male', skin: 'light', items: [head('male', 'green'), { def: 'hair/curly/hair_curly_short', color: 'ginger' }, { def: 'hair/beards/beards_medium', color: 'ginger' }, { def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2', color: 'white' }, { def: 'torso/aprons/torso_aprons_overalls', color: 'blue' }, shoes('brown')] },
  { file: 'c11.png', name: 'Green polo, gray hair, glasses', body: 'male', skin: 'amber', items: [head('male'), { def: 'hair/bald/hair_balding', color: 'gray' }, { def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_polo', color: 'green' }, { def: 'legs/pants/legs_pants2', color: 'tan' }, shoes('black'), { def: 'headwear/accessories/glasses/facial_glasses', color: 'brown' }] },
];

/** The spy game: the same person in the same clothes, only the jacket's color changes */
const SUIT_COLORS: { color: string; name: string }[] = [
  { color: 'charcoal', name: 'Charcoal suit' },
  { color: 'navy', name: 'Navy suit' },
  { color: 'maroon', name: 'Burgundy suit' },
  { color: 'forest', name: 'Forest green suit' },
  { color: 'tan', name: 'Tan suit' },
  { color: 'gray', name: 'Light gray suit' },
];
const SUITS: Character[] = SUIT_COLORS.map((s, i) => ({
  file: `s${String(i).padStart(2, '0')}.png`,
  name: s.name,
  body: 'male',
  skin: 'light',
  items: [
    head('male'),
    { def: 'hair/short/hair_parted3', color: 'dark_brown' },
    { def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_cardigan', color: s.color },
    { def: 'headwear/neck/neck_bowtie2', color: 'black' },
    // Long pants: the formal ones are drawn in their own colors and cannot be recolored
    { def: 'legs/pants/legs_pants2', color: 'black' },
    shoes('black'),
  ],
}));

// ------------------------------------------------------------ downloads

/** A file of the generator's repository, from the cache or downloaded (null: it does not exist) */
async function fetchRepo(path: string): Promise<Buffer | null> {
  const file = join(CACHE, path);
  const missing = `${file}.missing`;
  if (existsSync(file)) return readFileSync(file);
  if (existsSync(missing)) return null;
  mkdirSync(dirname(file), { recursive: true });
  const res = await fetch(REPO + path.split('/').map(encodeURIComponent).join('/'));
  if (res.status === 404) {
    writeFileSync(missing, '');
    return null;
  }
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}

async function json(path: string): Promise<any> {
  const buf = await fetchRepo(path);
  if (!buf) throw new Error(`Missing ${path}`);
  return JSON.parse(buf.toString('utf8'));
}

async function image(path: string): Promise<PNG | null> {
  const buf = await fetchRepo(path);
  return buf ? PNG.sync.read(buf) : null;
}

// ------------------------------------------------------------ colors

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** The Universal LPC palettes of a material (body, cloth, hair, eye...), and its base: the colors the art is drawn in */
async function palettes(material: string): Promise<{ base: string; colors: Record<string, string[]> }> {
  const meta = await json(`palette_definitions/${material}/meta_${material}.json`);
  return { base: meta.base, colors: await json(`palette_definitions/${material}/${material}_ulpc.json`) };
}

/** Color swaps of one layer: each color of the base palette to the same shade of the chosen one */
type Swap = { from: Rgb; to: Rgb }[];
async function swapFor(recolor: { material: string; base?: string }, target: string): Promise<Swap> {
  const p = await palettes(recolor.material);
  const from = p.colors[recolor.base ?? p.base];
  const to = p.colors[target];
  if (!from || !to) throw new Error(`No ${recolor.material} color "${target}" (or base "${recolor.base ?? p.base}")`);
  return from.map((c, i) => ({ from: rgb(c), to: rgb(to[Math.min(i, to.length - 1)]) }));
}

/**
 * Swap the colors of an image, in place. A color within 1 of a base color counts as that color.
 * Returns the share of its pixels that were swapped (an item drawn in other colors cannot be recolored).
 */
function recolor(png: PNG, swaps: Swap[]): number {
  const d = png.data;
  let seen = 0;
  let hits = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    seen++;
    for (const swap of swaps) {
      const hit = swap.find((s) => Math.abs(d[i] - s.from[0]) <= 1 && Math.abs(d[i + 1] - s.from[1]) <= 1 && Math.abs(d[i + 2] - s.from[2]) <= 1);
      if (!hit) continue;
      [d[i], d[i + 1], d[i + 2]] = hit.to;
      hits++;
      break;
    }
  }
  return seen ? hits / seen : 1;
}

// ------------------------------------------------------------ layers and credits

const OK_LICENSE = /^(CC0|OGA-BY|CC-BY)( \d(\.\d)?)?$/;
/** Best license to credit a layer under, from the most to the least free */
const pickLicense = (licenses: string[]) =>
  licenses.find((l) => l.startsWith('CC0')) ?? licenses.find((l) => l.startsWith('OGA-BY')) ?? licenses.find((l) => OK_LICENSE.test(l));

/** Credits of the layers used, by folder */
const credits = new Map<string, { authors: string[]; license: string; urls: string[]; notes?: string }>();

/** One drawn layer of an item: where its sheets are, its z order, how to color it */
interface Layer {
  zPos: number;
  /** Folder of the sheets: <dir><anim>.png, or <dir><anim>/<variant>.png */
  dir: string;
  variant?: string;
  swaps: Swap[];
}

/** The layers of an item for this body, with their colors, checking every animation and license */
async function layersOf(item: Item, c: Character): Promise<Layer[]> {
  const def = await json(`sheet_definitions/${item.def}.json`);
  const missing = NEEDED.filter((a) => !def.animations?.includes(a));
  if (missing.length) throw new Error(`${item.def} has no ${missing.join(', ')}`);

  // Colors: a palette swap (one material, or one per color of the item), or a file per color
  const swaps: Swap[] = [];
  let variant: string | undefined;
  const rc = def.recolors;
  if (rc?.material) {
    swaps.push(await swapFor(rc, rc.material === 'body' ? c.skin : item.color!));
  } else if (rc?.color_1) {
    for (const [key, r] of Object.entries<any>(rc)) {
      if (!key.startsWith('color_')) continue;
      const target = r.material === 'body' ? c.skin : r.material === 'eye' ? (item.eyes ?? 'brown') : item.color;
      if (target) swaps.push(await swapFor(r, target));
    }
  } else if (def.variants?.length) {
    if (!item.color || !def.variants.includes(item.color)) throw new Error(`${item.def}: pick one of ${def.variants.join(', ')}`);
    variant = item.color;
  }

  const out: Layer[] = [];
  for (const key of Object.keys(def).filter((k) => /^layer_\d+$/.test(k))) {
    const l = def[key];
    const raw: string | undefined = l[c.body];
    if (!raw) throw new Error(`${item.def} has no ${c.body} version`);
    const dir = raw.replace('${head}', c.body);
    checkLicense(item.def, def, dir);
    out.push({ zPos: l.zPos, dir, variant, swaps });
  }
  return out;
}

/** The credit lines that cover this folder must allow it; they are kept for CREDITS.txt */
function checkLicense(name: string, def: any, dir: string): void {
  const path = dir.replace(/\/$/, '');
  const lines = (def.credits ?? []).filter((cr: any) => path.startsWith(String(cr.file).replace(/\/$/, '').replace(/\.png$/, '')) || String(cr.file).startsWith(path));
  if (!lines.length) throw new Error(`${name}: no credit line for ${path}`);
  for (const cr of lines) {
    const license = pickLicense(cr.licenses ?? []);
    if (!license) throw new Error(`${name}: ${cr.file} is only ${(cr.licenses ?? []).join(', ')}`);
    credits.set(cr.file, { authors: cr.authors ?? [], license, urls: cr.urls ?? [], notes: cr.notes });
  }
}

/** The face drawn over the head for the happy and dead rows */
async function faceLayer(face: Face, c: Character): Promise<Layer> {
  const def = await json(`sheet_definitions/head/faces/face_${face}.json`);
  const dir = String(def.layer_1[c.body]).replace('${head}', c.body);
  checkLicense(`face ${face}`, def, dir);
  return { zPos: def.layer_1.zPos, dir, swaps: [await swapFor(def.recolors.material ? def.recolors : def.recolors.color_1, c.skin)] };
}

/** One animation of a layer, colored (null: the layer has no sheet for it) */
async function sheet(layer: Layer, anim: Anim): Promise<PNG | null> {
  const png = await image(`spritesheets/${layer.dir}${anim}${layer.variant ? `/${layer.variant}` : ''}.png`);
  // A layer drawn in other colors than its palette's base keeps them: say so, it would look wrong
  if (png && layer.swaps.length && recolor(png, layer.swaps) < 0.5) console.warn(`  ${layer.dir}${anim}: most of its colors are not in its palette`);
  return png;
}

/** Draw `src` over `dst` (straight alpha) */
function over(dst: PNG, dx: number, dy: number, src: PNG, sx: number, sy: number, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((sy + y) * src.width + sx + x) * 4;
      const a = src.data[si + 3] / 255;
      if (!a) continue;
      const di = ((dy + y) * dst.width + dx + x) * 4;
      const b = dst.data[di + 3] / 255;
      const out = a + b * (1 - a);
      for (let k = 0; k < 3; k++) dst.data[di + k] = Math.round((src.data[si + k] * a + dst.data[di + k] * b * (1 - a)) / out);
      dst.data[di + 3] = Math.round(out * 255);
    }
  }
}

const emptyCell = (png: PNG, col: number, row: number) => {
  for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) if (png.data[((row * FRAME + y) * png.width + col * FRAME + x) * 4 + 3]) return false;
  return true;
};

// ------------------------------------------------------------ build

async function build(c: Character): Promise<PNG> {
  const layers = (await Promise.all([{ def: 'body/body' } as Item, ...c.items].map((it) => layersOf(it, c)))).flat();
  const out = new PNG({ width: FRAME * COLUMNS, height: FRAME * SHEET_ROWS });
  for (const r of ROWS) {
    const stack = [...layers];
    if (r.face) stack.push(await faceLayer(r.face, c));
    stack.sort((a, b) => a.zPos - b.zPos);
    const loaded = await Promise.all(stack.map((l) => sheet(l, r.anim)));
    loaded.forEach((s, i) => s || console.warn(`  ${c.file}: no ${r.anim} sheet in ${stack[i].dir}`));
    const sheets = loaded.filter((s): s is PNG => !!s);
    const width = sheets[0].width;
    const frames = Math.min(COLUMNS, width / FRAME);
    const first = r.last ? frames - 1 : 0;
    for (let f = first; f < frames; f++) {
      for (const s of sheets) {
        if (s.height < (r.dir + 1) * FRAME) continue;
        over(out, (f - first) * FRAME, r.row * FRAME, s, f * FRAME, r.dir * FRAME, FRAME, FRAME);
      }
    }
  }
  return out;
}

/** Where the character stands in a frame: its feet, the top of its head, and its sides */
function measure(png: PNG, row: number) {
  let top = FRAME;
  let bottom = 0;
  let left = FRAME;
  let right = 0;
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      if (png.data[((row * FRAME + y) * png.width + x) * 4 + 3] < 128) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return { feet: bottom, body: { top, left, right } };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sheets = new Map<string, PNG>();
  for (const c of [...CROWD, ...SUITS]) {
    const png = await build(c);
    writeFileSync(join(OUT, c.file), PNG.sync.write(png));
    sheets.set(c.file, png);
    console.log(`${c.file}  ${c.name}`);
  }

  // Frame counts from the first character's sheet (every row of every character has the same)
  const first = sheets.get(CROWD[0].file)!;
  const rows: Record<string, { row: number; frames: number }> = {};
  for (const r of ROWS) {
    let frames = 0;
    while (frames < COLUMNS && !emptyCell(first, frames, r.row)) frames++;
    rows[r.key] = { row: r.row, frames };
  }
  const where = measure(first, 0);
  const info = {
    frame: FRAME,
    rows,
    characters: CROWD.map((c) => ({ file: c.file, name: c.name })),
    suits: SUITS.map((c) => ({ file: c.file, name: c.name })),
    feet: where.feet,
    body: where.body,
  };
  writeFileSync(join(OUT, 'characters.json'), `${JSON.stringify(info, null, 2)}\n`);

  // Credits: every layer used, then the short statement the generator asks for. Its README's own
  // example names CC-BY-SA, which is not the license used here, so the statement lists our authors.
  const authors = [...new Set([...credits.values()].flatMap((cr) => cr.authors))].sort((a, b) => a.localeCompare(b));
  const lines = [
    'Characters of the crowd games, made with the Universal LPC Spritesheet Character Generator',
    'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator',
    'Built by scripts/crowd-sprites.ts. Each layer below is used under the license named on its line.',
    '',
    ...[...credits.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([file, cr]) => [
        `${file}`,
        `  License: ${cr.license}`,
        `  Authors: ${cr.authors.join(', ')}`,
        ...(cr.notes ? [`  Notes: ${cr.notes}`] : []),
        ...cr.urls.map((u) => `  ${u}`),
        '',
      ]),
    `Sprites by: ${authors.join(', ')}`,
    'Sprites contributed as part of the Liberated Pixel Cup project from OpenGameArt.org: http://opengameart.org/content/lpc-collection',
    'Detailed credits: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/CREDITS.csv',
    '',
  ];
  writeFileSync(join(OUT, 'CREDITS.txt'), lines.join('\n'));
  console.log(JSON.stringify(rows), JSON.stringify(where));
}

await main();
