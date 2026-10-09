import type { BluffView } from '../../../shared/games.ts';
import { HbError } from '../../core/util.ts';
import type { GameFactory } from './engine.ts';

const CHOOSE_MS = 30_000;

/** Bluff: both secretly share or steal the pot */
export const bluff: GameFactory = (m) => {
  const choices = new Map<string, 'share' | 'steal'>();
  let over = false;

  const end = () => {
    if (over) return;
    over = true;
    // No choice in time counts as sharing
    const pick = (id: string) => choices.get(id) ?? 'share';
    for (const p of m.players) choices.set(p.id, pick(p.id));
    const [a, b] = m.players;
    const ca = pick(a.id);
    const cb = pick(b.id);
    const payouts: Record<string, number> = { [a.id]: 0, [b.id]: 0 };
    let winners: string[] = [];
    let headline: string;
    if (ca === 'share' && cb === 'share') {
      const bonus = m.reward('games.bluff');
      payouts[a.id] = Math.floor(m.pot / 2) + bonus;
      payouts[b.id] = m.pot - Math.floor(m.pot / 2) + bonus;
      winners = [a.id, b.id];
      headline = 'Both shared';
    } else if (ca === 'steal' && cb === 'steal') {
      headline = 'Both stole, nobody wins';
    } else {
      const thief = ca === 'steal' ? a : b;
      payouts[thief.id] = m.pot;
      winners = [thief.id];
      headline = `${thief.name} stole the pot`;
    }
    m.finish({
      winners,
      headline,
      payouts,
      lines: m.players.map((p) => ({ id: p.id, label: pick(p.id) === 'share' ? 'Share' : 'Steal' })),
    });
  };

  return {
    start() {
      m.deadline(CHOOSE_MS);
      m.later(CHOOSE_MS, end);
    },

    input(id, args) {
      // Locked once both have chosen, during the short pause before the reveal too
      if (over || choices.size >= m.players.length) throw new HbError('Too late');
      const choice = args?.choice;
      if (choice !== 'share' && choice !== 'steal') throw new HbError('Share or steal?');
      // Changing your mind is allowed until both have chosen
      choices.set(id, choice);
      if (choices.size >= m.players.length) {
        m.deadline(null);
        m.later(1500, end);
      }
      m.publish();
      return true;
    },

    view(): BluffView {
      return { chosen: [...choices.keys()], ...(over ? { choices: Object.fromEntries(choices) } : {}) };
    },
  };
};
