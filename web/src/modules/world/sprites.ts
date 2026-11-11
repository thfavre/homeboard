import { WANIM, WORLD_BODY, WORLD_FRAME_PX, WORLD_SPRITE_SCALE, type SheetInfo, type WDir } from '$shared/world.ts';

/**
 * Draws the town's characters from their composited sheets (one PNG per avatar, same rows as the
 * crowd games' sheets; see server/modules/world/compose.ts). Sheets are loaded once per URL.
 */

const images = new Map<string, HTMLImageElement | null>();

/** The sheet of a character, loading it the first time (null until it is there) */
export function sheetImage(url: string): HTMLImageElement | null {
  if (!images.has(url)) {
    images.set(url, null);
    const img = new Image();
    img.onload = () => images.set(url, img);
    img.src = url;
  }
  const img = images.get(url);
  return img && img.complete && img.naturalWidth ? img : null;
}

/** Rows for a facing: [up, left, down, right] */
const WALK_ROWS = ['walkUp', 'walkLeft', 'walkDown', 'walk'] as const;
const IDLE_ROWS = ['idleUp', 'idleLeft', 'idleDown', 'idleRight'] as const;

export interface WorldPose {
  anim: number;
  dir: WDir;
  /** Distance walked (the steps follow it) and time since the anim started (ms) */
  dist: number;
  since: number;
  now: number;
  /** Per-character offset so the town does not breathe in step */
  phase: number;
}

function frameOf(info: SheetInfo, p: WorldPose): { row: number; frame: number; last?: boolean } | null {
  const get = (name: string) => info.rows[name] ?? null;
  switch (p.anim) {
    case WANIM.walk: {
      const row = get(WALK_ROWS[p.dir]) ?? get('walk');
      if (!row) return null;
      // The first walk frame is a standing one
      const count = Math.max(1, row.frames - 1);
      return { row: row.row, frame: 1 + (Math.floor(p.dist / 6.5) % count) };
    }
    case WANIM.sit:
    case WANIM.pet: {
      const row = get('sit');
      return row ? { row: row.row, frame: Math.min(row.frames - 1, Math.floor(p.since / 150)) } : null;
    }
    case WANIM.sleep: {
      // The dead row keeps only its last frame: lying down, eyes closed
      const row = get('dead');
      return row ? { row: row.row, frame: 0 } : null;
    }
    case WANIM.cheer: {
      const row = get('emote');
      return row ? { row: row.row, frame: Math.floor(p.since / 180) % Math.max(1, row.frames) } : null;
    }
    default: {
      const row = get(IDLE_ROWS[p.dir]) ?? get('idleRight');
      if (!row) return null;
      return { row: row.row, frame: row.frames > 1 ? Math.floor((p.now + p.phase) / 520) % row.frames : 0 };
    }
  }
}

/**
 * Draw a character with its feet at (x, y) in world units. Without its sheet (still loading),
 * a plain figure in the guest's color.
 */
export function drawWorldCharacter(g: CanvasRenderingContext2D, info: SheetInfo | null, img: HTMLImageElement | null, x: number, y: number, p: WorldPose, color: string): void {
  const size = WORLD_FRAME_PX * WORLD_SPRITE_SCALE;
  const f = info && img ? frameOf(info, p) : null;
  if (f && img) {
    const px = info!.frame || WORLD_FRAME_PX;
    g.drawImage(img, f.frame * px, f.row * px, px, px, Math.round(x - WORLD_BODY.centerX * WORLD_SPRITE_SCALE), Math.round(y - WORLD_BODY.feetY * WORLD_SPRITE_SCALE), size, size);
    return;
  }
  // Plain figure: a body and a head, while the sheet loads
  const lying = p.anim === WANIM.sleep;
  g.fillStyle = color;
  if (lying) {
    g.fillRect(x - 30, y - 14, 60, 14);
    return;
  }
  const bob = p.anim === WANIM.walk ? Math.abs(Math.sin(p.dist / 8)) * 3 : 0;
  g.fillRect(x - 13, y - 56 - bob, 26, 48);
  g.fillStyle = '#f0c8a0';
  g.beginPath();
  g.arc(x, y - 68 - bob, 12, 0, Math.PI * 2);
  g.fill();
}
