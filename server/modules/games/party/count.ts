// Color Count: dots of a few colors light the strip for a while, then one color is asked.

import type { CountView, PartyColor } from '../../../../shared/party.ts';
import { HbError, num } from '../../../core/util.ts';
import { shuffle } from '../engine.ts';
import { LED, WHITE, colorsIn, ease, ramp, randInt, type MiniFactory } from './strip.ts';

/** The dots pop in over this long (each one at a random time), and fade out in FADE_MS */
const POP_MS = 1200;
const FLASH_MS = 120;
const FADE_MS = 400;
const REVEAL_MS = 7000;
/** Reveal: the dots of the color asked come back, then slide down into a row */
const GLIDE_AT_MS = 900;
const GLIDE_MS = 1600;

export const colorCount: MiniFactory = (h) => {
  const { m, n } = h;
  const showMs = h.opt('showSec') * 1000;
  const askMs = h.opt('answerSec') * 1000;
  const colors = shuffle(colorsIn(4)).slice(0, h.opt('colors'));
  // At least one dark LED between two dots: at most one dot every other LED, and far from full
  const slots = Math.floor((n + 1) / 2);
  const most = Math.max(4, Math.min(h.opt('most'), Math.floor((slots * 0.75) / colors.length)));
  const counts = Object.fromEntries(colors.map((c) => [c, randInt(Math.min(5, most), most)])) as Record<PartyColor, number>;
  const total = colors.reduce((sum, c) => sum + counts[c], 0);
  // `total` places with a gap: drawn among n - total + 1, then each one pushed up by its rank
  const free = shuffle(Array.from({ length: n - total + 1 }, (_, i) => i))
    .slice(0, total)
    .sort((a, b) => a - b);
  const kinds = shuffle(colors.flatMap((c) => Array<PartyColor>(counts[c]).fill(c)));
  const dots = free.map((p, i) => ({ at: p + i, color: kinds[i], pop: Math.random() * POP_MS }));

  const ask = colors[Math.floor(Math.random() * colors.length)];
  const answer = counts[ask];
  // The answers: the right one somewhere among them, evenly spaced, none below 1
  const choices = h.opt('answers');
  const gap = Math.max(1, Math.round((answer * h.opt('spread')) / 100));
  const place = Math.min(Math.floor(Math.random() * choices), Math.floor((answer - 1) / gap));
  const options = Array.from({ length: choices }, (_, i) => answer + (i - place) * gap);

  let phase: CountView['phase'] = 'show';
  const picks = new Map<string, { pick: number; ms: number }>();
  let showAt = 0;
  let askAt = 0;
  let revealAt = 0;

  const reveal = () => {
    if (phase !== 'ask') return;
    h.next();
    phase = 'reveal';
    revealAt = Date.now();
    m.deadline(null);
    m.publish();
    h.after(REVEAL_MS, () =>
      h.done(
        m.players.map((p) => {
          const x = picks.get(p.id);
          if (!x) return { id: p.id, label: 'No answer', score: null };
          // Closest first, then the fastest
          return { id: p.id, label: `Picked ${x.pick}`, score: -(Math.abs(x.pick - answer) / gap) * 1e6 - x.ms };
        }),
      ),
    );
  };

  return {
    start() {
      showAt = Date.now();
      m.deadline(POP_MS + showMs);
      h.after(POP_MS + showMs + FADE_MS, () => {
        h.next();
        phase = 'ask';
        askAt = Date.now();
        m.deadline(askMs);
        m.publish();
        h.after(askMs, reveal);
      });
      m.publish();
    },

    input(id, args) {
      if (phase !== 'ask') throw new HbError('Not now');
      if (picks.has(id)) return { pick: picks.get(id)!.pick };
      const pick = Math.round(num(args?.pick, NaN));
      if (!options.includes(pick)) throw new HbError('Pick one of the answers');
      picks.set(id, { pick, ms: Date.now() - askAt });
      if (m.players.every((p) => picks.has(p.id))) h.after(700, reveal);
      m.publish();
      return { pick };
    },

    view(): CountView {
      return {
        kind: 'count',
        phase,
        colors,
        ...(phase !== 'show' ? { ask, options } : {}),
        answered: [...picks.keys()],
        ...(phase === 'reveal' ? { counts, picks: Object.fromEntries(m.players.map((p) => [p.id, picks.get(p.id)?.pick ?? null])) } : {}),
      };
    },

    render(now, f) {
      if (phase === 'show') {
        const out = 1 - ramp(now, showAt + POP_MS + showMs, FADE_MS);
        for (const d of dots) {
          const t = now - showAt - d.pop;
          if (t < 0) continue;
          // A small white flash as it pops in, then steady
          f.add(d.at, LED[d.color], out);
          if (t < FLASH_MS) f.add(d.at, WHITE, 0.4 * (1 - t / FLASH_MS) * out);
        }
      } else if (phase === 'reveal') {
        // The dots of the color asked come back where they were, then slide down into a row: easy to count
        const glide = ease(ramp(now, revealAt + GLIDE_AT_MS, GLIDE_MS));
        dots
          .filter((d) => d.color === ask)
          .forEach((d, i) => f.add(Math.round(d.at + (i * 2 - d.at) * glide), LED[ask], ramp(now, revealAt, 500)));
      }
    },
  };
};
