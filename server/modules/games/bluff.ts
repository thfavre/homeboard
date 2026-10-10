import { bluffDeal, bluffGain, type BluffChoice, type BluffView } from '../../../shared/games.ts';
import { HbError } from '../../core/util.ts';
import type { GameFactory } from './engine.ts';

/** Both chose: a short pause before the cards turn over */
const REVEAL_MS = 1500;

const LABEL: Record<BluffChoice, string> = { share: 'Share', steal: 'Steal' };

/** Bluff: both secretly share or steal the pot (amounts dealt when the duel started, see BluffDeal) */
export const bluff: GameFactory = (m) => {
  const choices = new Map<string, BluffChoice>();
  const deal = m.options.bluff ?? bluffDeal(m.stake, m.reward('games.bluff'), m.settings.bluffMultiplier);
  // The host's time to choose (settings saved before it existed have none)
  const chooseMs = (m.settings.bluffChooseSec || 30) * 1000;
  /** Each player's own deadline: their clock starts when the cards show on their phone */
  const endsAt = new Map<string, number>();
  let over = false;
  /** Both are done: no more changes during the short pause before the reveal */
  let locked = false;

  const timeUp = (id: string) => (endsAt.get(id) ?? Infinity) <= Date.now();

  const startClock = (id: string) => {
    if (endsAt.has(id) || over) return;
    endsAt.set(id, Date.now() + chooseMs);
    // A little after the deadline: a timer firing a few ms early would find the time not up yet
    m.later(chooseMs + 50, check);
    m.publish();
  };

  /** Everyone has chosen or run out of time: turn the cards over */
  const check = () => {
    if (locked || over) return;
    if (!m.players.every((p) => choices.has(p.id) || timeUp(p.id))) return;
    locked = true;
    m.later(REVEAL_MS, end);
    m.publish();
  };

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
      // A phone that never shows the cards still gets its clock started, so the duel always ends
      m.later(chooseMs, () => m.players.forEach((p) => startClock(p.id)));
      m.publish();
    },

    input(id, args) {
      // The phone shows the cards: its clock starts
      if (args?.seen) {
        startClock(id);
        return true;
      }
      if (over || locked) throw new HbError('Too late');
      if (timeUp(id)) throw new HbError('Time is up');
      const choice = args?.choice;
      if (choice !== 'share' && choice !== 'steal') throw new HbError('Share or steal?');
      // Changing your mind is allowed until both are done
      choices.set(id, choice);
      // Choosing before the phone said it shows the cards (a lost message): the clock starts now
      startClock(id);
      check();
      m.publish();
      return true;
    },

    view(): BluffView {
      return {
        chosen: [...choices.keys()],
        endsAt: Object.fromEntries(endsAt),
        chooseMs,
        locked,
        ...(over ? { choices: Object.fromEntries(choices) } : {}),
      };
    },
  };
};
