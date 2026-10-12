// Stack: same size blocks fall and pile up from a floor to the top of the strip, players remember the
// tower, it falls through the floor, and they rebuild it on their phone.

import type { PartyColor, StackView } from '../../../../shared/party.ts';
import { HbError } from '../../../core/util.ts';
import { LED, WHITE, colorsIn, ramp, type Frame, type MiniFactory } from './strip.ts';

const LAND_GAP_MS = 90;
/** A white flash where a block lands */
const FLASH_MS = 160;
/** The tower falls through the floor and out of the strip */
const TUMBLE_MS = 1100;
const REVEAL_MS = 7000;
/** The floor: one dim LED under the first block */
const FLOOR_LEVEL = 0.15;

export const stack: MiniFactory = (h) => {
  const { m, n } = h;
  const blocks = h.opt('blocks');
  const colors = colorsIn(h.opt('colors'));
  const inputMs = h.opt('inputSec') * 1000;
  const memoMs = h.opt('memoSec') * 1000;
  // The floor: the blocks land on it, so it needs room for every block above it (2 LEDs each at least)
  const floor = Math.min(Math.round((n * h.opt('floor')) / 100), Math.max(0, n - blocks * 2));
  // Same size blocks with one dark LED between them, from the floor up to the top
  const size = Math.max(1, Math.floor((n - floor + 1) / blocks) - 1);
  const tower: PartyColor[] = [];
  while (tower.length < blocks) {
    const c = colors[Math.floor(Math.random() * colors.length)];
    // Never 3 of a color in a row (with 2 colors, never 3 the same either)
    if (tower.length >= 2 && tower[tower.length - 1] === c && tower[tower.length - 2] === c) continue;
    tower.push(c);
  }
  // Where each block rests, and when it starts falling and lands (gravity: the bottom ones fall longest)
  const g = (2 * n) / h.opt('fallMs') ** 2;
  let t = 300;
  const drops = tower.map((color, i) => {
    const rest = floor + i * (size + 1);
    const d = { color, rest, from: t, land: t + Math.sqrt((2 * (n - rest)) / g) };
    t = d.land + LAND_GAP_MS;
    return d;
  });
  const dropMs = t + 300;

  let phase: StackView['phase'] = 'drop';
  let phaseAt = 0;
  const answers = new Map<string, { list: PartyColor[]; at: number }>();
  const done = new Set<string>();
  let inputAt = 0;

  const go = (next: StackView['phase']) => {
    h.next();
    phase = next;
    phaseAt = Date.now();
    m.publish();
  };
  /** Blocks right from the bottom, until the first mistake */
  const right = (list: PartyColor[]) => {
    let k = 0;
    while (k < list.length && list[k] === tower[k]) k++;
    return k;
  };
  const reveal = () => {
    if (phase !== 'input') return;
    go('reveal');
    m.deadline(null);
    h.after(REVEAL_MS, () =>
      h.done(
        m.players.map((p) => {
          const a = answers.get(p.id);
          if (!a?.list.length) return { id: p.id, label: 'Nothing built', score: null };
          const k = right(a.list);
          // Most blocks right from the bottom, then the fastest
          return { id: p.id, label: `${k} of ${blocks}`, score: k * 1e6 - (a.at - inputAt) };
        }),
      ),
    );
  };
  /** The floor LED, under the first block (none when the floor is the bottom) */
  const drawFloor = (f: Frame, k = 1) => {
    if (floor >= 2) f.add(floor - 2, WHITE, FLOOR_LEVEL * k);
  };

  return {
    start() {
      phaseAt = Date.now();
      m.deadline(dropMs + memoMs);
      h.after(dropMs, () => {
        go('memo');
        h.after(memoMs, () => {
          go('fall');
          h.after(TUMBLE_MS, () => {
            go('input');
            inputAt = Date.now();
            m.deadline(inputMs);
            h.after(inputMs, reveal);
          });
        });
      });
      m.publish();
    },

    input(id, args) {
      if (phase !== 'input') throw new HbError('Not now');
      if (done.has(id)) return { done: true };
      const raw: unknown[] = Array.isArray(args?.list) ? args.list.slice(0, blocks) : [];
      const list = raw.filter((c): c is PartyColor => colors.includes(c as PartyColor));
      answers.set(id, { list, at: Date.now() });
      if (args?.done) done.add(id);
      if (m.players.every((p) => done.has(p.id))) h.after(600, reveal);
      m.publish();
      return { done: done.has(id) };
    },

    view(): StackView {
      return {
        kind: 'stack',
        phase,
        blocks,
        colors,
        progress: Object.fromEntries([...answers].map(([id, a]) => [id, a.list.length])),
        done: [...done],
        ...(phase === 'reveal'
          ? {
              tower,
              answers: Object.fromEntries([...answers].map(([id, a]) => [id, a.list])),
              correct: Object.fromEntries([...answers].map(([id, a]) => [id, right(a.list)])),
            }
          : {}),
      };
    },

    render(now, f) {
      const t = now - phaseAt;
      if (phase === 'drop' || phase === 'memo') {
        drawFloor(f, phase === 'drop' ? ramp(now, phaseAt, 300) : 1);
        for (const d of drops) {
          if (phase === 'drop' && t < d.from) continue;
          const falling = phase === 'drop' ? t - d.from : Infinity;
          const y = Math.max(d.rest, n - 0.5 * g * falling ** 2);
          f.fill(y, y + size, LED[d.color]);
          const since = phase === 'drop' ? t - d.land : Infinity;
          if (since >= 0 && since < FLASH_MS) f.fill(d.rest, d.rest + size, WHITE, 0.55 * (1 - since / FLASH_MS));
        }
      } else if (phase === 'fall') {
        // The floor opens: the whole tower falls through it and out of the bottom
        const y = 0.5 * g * 1.4 * t ** 2;
        for (const d of drops) f.fill(d.rest - y, d.rest - y + size, LED[d.color]);
      } else if (phase === 'reveal') {
        // The tower again on its floor, block by block from the bottom
        drawFloor(f, ramp(now, phaseAt, 300));
        drops.forEach((d, i) => f.fill(d.rest, d.rest + size, LED[d.color], ramp(now, phaseAt + 400 + i * 120, 250)));
      }
    },
  };
};
