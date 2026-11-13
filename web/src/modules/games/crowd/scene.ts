import { SPRITE_SCALE, SPY_SCENE, SQUARE_HOUSES, WORLD, houseRow, seeded, type HouseKind } from '$shared/crowd.ts';

/**
 * The places of the crowd games, made of LPC style environment art (web/public/crowd/env, see its
 * CREDITS.txt): the race street and the spy square. The ground is built once, pixel for pixel, at the
 * sprites' own size; the things that stand up (trees, lamps, the fountain...) are drawn every frame,
 * sorted with the characters, so people walk in front of and behind them.
 */

const S = SPRITE_SCALE;
const FILES = [
  'pave-stone-slabs',
  'street-road',
  'street-road-cracked',
  'street-sidewalk',
  'house-brick-a',
  'house-brick-b',
  'house-paneled',
  'lamp-post',
  'tree-trunks',
  'tree-canopies',
  'tree-shadows',
  'planters',
  'magecity',
  'fountain-anim',
  'water-sparkle-anim',
  'bird-brown',
  'bird-black',
  'bird-white',
  'cats',
  'flowers',
  'bins',
] as const;
export type EnvImage = (typeof FILES)[number];
export type Env = Record<EnvImage, HTMLImageElement>;

let loading: Promise<Env | null> | null = null;
/** Load every image once (null: they cannot be, the plain drawn places are used) */
export function loadEnv(): Promise<Env | null> {
  loading ??= Promise.all(
    FILES.map(
      (f) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve([f, img]);
          img.onerror = () => reject(new Error(f));
          img.src = `/crowd/env/${f}.png`;
        }),
    ),
  )
    .then((list) => Object.fromEntries(list) as Env)
    .catch(() => null);
  return loading;
}

/** A part of a sheet: x, y, width, height in its pixels */
export type Cut = [number, number, number, number];
const CUT = {
  houseA: [24, 0, 208, 201] as Cut,
  houseB: [23, 0, 144, 192] as Cut,
  housePaneled: [0, 0, 160, 160] as Cut,
  lamp: [7, 4, 18, 80] as Cut,
  lampOff: [39, 4, 18, 80] as Cut,
  trunk: [100, 13, 25, 64] as Cut,
  canopySummer: [33, 176, 94, 80] as Cut,
  canopySpring: [33, 16, 94, 80] as Cut,
  treeShadow: [16, 87, 64, 31] as Cut,
  topiary: [64, 0, 32, 80] as Cut,
  fern: [0, 32, 32, 52] as Cut,
  bench: [2, 506, 62, 36] as Cut,
  fountain: [0, 0, 64, 96] as Cut,
};

/** Draw a cut of a sheet with its bottom middle at (x, y), `scale` world units a pixel */
function put(g: CanvasRenderingContext2D, img: HTMLImageElement, c: Cut, x: number, y: number, scale = S, dx = 0) {
  const w = c[2] * scale;
  const h = c[3] * scale;
  g.drawImage(img, c[0], c[1], c[2], c[3], Math.round(x - w / 2 + dx), Math.round(y - h), Math.round(w), Math.round(h));
}

// ------------------------------------------------------------ the ground (built once)

/** The ground in sprite pixels: the world divided by the sprite scale, so tiles stay sharp */
const PW = Math.ceil(WORLD.w / S);
const PH = Math.ceil(WORLD.h / S);

/** A house's art: its sheet and the part of it that is the house (x, y, width, height in its pixels) */
export function houseArt(env: Env, kind: HouseKind): [HTMLImageElement, Cut] {
  if (kind === 'brickA') return [env['house-brick-a'], CUT.houseA];
  if (kind === 'brickB') return [env['house-brick-b'], CUT.houseB];
  return [env['house-paneled'], CUT.housePaneled];
}

/**
 * Something built in place of a house of the row (the town's shops): an image of the same size as the
 * house's art, or null to keep the house. `x` is the house's left edge (sprite pixels).
 */
export type HouseSwap = (kind: HouseKind, x: number) => CanvasImageSource | null;

/** A row of houses along the top, bottom at `bottom` (sprite pixels), cut off by the top of the screen */
function houses(g: CanvasRenderingContext2D, env: Env, bottom: number, seed: number, swap?: HouseSwap) {
  for (const h of houseRow(seed, PW)) {
    const [img, c] = houseArt(env, h.kind);
    const instead = swap?.(h.kind, h.x);
    if (instead) g.drawImage(instead, h.x, bottom - c[3]);
    else g.drawImage(img, c[0], c[1], c[2], c[3], h.x, bottom - c[3], c[2], c[3]);
  }
}

/** A band of sidewalk slabs from y0 to y1 (sprite pixels) with its curb at the bottom, `width` long */
function sidewalk(g: CanvasRenderingContext2D, env: Env, y0: number, y1: number, width = PW) {
  const img = env['street-sidewalk'];
  for (let y = y0; y < y1; y += 32) {
    for (let x = 0; x < width; x += 32) {
      const v = ((x / 32) % 2) * 32;
      const w = (((y - y0) / 32) % 2) * 32;
      g.drawImage(img, 192 + v, 160 + w, 32, Math.min(32, y1 - y), x, y, 32, Math.min(32, y1 - y));
    }
  }
  // The curb: a light edge and its shadow on the ground below
  g.fillStyle = '#9aa0a6';
  g.fillRect(0, y1 - 3, width, 3);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, y1, width, 3);
}

/** The race street: houses, a sidewalk, the road with its lane marks, the start and finish lines */
export function streetGround(env: Env, startX: number, finishX: number, font: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = PW;
  c.height = PH;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const r = seeded(5);
  // The road: plain asphalt, now and then a cracked tile
  for (let y = 0; y < PH; y += 32) {
    for (let x = 0; x < PW; x += 32) {
      if (r() < 0.04) {
        const t = Math.floor(r() * 18);
        g.drawImage(env['street-road-cracked'], (t % 6) * 32, Math.floor(t / 6) * 32, 32, 32, x, y, 32, 32);
      } else g.drawImage(env['street-road'], 0, 0, 32, 32, x, y, 32, 32);
    }
  }
  houses(g, env, 74, 3);
  sidewalk(g, env, 74, 128);
  // A thin sidewalk at the bottom
  g.fillStyle = '#9aa0a6';
  g.fillRect(0, PH - 9, PW, 2);
  g.fillStyle = '#7d8288';
  g.fillRect(0, PH - 7, PW, 7);
  const sx = Math.round(startX / S);
  const fx = Math.round(finishX / S);
  // Lane marks: white dashes, worn
  g.fillStyle = 'rgba(235,235,225,0.55)';
  for (const y of [Math.round(330 / S), Math.round(610 / S)]) for (let x = sx + 20; x < fx - 20; x += 40) g.fillRect(x, y, 22, 3);
  // The start line, and a checkered finish band
  g.fillStyle = 'rgba(240,240,232,0.9)';
  g.fillRect(sx + 4, 134, 4, PH - 146);
  for (let y = 132, row = 0; y < PH - 9; y += 8, row++) {
    for (let col = 0; col < 3; col++) {
      g.fillStyle = (row + col) % 2 ? '#f2f2ee' : '#1a1b20';
      g.fillRect(fx + col * 8, y, 8, Math.min(8, PH - 9 - y));
    }
  }
  // Words painted on the road
  g.save();
  g.font = `16px ${font}`;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(240,240,230,0.28)';
  g.translate(fx + 52, (PH + 128) / 2);
  g.rotate(-Math.PI / 2);
  g.fillText('FINISH', 0, 6);
  g.restore();
  g.save();
  g.font = `12px ${font}`;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(240,240,230,0.2)';
  g.translate(sx - 20, (PH + 128) / 2);
  g.rotate(-Math.PI / 2);
  g.fillText('START', 0, 5);
  g.restore();
  return c;
}

/** The spy square (and the town, with its shops swapped in): houses, a sidewalk, stone slabs, a light frame of stone around the fountain */
/** Where the square's sidewalk ends, below its houses (sprite pixels) */
export const SQUARE_STREET = 128;

/**
 * The square's ground in sprite pixels. `width` builds it wider than the screen, to show what goes on
 * past its right edge (the last house sticks out: the town's TV view draws it over the riverside).
 */
export function squareGround(env: Env, swap?: HouseSwap, width = PW): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = PH;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const r = seeded(9);
  const past = seeded(19);
  const slabs = env['pave-stone-slabs'];
  const fx = SPY_SCENE.fountain.x / S;
  const fy = SPY_SCENE.fountain.y / S;
  for (let y = 0; y < PH; y += 32) {
    for (let x = 0; x < width; x += 32) {
      // Grey slabs, a light rectangle of stone around the fountain framed by darker slabs, light stone
      // along the edges of the square
      const dx = Math.abs(x + 16 - fx);
      const dy = Math.abs(y + 16 - fy);
      const inner = dx < 150 && dy < 90;
      const frame = !inner && dx < 182 && dy < 122;
      const edge = x < 40 || (x > PW - 72 && x < PW) || y > PH - 40;
      // Past the screen's edge from its own numbers, so the square looks the same however wide it is built
      const rand = x < PW ? r : past;
      const col = inner || frame || edge ? Math.floor(rand() * 2) : 2 + Math.floor(rand() * 2);
      const row = frame ? 4 + Math.floor(rand() * 2) : inner || edge ? Math.floor(rand() * 2) : Math.floor(rand() * 4);
      g.drawImage(slabs, col * 32, row * 32, 32, 32, x, y, 32, 32);
    }
  }
  houses(g, env, SQUARE_HOUSES.bottom, SQUARE_HOUSES.seed, swap);
  sidewalk(g, env, SQUARE_HOUSES.bottom, SQUARE_STREET, width);
  return c;
}

// ------------------------------------------------------------ things that stand up

/** What a stray shot does to a thing: leaves fall from a tree, a lamp's glass breaks, the fountain splashes */
export type PropHit = 'leaves' | 'glass' | 'water';

/** Something drawn in depth order with the characters: `y` is where it stands */
export interface Prop {
  y: number;
  draw(g: CanvasRenderingContext2D, now: number): void;
  /** A shot at (x, y) lands on it (and what it does), or not */
  hit?(x: number, y: number): PropHit | null;
  /** A new round: as it was (a broken lamp is mended) */
  reset?(): void;
  /** Drawn on the ground before anyone (a tree's shadow): people walk over it, not under it */
  ground?(g: CanvasRenderingContext2D, now: number): void;
}

function tree(env: Env, x: number, y: number, spring: boolean, phase: number): Prop {
  return {
    y,
    hit(hx, hy) {
      // The leaves: an ellipse over the trunk
      const cy = y - 44 * S - 40 * S;
      return ((hx - x) / (47 * S)) ** 2 + ((hy - cy) / (40 * S)) ** 2 < 1 ? 'leaves' : null;
    },
    ground(g) {
      g.globalAlpha = 0.5;
      put(g, env['tree-shadows'], CUT.treeShadow, x + 6, y + 14);
      g.globalAlpha = 1;
    },
    draw(g, now) {
      // The trunk, and the leaves swaying a pixel in the wind
      put(g, env['tree-trunks'], CUT.trunk, x, y + 4);
      const sway = Math.round(Math.sin(now / 1400 + phase) * 1.3) * S;
      put(g, env['tree-canopies'], spring ? CUT.canopySpring : CUT.canopySummer, x, y - 44 * S, S, sway);
    },
  };
}

function lamp(env: Env, x: number, y: number): Prop {
  let broken = false;
  const ly = y - 82;
  return {
    y,
    hit(hx, hy) {
      if (broken || Math.hypot(hx - x, hy - ly) > 20) return null;
      broken = true;
      return 'glass';
    },
    reset() {
      broken = false;
    },
    draw(g, now) {
      // Shot: the light is out
      put(g, env['lamp-post'], broken ? CUT.lampOff : CUT.lamp, x, y + 4);
      if (broken) return;
      // A warm glow around the light, breathing a little
      const glow = g.createRadialGradient(x, ly, 0, x, ly, 46);
      glow.addColorStop(0, `rgba(255,210,120,${0.32 + 0.05 * Math.sin(now / 700 + x)})`);
      glow.addColorStop(1, 'rgba(255,210,120,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(x, ly, 46, 0, Math.PI * 2);
      g.fill();
    },
  };
}

/** The fountain, twice the size of the sprites so it fills the middle of the square, its water glinting */
function fountain(env: Env, x: number, y: number): Prop {
  const k = 2.1;
  return {
    y,
    hit(hx, hy) {
      // The basin, and the tiers above it
      const basin = ((hx - x) / (30 * k)) ** 2 + ((hy - y) / (16 * k)) ** 2 < 1;
      const tiers = Math.abs(hx - x) < 18 * k && hy < y && hy > y - 60 * k;
      return basin || tiers ? 'water' : null;
    },
    draw(g, now) {
      const frame = Math.floor(now / 260) % 2;
      const c: Cut = [frame * 64, 0, 64, 96];
      put(g, env['fountain-anim'], c, x, y + 28 * k, k);
      // Glints on the water of the basin
      const t = Math.floor(now / 140);
      for (const [dx, dy, p] of [
        [-40, -8, 0],
        [36, -2, 2],
        [-6, 12, 1],
      ] as const) {
        const f = (t + p) % 4;
        g.globalAlpha = 0.8;
        g.drawImage(env['water-sparkle-anim'], f * 32, 32, 32, 32, Math.round(x + dx - 16), Math.round(y + dy - 16), 32, 32);
      }
      g.globalAlpha = 1;
    },
  };
}

function still(img: HTMLImageElement, c: Cut, x: number, y: number): Prop {
  return { y, draw: (g) => put(g, img, c, x, y) };
}

/** Everything that stands up on the race street (on the sidewalk, behind the runners) */
export function streetProps(env: Env): Prop[] {
  const out: Prop[] = [];
  for (let x = 120, k = 0; x < WORLD.w; x += 260, k++) {
    if (k % 2) out.push(tree(env, x, 158, k % 4 === 1, k));
    else out.push(lamp(env, x, 162));
    out.push(still(env.planters, k % 2 ? CUT.fern : CUT.topiary, x + 110, 160));
  }
  return out;
}

/** Everything that stands up on the spy square */
export function squareProps(env: Env): Prop[] {
  const out: Prop[] = [fountain(env, SPY_SCENE.fountain.x, SPY_SCENE.fountain.y)];
  SPY_SCENE.trees.forEach((t, k) => out.push(tree(env, t.x, t.y, k % 2 === 1, k * 1.7)));
  for (const l of SPY_SCENE.lamps) out.push(lamp(env, l.x, l.y));
  // On the sidewalk along the houses: benches and plants
  for (const [x, kind] of [
    [150, 'topiary'],
    [400, 'bench'],
    [560, 'fern'],
    [1040, 'fern'],
    [1200, 'bench'],
    [1450, 'topiary'],
  ] as const) {
    if (kind === 'bench') out.push(still(env.magecity, CUT.bench, x, 168));
    else out.push(still(env.planters, kind === 'fern' ? CUT.fern : CUT.topiary, x, 168));
  }
  return out;
}
