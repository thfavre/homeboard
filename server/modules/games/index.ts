import {
  GAMES,
  DUEL_INVITE_MS,
  GAME_COLORS,
  RHYTHM_DEFAULT_LEVEL,
  gameInfo,
  type DuelInvite,
  type GameColor,
  type GameId,
  type GameMode,
  type GamePlayer,
  type GamesSettings,
  type GamesState,
  type MatchPhase,
  type MatchResult,
  type MatchState,
  type Perk,
  type RhythmSongInfo,
} from '../../../shared/games.ts';
import { formatAmount } from '../../../shared/money.ts';
import type { Charge } from '../../core/economy.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import { HbError, clamp, num, uid } from '../../core/util.ts';
import type { LightsApi } from '../wled/index.ts';
import type { GameFactory, GameRuntime, MatchApi, Outcome } from './engine.ts';
import { blindTimer } from './timer.ts';
import { lightSimon } from './simon.ts';
import { colorReflex } from './reflex.ts';
import { perfectCircle } from './circle.ts';
import { bluff } from './bluff.ts';
import { coinFlip } from './coin.ts';
import { rhythmRain } from './rhythm.ts';
import { Turntable } from './turntable.ts';
import { loadSong, searchSongs, songKey, type Song } from './beatsaver.ts';

/** Songs a new party starts with: well known, well rated maps with charts from Easy or Normal to Expert */
const STARTER_SONGS = ['747', '217', '8553', '849a', '141', '1492', '6d63', 'bd3', '13760', '1672a', '3fc90', '8278', '38c26'];

const FACTORIES: Record<GameId, GameFactory> = {
  timer: blindTimer,
  simon: lightSimon,
  reflex: colorReflex,
  circle: perfectCircle,
  bluff,
  coin: coinFlip,
  rhythm: rhythmRain,
};

const LOBBY_MS = 45_000;
/** Time to read the rules; it starts sooner once every player pressed Ready */
const INTRO_MS = 30_000;
const ALL_READY_MS = 3_000;
const RESULT_MS = 15_000;
/** When the Perfect Circle winner scratches, the result closes once it has been up this long */
const RESULT_SCRATCH_MS = 7000;
/** The lights prize fades from one color to the next */
const PERK_FADE_MS = 1000;

interface Invite extends DuelInvite {
  charges: Charge[];
  timer: NodeJS.Timeout;
}

interface Match {
  id: string;
  game: GameId;
  mode: GameMode;
  starter: GamePlayer | null;
  players: GamePlayer[];
  stake: number;
  /** Room game prize paid by the house (null: the "win a room game" reward) */
  prize: number | null;
  phase: MatchPhase;
  endsAt: number | null;
  phaseMs: number;
  runtime: GameRuntime | null;
  result: MatchResult | null;
  /** Everything paid for this match, given back if it is cancelled */
  charges: Charge[];
  timers: Set<NodeJS.Timeout>;
  lightColor: GameColor | null;
  usesLights: boolean;
  ready: Set<string>;
  options: { difficulty?: number; song?: string };
}

const player = (g: Guest): GamePlayer => ({ id: g.id, name: g.name, color: g.color });

/**
 * Mini games on the TV: 1 vs 1 duels where both put money in the pot, or room games
 * that anyone can join. Each game lives in its own file and plugs in through engine.ts.
 */
export default defineModule<GamesSettings>({
  id: 'games',
  name: 'Games',
  description: 'Duels and party games on the TV, played from the phones',
  settings: { enabled: GAMES.map((g) => g.id), maxStake: 0, tvColors: true, timerRounds: 3, circleCount: 3, reflexRounds: 5, simonStart: 1, reflexPerkSec: 60, circlePerkSec: 60, scratchLight: '', rhythmLight: '', rhythmReverse: false, rhythmSec: 45, rhythmSpeed: 100, rhythmSongs: STARTER_SONGS, rhythmAudioOffset: 0 },

  setup(ctx) {
    const invites = new Map<string, Invite>();
    let match: Match | null = null;
    let perk: Perk | null = null;
    let perkTimer: NodeJS.Timeout | null = null;
    /** The scratch record on a light strip, while the scratch prize lasts */
    let turntable: Turntable | null = null;
    /** Match whose result is already set to close early for the scratch */
    let cutShort: string | null = null;

    ctx.price({ key: 'games.duel', label: 'Challenge someone to a duel', default: 5000 });
    ctx.price({ key: 'games.room', label: 'Start a game for the room', default: 5000 });
    ctx.price({ key: 'games.rhythmMusic', label: 'Challenge to Rhythm Rain with music', default: 10000 });

    // ------------------------------------------------------------ the Rhythm Rain song

    const songDir = ctx.mediaDir('rhythm');
    /** The host's songs by key: downloaded once when added, then read from the copy */
    const songs = new Map<string, { info: RhythmSongInfo; song: Song | null }>();
    const loadOne = async (key: string) => {
      songs.set(key, { info: { key, status: 'loading' }, song: null });
      ctx.publish();
      try {
        const s = await loadSong(key, songDir);
        if (!songs.has(key)) return;
        songs.set(key, {
          info: { key, status: 'ready', title: s.title, artist: s.artist, url: ctx.mediaUrl(`rhythm/${s.audio}`), cover: s.cover, preview: s.preview, durationSec: s.durationSec },
          song: s,
        });
      } catch (err) {
        if (!songs.has(key)) return;
        ctx.log.warn('Rhythm Rain song', key, err instanceof Error ? err.message : err);
        songs.set(key, { info: { key, status: 'error', error: err instanceof Error ? err.message : 'Could not load it' }, song: null });
      }
      ctx.publish();
    };
    // One after the other: the first start downloads the starter songs (about 10 MB each)
    void (async () => {
      for (const key of ctx.settings.get().rhythmSongs) songs.set(key, { info: { key, status: 'loading' }, song: null });
      for (const key of ctx.settings.get().rhythmSongs) if (songs.has(key)) await loadOne(key);
    })();
    const readySong = (key: unknown) => {
      const e = songs.get(String(key ?? ''));
      return e?.song && e.info.url ? { ...e.song, url: e.info.url } : null;
    };
    ctx.earn({ key: 'games.win', label: 'Games: win a room game', default: 2000, describe: (a) => `${a} for winning a game started for the room` });
    ctx.earn({ key: 'games.bluff', label: 'Bluff: both share', default: 2000, describe: (a) => `${a} each when both players share in Bluff` });

    const lights = () => ctx.use<LightsApi>('lights');
    const lightsOn = () => !!lights()?.available();
    const allowed = (game: GameId, mode: GameMode) => ctx.settings.get().enabled.includes(game) && !!gameInfo(game)?.modes.includes(mode);
    const fmt = (amount: number) => `${formatAmount(amount)} ${ctx.economy.currency.symbol}`;

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
      if (match?.players.some((p) => p.id === guestId) && match.phase !== 'result') {
        throw new HbError(who ? `${who} is already in a game` : 'You are already in a game');
      }
      for (const inv of invites.values()) {
        if (inv.from.id === guestId || inv.to.id === guestId) {
          throw new HbError(who ? `${who} already has a challenge waiting` : 'You already have a challenge waiting');
        }
      }
    };

    /** A light-only game needs its light (Rhythm Rain: the strip the host picked) */
    const checkLight = (game: GameId) => {
      if (!gameInfo(game)?.lightOnly) return;
      const id = ctx.settings.get().rhythmLight;
      if (!id || !lights()?.available() || !lights()?.list().some((d) => d.id === id && d.online)) {
        throw new HbError(`${gameInfo(game)!.name} needs its light strip, and it is not reachable right now`);
      }
    };

    const tvFree = () => {
      if (match) throw new HbError('A game is already on the TV, wait for it to end');
      if (ctx.hub.takeover && ctx.hub.takeover !== ctx.id) throw new HbError('Something else is on the TV right now');
    };

    /**
     * Give money back with one notification per guest: a fee and a stake come back together,
     * and "money back" is only added when they paid something.
     * `alsoTell`: guests told `why` even when they paid nothing (players of a cancelled game).
     */
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

    // ------------------------------------------------------------ match flow

    const later = (m: Match, ms: number, fn: () => void) => {
      const t = setTimeout(() => {
        m.timers.delete(t);
        if (match === m) fn();
      }, ms);
      m.timers.add(t);
    };

    const deadline = (m: Match, ms: number | null) => {
      m.endsAt = ms === null ? null : Date.now() + ms;
      m.phaseMs = ms ?? 0;
      ctx.publish();
    };

    const close = () => {
      const m = match;
      if (!m) return;
      for (const t of m.timers) clearTimeout(t);
      match = null;
      if (m.usesLights) void lights()?.release();
      ctx.takeover.stop();
      ctx.publish();
    };

    /**
     * End the winner's prize. `keepLights`: a new light game takes the lights over as they are,
     * instead of restoring them in between.
     */
    const endPerk = (keepLights = false) => {
      const p = perk;
      if (!p) return;
      perk = null;
      if (perkTimer) clearTimeout(perkTimer);
      perkTimer = null;
      turntable?.stop();
      turntable = null;
      if (p.kind === 'lights' && !keepLights) void lights()?.release();
      ctx.publish();
    };

    /** Called when a game ends: true when the winner got a prize (it keeps the lights then) */
    const startPerk = (m: Match, outcome: Outcome): boolean => {
      const winner = outcome.winners.length === 1 ? m.players.find((p) => p.id === outcome.winners[0]) : undefined;
      if (!outcome.perk || !winner) return false;
      const s = ctx.settings.get();
      const sec = outcome.perk.kind === 'lights' ? s.reflexPerkSec : s.circlePerkSec;
      if (sec <= 0) return false;
      if (outcome.perk.kind === 'lights' && !(m.usesLights && lightsOn())) return false;
      endPerk();
      const base = { guest: winner, until: Date.now() + sec * 1000, totalMs: sec * 1000 };
      perk = outcome.perk.kind === 'lights' ? { ...base, kind: 'lights', color: null } : { ...base, kind: 'scratch', drawing: outcome.perk.drawing };
      perkTimer = setTimeout(() => endPerk(), sec * 1000);
      const strip = lights()?.list().find((d) => d.id === s.scratchLight && d.online);
      if (perk.kind === 'scratch' && strip) {
        turntable = new Turntable(Math.min(490, strip.leds ?? 60), winner.color, (rgb) => lights()?.frame(strip.id, rgb));
      }
      return true;
    };

    const cancel = (why: string, refund = true) => {
      if (!match) return;
      if (refund && match.phase !== 'result') refundAll(match.charges, why, match.players.map((p) => p.id));
      close();
    };

    const potOf = (m: Match) => m.stake * m.players.length;
    /** House prize for the winner of a room game (split between tied winners) */
    const prizeOf = (m: Match) => {
      if (m.mode !== 'room' || !ctx.economy.enabled) return 0;
      return m.prize ?? ctx.economy.earnAmount('games.win');
    };

    const createMatch = (
      game: GameId,
      mode: GameMode,
      starter: GamePlayer | null,
      players: GamePlayer[],
      stake: number,
      charges: Charge[],
      options: Match['options'] = {},
    ) => {
      tvFree();
      // A new game ends the prize; a light game takes the lights straight from it
      const handOver = perk?.kind === 'lights' && !!gameInfo(game)?.lights;
      endPerk(handOver);
      // Light-only games leave the TV as it is (a small card shows the score)
      if (!gameInfo(game)?.lightOnly) ctx.takeover.start();
      match = {
        id: uid(6),
        game,
        mode,
        starter,
        players,
        stake,
        prize: null,
        phase: 'lobby',
        endsAt: null,
        phaseMs: 0,
        runtime: null,
        result: null,
        charges,
        timers: new Set(),
        lightColor: null,
        // Lights handed over by the prize: released when this game is over, even if it never starts
        usesLights: handOver,
        ready: new Set(),
        options,
      };
      return match;
    };

    const intro = (m: Match) => {
      m.phase = 'intro';
      if (gameInfo(m.game)?.lights && lights()) {
        m.usesLights = true;
        lights()!.claim();
        lights()!.color(null);
      }
      deadline(m, INTRO_MS);
      later(m, INTRO_MS, () => play(m));
    };

    const play = (m: Match) => {
      // The rules timer and "everyone is ready" can both get here
      if (m.phase !== 'intro') return;
      m.phase = 'play';
      m.endsAt = null;
      m.phaseMs = 0;
      const api: MatchApi = {
        players: m.players,
        mode: m.mode,
        stake: m.stake,
        pot: potOf(m),
        settings: ctx.settings.get(),
        options: m.options,
        song: m.options.song ? readySong(m.options.song) : null,
        light: (color) => {
          m.lightColor = color;
          if (m.usesLights) lights()?.color(color ? (GAME_COLORS.find((c) => c.id === color)?.led ?? null) : null);
          ctx.publish();
        },
        get lightColor() {
          return m.lightColor;
        },
        deadline: (ms) => deadline(m, ms),
        later: (ms, fn) => later(m, ms, fn),
        every: (ms, fn) => {
          const t = setInterval(() => (match === m ? fn() : stop()), ms);
          const stop = () => {
            clearInterval(t);
            m.timers.delete(t);
          };
          m.timers.add(t);
          return stop;
        },
        strip: (id) => {
          const d = lights()?.list().find((x) => x.id === id && x.online);
          return d ? { leds: Math.min(490, d.leds ?? 60), send: (rgb) => lights()?.frame(d.id, rgb) } : null;
        },
        sound: (name, data) => ctx.emit('tv-audio', name, data),
        publish: () => ctx.publish(),
        finish: (outcome) => finish(m, outcome),
        reward: (key) => (ctx.economy.enabled ? ctx.economy.earnAmount(key) : 0),
      };
      m.runtime = FACTORIES[m.game](api);
      m.runtime.start();
      ctx.publish();
    };

    const finish = (m: Match, outcome: Outcome) => {
      if (m.phase !== 'play') return;
      const name = gameInfo(m.game)?.name ?? 'Game';
      const pot = potOf(m);
      const payouts: Record<string, number> = Object.fromEntries(m.players.map((p) => [p.id, 0]));
      if (outcome.payouts) {
        Object.assign(payouts, outcome.payouts);
      } else if (outcome.winners.length) {
        const share = Math.floor(pot / outcome.winners.length);
        outcome.winners.forEach((id, i) => (payouts[id] += share + (i === 0 ? pot - share * outcome.winners.length : 0)));
        const prize = prizeOf(m);
        const each = Math.floor(prize / outcome.winners.length);
        outcome.winners.forEach((id, i) => (payouts[id] += each + (i === 0 ? prize - each * outcome.winners.length : 0)));
      } else {
        // Nobody won: everyone gets their stake back
        for (const p of m.players) payouts[p.id] += m.stake;
      }

      for (const [id, amount] of Object.entries(payouts)) {
        const guest = ctx.session.guests.get(id);
        if (!guest || amount <= 0) continue;
        ctx.economy.credit(guest, amount, `${name}: ${outcome.winners.includes(id) ? 'winnings' : 'bet back'}`);
        ctx.toast(guest, { text: outcome.winners.includes(id) ? `${name}: you won` : `${name}: bet back`, amount, kind: 'success' });
      }

      const names = outcome.winners.map((id) => m.players.find((p) => p.id === id)?.name).filter(Boolean) as string[];
      const headline = outcome.headline ?? (names.length === 1 ? `${names[0]} wins` : names.length ? `Tie: ${names.join(' and ')}` : 'Nobody wins');
      m.result = { winners: outcome.winners, lines: outcome.lines, payouts, headline };
      m.phase = 'result';
      const prize = startPerk(m, outcome);
      if (m.usesLights) {
        m.usesLights = false;
        // A lights prize keeps them: released when it ends
        if (!(prize && perk?.kind === 'lights')) void lights()?.release();
      }
      const top = outcome.winners.length === 1 ? ctx.session.guests.get(outcome.winners[0]) : undefined;
      if (top) ctx.activity(`{name} won ${name}${pot ? ` and a pot of ${fmt(pot)}` : ''}`, { guest: top });
      deadline(m, RESULT_MS);
      later(m, RESULT_MS, close);
    };

    // ------------------------------------------------------------ duels

    const dropInvite = (inv: Invite, why: string | null) => {
      clearTimeout(inv.timer);
      invites.delete(inv.id);
      if (why) refundAll(inv.charges, why, [inv.from.id]);
      ctx.publish();
    };

    ctx.onGuest('invite', (args, guest) => {
      const game = String(args?.game ?? '') as GameId;
      if (!allowed(game, 'duel')) throw new HbError('This game is not available as a duel');
      const opponent = ctx.session.guests.get(String(args?.to ?? ''));
      if (!opponent) throw new HbError('Pick someone to challenge');
      if (opponent.id === guest.id) throw new HbError('You cannot challenge yourself');
      checkLight(game);
      if (opponent.sockets === 0) throw new HbError(`${opponent.name} is not online`);
      checkFree(guest.id, null);
      checkFree(opponent.id, opponent.name);
      const stake = cleanStake(args?.stake);
      if (stake > opponent.balance) throw new HbError(`${opponent.name} cannot match that bet`);
      const name = gameInfo(game)!.name;
      const song = game === 'rhythm' && args?.song ? readySong(args.song) : null;
      if (game === 'rhythm' && args?.song && !song) throw new HbError('This song is not available, pick another one');
      const music = !!song;

      const fee = ctx.economy.charge(guest, music ? 'games.rhythmMusic' : 'games.duel', 1, `Duel: ${name}${music ? ' with music' : ''}`);
      let bet: Charge;
      try {
        bet = ctx.economy.pay(guest, stake, `Duel bet: ${name}`);
      } catch (err) {
        ctx.economy.refund(fee);
        throw err;
      }
      const inv: Invite = {
        id: uid(6),
        game,
        from: player(guest),
        to: player(opponent),
        stake,
        expiresAt: Date.now() + DUEL_INVITE_MS,
        ...(game === 'rhythm' ? { difficulty: Math.min(10, Math.max(1, Math.round(num(args?.difficulty, RHYTHM_DEFAULT_LEVEL)))) } : {}),
        ...(song ? { song: { key: song.key, title: song.title, artist: song.artist } } : {}),
        charges: [fee, bet],
        timer: setTimeout(() => {
          if (!invites.has(inv.id)) return;
          dropInvite(inv, `${opponent.name} did not answer your challenge`);
        }, DUEL_INVITE_MS),
      };
      invites.set(inv.id, inv);
      ctx.activity(`{name} challenged ${opponent.name} to ${name}${stake ? ` for ${fmt(stake)}` : ''}`, { guest, sensitive: true });
      ctx.publish();
      return { id: inv.id };
    });

    ctx.onGuest('respond', (args, guest) => {
      const inv = invites.get(String(args?.id ?? ''));
      if (!inv || inv.to.id !== guest.id) throw new HbError('This challenge is gone');
      const from = ctx.session.guests.get(inv.from.id);
      if (!args?.accept || !from) {
        dropInvite(inv, `${guest.name} declined your challenge`);
        return true;
      }
      tvFree();
      checkLight(inv.game);
      if (inv.song && !readySong(inv.song.key)) throw new HbError('This song is not available any more');
      const bet = ctx.economy.pay(guest, inv.stake, `Duel bet: ${gameInfo(inv.game)!.name}`);
      try {
        const m = createMatch(inv.game, 'duel', inv.from, [inv.from, player(guest)], inv.stake, [...inv.charges, bet], { difficulty: inv.difficulty, song: inv.song?.key });
        dropInvite(inv, null);
        intro(m);
      } catch (err) {
        ctx.economy.refund(bet);
        throw err;
      }
      ctx.activity(`{name} accepted the duel against ${inv.from.name}`, { guest, sensitive: true });
      return true;
    });

    ctx.onGuest('cancelInvite', (args, guest) => {
      const inv = invites.get(String(args?.id ?? ''));
      if (!inv || inv.from.id !== guest.id) return false;
      dropInvite(inv, 'Challenge cancelled');
      return true;
    });

    // ------------------------------------------------------------ room games

    const startRoom = (game: GameId, starter: Guest | null, rawStake: unknown, rawPrize?: unknown) => {
      if (!allowed(game, 'room') && starter) throw new HbError('This game cannot be started for the room');
      if (!gameInfo(game)?.modes.includes('room')) throw new HbError('This game is for duels only');
      tvFree();
      const stake = cleanStake(rawStake);
      const charges: Charge[] = [];
      if (starter) {
        checkFree(starter.id, null);
        charges.push(ctx.economy.charge(starter, 'games.room', 1, `Started ${gameInfo(game)!.name}`));
        try {
          charges.push(ctx.economy.pay(starter, stake, `${gameInfo(game)!.name}: entry`));
        } catch (err) {
          for (const c of charges) ctx.economy.refund(c);
          throw err;
        }
      }
      try {
        const m = createMatch(game, 'room', starter ? player(starter) : null, starter ? [player(starter)] : [], stake, charges);
        // Only the host chooses the prize
        if (!starter && rawPrize !== undefined && rawPrize !== null) m.prize = Math.max(0, Math.round(num(rawPrize, 0)));
        deadline(m, LOBBY_MS);
        later(m, LOBBY_MS, () => beginRoom(m));
      } catch (err) {
        for (const c of charges) ctx.economy.refund(c);
        throw err;
      }
      ctx.activity(starter ? `{name} started ${gameInfo(game)!.name}, join from your phone` : `${gameInfo(game)!.name} is starting, join from your phone`, { guest: starter ?? undefined });
    };

    const beginRoom = (m: Match) => {
      if (m.phase !== 'lobby') return;
      if (m.players.length < 2) {
        cancel('Nobody else joined, game cancelled');
        return;
      }
      intro(m);
    };

    ctx.onGuest('startRoom', (args, guest) => {
      startRoom(String(args?.game ?? '') as GameId, guest, args?.stake);
      return true;
    });

    ctx.onGuest('join', (_args, guest) => {
      const m = match;
      if (!m || m.mode !== 'room' || m.phase !== 'lobby') throw new HbError('Too late to join');
      if (m.players.some((p) => p.id === guest.id)) return true;
      checkFree(guest.id, null);
      m.charges.push(ctx.economy.pay(guest, m.stake, `${gameInfo(m.game)!.name}: entry`));
      m.players.push(player(guest));
      ctx.publish();
      return true;
    });

    ctx.onGuest('leave', (_args, guest) => {
      const m = match;
      if (!m || m.mode !== 'room' || m.phase !== 'lobby') throw new HbError('The game has started');
      if (m.starter?.id === guest.id) {
        cancel(`${guest.name} cancelled the game`);
        return true;
      }
      m.players = m.players.filter((p) => p.id !== guest.id);
      const mine = m.charges.filter((c) => c.guest.id === guest.id);
      m.charges = m.charges.filter((c) => c.guest.id !== guest.id);
      refundAll(mine, 'You left the game');
      ctx.publish();
      return true;
    });

    /** Rules screen: this player has read them */
    ctx.onGuest('ready', (_args, guest) => {
      const m = match;
      if (!m || m.phase !== 'intro') throw new HbError('Not now');
      if (!m.players.some((p) => p.id === guest.id)) throw new HbError('You are not in this game');
      if (m.ready.has(guest.id)) return true;
      m.ready.add(guest.id);
      if (m.ready.size >= m.players.length && (m.endsAt ?? 0) - Date.now() > ALL_READY_MS) {
        deadline(m, ALL_READY_MS);
        later(m, ALL_READY_MS, () => play(m));
      } else ctx.publish();
      return true;
    });

    ctx.onGuest('begin', (_args, guest) => {
      const m = match;
      if (!m || m.phase !== 'lobby') throw new HbError('Not now');
      if (m.starter?.id !== guest.id) throw new HbError('Only the person who started it can do that');
      if (m.players.length < 2) throw new HbError('Wait for at least one more player');
      beginRoom(m);
      return true;
    });

    ctx.onGuest('play', (args, guest) => {
      const m = match;
      if (!m || m.phase !== 'play' || !m.runtime) throw new HbError('Not now');
      if (!m.players.some((p) => p.id === guest.id)) throw new HbError('You are not in this game');
      return m.runtime.input(guest.id, args) ?? true;
    });

    // ------------------------------------------------------------ host

    /** Add a song (a BeatSaver key or link): downloaded now, kept for every later party */
    ctx.onAdmin('addSong', async (args) => {
      const key = songKey(String(args?.key ?? ''));
      if (!key) throw new HbError('Paste a BeatSaver map key or link');
      const list = ctx.settings.get().rhythmSongs;
      if (!list.includes(key)) ctx.settings.update({ rhythmSongs: [...list, key] });
      await loadOne(key);
      const e = songs.get(key);
      if (e?.info.status === 'error') throw new HbError(e.info.error ?? 'Could not load it');
      return e?.info;
    });
    ctx.onAdmin('searchSongs', async (args) => {
      try {
        const page = Math.max(0, Math.min(50, Math.round(num(args?.page, 0))));
        const r = await searchSongs(String(args?.q ?? '').trim().slice(0, 100), page);
        const added = new Set(ctx.settings.get().rhythmSongs);
        return { ...r, hits: r.hits.map((h) => ({ ...h, added: added.has(h.key) })) };
      } catch (err) {
        throw new HbError(`BeatSaver cannot be reached: ${err instanceof Error ? err.message : 'no answer'}`);
      }
    });
    ctx.onAdmin('retrySong', (args) => {
      const key = String(args?.key ?? '');
      if (ctx.settings.get().rhythmSongs.includes(key)) void loadOne(key);
    });
    ctx.onAdmin('removeSong', (args) => {
      const key = String(args?.key ?? '');
      ctx.settings.update({ rhythmSongs: ctx.settings.get().rhythmSongs.filter((k) => k !== key) });
      songs.delete(key);
      ctx.publish();
    });

    ctx.onTv('play', (args) => {
      match?.runtime?.tvInput?.(args);
      return true;
    });

    ctx.onAdmin('startRoom', (args) => startRoom(String(args?.game ?? '') as GameId, null, args?.stake, args?.prize));
    ctx.onAdmin('begin', () => {
      if (match?.phase === 'lobby') beginRoom(match);
      else if (match?.phase === 'intro') play(match);
    });
    ctx.onAdmin('stop', () => cancel('The host stopped the game'));
    ctx.onAdmin('cancelInvite', (args) => {
      const inv = invites.get(String(args?.id ?? ''));
      if (inv) dropInvite(inv, 'The host cancelled your challenge');
    });
    ctx.onAdmin('setSettings', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        enabled: Array.isArray(args?.enabled) ? GAMES.map((g) => g.id).filter((id) => args.enabled.includes(id)) : s.enabled,
        maxStake: args?.maxStake !== undefined ? Math.max(0, Math.round(num(args.maxStake, 0))) : s.maxStake,
        tvColors: typeof args?.tvColors === 'boolean' ? args.tvColors : s.tvColors,
        timerRounds: args?.timerRounds !== undefined ? Math.min(10, Math.max(1, Math.round(num(args.timerRounds, 3)))) : s.timerRounds,
        circleCount: args?.circleCount !== undefined ? Math.min(10, Math.max(1, Math.round(num(args.circleCount, 3)))) : s.circleCount,
        reflexRounds: args?.reflexRounds !== undefined ? Math.min(15, Math.max(1, Math.round(num(args.reflexRounds, 5)))) : s.reflexRounds,
        simonStart: args?.simonStart !== undefined ? Math.min(10, Math.max(1, Math.round(num(args.simonStart, 1)))) : s.simonStart,
        reflexPerkSec: args?.reflexPerkSec !== undefined ? Math.min(300, Math.max(0, Math.round(num(args.reflexPerkSec, 60)))) : s.reflexPerkSec,
        circlePerkSec: args?.circlePerkSec !== undefined ? Math.min(300, Math.max(0, Math.round(num(args.circlePerkSec, 60)))) : s.circlePerkSec,
        scratchLight:
          typeof args?.scratchLight === 'string' && (args.scratchLight === '' || lights()?.list().some((d) => d.id === args.scratchLight))
            ? args.scratchLight
            : s.scratchLight,
        rhythmLight:
          typeof args?.rhythmLight === 'string' && (args.rhythmLight === '' || lights()?.list().some((d) => d.id === args.rhythmLight))
            ? args.rhythmLight
            : s.rhythmLight,
        rhythmReverse: typeof args?.rhythmReverse === 'boolean' ? args.rhythmReverse : s.rhythmReverse,
        rhythmAudioOffset:
          args?.rhythmAudioOffset !== undefined ? Math.min(500, Math.max(-500, Math.round(num(args.rhythmAudioOffset, 0)))) : s.rhythmAudioOffset,
        rhythmSpeed: args?.rhythmSpeed !== undefined ? Math.min(200, Math.max(50, Math.round(num(args.rhythmSpeed, 100)))) : s.rhythmSpeed,
        rhythmSec: args?.rhythmSec !== undefined ? Math.min(120, Math.max(20, Math.round(num(args.rhythmSec, 45)))) : s.rhythmSec,
      });
      ctx.publish();
    });

    // ------------------------------------------------------------ state

    /** For other modules: is this guest playing, or in a challenge? (no pop-ups then) */
    ctx.provide('games', {
      busy: (guestId: string) =>
        !!match?.players.some((p) => p.id === guestId) || [...invites.values()].some((i) => i.from.id === guestId || i.to.id === guestId),
    });

    ctx.state((role): GamesState => {
      const m = match;
      const state: MatchState | null = m && {
        id: m.id,
        game: m.game,
        mode: m.mode,
        starter: m.starter,
        players: m.players,
        stake: m.stake,
        pot: potOf(m),
        prize: prizeOf(m),
        phase: m.phase,
        endsAt: m.endsAt,
        phaseMs: m.phaseMs,
        view: m.runtime?.view(role) ?? null,
        result: m.result,
        ready: [...m.ready],
      };
      return {
        invites: [...invites.values()].map(({ charges: _c, timer: _t, ...inv }) => inv),
        match: state,
        perk,
        ...(role === 'admin' ? { lightDevices: (lights()?.list() ?? []).map(({ id, name, online }) => ({ id, name, online })) } : {}),
        lights: lightsOn(),
        rhythmSongs: ctx.settings.get().rhythmSongs.map((key) => songs.get(key)?.info ?? { key, status: 'loading' as const }),
        online: role === 'tv' ? [] : [...ctx.session.guests.values()].filter((g) => g.sockets > 0).map((g) => ({ ...player(g), balance: g.balance })),
        settings: ctx.settings.get(),
      };
    });

    // Opponents come and go and their balance changes: keep the list fresh (publish is throttled)
    ctx.session.on('guests-changed', () => ctx.publish());
    ctx.session.on('guest-changed', () => ctx.publish());

    const stopAll = (refund: boolean) => {
      for (const inv of [...invites.values()]) dropInvite(inv, refund ? 'Your challenge was cancelled' : null);
      cancel('The game was stopped', refund);
      endPerk();
    };

    // ------------------------------------------------------------ the winner's prize

    const myPerk = (guest: Guest) => {
      if (perk?.guest.id !== guest.id) throw new HbError('Your prize is over');
      return perk;
    };

    ctx.onGuest('perkColor', (args, guest) => {
      const p = myPerk(guest);
      if (p.kind !== 'lights') throw new HbError('Your prize is over');
      const c = GAME_COLORS.find((x) => x.id === args?.color);
      if (!c) throw new HbError('Pick a color');
      p.color = c.id;
      // A soft fade, not a flash: the whole room changes color
      lights()?.color(c.led, PERK_FADE_MS);
      ctx.publish();
      return true;
    });

    /** Scratch moves go straight to the TV, without a state update each time */
    ctx.onGuest('scratch', (args, guest) => {
      if (perk?.kind !== 'scratch' || perk.guest.id !== guest.id) return false;
      // The record is in the side column: scratching cuts the result short (it stays at least 7 s)
      const m = match;
      if (m?.phase === 'result' && m.game === 'circle' && m.endsAt && cutShort !== m.id) {
        cutShort = m.id;
        const shown = Date.now() - (m.endsAt - RESULT_MS);
        later(m, Math.max(0, RESULT_SCRATCH_MS - shown), close);
      }
      const raw = num(args?.angle, 0);
      const angle = Number.isFinite(raw) ? clamp(raw, -1e6, 1e6) : 0;
      ctx.emit('tv', 'scratch', { angle, touching: !!args?.touching });
      turntable?.move(angle, !!args?.touching);
      return true;
    });

    ctx.onGuest('perkEnd', (_args, guest) => {
      myPerk(guest);
      endPerk();
      return true;
    });
    ctx.onToggle((on) => {
      if (!on) stopAll(true);
    });
    ctx.onSessionReset(() => stopAll(false));
    ctx.onShutdown(() => stopAll(true));
  },
});
