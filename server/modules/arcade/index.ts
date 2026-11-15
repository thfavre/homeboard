import {
  ARCADE_COUNTDOWN_MS,
  ARCADE_DEFAULTS,
  ARCADE_GAMES,
  ARCADE_GRACE_MS,
  ARCADE_INVITE_MS,
  ARCADE_MIX_ROUNDS,
  ARCADE_READY_MS,
  ARCADE_ROUND_MS,
  arcadeGame,
  isArcadeGame,
  type ArcadeGameId,
  type ArcadeInvite,
  type ArcadeMatch,
  type ArcadePlayer,
  type ArcadeRecord,
  type ArcadeSettings,
  type ArcadeState,
} from '../../../shared/arcade.ts';
import { formatAmount } from '../../../shared/money.ts';
import type { Charge } from '../../core/economy.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import { HbError, clamp, num, uid } from '../../core/util.ts';
import type { GamesApi } from '../games/index.ts';

/** The result stays on the server (and the town's screen) this long; the phones keep it until closed */
const RESULT_MS = 20_000;

interface Invite extends ArcadeInvite {
  charges: Charge[];
  timer: NodeJS.Timeout;
}

interface Match extends ArcadeMatch {
  /** Everything paid for this match, given back if it is cancelled */
  charges: Charge[];
  timer: NodeJS.Timeout | null;
  /** When each player's last score came in (a score is a number they can only send so fast) */
  lastAt: Record<string, number>;
}

/** What the Arcade shares with other modules */
export interface ArcadeApi {
  /** Is this guest playing in the Arcade, or has a challenge waiting there? */
  busy(guestId: string): boolean;
  /** The guests playing a match right now (their characters go to the arcade) */
  players(): string[];
}

const player = (g: Guest): ArcadePlayer => ({ id: g.id, name: g.name, color: g.color });

/**
 * The Arcade: 1 vs 1 games played on the two phones, with a bet. A challenge is one game or a Mix
 * of three; each round both players play the same run (same seed), their phones send the score as
 * it goes, and the best score wins the round. The town shows the players going into the arcade
 * and the scores on its screen.
 */
export default defineModule<ArcadeSettings>({
  id: 'arcade',
  name: 'Arcade',
  description: 'Quick 1 vs 1 games on the phones, with a bet, in the town arcade',
  settings: ARCADE_DEFAULTS,

  setup(ctx) {
    const invites = new Map<string, Invite>();
    const matches = new Map<string, Match>();
    /** The best score of each game this party */
    let records: Partial<Record<ArcadeGameId, ArcadeRecord>> = {};

    ctx.price({ key: 'arcade.challenge', label: 'Challenge someone in the Arcade', default: 1000 });

    const games = () => ctx.use<GamesApi>('games');
    const fmt = (amount: number) => `${formatAmount(amount)} ${ctx.economy.currency.symbol}`;
    const offered = () => ctx.settings.get().games;
    const alive = (m: Match) => matches.get(m.id) === m;
    /** The match this guest plays in (not one whose result is showing) */
    const matchOf = (guestId: string) => [...matches.values()].find((m) => m.phase !== 'result' && m.players.some((p) => p.id === guestId));
    const inInvite = (guestId: string) => [...invites.values()].some((i) => i.from.id === guestId || i.to.id === guestId);
    const busy = (guestId: string) => !!matchOf(guestId) || inInvite(guestId);

    const cleanStake = (raw: unknown): number => {
      if (!ctx.economy.enabled) return 0;
      const stake = Math.round(num(raw, 0));
      if (stake < 0) throw new HbError('The bet cannot be negative');
      const max = ctx.settings.get().maxStake;
      if (max > 0 && stake > max) throw new HbError(`Bets are limited to ${fmt(max)}`);
      return stake;
    };

    /** Throws when this guest is already playing or has a challenge waiting (who: their name, or null for "you") */
    const checkFree = (guestId: string, who: string | null) => {
      if (matchOf(guestId) || games()?.busy(guestId)) throw new HbError(who ? `${who} is already in a game` : 'You are already in a game');
      if (inInvite(guestId)) throw new HbError(who ? `${who} already has a challenge waiting` : 'You already have a challenge waiting');
    };

    /** Money back with one notification per guest (see the Games module) */
    const refundAll = (charges: Charge[], why: string, alsoTell: string[] = []) => {
      const back = new Map<string, number>(alsoTell.map((id) => [id, 0]));
      for (const c of charges) {
        if (!c.amount || !ctx.session.guests.has(c.guest.id)) continue;
        ctx.economy.refund(c);
        back.set(c.guest.id, (back.get(c.guest.id) ?? 0) + c.amount);
      }
      for (const [id, amount] of back) {
        const guest = ctx.session.guests.get(id);
        if (guest) ctx.toast(guest, amount ? { text: `${why}, money back`, amount, kind: 'info' } : { text: why, kind: 'info' });
      }
    };

    /** A Mix: different games drawn at random among the ones offered (fewer when fewer are offered) */
    const drawMix = (): ArcadeGameId[] => {
      const pool = [...offered()];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, ARCADE_MIX_ROUNDS);
    };

    // ------------------------------------------------------------ challenges

    const dropInvite = (inv: Invite, why: string | null) => {
      clearTimeout(inv.timer);
      invites.delete(inv.id);
      if (why) refundAll(inv.charges, why, [inv.from.id]);
      ctx.publish();
    };

    /** A challenge from `guest` to `to`: one game, or 'mix' */
    const challenge = (guest: Guest, to: unknown, game: unknown, rawStake: unknown) => {
      const mix = game === 'mix';
      if (!mix && (!isArcadeGame(game) || !offered().includes(game))) throw new HbError('This game is not in the Arcade');
      if (mix && offered().length < 2) throw new HbError('A Mix needs at least two games in the Arcade');
      const opponent = ctx.session.guests.get(String(to ?? ''));
      if (!opponent) throw new HbError('Pick someone to challenge');
      if (opponent.id === guest.id) throw new HbError('You cannot challenge yourself');
      if (opponent.sockets === 0) throw new HbError(`${opponent.name} is not online`);
      checkFree(guest.id, null);
      checkFree(opponent.id, opponent.name);
      const stake = cleanStake(rawStake);
      if (stake > opponent.balance) throw new HbError(`${opponent.name} cannot match that bet`);
      const list = mix ? drawMix() : [game as ArcadeGameId];
      const title = mix ? 'Arcade Mix' : arcadeGame(list[0])!.name;

      const fee = ctx.economy.charge(guest, 'arcade.challenge', 1, `Arcade: ${title}`);
      let bet: Charge;
      try {
        bet = ctx.economy.pay(guest, stake, `Arcade bet: ${title}`);
      } catch (err) {
        ctx.economy.refund(fee);
        throw err;
      }
      const inv: Invite = {
        id: uid(6),
        from: player(guest),
        to: player(opponent),
        games: list,
        mix,
        stake,
        expiresAt: Date.now() + ARCADE_INVITE_MS,
        charges: [fee, bet],
        timer: setTimeout(() => {
          if (invites.has(inv.id)) dropInvite(inv, `${opponent.name} did not answer your challenge`);
        }, ARCADE_INVITE_MS),
      };
      invites.set(inv.id, inv);
      ctx.activity(`{name} challenged ${opponent.name} to ${title} in the Arcade${stake ? ` for ${fmt(stake)}` : ''}`, { guest, sensitive: true });
      ctx.publish();
      return { id: inv.id };
    };

    ctx.onGuest('invite', (args, guest) => challenge(guest, args?.to, args?.game, args?.stake));

    /** The same challenge again, from the end of a match: the same game (a new draw for a Mix), the same bet */
    ctx.onGuest('rematch', (args, guest) => {
      const m = matches.get(String(args?.match ?? ''));
      const other = m?.players.find((p) => p.id !== guest.id);
      if (!m || !other || !m.players.some((p) => p.id === guest.id)) throw new HbError('This match is over');
      const stake = Math.min(m.stake, ctx.settings.get().maxStake || Infinity);
      return challenge(guest, other.id, m.mix ? 'mix' : m.games[0], stake);
    });

    ctx.onGuest('respond', (args, guest) => {
      const inv = invites.get(String(args?.id ?? ''));
      if (!inv || inv.to.id !== guest.id) throw new HbError('This challenge is gone');
      const from = ctx.session.guests.get(inv.from.id);
      if (!args?.accept || !from) {
        dropInvite(inv, `${guest.name} declined your challenge`);
        return true;
      }
      if (games()?.busy(guest.id)) throw new HbError('Finish your game first');
      const bet = ctx.economy.pay(guest, inv.stake, `Arcade bet: ${inv.mix ? 'Arcade Mix' : arcadeGame(inv.games[0])!.name}`);
      dropInvite(inv, null);
      const m: Match = {
        id: uid(6),
        players: [inv.from, player(guest)],
        games: inv.games,
        mix: inv.mix,
        stake: inv.stake,
        pot: inv.stake * 2,
        rounds: [],
        wins: { [inv.from.id]: 0, [guest.id]: 0 },
        phase: 'ready',
        ready: [],
        startsAt: null,
        endsAt: null,
        charges: [...inv.charges, bet],
        timer: null,
        lastAt: {},
      };
      matches.set(m.id, m);
      nextRound(m);
      ctx.activity(`{name} took on ${inv.from.name} in the Arcade`, { guest, sensitive: true });
      return true;
    });

    ctx.onGuest('cancelInvite', (args, guest) => {
      const inv = invites.get(String(args?.id ?? ''));
      if (!inv || inv.from.id !== guest.id) return false;
      dropInvite(inv, 'Challenge cancelled');
      return true;
    });

    // ------------------------------------------------------------ rounds

    /** Run `fn` at `at` (server time), replacing what the match was waiting for */
    const at = (m: Match, when: number, fn: () => void) => {
      if (m.timer) clearTimeout(m.timer);
      m.timer = setTimeout(
        () => {
          m.timer = null;
          if (alive(m)) fn();
        },
        Math.max(0, when - Date.now()),
      );
    };

    const round = (m: Match) => m.rounds[m.rounds.length - 1];

    /** The rules of the next game, until both are ready (or the time is up) */
    const nextRound = (m: Match) => {
      const game = m.games[m.rounds.length];
      m.rounds.push({ game, seed: Math.floor(Math.random() * 2 ** 31), scores: Object.fromEntries(m.players.map((p) => [p.id, 0])), done: [] });
      m.phase = 'ready';
      m.ready = [];
      m.startsAt = null;
      m.endsAt = Date.now() + ARCADE_READY_MS;
      at(m, m.endsAt, () => play(m));
      ctx.publish();
    };

    /** 3, 2, 1, go: both phones start the same run at startsAt */
    const play = (m: Match) => {
      if (m.phase !== 'ready') return;
      const info = arcadeGame(round(m).game)!;
      m.phase = 'play';
      m.startsAt = Date.now() + ARCADE_COUNTDOWN_MS;
      m.endsAt = m.startsAt + info.seconds * 1000 + ARCADE_GRACE_MS;
      at(m, m.endsAt, () => endRound(m));
      ctx.publish();
    };

    ctx.onGuest('ready', (args, guest) => {
      const m = matches.get(String(args?.match ?? ''));
      if (!m || m.phase !== 'ready' || !m.players.some((p) => p.id === guest.id)) return false;
      if (!m.ready.includes(guest.id)) m.ready.push(guest.id);
      if (m.ready.length === m.players.length) play(m);
      else ctx.publish();
      return true;
    });

    /** A player's score as their run goes; `over`: their run is over (a mistake, or the time is up) */
    ctx.onGuest('score', (args, guest) => {
      const m = matches.get(String(args?.match ?? ''));
      if (!m || m.phase !== 'play' || !m.startsAt || !m.players.some((p) => p.id === guest.id)) return false;
      const r = round(m);
      if (Number(args?.round) !== m.rounds.length - 1 || r.done.includes(guest.id)) return false;
      const info = arcadeGame(r.game)!;
      const now = Date.now();
      // No more than the best players could make in the time since the start (the phones' clocks drift a little)
      const elapsed = Math.max(0, now - m.startsAt + 1500) / 1000;
      const most = Math.ceil(elapsed * info.maxPerSec) + 2;
      r.scores[guest.id] = Math.round(clamp(num(args?.score, 0), 0, most));
      m.lastAt[guest.id] = now;
      if (args?.over) r.done.push(guest.id);
      settle(m);
      ctx.publish();
      return true;
    });

    /**
     * Ends the round once both runs are over, or as soon as the one still playing passes the score of
     * the one who is out (a game of one life: nothing more can change)
     */
    const settle = (m: Match) => {
      const r = round(m);
      if (r.done.length === m.players.length) {
        endRound(m);
        return;
      }
      const info = arcadeGame(r.game)!;
      if (!info.oneLife || r.done.length !== 1) return;
      const out = r.done[0];
      const still = m.players.find((p) => p.id !== out)!.id;
      if (r.scores[still] > r.scores[out]) endRound(m);
    };

    const endRound = (m: Match) => {
      if (m.phase !== 'play') return;
      const r = round(m);
      const [a, b] = m.players.map((p) => p.id);
      r.winner = r.scores[a] > r.scores[b] ? a : r.scores[b] > r.scores[a] ? b : null;
      if (r.winner) m.wins[r.winner]++;
      // The best score of the game this party, and each player's own best
      for (const p of m.players) {
        const score = r.scores[p.id];
        const guest = ctx.session.guests.get(p.id);
        if (guest && score > 0) ctx.session.best(guest, `arcade:${r.game}`, score);
        if (score > 0 && score > (records[r.game]?.score ?? 0)) records = { ...records, [r.game]: { name: p.name, color: p.color, score } };
      }
      m.phase = 'round';
      m.startsAt = null;
      m.endsAt = Date.now() + ARCADE_ROUND_MS;
      at(m, m.endsAt, () => (over(m) ? finish(m) : nextRound(m)));
      ctx.publish();
    };

    /** The match is decided: one game played, or a Mix that one player won most of (or all its games played) */
    const over = (m: Match) => {
      const need = Math.floor(m.games.length / 2) + 1;
      return m.rounds.length >= m.games.length || Object.values(m.wins).some((w) => w >= need);
    };

    const finish = (m: Match) => {
      const [a, b] = m.players.map((p) => p.id);
      const winner = m.wins[a] > m.wins[b] ? a : m.wins[b] > m.wins[a] ? b : null;
      const title = m.mix ? 'Arcade Mix' : arcadeGame(m.games[0])!.name;
      const payouts: Record<string, number> = { [a]: 0, [b]: 0 };
      if (winner) payouts[winner] = m.pot;
      else for (const p of m.players) payouts[p.id] = m.stake;
      for (const p of m.players) {
        const guest = ctx.session.guests.get(p.id);
        if (!guest) continue;
        ctx.session.count(guest, 'games');
        if (p.id === winner) ctx.session.count(guest, 'wins');
        const amount = payouts[p.id];
        if (amount <= 0) continue;
        // A bet coming back was never really spent: it does not count as earned
        if (p.id === winner) ctx.economy.credit(guest, amount, `${title}: winnings`);
        else ctx.economy.giveBack(guest, amount, `${title}: bet back`);
        ctx.toast(guest, { text: p.id === winner ? `${title}: you won` : `${title}: a tie, bet back`, amount, kind: 'success' });
      }
      m.winner = winner;
      m.payouts = payouts;
      m.phase = 'result';
      m.startsAt = null;
      m.endsAt = Date.now() + RESULT_MS;
      const top = winner ? ctx.session.guests.get(winner) : undefined;
      const loser = m.players.find((p) => p.id !== winner);
      if (top && loser) ctx.activity(`{name} beat ${loser.name} at ${title}${m.pot ? ` and won ${fmt(m.pot)}` : ''}`, { guest: top });
      at(m, m.endsAt, () => {
        matches.delete(m.id);
        ctx.publish();
      });
      ctx.publish();
    };

    /** Stop a match before its end: everyone gets back what they paid */
    const cancel = (m: Match, why: string, refund = true) => {
      if (m.timer) clearTimeout(m.timer);
      matches.delete(m.id);
      if (m.phase !== 'result') {
        if (refund) refundAll(m.charges, why, m.players.map((p) => p.id));
      }
      ctx.publish();
    };

    // ------------------------------------------------------------ the host

    ctx.onAdmin('stop', (args) => {
      const m = matches.get(String(args?.id ?? ''));
      if (m) cancel(m, 'The host stopped your Arcade match');
    });
    ctx.onAdmin('cancelInvite', (args) => {
      const inv = invites.get(String(args?.id ?? ''));
      if (inv) dropInvite(inv, 'The host cancelled your challenge');
    });
    ctx.onAdmin('resetRecords', () => {
      records = {};
      ctx.publish();
    });
    ctx.onAdmin('setSettings', (args) => {
      const s = ctx.settings.get();
      const bool = (key: 'townWalk' | 'townScreen' | 'sounds') => (typeof args?.[key] === 'boolean' ? args[key] : s[key]);
      ctx.settings.update({
        games: Array.isArray(args?.games) ? ARCADE_GAMES.map((g) => g.id).filter((id) => args.games.includes(id)) : s.games,
        maxStake: args?.maxStake !== undefined ? Math.max(0, Math.round(num(args.maxStake, 0))) : s.maxStake,
        screenSec: args?.screenSec !== undefined ? Math.round(clamp(num(args.screenSec, 5), 2, 30)) : s.screenSec,
        townWalk: bool('townWalk'),
        townScreen: bool('townScreen'),
        sounds: bool('sounds'),
      });
      ctx.publish();
    });

    // ------------------------------------------------------------ state

    ctx.provide<ArcadeApi>('arcade', {
      busy,
      players: () => (ctx.settings.get().townWalk ? [...matches.values()].filter((m) => m.phase !== 'result').flatMap((m) => m.players.map((p) => p.id)) : []),
    });

    const plain = ({ charges: _c, timer: _t, lastAt: _l, ...m }: Match): ArcadeMatch => m;

    ctx.state((role): ArcadeState => {
      const guests = [...ctx.session.guests.values()];
      return {
        invites: role === 'tv' ? [] : [...invites.values()].map(({ charges: _c, timer: _t, ...inv }) => inv),
        matches: [...matches.values()].map(plain),
        records,
        online: role === 'tv' ? [] : guests.filter((g) => g.sockets > 0).map((g) => ({ ...player(g), balance: g.balance })),
        busy: role === 'tv' ? [] : guests.filter((g) => busy(g.id) || games()?.busy(g.id)).map((g) => g.id),
        settings: ctx.settings.get(),
      };
    });

    // A guest removed by the host: their challenges go, and a match they were in is called off
    ctx.session.on('guest-removed', (g: Guest) => {
      for (const inv of [...invites.values()]) {
        if (inv.from.id === g.id) dropInvite(inv, null);
        else if (inv.to.id === g.id) dropInvite(inv, `${g.name} left the party`);
      }
      const m = matchOf(g.id);
      if (m) cancel(m, `${g.name} left the party, match cancelled`);
    });
    // Opponents come and go and their balance changes: keep the list fresh (publish is throttled)
    ctx.session.on('guests-changed', () => ctx.publish());
    ctx.session.on('guest-changed', () => ctx.publish());

    const stopAll = (refund: boolean) => {
      for (const inv of [...invites.values()]) dropInvite(inv, refund ? 'Your challenge was cancelled' : null);
      for (const m of [...matches.values()]) cancel(m, 'The Arcade was closed', refund);
    };
    ctx.onToggle((on) => {
      if (!on) stopAll(true);
    });
    ctx.onSessionReset(() => {
      stopAll(false);
      records = {};
    });
    ctx.onShutdown(() => stopAll(true));
  },
});
