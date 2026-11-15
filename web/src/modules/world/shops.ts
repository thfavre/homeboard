import type { PlaceId, TownPlace } from '$shared/world.ts';
import { SPRITE_SCALE } from '$shared/crowd.ts';
import type { Env } from '../games/crowd/scene.ts';
import { CURTAIN, DOOR_FRAME, drawPole, shopLooks, worldOf, type Front, type ShopArt } from './shopfronts.ts';
import { drawArcadeLight, drawArcadeLive, drawCabinetScreens } from './arcadeFront.ts';

/**
 * The town's shops on the TV, every frame: the room seen through the shop window with whoever is
 * inside, the glass and the awning in front of them, the door opening for whoever goes in or out, the
 * barber pole turning. The buildings themselves are built once (shopfronts.ts) and lie in the ground.
 */

const S = SPRITE_SCALE;

/** Where the feet of a character inside go: below the window, so the glass shows it from the knees up */
export const insideFeet = (p: TownPlace) => p.window.y + p.window.h + 20;

let art: { env: Env; art: ShopArt } | null = null;
/** The shops' art, once both the square's and the shops' sheets are loaded */
export function setShopArt(env: Env | null, shopArt: ShopArt | null): void {
  art = env && shopArt ? { env, art: shopArt } : null;
}

/** How far each door is open (0 shut, 1 wide open), eased toward whether someone is going through */
const doors: Record<PlaceId, { open: number; at: number }> = { clothes: { open: 0, at: 0 }, barber: { open: 0, at: 0 }, arcade: { open: 0, at: 0 } };

/** Draw a sprite-pixel image at a shop's house-art position (x, y), on the square's pixel grid */
function blit(g: CanvasRenderingContext2D, img: CanvasImageSource, p: TownPlace, f: Front, x: number, y: number, sx: number, sy: number, w: number, h: number): void {
  const o = worldOf(p, f, x, y);
  g.drawImage(img, sx, sy, w, h, o.x, o.y, w * S, h * S);
}

/**
 * A shop: the room behind the glass and the characters in it (drawn by `people`, clipped to the
 * glass), then the glass, drapes and awning, the door (open while `doorBusy`), the barber pole.
 */
export function drawShop(g: CanvasRenderingContext2D, p: TownPlace, now: number, doorBusy: boolean, people: (g: CanvasRenderingContext2D) => void): void {
  const { x, y, w, h } = p.window;
  const look = art ? shopLooks(art.env, art.art)[p.id] : null;

  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  if (look) g.drawImage(look.room, x, y, w, h);
  else {
    g.fillStyle = '#d9c3a0';
    g.fillRect(x, y, w, h);
  }
  if (look && p.id === 'arcade') drawCabinetScreens(g, p, now);
  people(g);
  g.restore();
  if (!look) return;
  const f = look.front;
  blit(g, look.over, p, f, 0, 0, 0, 0, f.w, f.h);

  // The door swings open in a few frames for whoever goes through it, and shut behind them
  const d = doors[p.id];
  const dt = Math.min(0.2, Math.max(0, (now - d.at) / 1000));
  d.at = now;
  d.open = Math.max(0, Math.min(1, d.open + (doorBusy ? dt : -dt) * 4));
  const frame = 3 + Math.min(3, Math.round(d.open * 3));
  const [rx, ry] = DOOR_FRAME.row[p.id];
  const fr = DOOR_FRAME.inFrame;
  blit(g, art!.art.doors, p, f, f.door.x - fr.x, f.door.y - fr.y, rx + frame * 64, ry, 64, 96);

  if (f.pole) {
    // The pole's stripes, climbing
    const c = poleCanvas();
    const pg = c.getContext('2d')!;
    pg.clearRect(0, 0, c.width, c.height);
    drawPole(pg, 1, 6, f.pole.h, Math.floor(now / 110));
    blit(g, c, p, f, f.pole.x - 1, f.pole.y - 6, 0, 0, c.width, c.height);
  }
  // The arcade's marquee: its lights and the scores on its screen
  if (p.id === 'arcade') drawArcadeLive(g, p, f.h, now);
}

/** In the evening, after the night veil: the shop window's light, and the light it spills on the pavement */
export function drawShopLight(g: CanvasRenderingContext2D, p: TownPlace, dark: number, now: number): void {
  const { x, y, w, h } = p.window;
  // The arcade's neon shines through the night
  const look = art ? shopLooks(art.env, art.art)[p.id] : null;
  if (look && p.id === 'arcade') drawArcadeLight(g, p, look.front.h, now, dark);
  g.fillStyle = `rgba(255,214,150,${0.2 * dark})`;
  g.fillRect(x, y, w, h);
  const spill = g.createLinearGradient(0, y + h, 0, y + h + 40);
  spill.addColorStop(0, `rgba(255,205,130,${0.14 * dark})`);
  spill.addColorStop(1, 'rgba(255,205,130,0)');
  g.fillStyle = spill;
  g.beginPath();
  g.moveTo(x, y + h + 4);
  g.lineTo(x + w, y + h + 4);
  g.lineTo(x + w + 14, y + h + 40);
  g.lineTo(x - 14, y + h + 40);
  g.fill();
}

let pole: HTMLCanvasElement | null = null;
function poleCanvas(): HTMLCanvasElement {
  if (!pole) {
    pole = document.createElement('canvas');
    pole.width = 12;
    pole.height = 42;
  }
  return pole;
}

/** Who's inside the window, under the glass: a curtain drawn across while the look changes */
export function drawSwish(g: CanvasRenderingContext2D, p: TownPlace, seatX: number, t: number): void {
  // t from 0 to 1: closes, holds, opens
  const cover = t < 0.35 ? t / 0.35 : t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
  const half = p.window.w / p.seats.length / 2;
  const fold = Math.round((half * cover) / S) * S;
  if (fold > 0) {
    const curtains = art?.art.curtains;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? seatX - half : seatX + half - fold;
      if (curtains) {
        // The folds of a drawn curtain, gathered toward the side it comes from
        const cw = Math.max(1, Math.round(fold / S));
        g.drawImage(curtains, CURTAIN[0] + (side < 0 ? CURTAIN[2] - cw : 0), CURTAIN[1], cw, Math.round(p.window.h / S), x0, p.window.y, fold, Math.round(p.window.h / S) * S);
      } else {
        g.fillStyle = '#8e2f3a';
        g.fillRect(x0, p.window.y, fold, p.window.h);
      }
    }
  }
  // A few sparkles as it opens on the new look
  if (t > 0.6) {
    const a = 1 - (t - 0.6) / 0.4;
    g.fillStyle = `rgba(255,248,214,${a})`;
    for (let i = 0; i < 5; i++) {
      const sx = seatX + Math.sin(i * 2.4) * half * 0.8;
      const sy = p.window.y + 8 + ((i * 11) % (p.window.h - 14));
      const s = 2 + (i % 2);
      g.fillRect(sx - s, sy, s * 2 + 1, 1);
      g.fillRect(sx, sy - s, 1, s * 2 + 1);
    }
  }
}

/** Hair snipped at the barber: little bits falling by the head, the scissors flashing over it */
export function drawSnips(g: CanvasRenderingContext2D, x: number, headY: number, now: number, color: string): void {
  g.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const t = (((now / 1100 + i / 4) % 1) + 1) % 1;
    g.fillRect(Math.round(x - 10 + i * 6 + Math.sin((t + i) * 6) * 2), Math.round(headY + 6 + t * 22), 2, 1);
  }
  // The scissors, opening and closing
  const open = Math.abs(Math.sin(now / 160)) * 0.5;
  const sx = x + 13;
  const sy = headY + 2;
  g.strokeStyle = '#d7dce2';
  g.lineWidth = 1.5;
  g.beginPath();
  for (const s of [-1, 1]) {
    g.moveTo(sx, sy);
    g.lineTo(sx - 9 * Math.cos(open * s), sy - 9 * Math.sin(open * s));
  }
  g.stroke();
  g.beginPath();
  g.arc(sx + 3, sy - 2, 2, 0, Math.PI * 2);
  g.arc(sx + 3, sy + 2, 2, 0, Math.PI * 2);
  g.stroke();
}

/** The barber cutting: the scissors snapping along the cut line by the head (the cut hair is the TV's, from the old look's pixels) */
export function drawCut(g: CanvasRenderingContext2D, cutX: number, headY: number, now: number): void {
  const open = Math.abs(Math.sin(now / 90)) * 0.55;
  // Pointing down along the cut, riding up and down the hair
  const sx = cutX;
  const sy = headY - 10 + Math.sin(now / 260) * 5;
  g.strokeStyle = '#e3e7ec';
  g.lineWidth = 1.5;
  g.beginPath();
  for (const s of [-1, 1]) {
    g.moveTo(sx, sy);
    g.lineTo(sx + 10 * Math.sin(open * s), sy + 10 * Math.cos(open * s));
  }
  g.stroke();
  g.beginPath();
  g.arc(sx - 2, sy - 3, 2, 0, Math.PI * 2);
  g.arc(sx + 2, sy - 3, 2, 0, Math.PI * 2);
  g.stroke();
}
