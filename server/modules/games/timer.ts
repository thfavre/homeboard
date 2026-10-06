import { randomInt } from 'node:crypto';
import { BLIND_TARGET_SEC, type TimerRound, type TimerView } from '../../../shared/games.ts';
import { HbError, num } from '../../core/util.ts';
import { best, type GameFactory } from './engine.ts';

/** Long enough to read the target before GO */
const COUNTDOWN_MS = 5000;
/** Nobody can stop later than this after the target */
const OVERTIME_MS = 10_000;
/** Not stopping counts as being this far off */
const MISS_MS = OVERTIME_MS;
/** The TV sweeps the time axis, then holds the result */
const REVEAL_MS = 11_000;

const gap = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/**
 * Blind Timer: stop the hidden clock as close as possible to a random target time,
 * over several rounds. Nobody can see who stopped until the round is revealed.
 */
export const blindTimer: GameFactory = (m) => {
  const rounds = Math.max(1, m.settings.timerRounds);
  let round = 0;
  let step: TimerView['step'] = 'countdown';
  let target = 0;
  let startAt = 0;
  let times = new Map<string, number>();
  const history: TimerRound[] = [];
  const totals = new Map<string, number>(m.players.map((p) => [p.id, 0]));
  const wins = new Map<string, number>(m.players.map((p) => [p.id, 0]));

  const nextRound = () => {
    round += 1;
    step = 'countdown';
    target = randomInt(BLIND_TARGET_SEC.min, BLIND_TARGET_SEC.max + 1) * 1000;
    times = new Map();
    startAt = Date.now() + COUNTDOWN_MS;
    m.deadline(null);
    m.later(COUNTDOWN_MS, () => {
      step = 'running';
      m.publish();
    });
    const r = round;
    m.later(COUNTDOWN_MS + target + OVERTIME_MS, () => reveal(r));
    m.publish();
  };

  /** Reveal round `r` (timers of a round that already ended do nothing) */
  const reveal = (r: number) => {
    if (r !== round || step === 'reveal') return;
    step = 'reveal';
    // The closest stop wins the round (a tie gives the round to each of them)
    const roundWinners = best(m.players, (id) => (times.has(id) ? Math.abs(times.get(id)! - target) : null), false);
    for (const id of roundWinners) wins.set(id, wins.get(id)! + 1);
    history.push({ target, times: Object.fromEntries(m.players.map((p) => [p.id, times.get(p.id) ?? null])), winners: roundWinners });
    for (const p of m.players) {
      const t = times.get(p.id);
      totals.set(p.id, totals.get(p.id)! + (t === undefined ? MISS_MS : Math.abs(t - target)));
    }
    m.publish();
    m.later(REVEAL_MS, () => (round < rounds ? nextRound() : end()));
  };

  /** Most rounds won first, then the smallest total gap */
  const compare = (a: string, b: string) => wins.get(b)! - wins.get(a)! || totals.get(a)! - totals.get(b)!;

  const end = () => {
    const order = [...m.players].sort((a, b) => compare(a.id, b.id));
    const top = order[0];
    m.finish({
      winners: top && wins.get(top.id)! > 0 ? order.filter((p) => compare(p.id, top.id) === 0).map((p) => p.id) : [],
      lines: order.map((p) => {
        const w = wins.get(p.id)!;
        const missed = history.filter((r) => r.times[p.id] === null).length;
        return {
          id: p.id,
          label: rounds > 1 ? `${w} ${w === 1 ? 'round' : 'rounds'} won` : `${gap(totals.get(p.id)!)} off`,
          detail: rounds > 1 ? `Total gap ${gap(totals.get(p.id)!)}${missed ? `, ${missed} missed` : ''}` : missed ? 'Did not stop' : undefined,
        };
      }),
    });
  };

  return {
    start() {
      nextRound();
    },

    input(id, args) {
      if (step === 'reveal') throw new HbError('Wait for the next round');
      if (times.has(id)) throw new HbError('You already stopped');
      const serverElapsed = Date.now() - startAt;
      if (serverElapsed < 0) throw new HbError('Wait for GO');
      // The phone measures the time itself (no network delay); it can only be a little earlier
      const claimed = num(args?.elapsed, serverElapsed);
      times.set(id, Math.round(Math.min(serverElapsed, Math.max(serverElapsed - 1500, claimed))));
      // Nothing is published: the others must not know who already stopped
      const r = round;
      if (times.size >= m.players.length) m.later(800, () => reveal(r));
      return { round };
    },

    view(): TimerView {
      return { round, rounds, step, target, startAt, history, totals: Object.fromEntries(totals), wins: Object.fromEntries(wins) };
    },
  };
};
