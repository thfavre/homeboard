/**
 * Draws the bra sheets (assets/lpc/spritesheets/torso/clothes/bra/female/) from the LPC "Sleeveless 2"
 * top, frame by frame, so it has every animation and the same pixel style: the chest band is kept,
 * the part above it thins to two straps, and the new lower edge gets the top's dark outline. Which
 * way is "up" in a frame (standing, sitting, lying hurt) comes from where the head is.
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
/** Of the top's length from the shoulders down: where the straps end and where the band ends */
const STRAPS_TO = 0.3;
const BAND_TO = 0.62;
/** How much of the width at each side the straps keep */
const STRAP_W = 0.26;

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
      // Narrow seen from the side: one strap in the middle
      const side = c1 - c0 < 10;
      const keep = (x: number, y: number) => {
        if (!top.data[at(x, y) + 3]) return false;
        const tt = t(x, y);
        if (tt > BAND_TO) return false;
        if (tt >= STRAPS_TO) return true;
        const ww = w(x, y);
        return side ? Math.abs(ww - 0.5) < 0.2 : ww < STRAP_W || ww > 1 - STRAP_W;
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
