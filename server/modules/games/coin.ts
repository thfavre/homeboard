import { randomInt } from 'node:crypto';
import type { CoinSide, CoinView } from '../../../shared/games.ts';
import { HbError } from '../../core/util.ts';
import type { GameFactory } from './engine.ts';

/** The roulette on the TV that picks who calls the side */
const DRAW_MS = 4500;
const CALL_MS = 15_000;
const TOSS_MS = 15_000;
/** From the swipe to the landing */
const FLIP_MS = 4000;

const other = (side: CoinSide): CoinSide => (side === 'heads' ? 'tails' : 'heads');

/** Coin Flip: a random player calls the side, the other one flicks the coin from their phone to the TV */
export const coinFlip: GameFactory = (m) => {
  const callerIndex = randomInt(m.players.length);
  const caller = m.players[callerIndex];
  const flipper = m.players[1 - callerIndex];
  let step: CoinView['step'] = 'draw';
  let drawAt: number | null = null;
  let side: CoinSide | null = null;
  let flipAt: number | null = null;
  let power = 0.5;
  let outcome: CoinSide | null = null;

  const call = (s: CoinSide) => {
    if (step !== 'call') return;
    side = s;
    step = 'toss';
    m.deadline(TOSS_MS);
    // Nobody swiped: the coin goes up anyway
    m.later(TOSS_MS, () => toss(0.5));
  };

  const toss = (p: number) => {
    if (step !== 'toss') return;
    step = 'flight';
    power = p;
    flipAt = Date.now();
    m.deadline(null);
    const result: CoinSide = randomInt(2) === 0 ? 'heads' : 'tails';
    m.later(FLIP_MS, () => {
      outcome = result;
      m.publish();
      m.later(1800, () => {
        const winner = outcome === side ? caller : flipper;
        const loser = winner === caller ? flipper : caller;
        const detail = (who: typeof caller) => (who === caller ? `Called ${side}` : `Had ${other(side!)}`);
        m.finish({
          winners: [winner.id],
          headline: `${outcome === 'heads' ? 'Heads' : 'Tails'}!`,
          lines: [
            { id: winner.id, label: 'Won', detail: detail(winner) },
            { id: loser.id, label: 'Lost', detail: detail(loser) },
          ],
        });
      });
    });
  };

  return {
    start() {
      drawAt = Date.now();
      m.later(DRAW_MS, () => {
        step = 'call';
        m.deadline(CALL_MS);
        // No answer: the coin calls it for them
        m.later(CALL_MS, () => call(randomInt(2) === 0 ? 'heads' : 'tails'));
      });
      m.publish();
    },

    input(playerId, args) {
      if (step === 'call') {
        if (playerId !== caller.id) throw new HbError(`${caller.name} calls the side`);
        if (args?.side !== 'heads' && args?.side !== 'tails') throw new HbError('Pick heads or tails');
        call(args.side);
      } else if (step === 'toss') {
        if (playerId !== flipper.id) throw new HbError(`${flipper.name} flips the coin`);
        const p = Number(args?.power);
        toss(Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0.5);
      } else {
        throw new HbError('Nothing to do right now, watch the TV');
      }
      m.publish();
      return true;
    },

    view(): CoinView {
      return { step, caller: caller.id, flipper: flipper.id, drawAt, drawMs: DRAW_MS, side, flipAt, power, outcome };
    },
  };
};
