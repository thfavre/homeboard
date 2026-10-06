import { BLIND_TARGET_MS, type TimerView } from '../../../shared/games.ts';
import { HbError, num } from '../../core/util.ts';
import { best, type GameFactory } from './engine.ts';

const COUNTDOWN_MS = 3000;
/** Nobody can stop after this */
const MAX_MS = 20_000;

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/** Blind Timer: stop the hidden clock as close as possible to 10.00 seconds */
export const blindTimer: GameFactory = (m) => {
  let startAt: number | null = null;
  const times = new Map<string, number>();
  let over = false;

  const end = () => {
    if (over) return;
    over = true;
    const diff = (id: string) => (times.has(id) ? Math.abs(times.get(id)! - BLIND_TARGET_MS) : null);
    const order = [...m.players].sort((a, b) => (diff(a.id) ?? Infinity) - (diff(b.id) ?? Infinity));
    m.finish({
      winners: best(m.players, diff, false),
      lines: order.map((p) => {
        const t = times.get(p.id);
        if (t === undefined) return { id: p.id, label: 'No stop', detail: 'Did not tap in time' };
        const d = t - BLIND_TARGET_MS;
        return { id: p.id, label: seconds(t), detail: d === 0 ? 'Perfect' : `${d > 0 ? '+' : '-'}${(Math.abs(d) / 1000).toFixed(2)} s` };
      }),
    });
  };

  return {
    start() {
      startAt = Date.now() + COUNTDOWN_MS;
      m.deadline(COUNTDOWN_MS + MAX_MS);
      m.later(COUNTDOWN_MS + MAX_MS, end);
    },

    input(id, args) {
      if (!startAt || over) throw new HbError('Not now');
      if (times.has(id)) throw new HbError('You already stopped');
      const serverElapsed = Date.now() - startAt;
      if (serverElapsed < 0) throw new HbError('Wait for GO');
      // The phone measures the time itself (no network delay); it can only be a little earlier
      const claimed = num(args?.elapsed, serverElapsed);
      const elapsed = Math.round(Math.min(serverElapsed, Math.max(serverElapsed - 1500, claimed)));
      times.set(id, elapsed);
      if (times.size >= m.players.length) m.later(600, end);
      else m.publish();
      return true;
    },

    view(): TimerView {
      return {
        startAt,
        stopped: [...times.keys()],
        ...(over ? { times: Object.fromEntries(m.players.map((p) => [p.id, times.get(p.id) ?? null])) } : {}),
      };
    },
  };
};
