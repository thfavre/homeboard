import type { Component } from 'svelte';
import type { GameId, MatchState } from '$shared/games.ts';
import TimerPhone from './phone/TimerPhone.svelte';
import SimonPhone from './phone/SimonPhone.svelte';
import ReflexPhone from './phone/ReflexPhone.svelte';
import CirclePhone from './phone/CirclePhone.svelte';
import BluffPhone from './phone/BluffPhone.svelte';
import CoinPhone from './phone/CoinPhone.svelte';
import RhythmPhone from './phone/RhythmPhone.svelte';
import PiratesPhone from './phone/PiratesPhone.svelte';
import PartyPhone from './party/PartyPhone.svelte';
import TimerTv from './tv/TimerTv.svelte';
import SimonTv from './tv/SimonTv.svelte';
import ReflexTv from './tv/ReflexTv.svelte';
import CircleTv from './tv/CircleTv.svelte';
import PiratesTv from './tv/PiratesTv.svelte';
import PartyTv from './party/PartyTv.svelte';

type View = Component<{ m: MatchState }>;

/**
 * Screens of each game (no TV screen: played on a light or the phones, see RhythmCard, CoinCard and BluffCard). `tvResult`: the TV screen of the game also shows its result
 * (drawings, revealed cards...) instead of the generic result list. `phoneResult`: the same for the
 * phone. `fill`: the phone screen takes the whole height while playing instead of being centered.
 */
export const GAME_UI: Record<GameId, { phone: View; tv?: View; tvResult?: boolean; phoneResult?: boolean; fill?: boolean }> = {
  timer: { phone: TimerPhone, tv: TimerTv, tvResult: true },
  simon: { phone: SimonPhone, tv: SimonTv },
  reflex: { phone: ReflexPhone, tv: ReflexTv, tvResult: true },
  circle: { phone: CirclePhone, tv: CircleTv, tvResult: true },
  bluff: { phone: BluffPhone, phoneResult: true },
  coin: { phone: CoinPhone },
  rhythm: { phone: RhythmPhone, fill: true },
  pirates: { phone: PiratesPhone, tv: PiratesTv, tvResult: true, fill: true },
  party: { phone: PartyPhone, tv: PartyTv },
};
