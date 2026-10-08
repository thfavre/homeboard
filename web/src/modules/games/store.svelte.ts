import type { Component } from 'svelte';
import { CircleDashed, Coins, Guitar, Lightbulb, Timer, VenetianMask, Zap } from '@lucide/svelte';
import type { GameId, GamesState, MatchState } from '$shared/games.ts';
import { hb, serverNow } from '$lib/client.svelte.ts';

export const GAME_ICONS: Record<GameId, Component<any>> = {
  timer: Timer,
  simon: Lightbulb,
  reflex: Zap,
  circle: CircleDashed,
  bluff: VenetianMask,
  coin: Coins,
  rhythm: Guitar,
};

export const gamesState = () => hb.modules.games as GamesState | undefined;

/** What this phone chose to hide: a room lobby it skipped, results it closed */
export const local = $state({ skipped: '', closed: '' });

export function myMatch(): MatchState | null {
  const m = gamesState()?.match;
  const me = hb.me?.id;
  // Results stay until this phone closes them
  return m && me && m.players.some((p) => p.id === me) && !(m.phase === 'result' && local.closed === m.id) ? m : null;
}

export function showGamesScreen(): boolean {
  const s = gamesState();
  const me = hb.me?.id;
  if (!s || !me) return false;
  const m = s.match;
  if (myMatch()) return true;
  if (s.perk?.guest.id === me) return true;
  if (s.invites.some((i) => i.to.id === me || i.from.id === me)) return true;
  return !!m && m.mode === 'room' && m.phase === 'lobby' && local.skipped !== m.id;
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
