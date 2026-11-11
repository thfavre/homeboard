import { ANIM, BODY, FRAME_PX, SPRITE_SCALE, type Dir } from '$shared/crowd.ts';

/**
 * The characters of Crowd Race and Spy Hunt: LPC sprite sheets made by scripts/crowd-sprites.ts, one PNG a
 * character (64 px frames, one animation a row), described by characters.json. See CREDITS.txt.
 */

interface RowInfo {
  row: number;
  frames: number;
}
interface SheetInfo {
  frame: number;
  rows: Record<string, RowInfo | undefined>;
  characters: { file: string; name: string }[];
  suits?: { file: string; name: string }[];
}

export interface Sheets {
  info: SheetInfo;
  people: HTMLImageElement[];
  suits: HTMLImageElement[];
}

let loading: Promise<Sheets | null> | null = null;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });

/** Load every sheet once (null: they cannot be, the characters are drawn plain) */
export function loadSheets(): Promise<Sheets | null> {
  loading ??= (async () => {
    try {
      const info = (await fetch('/crowd/characters.json').then((r) => r.json())) as SheetInfo;
      const people = await Promise.all(info.characters.map((c) => loadImage(`/crowd/${c.file}`)));
      const suits = await Promise.all((info.suits ?? []).map((c) => loadImage(`/crowd/${c.file}`)));
      return { info, people, suits };
    } catch {
      return null;
    }
  })();
  return loading;
}

/** Row for a facing: [up, left, down, right] */
const BY_DIR: Record<'walk' | 'idle', [string, string, string, string]> = {
  walk: ['walkUp', 'walkLeft', 'walkDown', 'walk'],
  idle: ['idleUp', 'idleLeft', 'idleDown', 'idleRight'],
};

export interface Pose {
  anim: number;
  dir: Dir;
  /** Distance walked so far (the steps follow it), and time since the anim started (ms) */
  dist: number;
  since: number;
  /** Time now (ms), for the loops that do not move (idle, jump) */
  now: number;
  /** A per-character offset, so the crowd does not breathe in step */
  phase: number;
}

/** The row and frame of a pose */
function frameOf(info: SheetInfo, p: Pose): { row: RowInfo; frame: number } | null {
  const rows = info.rows;
  const get = (name: string) => rows[name] ?? null;
  switch (p.anim) {
    case ANIM.walk:
    case ANIM.run: {
      const run = p.anim === ANIM.run && p.dir === 3 ? get('run') : null;
      const row = run ?? get(BY_DIR.walk[p.dir]) ?? get('walk');
      if (!row) return null;
      // Walk frames start with a standing one; run frames are all strides
      const first = run ? 0 : 1;
      const stride = run ? 11 : 6.5;
      const count = Math.max(1, row.frames - first);
      return { row, frame: first + (Math.floor(p.dist / stride) % count) };
    }
    case ANIM.dead: {
      const dead = get('dead');
      const hurt = get('hurt');
      if (!hurt) return null;
      const k = Math.floor(p.since / 110);
      if (k >= hurt.frames - 1 && dead) return { row: dead, frame: Math.min(dead.frames - 1, 0) };
      return { row: hurt, frame: Math.min(hurt.frames - 1, k) };
    }
    case ANIM.win: {
      // A loop: a jump (all its frames), then the arms up (the emote), then again
      const jump = get('jump');
      const cheer = get('emote') ?? get('happy');
      if (!jump) return cheer ? { row: cheer, frame: Math.floor(p.since / 180) % cheer.frames } : null;
      const jumpMs = jump.frames * 110;
      const cheerMs = cheer ? cheer.frames * 2 * 160 : 0;
      const at = p.since % (jumpMs + cheerMs);
      if (at < jumpMs) return { row: jump, frame: Math.floor(at / 110) };
      return { row: cheer!, frame: Math.floor((at - jumpMs) / 160) % cheer!.frames };
    }
    case ANIM.cheer: {
      const row = get('emote');
      return row ? { row, frame: Math.floor(p.since / 180) % row.frames } : null;
    }
    case ANIM.sit: {
      const row = get('sit');
      return row ? { row, frame: Math.min(row.frames - 1, Math.floor(p.since / 150)) } : null;
    }
    default: {
      const row = get(BY_DIR.idle[p.dir]) ?? get('idleRight') ?? get('walk');
      if (!row) return null;
      return { row, frame: row.frames > 1 ? Math.floor((p.now + p.phase) / 520) % row.frames : 0 };
    }
  }
}

/**
 * Draw a character with its feet at (x, y) in world units (the context is already scaled to the world).
 * Without the sheets, a plain figure in a color of its look.
 */
export function drawCharacter(ctx: CanvasRenderingContext2D, sheets: Sheets | null, img: HTMLImageElement | undefined, x: number, y: number, p: Pose, fallbackHue: number): void {
  const size = FRAME_PX * SPRITE_SCALE;
  const f = sheets && img ? frameOf(sheets.info, p) : null;
  if (f && img) {
    const px = sheets!.info.frame || FRAME_PX;
    ctx.drawImage(img, f.frame * px, f.row.row * px, px, px, Math.round(x - BODY.centerX * SPRITE_SCALE), Math.round(y - BODY.feetY * SPRITE_SCALE), size, size);
    return;
  }
  // Plain figure: a body and a head
  const dead = p.anim === ANIM.dead;
  ctx.fillStyle = `hsl(${fallbackHue} 55% 50%)`;
  if (dead) {
    ctx.fillRect(x - 30, y - 14, 60, 14);
    return;
  }
  const bob = p.anim === ANIM.walk || p.anim === ANIM.run ? Math.abs(Math.sin(p.dist / 8)) * 3 : 0;
  ctx.fillRect(x - 13, y - 52 - bob, 26, 46);
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(x, y - 64 - bob, 11, 0, Math.PI * 2);
  ctx.fill();
}
