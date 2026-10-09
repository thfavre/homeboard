import { bluffDeal, bluffGain, type BluffChoice, type BluffView } from '../../../shared/games.ts';
import { HbError } from '../../core/util.ts';
import type { GameFactory } from './engine.ts';

const CHOOSE_MS = 30_000;
/** Both chose: a short pause before the cards turn over */
const REVEAL_MS = 1500;

const LABEL: Record<BluffChoice, string> = { share: 'Share', steal: 'Steal' };

/** Bluff: both secretly share or steal the pot (amounts dealt when the duel started, see BluffDeal) */
export const bluff: GameFactory = (m) => {
  const choices = new Map<string, BluffChoice>();
  const deal = m.options.bluff ?? bluffDeal(m.stake, m.reward('games.bluff'), m.settings.bluffMultiplier);
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
    const payouts: Record<string, number> = { [a.id]: bluffGain(deal, ca, cb), [b.id]: bluffGain(deal, cb, ca) };
    let winners: string[] = [];
    let headline: string;
    if (ca === 'share' && cb === 'share') {
      winners = [a.id, b.id];
      headline = 'Both shared';
    } else if (ca === 'steal' && cb === 'steal') {
      headline = 'Both stole, nobody wins';
    } else {
      const thief = ca === 'steal' ? a : b;
      winners = [thief.id];
      headline = `${thief.name} stole the pot`;
    }
    m.finish({
      winners,
      headline,
      payouts,
      lines: m.players.map((p) => {
        const other = m.players.find((x) => x.id !== p.id)!;
        return { id: p.id, label: LABEL[pick(p.id)], detail: `${other.name} chose to ${pick(other.id)}` };
      }),
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
        m.later(REVEAL_MS, end);
      }
      m.publish();
      return true;
    },

    view(): BluffView {
      return { chosen: [...choices.keys()], ...(over ? { choices: Object.fromEntries(choices) } : {}) };
    },
  };
};
