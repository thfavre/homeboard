import type { Component } from 'svelte';
import { CircleDashed, Coins, Guitar, Lightbulb, Ship, Timer, VenetianMask, Zap } from '@lucide/svelte';
import { isCardGame, type GameId, type GamesState, type MatchState } from '$shared/games.ts';
import { hb, serverNow } from '$lib/client.svelte.ts';

export const GAME_ICONS: Record<GameId, Component<any>> = {
  timer: Timer,
  simon: Lightbulb,
  reflex: Zap,
  circle: CircleDashed,
  bluff: VenetianMask,
  coin: Coins,
  rhythm: Guitar,
  pirates: Ship,
};

export const gamesState = () => hb.modules.games as GamesState | undefined;

/** What this phone chose to hide: a room lobby it skipped, results it closed */
export const local = $state({ skipped: '', closed: '' });

/** The game on the whole TV (null: none, or only card games, see isCardGame) */
export const tvMatch = () => gamesState()?.matches.find((m) => !isCardGame(m.game)) ?? null;
/** The match of one game (a card game is played once at a time) */
export const gameMatch = (game: GameId) => gamesState()?.matches.find((m) => m.game === game) ?? null;
/** The room game waiting for players */
export const roomLobby = () => gamesState()?.matches.find((m) => m.mode === 'room' && m.phase === 'lobby') ?? null;

export function myMatch(): MatchState | null {
  const me = hb.me?.id;
  if (!me) return null;
  const mine = (gamesState()?.matches ?? []).filter((m) => m.players.some((p) => p.id === me));
  // The game being played first, then a result that stays until this phone closes it
  return mine.find((m) => m.phase !== 'result') ?? mine.find((m) => local.closed !== m.id) ?? null;
}

export function showGamesScreen(): boolean {
  const s = gamesState();
  const me = hb.me?.id;
  if (!s || !me) return false;
  if (myMatch()) return true;
  if (s.perk?.guest.id === me) return true;
  if (s.invites.some((i) => i.to.id === me || i.from.id === me)) return true;
  const m = roomLobby();
  return !!m && local.skipped !== m.id;
}

/** Server time, refreshed every `ms` while the component lives */
export class Now {
  value = $state(serverNow());
  constructor(ms = 100) {
    $effect(() => {
      const t = setInterval(() => (this.value = serverNow()), ms);
      return () => clearInterval(t);
    });
  }
}

export const secondsLeft = (endsAt: number | null, now: number) => (endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0);
