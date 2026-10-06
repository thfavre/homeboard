import { GAME_COLORS, type GameColor, type ReflexView } from '../../../shared/games.ts';
import { HbError } from '../../core/util.ts';
import { best, type GameFactory } from './engine.ts';

const READY_MS = 1800;
const GO_MS = 3000;
const SHOW_MS = 2600;

/** Color Reflex: tap the color the lights turn, before everyone else */
export const colorReflex: GameFactory = (m) => {
  const rounds = Math.max(1, m.settings.reflexRounds);
  let round = 0;
  let step: ReflexView['step'] = 'ready';
  let color: GameColor | null = null;
  let previous: GameColor | null = null;
  let goAt = 0;
  let out = new Set<string>();
  let roundWinner: string | null = null;
  let reactionMs: number | null = null;
  const scores = new Map<string, number>(m.players.map((p) => [p.id, 0]));
  const fastest = new Map<string, number>();

  const nextRound = () => {
    round += 1;
    step = 'ready';
    previous = color ?? previous;
    color = null;
    out = new Set();
    roundWinner = null;
    reactionMs = null;
    m.light(null);
    m.deadline(null);
    m.publish();
    m.later(READY_MS, () => {
      step = 'wait';
      m.publish();
      m.later(1500 + Math.random() * 3500, go);
    });
  };

  const go = () => {
    const choices = GAME_COLORS.map((c) => c.id).filter((c) => c !== previous);
    color = choices[Math.floor(Math.random() * choices.length)];
    step = 'go';
    goAt = Date.now();
    m.light(color);
    m.deadline(GO_MS);
    m.later(GO_MS, () => step === 'go' && endRound());
    m.publish();
  };

  const endRound = () => {
    step = 'won';
    m.deadline(null);
    m.publish();
    m.later(SHOW_MS, () => {
      if (round < rounds) return nextRound();
      m.light(null);
      const order = [...m.players].sort((a, b) => scores.get(b.id)! - scores.get(a.id)! || (fastest.get(a.id) ?? 1e9) - (fastest.get(b.id) ?? 1e9));
      m.finish({
        winners: best(m.players, (id) => scores.get(id) || null),
        lines: order.map((p) => {
          const s = scores.get(p.id)!;
          const f = fastest.get(p.id);
          return { id: p.id, label: `${s} ${s === 1 ? 'point' : 'points'}`, detail: f ? `Fastest: ${f} ms` : 'No round won' };
        }),
      });
    });
  };

  return {
    start() {
      nextRound();
    },

    input(id, args) {
      if (out.has(id)) throw new HbError('Wait for the next round');
      if (step === 'ready') return { result: 'ignored' };
      if (step === 'wait') {
        out.add(id);
        m.publish();
        return { result: 'early' };
      }
      if (step !== 'go') return { result: 'late' };
      if (args?.color !== color) {
        out.add(id);
        if (m.players.every((p) => out.has(p.id))) endRound();
        else m.publish();
        return { result: 'wrong' };
      }
      roundWinner = id;
      reactionMs = Date.now() - goAt;
      scores.set(id, scores.get(id)! + 1);
      if (!fastest.has(id) || reactionMs < fastest.get(id)!) fastest.set(id, reactionMs);
      endRound();
      return { result: 'won', ms: reactionMs };
    },

    view(role): ReflexView {
      return {
        round,
        rounds,
        step,
        scores: Object.fromEntries(scores),
        out: [...out],
        roundWinner,
        reactionMs,
        // Phones only learn the color once the round is decided
        color: role === 'guest' && step === 'go' ? null : color,
      };
    },
  };
};
