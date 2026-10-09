import { randomInt } from 'node:crypto';
import type { CoinSide, CoinView } from '../../../shared/games.ts';
import { HbError } from '../../core/util.ts';
import type { GameFactory } from './engine.ts';

/** The roulette on the phones that picks who throws */
const DRAW_MS = 4500;
const TOSS_MS = 15_000;
/** From the swipe to the landing on the TV */
const FLIP_MS = 2600;
/** The coin settles and the pot flies to the winner on the TV before the phones show the result */
const SETTLE_MS = 2600;

/**
 * Coin Flip: each player's face is on one side of the coin. A random player throws it from their
 * phone up to the TV, and the face it lands on wins.
 */
export const coinFlip: GameFactory = (m) => {
  const flipper = m.players[randomInt(m.players.length)];
  const [heads, tails] = randomInt(2) === 0 ? [m.players[0], m.players[1]] : [m.players[1], m.players[0]];
  let step: CoinView['step'] = 'draw';
  let drawAt: number | null = null;
  let flipAt: number | null = null;
  let power = 0.5;
  let outcome: CoinSide | null = null;

  const toss = (p: number) => {
    if (step !== 'toss') return;
    step = 'flight';
    power = p;
    flipAt = Date.now();
    m.deadline(null);
    // Decided now, told when the coin lands: nobody knows it while it is in the air
    const result: CoinSide = randomInt(2) === 0 ? 'heads' : 'tails';
    m.later(FLIP_MS, () => {
      outcome = result;
      m.publish();
      m.later(SETTLE_MS, () => {
        const winner = outcome === 'heads' ? heads : tails;
        const loser = winner === heads ? tails : heads;
        const threw = (id: string) => (id === flipper.id ? 'Threw the coin' : undefined);
        m.finish({
          winners: [winner.id],
          headline: `${winner.name}'s face!`,
          lines: [
            { id: winner.id, label: 'Won', detail: threw(winner.id) },
            { id: loser.id, label: 'Lost', detail: threw(loser.id) },
          ],
        });
      });
    });
    m.publish();
  };

  return {
    start() {
      drawAt = Date.now();
      m.later(DRAW_MS, () => {
        step = 'toss';
        m.deadline(TOSS_MS);
        // Nobody swiped: the coin goes up anyway
        m.later(TOSS_MS, () => toss(0.5));
        m.publish();
      });
      m.publish();
    },

    input(playerId, args) {
      if (step !== 'toss') throw new HbError('Nothing to do right now');
      if (playerId !== flipper.id) throw new HbError(`${flipper.name} throws the coin`);
      const p = Number(args?.power);
      toss(Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0.5);
      return true;
    },

    view(): CoinView {
      return { step, flipper: flipper.id, heads: heads.id, tails: tails.id, drawAt, drawMs: DRAW_MS, flipAt, flipMs: FLIP_MS, power, outcome };
    },
  };
};
