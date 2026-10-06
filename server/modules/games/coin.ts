import { randomInt } from 'node:crypto';
import type { CoinView } from '../../../shared/games.ts';
import { HbError } from '../../core/util.ts';
import type { GameFactory } from './engine.ts';

const FLIP_MS = 4000;

/** Coin Flip: the challenger called a side, the coin decides */
export const coinFlip: GameFactory = (m) => {
  const side = m.options.side ?? 'heads';
  const [caller, other] = m.players;
  let outcome: CoinView['outcome'] = null;
  let flipAt: number | null = null;

  return {
    start() {
      flipAt = Date.now();
      const result = randomInt(2) === 0 ? 'heads' : 'tails';
      m.later(FLIP_MS, () => {
        outcome = result;
        m.publish();
        m.later(1800, () => {
          const winner = outcome === side ? caller : other;
          const loser = winner === caller ? other : caller;
          m.finish({
            winners: [winner.id],
            headline: `${outcome === 'heads' ? 'Heads' : 'Tails'}!`,
            lines: [
              { id: winner.id, label: 'Won', detail: winner === caller ? `Called ${side}` : `Had ${side === 'heads' ? 'tails' : 'heads'}` },
              { id: loser.id, label: 'Lost', detail: loser === caller ? `Called ${side}` : `Had ${side === 'heads' ? 'tails' : 'heads'}` },
            ],
          });
        });
      });
      m.publish();
    },

    input() {
      throw new HbError('Nothing to do, watch the coin');
    },

    view(): CoinView {
      return { side, caller: caller.id, outcome, flipAt };
    },
  };
};
