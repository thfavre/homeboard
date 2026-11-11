import { ANIM } from '$shared/crowd.ts';
import { WANIM, type SheetInfo } from '$shared/world.ts';
import type { Sheets } from '../games/crowd/sprites.ts';

/**
 * The town draws its characters with the crowd games' renderer (the avatar sheets share its row
 * layout, see server/modules/world/compose.ts): this maps the world to what it expects. Sheets are
 * loaded once per URL (one per avatar).
 */

const images = new Map<string, HTMLImageElement>();

/** The sheet of a character, loading it the first time (null until it is there) */
export function sheetImage(url: string): HTMLImageElement | null {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** What the games' renderer needs to read the rows of our sheets */
export function asSheets(info: SheetInfo | null): Sheets | null {
  return info ? { info: { frame: info.frame, rows: info.rows, characters: [] }, people: [], suits: [] } : null;
}

/** The games' animation for what a character of the town is doing. Sleep lies down (the dead row). */
export function gameAnim(anim: number): { anim: number; skipFall: boolean } {
  switch (anim) {
    case WANIM.walk:
      return { anim: ANIM.walk, skipFall: false };
    case WANIM.sit:
    case WANIM.pet:
      return { anim: ANIM.sit, skipFall: false };
    case WANIM.sleep:
      // The dead animation first falls over; a sleeper is already lying there
      return { anim: ANIM.dead, skipFall: true };
    case WANIM.cheer:
      return { anim: ANIM.cheer, skipFall: false };
    default:
      return { anim: ANIM.idle, skipFall: false };
  }
}
