import { GAME_COLORS, type GameColor, type SimonView } from '../../../shared/games.ts';
import { HbError } from '../../core/util.ts';
import { best, type GameFactory } from './engine.ts';

const MAX_ROUNDS = 25;
const BETWEEN_MS = 2200;

const randomColor = (): GameColor => GAME_COLORS[Math.floor(Math.random() * GAME_COLORS.length)].id;

/** Light Simon: repeat the growing color sequence played by the lights */
export const lightSimon: GameFactory = (m) => {
  const firstLength = Math.max(1, m.settings.simonStart);
  const sequence: GameColor[] = [];
  let round = 0;
  let step: SimonView['step'] = 'between';
  let alive = m.players.map((p) => p.id);
  let done = new Set<string>();
  let failed = new Set<string>();
  let progress = new Map<string, number>();
  /** Longest sequence each player repeated */
  const completed = new Map<string, number>();
  /** Right taps in the round where they were knocked out */
  const lastTry = new Map<string, number>();
  let over = false;

  const nextRound = () => {
    round += 1;
    while (sequence.length < firstLength - 1 + round) sequence.push(randomColor());
    done = new Set();
    failed = new Set();
    progress = new Map();
    step = 'show';
    m.deadline(null);
    // Faster flashes as the rounds go
    const on = Math.max(320, 620 - round * 25);
    const off = Math.max(140, 240 - round * 8);
    let t = 900;
    sequence.forEach((c) => {
      m.later(t, () => m.light(c));
      m.later(t + on, () => m.light(null));
      t += on + off;
    });
    m.later(t + 200, startInput);
    m.publish();
  };

  const startInput = () => {
    step = 'input';
    // Plenty of time: the challenge is the memory, not the speed
    const ms = 6000 + sequence.length * 1500;
    m.deadline(ms);
    m.later(ms, endRound);
    m.publish();
  };

  const endRound = () => {
    if (step !== 'input' || over) return;
    step = 'between';
    m.deadline(null);
    for (const id of alive) {
      if (done.has(id)) completed.set(id, sequence.length);
      else lastTry.set(id, progress.get(id) ?? 0);
    }
    const survivors = alive.filter((id) => done.has(id));
    if (survivors.length === 0) {
      // Everyone slipped in the same round: the furthest in the sequence wins
      const before = alive;
      return finish(best(m.players.filter((p) => before.includes(p.id)), (id) => lastTry.get(id) ?? 0));
    }
    alive = survivors;
    if (survivors.length === 1 || round >= MAX_ROUNDS) return finish(survivors);
    m.publish();
    m.later(BETWEEN_MS, nextRound);
  };

  const finish = (winners: string[]) => {
    over = true;
    m.light(null);
    const score = (id: string) => (completed.get(id) ?? 0) * 100 + (lastTry.get(id) ?? 0);
    m.finish({
      winners,
      lines: [...m.players]
        .sort((a, b) => Number(winners.includes(b.id)) - Number(winners.includes(a.id)) || score(b.id) - score(a.id))
        .map((p) => {
          const n = completed.get(p.id) ?? 0;
          return { id: p.id, label: n === 1 ? '1 color' : `${n} colors`, detail: n ? `Longest sequence repeated` : 'Out in the first round' };
        }),
    });
  };

  return {
    start() {
      nextRound();
    },

    input(id, args) {
      if (step !== 'input') throw new HbError('Watch the lights first');
      if (!alive.includes(id)) throw new HbError('You are out');
      if (done.has(id) || failed.has(id)) return { ok: !failed.has(id), done: done.has(id) };
      const at = progress.get(id) ?? 0;
      if (args?.color !== sequence[at]) {
        failed.add(id);
        lastTry.set(id, at);
      } else {
        progress.set(id, at + 1);
        if (at + 1 >= sequence.length) done.add(id);
      }
      if (alive.every((p) => done.has(p) || failed.has(p))) m.later(500, endRound);
      m.publish();
      return { ok: !failed.has(id), done: done.has(id) };
    },

    view(role): SimonView {
      return {
        round,
        step,
        length: sequence.length,
        alive,
        done: [...done],
        progress: Object.fromEntries(progress),
        ...(role !== 'guest' ? { flash: m.lightColor } : {}),
      };
    },
  };
};
