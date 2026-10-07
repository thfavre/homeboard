import { GAME_COLORS, type GameColor, type ReflexTap, type ReflexView } from '../../../shared/games.ts';
import { HbError } from '../../core/util.ts';
import { best, type GameFactory } from './engine.ts';

const READY_MS = 1800;
const GO_MS = 3000;
/** A miss (too early, wrong color, no tap) counts as this */
const PENALTY_MS = GO_MS;
const DONE_MS = 1400;
/**
 * Reveal: one round at a time for everyone (the times pop in quickly one after the other), so it
 * lasts the same with 2 or 10 players: about 9 s for 5 rounds, 14.5 s at most
 */
const ROUND_MS = 1300;
const ROUNDS_MAX_MS = 12_000;
const CASCADE_MS = 150;
const REVEAL_LEAD_MS = 1000;
const REVEAL_HOLD_MS = 1500;

/** Color Reflex: everyone taps the color of the lights as fast as they can; times stay secret until the reveal */
export const colorReflex: GameFactory = (m) => {
  const rounds = Math.max(1, m.settings.reflexRounds);
  let round = 0;
  let step: ReflexView['step'] = 'ready';
  let color: GameColor | null = null;
  let previous: GameColor | null = null;
  let goAt = 0;
  /** This round's taps */
  let taps = new Map<string, ReflexTap>();
  const history = new Map<string, ReflexTap[]>(m.players.map((p) => [p.id, []]));
  let revealAt = 0;
  let stepMs = 0;
  let cascadeMs = 0;

  const score = (t: ReflexTap) => t.ms ?? PENALTY_MS;
  const total = (id: string) => history.get(id)!.reduce((s, t) => s + score(t), 0);

  const nextRound = () => {
    round += 1;
    step = 'ready';
    previous = color ?? previous;
    color = null;
    taps = new Map();
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
    if (step !== 'wait') return;
    const choices = GAME_COLORS.map((c) => c.id).filter((c) => c !== previous);
    color = choices[Math.floor(Math.random() * choices.length)];
    step = 'go';
    goAt = Date.now();
    m.light(color);
    m.deadline(GO_MS);
    const r = round;
    // Only this round: it may have ended early, when everyone had tapped
    m.later(GO_MS, () => round === r && endRound());
    m.publish();
    // Everyone jumped the gun: nothing to wait for
    if (m.players.every((p) => taps.has(p.id))) m.later(400, endRound);
  };

  const endRound = () => {
    if (step !== 'go') return;
    step = 'done';
    m.deadline(null);
    for (const p of m.players) history.get(p.id)!.push(taps.get(p.id) ?? { ms: null, miss: 'none' });
    m.publish();
    m.later(DONE_MS, () => (round < rounds ? nextRound() : reveal()));
  };

  const reveal = () => {
    step = 'reveal';
    m.light(null);
    stepMs = Math.round(Math.min(ROUND_MS, ROUNDS_MAX_MS / rounds));
    // Everyone's time of a round shows within the first 60% of it
    cascadeMs = Math.round(Math.min(CASCADE_MS, (stepMs * 0.6) / m.players.length));
    revealAt = Date.now() + REVEAL_LEAD_MS;
    m.publish();
    m.later(REVEAL_LEAD_MS + rounds * stepMs + REVEAL_HOLD_MS, end);
  };

  const end = () => {
    const hits = (id: string) => history.get(id)!.filter((t) => t.ms !== null);
    const winners = best(m.players, total, false);
    m.finish({
      winners,
      lines: [...m.players]
        .sort((a, b) => total(a.id) - total(b.id))
        .map((p) => {
          const h = hits(p.id);
          const fastest = h.length ? Math.min(...h.map((t) => t.ms!)) : null;
          return {
            id: p.id,
            label: `${(total(p.id) / 1000).toFixed(2)} s`,
            detail: `${h.length} of ${rounds} right${fastest !== null ? `, fastest ${fastest} ms` : ''}`,
          };
        }),
      perk: { kind: 'lights' },
    });
  };

  return {
    start() {
      nextRound();
    },

    input(id, args) {
      if (taps.has(id)) throw new HbError('Already in for this round');
      if (step === 'ready') return { result: 'ignored' };
      if (step === 'wait') {
        taps.set(id, { ms: null, miss: 'early' });
        m.publish();
        return { result: 'early' };
      }
      if (step !== 'go') return { result: 'late' };
      // Right or wrong stays secret until the reveal
      taps.set(id, args?.color === color ? { ms: Date.now() - goAt } : { ms: null, miss: 'wrong' });
      if (m.players.every((p) => taps.has(p.id))) m.later(400, endRound);
      m.publish();
      return { result: 'in' };
    },

    view(role): ReflexView {
      return {
        round,
        rounds,
        step,
        tapped: [...taps.keys()],
        // Phones only learn the color once the round is over
        color: role === 'guest' && step === 'go' ? null : color,
        penaltyMs: PENALTY_MS,
        ...(step === 'reveal' ? { taps: Object.fromEntries(history), revealAt, stepMs, cascadeMs } : {}),
      };
    },
  };
};
