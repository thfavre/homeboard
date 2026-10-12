import type { Component } from 'svelte';
import { Hash, Layers, Pipette } from '@lucide/svelte';
import type { MatchState } from '$shared/games.ts';
import type { PartyMiniId, PartyView } from '$shared/party.ts';
import CountPhone from './count/CountPhone.svelte';
import CountTv from './count/CountTv.svelte';
import StackPhone from './stack/StackPhone.svelte';
import StackTv from './stack/StackTv.svelte';
import MatchPhone from './match/MatchPhone.svelte';
import MatchTv from './match/MatchTv.svelte';

/** What a mini game's screen gets: the match, and the party (its `mini` is this game's view) */
export type MiniScreen = Component<{ m: MatchState; v: PartyView }>;

/**
 * Screens of each Light Party mini game, while it is played (the lineup, rules and results are shared,
 * see PartyPhone and PartyTv). A new mini game: its folder here, a line below, its server file and its
 * entry in PARTY_MINIS.
 */
export const PARTY_UI: Record<PartyMiniId, { icon: Component<any>; phone: MiniScreen; tv: MiniScreen }> = {
  count: { icon: Hash, phone: CountPhone, tv: CountTv },
  stack: { icon: Layers, phone: StackPhone, tv: StackTv },
  match: { icon: Pipette, phone: MatchPhone, tv: MatchTv },
};

export const ordinal = (k: number) => `${k}${k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th'}`;
