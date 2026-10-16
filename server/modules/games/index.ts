import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import {
  GAMES,
  DUEL_INVITE_MS,
  GAME_COLORS,
  RHYTHM_COLORS,
  RHYTHM_DIFFICULTIES,
  RHYTHM_GOOD_STARS,
  rhythmColors,
  rhythmDifficulty,
  gameInfo,
  isCardGame,
  bluffDeal,
  PIRATE_LENGTHS,
  PIRATE_SONG_TEST_SEC,
  PIRATE_SOUNDS,
  type PirateSoundId,
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
  type RhythmColor,
  type RhythmSongInfo,
} from '../../../shared/games.ts';
import { formatAmount } from '../../../shared/money.ts';
import type { Charge } from '../../core/economy.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import { HbError, clamp, num, uid } from '../../core/util.ts';
import type { LightsApi } from '../wled/index.ts';
import type { MusicApi } from '../spotify/index.ts';
import { FRAME_MS, type GameFactory, type GameRuntime, type MatchApi, type MatchOptions, type Outcome } from './engine.ts';
import { blindTimer } from './timer.ts';
import { lightSimon } from './simon.ts';
import { colorReflex } from './reflex.ts';
import { perfectCircle } from './circle.ts';
import { bluff } from './bluff.ts';
import { coinFlip } from './coin.ts';
import { chartFor, chartNps, chartSteadiness, rhythmRain } from './rhythm.ts';
import { Turntable } from './turntable.ts';
import { Fireworks, rgbOf } from '../wled/fireworks.ts';
import { dealPirateCrews, pirateRace, pirateWaitingLights } from './pirates.ts';
import { cleanMp3, downloadMp3 } from '../soundboard/myinstants.ts';
import { loadSong, searchSongs, songKey, type Song } from './beatsaver.ts';
import { lightParty } from './party/index.ts';
import { PARTY_MINIS, cleanPartyOptions } from '../../../shared/party.ts';

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
  pirates: pirateRace,
  party: lightParty,
};

/** Games played on one light the host picks: the setting that names it */
const GAME_LIGHT: Partial<Record<GameId, 'rhythmLight' | 'partyLight'>> = { rhythm: 'rhythmLight', party: 'partyLight' };

const LOBBY_MS = 45_000;
const MINUTE = 60_000;
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
  /** A light the game set to full brightness (the Pirate Race light): put back before the lights are released */
  fullLight?: string;
  ready: Set<string>;
  options: MatchOptions;
  /** The Spotify music was paused for this game: resumed when it ends */
  musicPaused: boolean;
  /** Took the whole TV (the small card games leave it as it is) */
  takeover: boolean;
}

const player = (g: Guest): GamePlayer => ({ id: g.id, name: g.name, color: g.color });

/** Where a Rhythm Rain score goes: one board per song, difficulty and number of colors */
const songBoard = (song: string, chart: string, colors: number) => `rhythm:${song}:${chart}:${colors}`;

/** What the games share with other modules */
export interface GamesApi {
  busy(guestId: string): boolean;
  /** Name of a game being played, also the ones that leave the TV free (Coin Flip, Rhythm Rain...) */
  playing(): string | null;
  /** The song of a Rhythm Rain board (see songBoard), null when it is not one of the host's songs any more */
  songBoard(board: string): { title: string; artist: string; cover?: string; chart: string; colors: number } | null;
}

/**
 * Mini games on the TV: 1 vs 1 duels where both put money in the pot, or room games
 * that anyone can join. Each game lives in its own file and plugs in through engine.ts.
 */
export default defineModule<GamesSettings>({
  id: 'games',
  name: 'Games',
  description: 'Duels and party games on the TV, played from the phones',
  settings: { enabled: GAMES.map((g) => g.id), maxStake: 0, tvColors: true, timerRounds: 3, circleCount: 3, reflexRounds: 5, simonStart: 1, reflexPerkSec: 60, circlePerkSec: 60, rhythmPerkSec: 45, bluffMultiplier: 0.5, bluffCooldownMin: 30, bluffChooseSec: 30, scratchLight: '', rhythmLight: '', rhythmReverse: false, rhythmMinSec: 60, rhythmMaxSec: 120, rhythmFullSong: false, rhythmHolds: true, rhythmSongs: STARTER_SONGS, rhythmRatings: {}, rhythmAudioOffset: 0, rhythmSoloTaps: 'tv', pirateLight: '', pirateReverse: false, pirateTreasure: 100, pirateLength: 'normal', pirateAudioOffset: 0, pirateSounds: {}, pirateSongs: [], pirateSongVolume: 70, pirateDrumVolume: 100, partyLight: '', partyReverse: false, partyRounds: 3, partyMinis: PARTY_MINIS.map((g) => g.id), partyOptions: {} },

  setup(ctx) {
    const invites = new Map<string, Invite>();
    /** Games being played: one on the whole TV, or several card games at once (see isCardGame) */
    const matches = new Map<string, Match>();
    const alive = (m: Match) => matches.get(m.id) === m;
    /** The match this guest plays in (not the ones whose result is showing, unless `phase` says so) */
    const matchOf = (guestId: string, phase?: MatchPhase) =>
      [...matches.values()].find((m) => m.players.some((p) => p.id === guestId) && (phase ? m.phase === phase : m.phase !== 'result'));
    /** The room game waiting for players (room games take the whole TV: one at most) */
    const lobby = () => [...matches.values()].find((m) => m.mode === 'room' && m.phase === 'lobby');
    /**
     * When each guest last played a Bluff (both players): they wait the cooldown before playing
     * another one, so nobody can farm the bonus with back-to-back duels, even taking turns to challenge
     */
    const lastBluff = new Map<string, number>();
    /** Guests who cannot play a Bluff yet, with when they can */
    const bluffReadyAt = () => {
      const wait = ctx.settings.get().bluffCooldownMin * MINUTE;
      const now = Date.now();
      const ready: Record<string, number> = {};
      for (const [id, at] of lastBluff) if (at + wait > now) ready[id] = at + wait;
      return ready;
    };
    /** Both players of a Bluff must be done waiting (`me`: the guest asking) */
    const checkBluff = (game: GameId, players: GamePlayer[], me: string) => {
      if (game !== 'bluff') return;
      const ready = bluffReadyAt();
      for (const p of players) {
        const at = ready[p.id];
        if (!at) continue;
        const min = Math.ceil((at - Date.now()) / MINUTE);
        throw new HbError(p.id === me ? `You can play another Bluff in ${min} min` : `${p.name} can play another Bluff in ${min} min`);
      }
    };
    let perk: Perk | null = null;
    let perkTimer: NodeJS.Timeout | null = null;
    /** The scratch record on a light strip, while the scratch prize lasts */
    let turntable: Turntable | null = null;
    /** The fireworks on the Rhythm Rain strip, while that prize lasts */
    let fireworks: Fireworks | null = null;
    /** Match whose result is already set to close early for the scratch */
    let cutShort: string | null = null;

    ctx.price({ key: 'games.duel', label: 'Challenge someone to a duel', default: 5000 });
    ctx.price({ key: 'games.room', label: 'Start a game for the room', default: 5000 });
    ctx.price({ key: 'games.rhythmMusic', label: 'Rhythm Rain with music', default: 10000 });
    ctx.price({ key: 'games.solo', label: 'Play a solo game', default: 3000 });

    // ------------------------------------------------------------ the Rhythm Rain song

    // Light Party's first settings, now in partyOptions
    {
      const old = ctx.settings.get() as GamesSettings & { partyCountSec?: number; partyStackBlocks?: number };
      if (old.partyCountSec !== undefined || old.partyStackBlocks !== undefined) ctx.settings.update({ partyCountSec: undefined, partyStackBlocks: undefined } as Partial<GamesSettings>);
    }
    // Settings of an older version: one song length, and a note speed (the notes follow the music now)
    {
      const old = ctx.settings.get() as GamesSettings & { rhythmSec?: number; rhythmSpeed?: number };
      if (old.rhythmSec !== undefined || old.rhythmSpeed !== undefined) ctx.settings.update({ rhythmSec: undefined, rhythmSpeed: undefined } as Partial<GamesSettings>);
    }

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
          info: { key, status: 'ready', title: s.title, artist: s.artist, url: ctx.mediaUrl(`rhythm/${s.audio}`), cover: s.cover, preview: s.preview, previewMs: s.previewMs, durationSec: s.durationSec, upvotes: s.upvotes, rating: s.rating,
            charts: RHYTHM_DIFFICULTIES.filter((d) => s.charts[d.id]?.length).map((d) => ({ id: d.id, nps: chartNps(s.charts[d.id]!, s.bpm, d.minGapMs, s.tempos?.[d.id]), steady: chartSteadiness(s.charts[d.id]!, s.bpm, d.minGapMs, s.tempos?.[d.id]) })) },
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
    /** Rhythm Rain options from a phone: colors, difficulty (the closest the song has), song */
    const rhythmOptions = (args: any, song: Song | null): MatchOptions => {
      const chart = rhythmDifficulty(args?.chart).id;
      return { colors: rhythmColors(args?.colors), chart: song ? (chartFor(song, chart)?.id ?? chart) : chart, song: song?.key };
    };
    /** A random song ready to play, among the host's best rated if any (null: none) */
    const drawSong = () => {
      const ready = [...songs.keys()].map(readySong).filter((x) => !!x);
      const ratings = ctx.settings.get().rhythmRatings;
      const rated = ready.filter((x) => (ratings[x.key] ?? 0) >= RHYTHM_GOOD_STARS);
      const pool = rated.length ? rated : ready;
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
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
      if (matchOf(guestId)) {
        throw new HbError(who ? `${who} is already in a game` : 'You are already in a game');
      }
      for (const inv of invites.values()) {
        if (inv.from.id === guestId || inv.to.id === guestId) {
          throw new HbError(who ? `${who} already has a challenge waiting` : 'You already have a challenge waiting');
        }
      }
    };

    /** A game played on one light needs it (Rhythm Rain, Light Party: the strip the host picked) */
    const checkLight = (game: GameId) => {
      const key = GAME_LIGHT[game];
      if (!key) return;
      const id = ctx.settings.get()[key];
      if (!id || !lights()?.available() || !lights()?.list().some((d) => d.id === id && d.online)) {
        throw new HbError(`${gameInfo(game)!.name} needs its light strip, and it is not reachable right now`);
      }
    };

    /**
     * A game on the whole TV needs it free. Card games (a small card at the top of the TV) can be
     * played together, one of each, but not during a game on the whole TV.
     */
    const tvFree = (game: GameId) => {
      const card = isCardGame(game);
      for (const m of matches.values()) {
        if (!card || !isCardGame(m.game)) throw new HbError('A game is already on the TV, wait for it to end');
        if (m.game === game) throw new HbError(`${gameInfo(game)!.name} is already being played, wait for it to end`);
      }
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
        if (alive(m)) fn();
      }, ms);
      m.timers.add(t);
    };

    const deadline = (m: Match, ms: number | null) => {
      m.endsAt = ms === null ? null : Date.now() + ms;
      m.phaseMs = ms ?? 0;
      ctx.publish();
    };

    /** A game with its own sound pauses the Spotify music while it is played */
    const music = () => ctx.use<MusicApi>('music');
    const pauseMusic = (m: Match) => {
      if (!gameInfo(m.game)?.pausesMusic) return;
      void music()
        ?.pause()
        .then((paused) => {
          if (!paused) return;
          // The game may be over already: then resume straight away
          if (alive(m) && m.phase === 'play') m.musicPaused = true;
          else void music()?.resume().catch(() => {});
        })
        .catch((err) => ctx.log.warn('Could not pause the music', err instanceof Error ? err.message : err));
    };
    const resumeMusic = (m: Match) => {
      if (!m.musicPaused) return;
      m.musicPaused = false;
      void music()
        ?.resume()
        .catch((err) => ctx.log.warn('Could not resume the music', err instanceof Error ? err.message : err));
    };

    /** Forget the full brightness of a game's light, so releasing the lights puts it back as it was */
    const dimLight = (m: Match) => {
      if (m.fullLight) void lights()?.unboost(m.fullLight);
      m.fullLight = undefined;
    };

    const close = (m: Match) => {
      if (!alive(m)) return;
      for (const t of m.timers) clearTimeout(t);
      matches.delete(m.id);
      resumeMusic(m);
      if (m.usesLights) {
        dimLight(m);
        void lights()?.release();
      }
      if (m.takeover) ctx.takeover.stop();
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
      fireworks?.stop();
      fireworks = null;
      if (p.kind === 'fireworks') void lights()?.unboost(ctx.settings.get().rhythmLight);
      if (p.kind === 'lights' && !keepLights) void lights()?.release();
      ctx.publish();
    };

    /** Called when a game ends: true when the winner got a prize (it keeps the lights then) */
    const startPerk = (m: Match, outcome: Outcome): boolean => {
      const winner = outcome.winners.length === 1 ? m.players.find((p) => p.id === outcome.winners[0]) : undefined;
      if (!outcome.perk || !winner) return false;
      const s = ctx.settings.get();
      const kind = outcome.perk.kind;
      const sec = kind === 'lights' ? s.reflexPerkSec : kind === 'scratch' ? s.circlePerkSec : s.rhythmPerkSec;
      if (sec <= 0) return false;
      if (kind === 'lights' && !(m.usesLights && lightsOn())) return false;
      // Fireworks need the game's strip
      const gameStrip = lights()?.list().find((d) => d.id === s.rhythmLight && d.online);
      if (kind === 'fireworks' && !gameStrip) return false;
      endPerk();
      const base = { guest: winner, until: Date.now() + sec * 1000, totalMs: sec * 1000 };
      perk =
        outcome.perk.kind === 'lights'
          ? { ...base, kind: 'lights', color: null }
          : outcome.perk.kind === 'scratch'
            ? { ...base, kind: 'scratch', drawing: outcome.perk.drawing }
            : { ...base, kind: 'fireworks', colors: RHYTHM_COLORS.slice(0, 4).map((c) => c.id) };
      perkTimer = setTimeout(() => endPerk(), sec * 1000);
      if (perk.kind === 'fireworks' && gameStrip) {
        fireworks = new Fireworks(Math.min(490, gameStrip.leds ?? 60), rgbOf(winner.color), s.rhythmReverse, (rgb) => lights()?.frame(gameStrip.id, rgb));
      }
      const strip = lights()?.list().find((d) => d.id === s.scratchLight && d.online);
      if (perk.kind === 'scratch' && strip) {
        turntable = new Turntable(Math.min(490, strip.leds ?? 60), winner.color, (rgb) => lights()?.frame(strip.id, rgb));
      }
      return true;
    };

    const cancel = (m: Match, why: string, refund = true) => {
      if (!alive(m)) return;
      if (refund && m.phase !== 'result') refundAll(m.charges, why, m.players.map((p) => p.id));
      close(m);
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
      tvFree(game);
      // A new game on the TV or the lights ends the prize; a light game takes the lights straight from it
      const handOver = perk?.kind === 'lights' && !!gameInfo(game)?.lights;
      const takeover = !isCardGame(game);
      if (takeover || gameInfo(game)?.lights) endPerk(handOver);
      // Light-only and phone games leave the TV as it is (a small card shows how it goes)
      if (takeover) ctx.takeover.start();
      const match: Match = {
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
        musicPaused: false,
        takeover,
      };
      matches.set(match.id, match);
      return match;
    };

    const intro = (m: Match) => {
      m.phase = 'intro';
      // The crews are dealt now, so the phones show each player's ship with the rules
      if (m.game === 'pirates' && m.players.length >= 2) m.options.crews = dealPirateCrews(m.players.map((p) => p.id));
      if (gameInfo(m.game)?.lights && lights()) {
        m.usesLights = true;
        lights()!.claim();
        lights()!.color(null);
      }
      // Light Party: its strip at full brightness, the game draws its own levels
      const party = m.game === 'party' ? ctx.settings.get().partyLight : '';
      if (party && m.usesLights && lights()?.list().some((d) => d.id === party && d.online)) {
        m.fullLight = party;
        void lights()?.boost(party);
      }
      // Pirate Race: the lights already show the sea and the ships waiting at the start
      if (m.game === 'pirates' && m.usesLights && m.options.crews) {
        // The race light at full brightness: the ships shine at their brightest, the sea is drawn dim
        const race = ctx.settings.get().pirateLight;
        if (race && lights()?.list().some((d) => d.id === race && d.online)) {
          m.fullLight = race;
          void lights()?.boost(race);
        }
        const t = setInterval(() => {
          if (!alive(m) || m.phase !== 'intro' || !m.options.crews) {
            clearInterval(t);
            m.timers.delete(t);
            return;
          }
          const strips = (lights()?.list() ?? []).filter((d) => d.online).map((d) => ({ id: d.id, leds: Math.min(490, d.leds ?? 60), send: (rgb: Uint8Array) => lights()?.frame(d.id, rgb) }));
          pirateWaitingLights(m.options.crews, ctx.settings.get(), strips);
        }, FRAME_MS);
        m.timers.add(t);
      }
      deadline(m, INTRO_MS);
      later(m, INTRO_MS, () => play(m));
    };

    const play = (m: Match) => {
      // The rules timer and "everyone is ready" can both get here
      if (m.phase !== 'intro') return;
      m.phase = 'play';
      if (m.game === 'bluff') for (const p of m.players) lastBluff.set(p.id, Date.now());
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
          const t = setInterval(() => (alive(m) ? fn() : stop()), ms);
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
        strips: () =>
          (lights()?.list() ?? []).filter((d) => d.online).map((d) => ({ id: d.id, leds: Math.min(490, d.leds ?? 60), send: (rgb: Uint8Array) => lights()?.frame(d.id, rgb) })),
        sound: (name, data) => ctx.emit('tv-audio', name, data),
        publish: () => ctx.publish(),
        finish: (outcome) => finish(m, outcome),
        reward: (key) => (ctx.economy.enabled ? ctx.economy.earnAmount(key) : 0),
      };
      m.runtime = FACTORIES[m.game](api);
      pauseMusic(m);
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

      // For the TV leaderboards: games played and won, and the best score on each song
      const board = m.game === 'rhythm' && m.options.song ? songBoard(m.options.song, m.options.chart ?? 'Normal', m.options.colors ?? 3) : null;
      for (const p of m.players) {
        const guest = ctx.session.guests.get(p.id);
        if (!guest) continue;
        ctx.session.count(guest, 'games');
        if (outcome.winners.includes(p.id) && m.players.length > 1) ctx.session.count(guest, 'wins');
        if (board && outcome.scores?.[p.id] !== undefined) ctx.session.best(guest, board, outcome.scores[p.id]);
      }

      for (const [id, amount] of Object.entries(payouts)) {
        const guest = ctx.session.guests.get(id);
        if (!guest || amount <= 0) continue;
        // A bet coming back was never really spent: it does not count as earned
        if (outcome.winners.includes(id)) ctx.economy.credit(guest, amount, `${name}: winnings`);
        else ctx.economy.giveBack(guest, amount, `${name}: bet back`);
        ctx.toast(guest, { text: outcome.winners.includes(id) ? `${name}: you won` : `${name}: bet back`, amount, kind: 'success' });
      }

      const names = outcome.winners.map((id) => m.players.find((p) => p.id === id)?.name).filter(Boolean) as string[];
      const headline = outcome.headline ?? (names.length === 1 ? `${names[0]} wins` : names.length ? `Tie: ${names.join(' and ')}` : 'Nobody wins');
      m.result = { winners: outcome.winners, lines: outcome.lines, payouts, headline };
      m.phase = 'result';
      resumeMusic(m);
      const prize = startPerk(m, outcome);
      if (m.usesLights) {
        m.usesLights = false;
        dimLight(m);
        // A lights prize keeps them: released when it ends
        if (prize && perk?.kind === 'fireworks') {
          // The fireworks at full brightness, once the lights are back to how they were
          const p = perk;
          void lights()
            ?.release()
            .then(() => (perk === p ? lights()?.boost(ctx.settings.get().rhythmLight) : undefined));
        } else if (!(prize && perk?.kind === 'lights')) void lights()?.release();
      }
      const top = outcome.winners.length === 1 ? ctx.session.guests.get(outcome.winners[0]) : undefined;
      if (top) ctx.activity(`{name} won ${name}${pot ? ` and a pot of ${fmt(pot)}` : ''}`, { guest: top });
      // The host's try on the light is done when the song is: no result to show
      if (m.options.test) {
        close(m);
        return;
      }
      deadline(m, RESULT_MS);
      later(m, RESULT_MS, () => close(m));
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
      checkBluff(game, [player(guest), player(opponent)], guest.id);
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
      const deal = game === 'bluff' ? bluffDeal(stake, ctx.economy.enabled ? ctx.economy.earnAmount('games.bluff') : 0, ctx.settings.get().bluffMultiplier) : null;
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
        ...(game === 'rhythm' ? (({ colors, chart }) => ({ colors, chart }))(rhythmOptions(args, song)) : {}),
        ...(song ? { song: { key: song.key, title: song.title, artist: song.artist } } : {}),
        ...(deal ? { bluff: deal } : {}),
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
      tvFree(inv.game);
      checkLight(inv.game);
      checkBluff(inv.game, [player(guest), inv.from], guest.id);
      if (inv.song && !readySong(inv.song.key)) throw new HbError('This song is not available any more');
      const bet = ctx.economy.pay(guest, inv.stake, `Duel bet: ${gameInfo(inv.game)!.name}`);
      try {
        const m = createMatch(inv.game, 'duel', inv.from, [inv.from, player(guest)], inv.stake, [...inv.charges, bet], { colors: inv.colors, chart: inv.chart, song: inv.song?.key, bluff: inv.bluff });
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

    // ------------------------------------------------------------ solo

    /** A game for one, on the TV or its light (no bet: just the fee) */
    ctx.onGuest('solo', (args, guest) => {
      const game = String(args?.game ?? '') as GameId;
      if (!allowed(game, 'solo')) throw new HbError('This game cannot be played solo');
      tvFree(game);
      checkLight(game);
      checkFree(guest.id, null);
      const song = game === 'rhythm' && args?.song ? readySong(args.song) : null;
      if (game === 'rhythm' && args?.song && !song) throw new HbError('This song is not available, pick another one');
      const name = gameInfo(game)!.name;
      const fee = ctx.economy.charge(guest, song ? 'games.rhythmMusic' : 'games.solo', 1, `Solo: ${name}${song ? ' with music' : ''}`);
      try {
        const m = createMatch(game, 'solo', player(guest), [player(guest)], 0, [fee], game === 'rhythm' ? rhythmOptions(args, song) : {});
        intro(m);
      } catch (err) {
        ctx.economy.refund(fee);
        throw err;
      }
      ctx.activity(`{name} is playing ${name}${song ? ` on ${song.title}` : ''}`, { guest });
      return true;
    });

    // ------------------------------------------------------------ room games

    const startRoom = (game: GameId, starter: Guest | null, rawStake: unknown, rawPrize?: unknown, args?: any) => {
      if (!allowed(game, 'room') && starter) throw new HbError('This game cannot be started for the room');
      if (!gameInfo(game)?.modes.includes('room')) throw new HbError('This game is for duels only');
      tvFree(game);
      checkLight(game);
      // Rhythm Rain: the song the guest picked; the host's start draws one (no music when no song is ready)
      const song = game !== 'rhythm' ? null : args?.song ? readySong(args.song) : starter ? null : drawSong();
      if (game === 'rhythm' && args?.song && !song) throw new HbError('This song is not available, pick another one');
      const stake = cleanStake(rawStake);
      const charges: Charge[] = [];
      if (starter) {
        checkFree(starter.id, null);
        charges.push(ctx.economy.charge(starter, song ? 'games.rhythmMusic' : 'games.room', 1, `Started ${gameInfo(game)!.name}${song ? ' with music' : ''}`));
        try {
          charges.push(ctx.economy.pay(starter, stake, `${gameInfo(game)!.name}: entry`));
        } catch (err) {
          for (const c of charges) ctx.economy.refund(c);
          throw err;
        }
      }
      try {
        const m = createMatch(game, 'room', starter ? player(starter) : null, starter ? [player(starter)] : [], stake, charges, game === 'rhythm' ? rhythmOptions(args, song) : {});
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
        cancel(m, 'Nobody else joined, game cancelled');
        return;
      }
      intro(m);
    };

    ctx.onGuest('startRoom', (args, guest) => {
      startRoom(String(args?.game ?? '') as GameId, guest, args?.stake, undefined, args);
      return true;
    });

    ctx.onGuest('join', (_args, guest) => {
      const m = lobby();
      if (!m) throw new HbError('Too late to join');
      if (m.players.some((p) => p.id === guest.id)) return true;
      checkFree(guest.id, null);
      const most = gameInfo(m.game)?.maxPlayers;
      if (most && m.players.length >= most) throw new HbError(`The game is full (${most} players)`);
      m.charges.push(ctx.economy.pay(guest, m.stake, `${gameInfo(m.game)!.name}: entry`));
      m.players.push(player(guest));
      ctx.publish();
      return true;
    });

    ctx.onGuest('leave', (_args, guest) => {
      const m = lobby();
      if (!m) throw new HbError('The game has started');
      if (m.starter?.id === guest.id) {
        cancel(m, `${guest.name} cancelled the game`);
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
      const m = matchOf(guest.id, 'intro');
      if (!m) throw new HbError('Not now');
      if (m.ready.has(guest.id)) return true;
      m.ready.add(guest.id);
      if (m.ready.size >= m.players.length && (m.endsAt ?? 0) - Date.now() > ALL_READY_MS) {
        deadline(m, ALL_READY_MS);
        later(m, ALL_READY_MS, () => play(m));
      } else ctx.publish();
      return true;
    });

    ctx.onGuest('begin', (_args, guest) => {
      const m = lobby();
      if (!m) throw new HbError('Not now');
      if (m.starter?.id !== guest.id) throw new HbError('Only the person who started it can do that');
      if (m.players.length < 2) throw new HbError('Wait for at least one more player');
      beginRoom(m);
      return true;
    });

    ctx.onGuest('play', (args, guest) => {
      const m = matchOf(guest.id, 'play');
      if (!m?.runtime) throw new HbError('Not now');
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
    /** The host's stars for a song (0: none) */
    ctx.onAdmin('rateSong', (args) => {
      const key = String(args?.key ?? '');
      if (!ctx.settings.get().rhythmSongs.includes(key)) throw new HbError('Unknown song');
      const stars = clamp(Math.round(num(args?.stars, 0)), 0, 5);
      const { [key]: _old, ...rest } = ctx.settings.get().rhythmRatings;
      ctx.settings.update({ rhythmRatings: stars ? { ...rest, [key]: stars } : rest });
      ctx.publish();
    });
    ctx.onAdmin('removeSong', (args) => {
      const key = String(args?.key ?? '');
      const { [key]: _old, ...ratings } = ctx.settings.get().rhythmRatings;
      ctx.settings.update({ rhythmSongs: ctx.settings.get().rhythmSongs.filter((k) => k !== key), rhythmRatings: ratings });
      songs.delete(key);
      ctx.publish();
    });

    // Pirate Race sounds: a MyInstants sound in place of a built-in one, kept for every later party
    const pirateDir = ctx.mediaDir('pirates');
    /** A sound file uploaded from the host's computer is deleted once it is replaced (MyInstants files stay, as a cache) */
    const dropUpload = (kind: PirateSoundId) => {
      const file = ctx.settings.get().pirateSounds[kind]?.file;
      if (!file?.startsWith('sound-')) return;
      try {
        unlinkSync(join(pirateDir, file));
      } catch {
        // already gone
      }
    };
    ctx.onAdmin('setPirateSound', async (args) => {
      const kind = String(args?.kind ?? '') as PirateSoundId;
      if (!PIRATE_SOUNDS.some((x) => x.id === kind)) throw new HbError('Unknown sound');
      const sounds = { ...ctx.settings.get().pirateSounds };
      if (!args?.mp3) {
        delete sounds[kind];
      } else {
        const mp3 = cleanMp3(args.mp3);
        const file = await downloadMp3(mp3, pirateDir);
        sounds[kind] = { file, url: ctx.mediaUrl(`pirates/${encodeURIComponent(file)}`), title: String(args?.title ?? mp3).slice(0, 60) };
      }
      dropUpload(kind);
      ctx.settings.update({ pirateSounds: sounds });
      ctx.publish();
      return sounds[kind] ?? null;
    });
    /** A sound from the host's computer instead of a built-in one (the browser checked it can be played) */
    const SOUND_EXTS = ['mp3', 'ogg', 'oga', 'opus', 'wav', 'flac', 'm4a', 'aac', 'webm'];
    ctx.http.post('/pirateSound', express.raw({ type: () => true, limit: '10mb' }), (req, res) => {
      if (!ctx.isAdminRequest(req)) {
        res.status(403).json({ error: 'Host only' });
        return;
      }
      const kind = String(req.query.kind ?? '') as PirateSoundId;
      const name = String(req.query.name ?? '');
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      if (!PIRATE_SOUNDS.some((x) => x.id === kind)) {
        res.status(400).json({ error: 'Unknown sound' });
        return;
      }
      if (!SOUND_EXTS.includes(ext) || !Buffer.isBuffer(req.body) || !req.body.length) {
        res.status(400).json({ error: 'Send an audio file (MP3, OGG, WAV, FLAC, M4A...)' });
        return;
      }
      dropUpload(kind);
      const file = `sound-${kind}-${uid(6)}.${ext}`;
      writeFileSync(join(pirateDir, file), req.body);
      const title = name.replace(/.[^.]+$/, '').slice(0, 60) || 'My sound';
      const pick = { file, url: ctx.mediaUrl(`pirates/${file}`), title };
      ctx.settings.update({ pirateSounds: { ...ctx.settings.get().pirateSounds, [kind]: pick } });
      ctx.publish();
      res.json(pick);
    });
    /** Let the TV play one of the race sounds, to try it */
    ctx.onAdmin('testPirateSound', (args) => {
      const kind = String(args?.kind ?? '');
      if (!PIRATE_SOUNDS.some((x) => x.id === kind)) throw new HbError('Unknown sound');
      ctx.emit('tv-audio', 'pirateTest', { kind, url: ctx.settings.get().pirateSounds[kind as PirateSoundId]?.url ?? null });
    });

    // The race songs: uploaded from the admin, their tempo and first beat measured there
    const SONG_TYPES: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a' };
    /** Beat times sent with an upload: rising, inside the song, at most 2000 */
    const beatList = (raw: unknown): number[] => {
      const list = String(raw ?? '')
        .split(',')
        .map((x) => Math.round(Number(x) * 1000) / 1000)
        .filter((x) => Number.isFinite(x) && x >= 0 && x < 3600)
        .slice(0, 2000);
      return list.filter((x, i) => i === 0 || x > list[i - 1]);
    };
    const songOf = (id: unknown) => {
      const song = ctx.settings.get().pirateSongs.find((x) => x.id === id);
      if (!song) throw new HbError('Unknown song');
      return song;
    };
    ctx.http.post('/pirateSong', express.raw({ type: Object.keys(SONG_TYPES), limit: '25mb' }), (req, res) => {
      if (!ctx.isAdminRequest(req)) {
        res.status(403).json({ error: 'Host only' });
        return;
      }
      const ext = SONG_TYPES[req.get('content-type') ?? ''];
      if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) {
        res.status(400).json({ error: 'Send an MP3, OGG, WAV or M4A file' });
        return;
      }
      const id = uid(6);
      const file = `song-${id}.${ext}`;
      writeFileSync(join(pirateDir, file), req.body);
      const title = String(req.query.name ?? '').slice(0, 80) || 'Race song';
      const beats = beatList(req.query.beats);
      if (beats.length < 8) {
        res.status(400).json({ error: 'No beat found in this song' });
        return;
      }
      const bpm = Math.round(clamp(num(req.query.bpm, 100), 30, 250) * 10) / 10;
      const duration = Math.round(clamp(num(req.query.duration, beats[beats.length - 1] + 2), beats[beats.length - 1], 3600) * 100) / 100;
      const song = { id, file, url: ctx.mediaUrl(`pirates/${file}`), title, beats, bpm, steady: req.query.steady === '1', duration };
      ctx.settings.update({ pirateSongs: [...ctx.settings.get().pirateSongs, song] });
      ctx.publish();
      res.json({ id });
    });
    /** Moves all the beats of a song a little earlier or later */
    ctx.onAdmin('shiftPirateSong', (args) => {
      const song = songOf(args?.id);
      const by = clamp(num(args?.ms, 0), -500, 500) / 1000;
      const beats = song.beats.map((b) => Math.round((b + by) * 1000) / 1000).filter((b) => b >= 0);
      ctx.settings.update({ pirateSongs: ctx.settings.get().pirateSongs.map((x) => (x.id === song.id ? { ...x, beats } : x)) });
      ctx.publish();
    });
    ctx.onAdmin('removePirateSong', (args) => {
      const song = songOf(args?.id);
      try {
        unlinkSync(join(pirateDir, song.file));
      } catch {
        // already gone
      }
      ctx.settings.update({ pirateSongs: ctx.settings.get().pirateSongs.filter((x) => x.id !== song.id) });
      ctx.publish();
    });
    /** The TV plays a song from its first beat with the drum on top, to check they match */
    /** The last song tried on the TV, so a random pick is another one when there are several */
    let lastTried = '';
    ctx.onAdmin('testPirateSong', (args) => {
      const s = ctx.settings.get();
      let song;
      if (args?.id) song = songOf(args.id);
      else {
        const pool = s.pirateSongs.length > 1 ? s.pirateSongs.filter((x) => x.id !== lastTried) : s.pirateSongs;
        song = pool[Math.floor(Math.random() * pool.length)];
        if (!song) throw new HbError('Add a song first');
      }
      lastTried = song.id;
      ctx.emit('tv-audio', 'pirateSongTest', { id: song.id, drum: s.pirateSounds.drum?.url ?? null, accent: s.pirateSounds.drumAccent?.url ?? null });
      return { title: song.title, sec: PIRATE_SONG_TEST_SEC };
    });
    ctx.onAdmin('stopPirateSongTest', () => ctx.emit('tv-audio', 'pirateSongTest', null));

    ctx.onTv('play', (args) => {
      for (const m of matches.values()) m.runtime?.tvInput?.(args);
      return true;
    });

    /**
     * The host tries Rhythm Rain on its light: a solo game with nobody's phone, no fee and no score kept.
     * With autoplay, every note is hit on time (bursts, multiplier waves, the finale), else they all go by.
     */
    ctx.onAdmin('testRhythm', (args) => {
      tvFree('rhythm');
      checkLight('rhythm');
      const song = args?.song ? readySong(args.song) : null;
      if (args?.song && !song) throw new HbError('This song is not ready, pick another one');
      const tester: GamePlayer = { id: 'host-test', name: 'Test', color: '#8a8f98' };
      const m = createMatch('rhythm', 'solo', null, [tester], 0, [], { ...rhythmOptions(args, song), autoplay: args?.autoplay !== false, test: true });
      intro(m);
      play(m);
      // The page knows which game is its try (a guest's game can be on too)
      return m.id;
    });

    ctx.onAdmin('startRoom', (args) => startRoom(String(args?.game ?? '') as GameId, null, args?.stake, args?.prize, args));
    /** The match the host acts on: the one named, else the only one */
    const hostMatch = (args: any) => (args?.id ? matches.get(String(args.id)) : matches.size === 1 ? [...matches.values()][0] : undefined);
    ctx.onAdmin('begin', (args) => {
      const m = hostMatch(args);
      if (m?.phase === 'lobby') beginRoom(m);
      else if (m?.phase === 'intro') play(m);
      else if (m?.phase === 'play') m.runtime?.skip?.();
    });
    ctx.onAdmin('stop', (args) => {
      const m = hostMatch(args);
      if (m) cancel(m, 'The host stopped the game');
    });
    /** A guest (or everyone, with no guest) can start a Bluff again right away */
    ctx.onAdmin('resetBluff', (args) => {
      if (args?.guestId) lastBluff.delete(String(args.guestId));
      else lastBluff.clear();
      ctx.publish();
    });
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
        rhythmPerkSec: args?.rhythmPerkSec !== undefined ? Math.min(300, Math.max(0, Math.round(num(args.rhythmPerkSec, 45)))) : s.rhythmPerkSec,
        bluffMultiplier: args?.bluffMultiplier !== undefined ? Math.round(clamp(num(args.bluffMultiplier, 0.5), 0, 3) * 100) / 100 : s.bluffMultiplier,
        bluffCooldownMin: args?.bluffCooldownMin !== undefined ? Math.round(clamp(num(args.bluffCooldownMin, 30), 0, 240)) : s.bluffCooldownMin,
        bluffChooseSec: args?.bluffChooseSec !== undefined ? Math.round(clamp(num(args.bluffChooseSec, 30), 10, 180)) : s.bluffChooseSec,
        scratchLight:
          typeof args?.scratchLight === 'string' && (args.scratchLight === '' || lights()?.list().some((d) => d.id === args.scratchLight))
            ? args.scratchLight
            : s.scratchLight,
        rhythmLight:
          typeof args?.rhythmLight === 'string' && (args.rhythmLight === '' || lights()?.list().some((d) => d.id === args.rhythmLight))
            ? args.rhythmLight
            : s.rhythmLight,
        rhythmReverse: typeof args?.rhythmReverse === 'boolean' ? args.rhythmReverse : s.rhythmReverse,
        rhythmSoloTaps: ['phone', 'tv'].includes(args?.rhythmSoloTaps) ? args.rhythmSoloTaps : s.rhythmSoloTaps,
        rhythmAudioOffset:
          args?.rhythmAudioOffset !== undefined ? Math.min(2000, Math.max(-2000, Math.round(num(args.rhythmAudioOffset, 0)))) : s.rhythmAudioOffset,
        rhythmMinSec: args?.rhythmMinSec !== undefined ? Math.min(600, Math.max(20, Math.round(num(args.rhythmMinSec, 60)))) : s.rhythmMinSec,
        rhythmMaxSec: args?.rhythmMaxSec !== undefined ? Math.min(600, Math.max(20, Math.round(num(args.rhythmMaxSec, 120)))) : s.rhythmMaxSec,
        rhythmFullSong: typeof args?.rhythmFullSong === 'boolean' ? args.rhythmFullSong : s.rhythmFullSong,
        rhythmHolds: typeof args?.rhythmHolds === 'boolean' ? args.rhythmHolds : s.rhythmHolds,
        pirateLight:
          typeof args?.pirateLight === 'string' && (args.pirateLight === '' || lights()?.list().some((d) => d.id === args.pirateLight))
            ? args.pirateLight
            : s.pirateLight,
        pirateReverse: typeof args?.pirateReverse === 'boolean' ? args.pirateReverse : s.pirateReverse,
        pirateTreasure: args?.pirateTreasure !== undefined ? Math.min(100, Math.max(10, Math.round(num(args.pirateTreasure, 100)))) : s.pirateTreasure,
        pirateLength: PIRATE_LENGTHS.some((l) => l.id === args?.pirateLength) ? args.pirateLength : s.pirateLength,
        pirateSongVolume: args?.pirateSongVolume !== undefined ? Math.round(clamp(num(args.pirateSongVolume, 70), 0, 100)) : s.pirateSongVolume,
        pirateDrumVolume: args?.pirateDrumVolume !== undefined ? Math.round(clamp(num(args.pirateDrumVolume, 100), 0, 200)) : s.pirateDrumVolume,
        pirateAudioOffset:
          args?.pirateAudioOffset !== undefined ? Math.min(1000, Math.max(-1000, Math.round(num(args.pirateAudioOffset, 0)))) : s.pirateAudioOffset,
        partyLight:
          typeof args?.partyLight === 'string' && (args.partyLight === '' || lights()?.list().some((d) => d.id === args.partyLight)) ? args.partyLight : s.partyLight,
        partyReverse: typeof args?.partyReverse === 'boolean' ? args.partyReverse : s.partyReverse,
        partyRounds: args?.partyRounds !== undefined ? Math.round(clamp(num(args.partyRounds, 3), 1, PARTY_MINIS.length)) : s.partyRounds,
        partyMinis: Array.isArray(args?.partyMinis) ? PARTY_MINIS.map((g) => g.id).filter((id) => args.partyMinis.includes(id)) : s.partyMinis,
        partyOptions: args?.partyOptions !== undefined ? cleanPartyOptions(args.partyOptions) : s.partyOptions,
      });
      // The shortest stays below the longest, whichever was moved
      const n = ctx.settings.get();
      if (n.rhythmMinSec > n.rhythmMaxSec) {
        ctx.settings.update(args?.rhythmMinSec !== undefined ? { rhythmMaxSec: n.rhythmMinSec } : { rhythmMinSec: n.rhythmMaxSec });
      }
      ctx.publish();
    });

    // ------------------------------------------------------------ state

    /** For other modules: is this guest playing, or in a challenge? (no pop-ups then). And the song leaderboards. */
    ctx.provide<GamesApi>('games', {
      busy: (guestId: string) =>
        [...matches.values()].some((m) => m.players.some((p) => p.id === guestId)) || [...invites.values()].some((i) => i.from.id === guestId || i.to.id === guestId),
      playing: () => {
        const m = [...matches.values()][0];
        return m ? (gameInfo(m.game)?.name ?? 'A game') : null;
      },
      songBoard: (board) => {
        const [, key, chart, colors] = board.split(':');
        const info = songs.get(key)?.info;
        if (!info?.title) return null;
        return { title: info.title, artist: info.artist ?? '', cover: info.cover, chart: rhythmDifficulty(chart).name, colors: Number(colors) || 1 };
      },
    });

    const matchState = (m: Match, role: Parameters<GameRuntime['view']>[0]): MatchState => ({
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
      ...(m.options.crews ? { crews: m.options.crews } : {}),
      ...(m.options.bluff ? { bluff: m.options.bluff } : {}),
    });

    ctx.state((role): GamesState => {
      const s = ctx.settings.get();
      return {
        invites: [...invites.values()].map(({ charges: _c, timer: _t, ...inv }) => inv),
        matches: [...matches.values()].map((m) => matchState(m, role)),
        bluffReadyAt: bluffReadyAt(),
        bluffBase: ctx.economy.enabled ? ctx.economy.earnAmount('games.bluff') : 0,
        perk,
        ...(role === 'admin' ? { lightDevices: (lights()?.list() ?? []).map(({ id, name, online }) => ({ id, name, online })) } : {}),
        lights: lightsOn(),
        rhythmSongs: s.rhythmSongs.map((key) => songs.get(key)?.info ?? { key, status: 'loading' as const }),
        online: role === 'tv' ? [] : [...ctx.session.guests.values()].filter((g) => g.sockets > 0).map((g) => ({ ...player(g), balance: g.balance })),
        settings: s,
      };
    });

    // A guest removed by the host: their challenges go (the other side gets their money back),
    // and they leave a game that has not started yet
    ctx.session.on('guest-removed', (g: Guest) => {
      for (const inv of [...invites.values()]) {
        if (inv.from.id === g.id) dropInvite(inv, null);
        else if (inv.to.id === g.id) dropInvite(inv, `${g.name} left the party`);
      }
      const m = matchOf(g.id);
      if (!m) return;
      if (m.phase !== 'lobby' && m.phase !== 'intro') return;
      const left = m.players.filter((p) => p.id !== g.id);
      // A duel or solo game without its player, or a room game left with one: the others get their money back
      if (m.mode !== 'room' || (m.phase === 'lobby' ? m.starter?.id === g.id : left.length < 2)) {
        cancel(m, `${g.name} left the party, game cancelled`);
        return;
      }
      m.players = left;
      m.charges = m.charges.filter((c) => c.guest.id !== g.id);
      m.ready.delete(g.id);
      ctx.publish();
    });

    // Opponents come and go and their balance changes: keep the list fresh (publish is throttled)
    ctx.session.on('guests-changed', () => ctx.publish());
    ctx.session.on('guest-changed', () => ctx.publish());

    const stopAll = (refund: boolean) => {
      for (const inv of [...invites.values()]) dropInvite(inv, refund ? 'Your challenge was cancelled' : null);
      for (const m of [...matches.values()]) cancel(m, 'The game was stopped', refund);
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
      const m = [...matches.values()].find((x) => x.game === 'circle');
      if (m?.phase === 'result' && m.endsAt && cutShort !== m.id) {
        cutShort = m.id;
        const shown = Date.now() - (m.endsAt - RESULT_MS);
        later(m, Math.max(0, RESULT_SCRATCH_MS - shown), () => close(m));
      }
      const raw = num(args?.angle, 0);
      const angle = Number.isFinite(raw) ? clamp(raw, -1e6, 1e6) : 0;
      ctx.emit('tv', 'scratch', { angle, touching: !!args?.touching });
      turntable?.move(angle, !!args?.touching);
      return true;
    });

    /** Fireworks: the winner taps a color, a shot goes up the strip (straight there, no state update) */
    ctx.onGuest('perkShoot', (args, guest) => {
      if (perk?.kind !== 'fireworks' || perk.guest.id !== guest.id) return false;
      const color = String(args?.color ?? '') as RhythmColor;
      if (!perk.colors.includes(color)) return false;
      const led = RHYTHM_COLORS.find((c) => c.id === color)?.led;
      if (led) fireworks?.shoot(rgbOf(led));
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
    ctx.onSessionReset(() => {
      stopAll(false);
      lastBluff.clear();
    });
    ctx.onShutdown(() => stopAll(true));
  },
});
