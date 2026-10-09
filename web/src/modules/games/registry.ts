import type { Component } from 'svelte';
import type { GameId, MatchState } from '$shared/games.ts';
import TimerPhone from './phone/TimerPhone.svelte';
import SimonPhone from './phone/SimonPhone.svelte';
import ReflexPhone from './phone/ReflexPhone.svelte';
import CirclePhone from './phone/CirclePhone.svelte';
import BluffPhone from './phone/BluffPhone.svelte';
import CoinPhone from './phone/CoinPhone.svelte';
import RhythmPhone from './phone/RhythmPhone.svelte';
import TimerTv from './tv/TimerTv.svelte';
import SimonTv from './tv/SimonTv.svelte';
import ReflexTv from './tv/ReflexTv.svelte';
import CircleTv from './tv/CircleTv.svelte';
import BluffTv from './tv/BluffTv.svelte';

type View = Component<{ m: MatchState }>;

/**
 * Screens of each game (no TV screen: played on a light or the phones, see RhythmCard and CoinCard). `tvResult`: the TV screen of the game also shows its result
 * (drawings, revealed cards...) instead of the generic result list. `fill`: the phone screen takes
 * the whole height while playing instead of being centered.
 */
export const GAME_UI: Record<GameId, { phone: View; tv?: View; tvResult?: boolean; fill?: boolean }> = {
  timer: { phone: TimerPhone, tv: TimerTv, tvResult: true },
  simon: { phone: SimonPhone, tv: SimonTv },
  reflex: { phone: ReflexPhone, tv: ReflexTv, tvResult: true },
  circle: { phone: CirclePhone, tv: CircleTv, tvResult: true },
  bluff: { phone: BluffPhone, tv: BluffTv, tvResult: true },
  coin: { phone: CoinPhone },
  rhythm: { phone: RhythmPhone, fill: true },
};
