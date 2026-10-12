// Color Match: the strip glows one color, players make it again on a color wheel. The reveal keeps the
// real color on the bottom part and fades each guess in and out above it, one player at a time.

import { hueSatRgb, hueSatScore, type HueSat, type MatchView } from '../../../../shared/party.ts';
import { HbError, clamp, num } from '../../../core/util.ts';
import { envelope, ramp, type MiniFactory } from './strip.ts';

const FADE_MS = 700;
/** Reveal: each guess fades in, stays, fades out, then a short dark gap */
const GUESS_IN_MS = 700;
const GUESS_OUT_MS = 600;
const GUESS_GAP_MS = 300;
const REVEAL_INTRO_MS = 1500;
const REVEAL_END_MS = 3000;

export const colorMatch: MiniFactory = (h) => {
  const { m, n } = h;
  const showMs = h.opt('showSec') * 1000;
  const inputMs = h.opt('inputSec') * 1000;
  const level = h.opt('brightness') / 100;
  const stepMs = h.opt('guessSec') * 1000 + GUESS_GAP_MS;
  // The real color below the split, the guesses above it, one dark LED between
  const split = clamp(Math.round((n * h.opt('split')) / 100), 1, n - 2);
  const palest = h.opt('pale') / 100;
  const target: HueSat = { h: Math.floor(Math.random() * 360), s: Math.round((1 - Math.random() * palest) * 100) / 100 };

  let phase: MatchView['phase'] = 'show';
  let phaseAt = 0;
  const guesses = new Map<string, HueSat>();
  const done = new Set<string>();
  let order: string[] = [];
  let showing = -1;
  let shownAt = 0;
  const scoreOf = (id: string) => (guesses.has(id) ? hueSatScore(target, guesses.get(id)!) : null);

  const finish = () =>
    h.done(
      m.players.map((p) => {
        const sc = scoreOf(p.id);
        return { id: p.id, label: sc === null ? 'No color' : `${sc.toFixed(1)} %`, score: sc };
      }),
    );
  const show = (i: number) => {
    showing = i;
    shownAt = Date.now();
    m.publish();
    if (i < order.length) h.after(stepMs, () => show(i + 1));
    else h.after(REVEAL_END_MS, finish);
  };
  const reveal = () => {
    if (phase !== 'input') return;
    h.next();
    phase = 'reveal';
    phaseAt = Date.now();
    m.deadline(null);
    // Worst first: the best guess comes last
    order = m.players
      .filter((p) => guesses.has(p.id))
      .map((p) => p.id)
      .sort((a, b) => scoreOf(a)! - scoreOf(b)!);
    m.publish();
    h.after(REVEAL_INTRO_MS, () => show(0));
  };

  return {
    start() {
      phaseAt = Date.now();
      m.deadline(FADE_MS * 2 + showMs);
      h.after(FADE_MS * 2 + showMs + 200, () => {
        h.next();
        phase = 'input';
        phaseAt = Date.now();
        m.deadline(inputMs);
        m.publish();
        h.after(inputMs, reveal);
      });
      m.publish();
    },

    input(id, args) {
      if (phase !== 'input') throw new HbError('Not now');
      if (done.has(id)) return { done: true };
      const hue = num(args?.h, NaN);
      const sat = num(args?.s, NaN);
      if (!Number.isFinite(hue) || !Number.isFinite(sat)) throw new HbError('Pick a color');
      guesses.set(id, { h: ((hue % 360) + 360) % 360, s: clamp(sat, 0, 1) });
      if (args?.done) done.add(id);
      if (m.players.every((p) => done.has(p.id))) h.after(600, reveal);
      // The color moving on a phone is not shown anywhere: only "done" changes the screens
      if (args?.done) m.publish();
      return { done: done.has(id) };
    },

    view(): MatchView {
      return {
        kind: 'match',
        phase,
        done: [...done],
        ...(phase === 'reveal'
          ? {
              target,
              guesses: Object.fromEntries(m.players.map((p) => [p.id, guesses.get(p.id) ?? null])),
              scores: Object.fromEntries(m.players.map((p) => [p.id, scoreOf(p.id) ?? 0])),
              order,
              showing,
            }
          : {}),
      };
    },

    render(now, f) {
      const rgb = hueSatRgb(target);
      if (phase === 'show') {
        f.fill(0, n, rgb, envelope(now, phaseAt, phaseAt + FADE_MS * 2 + showMs, FADE_MS, FADE_MS) * level);
      } else if (phase === 'reveal') {
        f.fill(0, split, rgb, ramp(now, phaseAt, FADE_MS) * level);
        const guess = guesses.get(order[showing]);
        if (guess) f.fill(split + 1, n, hueSatRgb(guess), envelope(now, shownAt, shownAt + stepMs - GUESS_GAP_MS, GUESS_IN_MS, GUESS_OUT_MS) * level);
      }
    },
  };
};
