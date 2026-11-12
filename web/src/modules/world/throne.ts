import { BODY, FRAME_PX, SPRITE_SCALE } from '$shared/crowd.ts';
import { THRONE, THRONE_CARPET, type SheetInfo } from '$shared/world.ts';

/**
 * The King's corner of the square on the TV: the throne (LPC Revised art, web/public/crowd/env, see
 * its CREDITS.txt) on a royal carpet, the faithful kneeling before it, and the King's golden
 * nametag with a crown.
 */

const S = SPRITE_SCALE;
/** The throne with the golden cushion, front view (its sheet has every color, front, back and sides) */
const THRONE_CUT = [0, 0, 32, 64] as const;
/** The purple carpet: 3 x 3 tiles of 32 px (corners, edges, the middle) */
const CARPET_AT = { x: 0, y: 96 };
const TILE = 32;

export interface ThroneArt {
  throne: HTMLImageElement;
  carpet: HTMLImageElement;
}

let loading: Promise<ThroneArt | null> | null = null;

/** Load the throne and the carpet once (null: they cannot be, the square has no throne) */
export function loadThrone(): Promise<ThroneArt | null> {
  const load = (f: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(f));
      img.src = `/crowd/env/${f}.png`;
    });
  loading ??= Promise.all([load('throne'), load('carpet')])
    .then(([throne, carpet]) => ({ throne, carpet }))
    .catch(() => null);
  return loading;
}

/** The carpet on the ground (drawn once, into the ground picture, world units) */
export function drawCarpet(g: CanvasRenderingContext2D, art: ThroneArt): void {
  const { tilesW, tilesH, y0 } = THRONE_CARPET;
  const x0 = Math.round(THRONE_CARPET.x - (tilesW * TILE * S) / 2);
  const size = Math.ceil(TILE * S);
  for (let ty = 0; ty < tilesH; ty++) {
    for (let tx = 0; tx < tilesW; tx++) {
      // Which of the 3 x 3 tiles: the corners and edges on the rim, the middle inside
      const col = tx === 0 ? 0 : tx === tilesW - 1 ? 2 : 1;
      const row = ty === 0 ? 0 : ty === tilesH - 1 ? 2 : 1;
      const dx = Math.round(x0 + tx * TILE * S);
      const dy = Math.round(y0 + ty * TILE * S);
      g.drawImage(art.carpet, CARPET_AT.x + col * TILE, CARPET_AT.y + row * TILE, TILE, TILE, dx, dy, size, size);
    }
  }
}

/** The throne, drawn in depth order with the characters (the King sits just in front of it) */
export function throneProp(art: ThroneArt): { y: number; draw(g: CanvasRenderingContext2D): void } {
  const [cx, cy, cw, ch] = THRONE_CUT;
  const w = cw * S;
  const h = ch * S;
  return {
    y: THRONE.y,
    draw: (g) => g.drawImage(art.throne, cx, cy, cw, ch, Math.round(THRONE.x - w / 2), Math.round(THRONE.y - h), Math.round(w), Math.round(h)),
  };
}

/**
 * Kneeling before the throne, back to us: the kneeling frames of the LPC sit sheet facing up. Down on
 * the knees, then a slow bow, hands to the ground, and up again. A sheet made before the row existed
 * (or still loading its new picture) kneels facing us instead. False: nothing to draw it with.
 */
export function drawPraying(g: CanvasRenderingContext2D, img: HTMLImageElement, info: SheetInfo, x: number, y: number, since: number, phase: number): boolean {
  const up = info.rows.sitUp;
  const fits = !!up && up.frames >= 2 && img.naturalHeight >= (up.row + 1) * info.frame;
  const row = fits ? up : info.rows.sit;
  if (!row || row.frames < 2) return false;
  // Kneeling up (0) for a while, bowing down (1) for longer
  const loop = (since + phase) % 3000;
  const frame = since < 400 || loop < 1100 ? 0 : 1;
  const px = info.frame || FRAME_PX;
  const size = FRAME_PX * S;
  g.drawImage(img, frame * px, row.row * px, px, px, Math.round(x - BODY.centerX * S), Math.round(y - BODY.feetY * S), size, size);
  return true;
}

/** A small crown, its bottom middle at (x, y) */
export function crownMark(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x - s, y);
  g.lineTo(x - s, y - s * 1.1);
  g.lineTo(x - s * 0.5, y - s * 0.5);
  g.lineTo(x, y - s * 1.35);
  g.lineTo(x + s * 0.5, y - s * 0.5);
  g.lineTo(x + s, y - s * 1.1);
  g.lineTo(x + s, y);
  g.closePath();
  g.fill();
}
