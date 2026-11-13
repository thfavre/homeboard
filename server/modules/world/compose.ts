import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { BEARDS, DEFAULT_CHOICES, HAIR_STYLES, type AvatarChoices, type SheetInfo } from '../../../shared/world.ts';
import { SLOTS, costumeOf, itemById, piecesOf, splitColor, type Outfit } from '../../../shared/wardrobe.ts';
import type { LpcFiles } from './lpc.ts';

/**
 * Composites a guest's avatar into one sprite sheet, the same way scripts/crowd-sprites.ts builds
 * the crowd game characters (same rows, so the TV can draw both with the same code): each item's
 * layers are recolored from their palette and stacked in z order, one animation per row.
 *
 * Differences from the build script: art comes through LpcFiles (local pack or cached fetches),
 * a layer without a sheet for an animation is skipped instead of refused (the body always has
 * them all), and CC-BY-SA is accepted: the generated sheets are art, not code, and they stay in
 * the data folder with their credits (data/modules/world/avatars/CREDITS.txt).
 */

const FRAME = 64;
const COLUMNS = 13;

type Anim = 'walk' | 'run' | 'idle' | 'hurt' | 'jump' | 'emote' | 'sit';
const DIR = { up: 0, left: 1, down: 2, right: 3 } as const;
type Face = 'happy' | 'closed';

/** The rows of an output sheet, identical to scripts/crowd-sprites.ts (the TV reuses its renderer) */
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
  // The town only. Kneeling with the back to us; then the ceremony in the throne room: seated
  // facing left (the King on the throne, seen from the side), kneeling toward the throne, and both
  // hands up facing left (the King opening the court)
  { key: 'sitUp', row: 15, anim: 'sit', dir: DIR.up },
  { key: 'sitLeft', row: 16, anim: 'sit', dir: DIR.left },
  { key: 'sitRight', row: 17, anim: 'sit', dir: DIR.right },
  { key: 'emoteLeft', row: 18, anim: 'emote', dir: DIR.left },
];
/** Every row key: a sheet measured without one of them was made before it existed and is redrawn */
export const ROW_KEYS = ROWS.map((r) => r.key);
const SHEET_ROWS = Math.max(...ROWS.map((r) => r.row)) + 1;

/** One item of an avatar: a sheet definition, its color, the eye color for heads */
interface Item {
  def: string;
  color?: string;
  eyes?: string;
}

/**
 * The items a guest's choices and outfit stand for. Basic white shoes stay on bare feet (the white
 * shorts and the bra are pieces every guest owns, see starterPieces); a dress covers the bottom slot too. A costume
 * head is drawn instead of the guest's own head, and takes their hair and beard off unless it is
 * drawn to wear them.
 */
function itemsOf(c: AvatarChoices, outfit: Outfit): Item[] {
  const costume = costumeOf(outfit);
  const items: Item[] = costume ? [] : [{ def: `head/heads/human/heads_human_${c.body}`, eyes: c.eyes }];
  if (!outfit.feet) items.push({ def: 'feet/shoes/feet_shoes_basic', color: 'white' });
  for (const worn of Object.values(outfit)) {
    const item = itemById(worn.id);
    if (item) items.push(...piecesOf(item, worn.color));
  }
  if (costume && !costume.item.head?.keepHair) return items;
  const hair = HAIR_STYLES.find((h) => h.id === c.hair)?.def;
  if (hair) items.push({ def: hair, color: c.hairColor });
  const beard = BEARDS.find((b) => b.id === c.beard)?.def;
  if (beard) items.push({ def: beard, color: c.hairColor });
  return items;
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

type Swap = { from: Rgb; to: Rgb }[];

interface Layer {
  zPos: number;
  dir: string;
  variant?: string;
  swaps: Swap[];
  /** The skin itself: its sheets set how many frames an animation really has */
  body?: boolean;
}

export interface Composed {
  png: Buffer;
  info: SheetInfo;
}

const OK_LICENSE = /^(CC0|OGA-BY|CC-BY|CC-BY-SA)( \d(\.\d)?)?$/;
const pickLicense = (licenses: string[]) =>
  licenses.find((l) => l.startsWith('CC0')) ??
  licenses.find((l) => l.startsWith('OGA-BY')) ??
  licenses.find((l) => /^CC-BY( |$)/.test(l)) ??
  licenses.find((l) => OK_LICENSE.test(l));

export class Composer {
  private defs = new Map<string, Promise<any>>();
  private palettes = new Map<string, Promise<{ base: string; colors: Record<string, string[]> }>>();
  /** Credit lines of every layer ever used, kept by the module next to the sheets */
  credits = new Map<string, { authors: string[]; license: string; urls: string[]; notes?: string }>();

  constructor(private files: LpcFiles) {}

  private async json(path: string): Promise<any> {
    let p = this.defs.get(path);
    if (!p) {
      p = this.files.read(path).then((buf) => {
        if (!buf) throw new Error(`Missing ${path}`);
        return JSON.parse(buf.toString('utf8'));
      });
      this.defs.set(path, p);
      p.catch(() => this.defs.delete(path));
    }
    return p;
  }

  private async image(path: string): Promise<PNG | null> {
    const buf = await this.files.read(path);
    return buf ? PNG.sync.read(buf) : null;
  }

  /** The palettes of a material (body, cloth, hair, eye) and the base the art is drawn in; `set` is
   *  the palette file (ulpc, or lpcr for art drawn in its ramps) */
  private async palette(material: string, set = 'ulpc'): Promise<{ base: string; colors: Record<string, string[]> }> {
    const key = `${material}_${set}`;
    let p = this.palettes.get(key);
    if (!p) {
      p = (async () => {
        const meta = await this.json(`palette_definitions/${material}/meta_${material}.json`);
        return { base: meta.base, colors: await this.json(`palette_definitions/${material}/${material}_${set}.json`) };
      })();
      this.palettes.set(key, p);
      p.catch(() => this.palettes.delete(key));
    }
    return p;
  }

  /**
   * The color swap from the art's own ramp to the target color. The base may name its palette
   * ("ulpc.fur_brown", "lpcr.ivory"); a target missing from the material's palette is looked up in the other
   * materials the art allows (pauldrons drawn in cloth, worn in steel: "metal.ulpc").
   */
  private async swapFor(recolor: { material: string; base?: string; palettes?: string[] }, target: string): Promise<Swap> {
    const p = await this.palette(recolor.material);
    const [set, base] = /^(ulpc|lpcr)\.(.+)$/.exec(recolor.base ?? '')?.slice(1) ?? ['ulpc', recolor.base ?? p.base];
    const from = (await this.palette(recolor.material, set)).colors[base];
    let to = p.colors[target];
    for (const other of recolor.palettes ?? []) {
      if (to) break;
      const m = /^(\w+)\.ulpc$/.exec(other);
      if (m) to = (await this.palette(m[1])).colors[target];
    }
    if (!from || !to) throw new Error(`No ${recolor.material} color "${target}"`);
    return from.map((c, i) => ({ from: rgb(c), to: rgb(to[Math.min(i, to.length - 1)]) }));
  }

  /**
   * The drawn layers of one item for this body, with their color swaps. A two-color id
   * ("leather+steel") gives art drawn in two materials one color each, in order; anything else
   * takes the first color.
   */
  private async layersOf(item: Item, c: AvatarChoices): Promise<Layer[]> {
    const def = await this.json(`sheet_definitions/${item.def}.json`);
    const swaps: Swap[] = [];
    let variant: string | undefined;
    const rc = def.recolors;
    const [main, accent] = item.color ? splitColor(item.color) : [undefined, undefined];
    if (rc?.material) {
      // Art drawn in skin takes the wearer's skin, unless the piece names a tone (horns of bone)
      swaps.push(await this.swapFor(rc, rc.material === 'body' ? (main && main !== 'skin' ? main : c.skin) : main!));
    } else if (rc?.color_1) {
      let n = 0;
      for (const [key, r] of Object.entries<any>(rc)) {
        if (!key.startsWith('color_')) continue;
        const target = r.material === 'body' ? c.skin : r.material === 'eye' ? (item.eyes ?? 'brown') : n++ === 0 ? main : (accent ?? main);
        if (target) swaps.push(await this.swapFor(r, target));
      }
    } else if (def.variants?.length) {
      variant = main && def.variants.includes(main) ? main : def.variants[0];
    }

    const out: Layer[] = [];
    for (const key of Object.keys(def).filter((k) => /^layer_\d+$/.test(k))) {
      const l = def[key];
      const raw: string | undefined = l[c.body];
      if (!raw) continue;
      const dir = raw.replace('${head}', c.body);
      this.collectCredits(def, dir);
      out.push({ zPos: l.zPos, dir, variant, swaps, body: item.def === 'body/body' });
    }
    if (!out.length) throw new Error(`${item.def} has no ${c.body} version`);
    return out;
  }

  /** Keep the credit lines that cover this folder; a layer with none, or none we may use, is refused */
  private collectCredits(def: any, dir: string): void {
    const path = dir.replace(/\/$/, '');
    const lines = (def.credits ?? []).filter(
      (cr: any) => path.startsWith(String(cr.file).replace(/\/$/, '').replace(/\.png$/, '')) || String(cr.file).startsWith(path),
    );
    if (!lines.length) throw new Error(`${def.name}: no credit line for ${path}`);
    for (const cr of lines) {
      const license = pickLicense(cr.licenses ?? []);
      if (!license) throw new Error(`${def.name}: ${cr.file} is only ${(cr.licenses ?? []).join(', ')}`);
      this.credits.set(cr.file, { authors: cr.authors ?? [], license, urls: cr.urls ?? [], notes: cr.notes });
    }
  }

  private async faceLayer(face: Face, c: AvatarChoices): Promise<Layer> {
    const def = await this.json(`sheet_definitions/head/faces/face_${face}.json`);
    const dir = String(def.layer_1[c.body]).replace('${head}', c.body);
    this.collectCredits(def, dir);
    return { zPos: def.layer_1.zPos, dir, swaps: [await this.swapFor(def.recolors.material ? def.recolors : def.recolors.color_1, c.skin)] };
  }

  /**
   * One animation of a layer, colored (null: the layer has no sheet for it; it is left out). Art
   * drawn only walking (butterfly wings) stands in the first walking frame.
   */
  private async sheet(layer: Layer, anim: Anim): Promise<PNG | null> {
    const file = (a: Anim) => `spritesheets/${layer.dir}${a}${layer.variant ? `/${layer.variant}` : ''}.png`;
    let png = await this.image(file(anim));
    if (!png && anim === 'idle') {
      const walk = await this.image(file('walk'));
      if (walk) {
        png = new PNG({ width: FRAME * COLUMNS, height: walk.height });
        for (let f = 0; f < COLUMNS; f++) over(png, f * FRAME, 0, walk, 0, 0, FRAME, walk.height);
      }
    }
    if (png && layer.swaps.length) recolor(png, layer.swaps);
    return png;
  }

  /** Build the whole sheet of an avatar */
  async build(choices: AvatarChoices, outfit: Outfit = {}): Promise<Composed> {
    // A costume head of skin colors colors the whole body; its own face stays as drawn (the happy
    // and closed-eye faces are drawn for human heads)
    const costume = costumeOf(outfit);
    const c = costume?.item.head?.skin ? { ...choices, skin: splitColor(costume.color)[0] } : choices;
    const layers = (await Promise.all([{ def: 'body/body' } as Item, ...itemsOf(c, outfit)].map((it) => this.layersOf(it, c)))).flat();
    const out = new PNG({ width: FRAME * COLUMNS, height: FRAME * SHEET_ROWS });
    for (const r of ROWS) {
      const stack = [...layers];
      if (r.face && !costume) stack.push(await this.faceLayer(r.face, c));
      stack.sort((a, b) => a.zPos - b.zPos);
      const loaded = await Promise.all(stack.map((l) => this.sheet(l, r.anim)));
      const sheets = loaded.filter((s): s is PNG => !!s);
      if (!sheets.length) continue;
      // The body sets the frame count: an item with extra frames would otherwise float on its own
      const bodySheet = loaded.find((s, i) => s && stack[i].body) ?? sheets[0];
      const frames = Math.min(COLUMNS, bodySheet.width / FRAME);
      const first = r.last ? frames - 1 : 0;
      for (let f = first; f < frames; f++) {
        for (const s of sheets) {
          if (s.height < (r.dir + 1) * FRAME || s.width < (f + 1) * FRAME) continue;
          over(out, (f - first) * FRAME, r.row * FRAME, s, f * FRAME, r.dir * FRAME, FRAME, FRAME);
        }
      }
    }
    return { png: PNG.sync.write(out), info: this.measure(out) };
  }

  /**
   * A small picture of one item alone (no body) for the shop's grid: the down-facing idle frame
   * of its layers (the item's pieces: see piecesOf), trimmed to the drawn pixels and centered in
   * a square. `skin` colors art drawn in skin (a costume head).
   */
  async icon(pieces: Item[], body: 'male' | 'female', skin?: string): Promise<Buffer> {
    const c: AvatarChoices = { ...DEFAULT_CHOICES, body, ...(skin ? { skin } : {}) };
    const layers = (await Promise.all(pieces.map((p) => this.layersOf(p, c)))).flat().sort((a, b) => a.zPos - b.zPos);
    const flat = new PNG({ width: FRAME, height: FRAME });
    for (const layer of layers) {
      const png = (await this.sheet(layer, 'idle')) ?? (await this.sheet(layer, 'walk'));
      if (!png || png.height < (DIR.down + 1) * FRAME || png.width < FRAME) continue;
      over(flat, 0, 0, png, 0, DIR.down * FRAME, FRAME, FRAME);
    }
    let top = FRAME;
    let bottom = -1;
    let left = FRAME;
    let right = -1;
    for (let y = 0; y < FRAME; y++) {
      for (let x = 0; x < FRAME; x++) {
        if (!flat.data[(y * FRAME + x) * 4 + 3]) continue;
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    if (bottom < 0) return PNG.sync.write(flat);
    const size = Math.max(bottom - top, right - left) + 5;
    const out = new PNG({ width: size, height: size });
    over(out, Math.floor((size - (right - left + 1)) / 2), Math.floor((size - (bottom - top + 1)) / 2), flat, left, top, right - left + 1, bottom - top + 1);
    return PNG.sync.write(out);
  }

  /** Rows, frame counts and where the body stands, read off the finished sheet */
  private measure(png: PNG): SheetInfo {
    const emptyCell = (col: number, row: number) => {
      for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) if (png.data[((row * FRAME + y) * png.width + col * FRAME + x) * 4 + 3]) return false;
      return true;
    };
    const rows: SheetInfo['rows'] = {};
    for (const r of ROWS) {
      let frames = 0;
      while (frames < COLUMNS && !emptyCell(frames, r.row)) frames++;
      rows[r.key] = { row: r.row, frames };
    }
    let top = FRAME;
    let bottom = 0;
    let left = FRAME;
    let right = 0;
    for (let y = 0; y < FRAME; y++) {
      for (let x = 0; x < FRAME; x++) {
        if (png.data[(y * png.width + x) * 4 + 3] < 128) continue;
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    return { frame: FRAME, rows, feet: bottom, body: { top, left, right } };
  }

  /** The credits of everything used so far, ready to write next to the sheets */
  creditsText(): string {
    const authors = [...new Set([...this.credits.values()].flatMap((cr) => cr.authors))].sort((a, b) => a.localeCompare(b));
    return [
      'Avatar sheets of the Homeboard world, made with the Universal LPC Spritesheet Character Generator',
      'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator',
      'Each layer below is used under the license named on its line; sheets using CC-BY-SA layers are CC-BY-SA.',
      '',
      ...[...this.credits.entries()]
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
      'Sprites contributed as part of the Liberated Pixel Cup project: http://opengameart.org/content/lpc-collection',
      '',
    ].join('\n');
  }
}

/** A stable name for a look (choices plus outfit, with the layers each piece draws), for the sheet's file name */
export function choicesHash(c: AvatarChoices, outfit: Outfit = {}): string {
  const worn = SLOTS.map((s) => outfit[s.id]).map((w) => {
    const item = w && itemById(w.id);
    return w ? [w.id, w.color, ...(item ? piecesOf(item, w.color) : [])] : null;
  });
  // Empty slots past the first eight (the slots added later) are left out, so adding a slot keeps
  // the names of the sheets already drawn
  while (worn.length > 8 && worn[worn.length - 1] === null) worn.pop();
  // Bare legs (shorts that are a piece now, not drawn under every empty slot) get a new name
  const bare = !outfit.bottom && !outfit.dress ? ['bare'] : [];
  // The bra was redrawn (straps that reach the band, no shoulder caps): looks wearing it get a new name
  const redrawn = outfit.top?.id === 'bra' ? ['bra2'] : [];
  return createHash('sha1').update(JSON.stringify([c.body, c.skin, c.hair, c.hairColor, c.beard, c.eyes, worn, ...bare, ...redrawn])).digest('hex').slice(0, 12);
}

/** Swap the colors of an image in place (a color within 1 of a base color counts as that color) */
function recolor(png: PNG, swaps: Swap[]): void {
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    for (const swap of swaps) {
      const hit = swap.find((s) => Math.abs(d[i] - s.from[0]) <= 1 && Math.abs(d[i + 1] - s.from[1]) <= 1 && Math.abs(d[i + 2] - s.from[2]) <= 1);
      if (!hit) continue;
      [d[i], d[i + 1], d[i + 2]] = hit.to;
      break;
    }
  }
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
      const outA = a + b * (1 - a);
      for (let k = 0; k < 3; k++) dst.data[di + k] = Math.round((src.data[si + k] * a + dst.data[di + k] * b * (1 - a)) / outA);
      dst.data[di + 3] = Math.round(outA * 255);
    }
  }
}
