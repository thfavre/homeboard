/**
 * Draws the bra sheets (assets/lpc/spritesheets/torso/clothes/bra/female/) from the LPC "Sleeveless 2"
 * top, frame by frame, so it has every animation and the same pixel style. Seen from the front: two
 * straps from the shoulders down to two rounded cups, a V between them; from the back a straight band
 * under the straps; from the side the cup. Every cut edge gets the top's dark outline. Which way is
 * "up" in a frame (standing, sitting, lying hurt) comes from where the head is.
 *
 *   npx tsx scripts/make-bra.ts
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const LPC = join(import.meta.dirname, '..', 'assets', 'lpc', 'spritesheets');
const TOP = join(LPC, 'torso/clothes/sleeveless/sleeveless2/female');
const HEAD = join(LPC, 'head/heads/human/female');
const OUT = join(LPC, 'torso/clothes/bra/female');
const F = 64;
/** Of the top's length from the shoulders down (0) to the waist (1) */
const CUP_TOP_OUT = 0.28; // the cups' top at the straps
const CUP_TOP_IN = 0.5; // ... dipping to this between them (the V)
const CUP_EDGE = 0.66; // the cups' bottom at their sides
const CUP_LOW = 0.84; // ... and at their lowest
const BACK = [0.5, 0.7]; // the band across the back
/** Of the width: the straps at each side, and each cup's half width around its middle */
const STRAP_W = 0.2;
const CUP_HALF = 0.27;
/** The rows of a four-way sheet, top to bottom */
const FACING = ['back', 'side', 'front', 'side'] as const;

const read = (file: string) => PNG.sync.read(readFileSync(file));

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(TOP).filter((f) => f.endsWith('.png'))) {
  const top = read(join(TOP, file));
  let head: PNG | null = null;
  try {
    head = read(join(HEAD, file));
  } catch {
    // No head sheet for this one: up is up
  }
  const out = new PNG({ width: top.width, height: top.height });
  for (let cy = 0; cy < top.height; cy += F) {
    for (let cx = 0; cx < top.width; cx += F) {
      const px: [number, number][] = [];
      const at = (x: number, y: number) => ((cy + y) * top.width + cx + x) * 4;
      for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) if (top.data[at(x, y) + 3]) px.push([x, y]);
      if (!px.length) continue;
      const mid = px.reduce((m, [x, y]) => [m[0] + x / px.length, m[1] + y / px.length], [0, 0]);
      // Up: from the top's middle toward the head's
      let up: [number, number] = [0, -1];
      if (head) {
        let hx = 0;
        let hy = 0;
        let n = 0;
        for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) if (head.data[at(x, y) + 3]) (hx += x), (hy += y), n++;
        if (n) {
          const dx = hx / n - mid[0];
          const dy = hy / n - mid[1];
          const len = Math.hypot(dx, dy) || 1;
          // Snapped to the nearest of the four ways, so rows stay rows
          up = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy) || -1];
          void len;
        }
      }
      // Along: 0 at the shoulders, 1 at the waist. Across: 0..1 over the width
      const along = (x: number, y: number) => -(x * up[0] + y * up[1]);
      const across = (x: number, y: number) => x * -up[1] + y * up[0];
      const as = px.map(([x, y]) => along(x, y));
      const cs = px.map(([x, y]) => across(x, y));
      const a0 = Math.min(...as);
      const a1 = Math.max(...as);
      const c0 = Math.min(...cs);
      const c1 = Math.max(...cs);
      const t = (x: number, y: number) => (along(x, y) - a0) / Math.max(1, a1 - a0);
      const w = (x: number, y: number) => (across(x, y) - c0) / Math.max(1, c1 - c0);
      // Which side we see: from the sheet's row (one-row sheets face us), or narrow means the side
      const facing = c1 - c0 < 10 ? 'side' : top.height >= 4 * F ? FACING[cy / F] : 'front';
      const keep = (x: number, y: number) => {
        if (!top.data[at(x, y) + 3]) return false;
        const tt = t(x, y);
        const ww = w(x, y);
        const strap = (ww < STRAP_W || ww > 1 - STRAP_W) && tt < CUP_TOP_OUT + 0.1;
        if (facing === 'back') return strap || (tt >= BACK[0] && tt <= BACK[1]);
        if (facing === 'side') return (Math.abs(ww - 0.5) < 0.2 && tt < CUP_TOP_OUT + 0.1) || (tt >= CUP_TOP_OUT && tt <= CUP_LOW);
        if (strap) return true;
        // The front: below the V of the cups' top, above their round bottoms
        const fromMid = Math.abs(ww - 0.5) * 2;
        const cupTop = CUP_TOP_IN - (CUP_TOP_IN - CUP_TOP_OUT) * fromMid;
        const cupMid = ww < 0.5 ? 0.5 - CUP_HALF + 0.02 : 0.5 + CUP_HALF - 0.02;
        const k = Math.min(1, Math.abs(ww - cupMid) / CUP_HALF);
        const cupBottom = CUP_EDGE + (CUP_LOW - CUP_EDGE) * Math.sqrt(1 - k * k);
        return tt >= cupTop && tt <= cupBottom;
      };
      // The darkest color of the top in this frame: its outline
      let dark = [255, 255, 255];
      for (const [x, y] of px) {
        const i = at(x, y);
        const d = top.data;
        if (d[i] + d[i + 1] + d[i + 2] < dark[0] + dark[1] + dark[2]) dark = [d[i], d[i + 1], d[i + 2]];
      }
      for (const [x, y] of px) {
        if (!keep(x, y)) continue;
        const i = at(x, y);
        // Next to a part of the top that was cut away: the edge, drawn as an outline
        const cut = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < F && ny < F && top.data[at(nx, ny) + 3] && !keep(nx, ny);
        });
        const c = cut ? dark : [top.data[i], top.data[i + 1], top.data[i + 2]];
        out.data[i] = c[0];
        out.data[i + 1] = c[1];
        out.data[i + 2] = c[2];
        out.data[i + 3] = 255;
      }
    }
  }
  writeFileSync(join(OUT, file), PNG.sync.write(out));
  console.log('drew', file);
}
