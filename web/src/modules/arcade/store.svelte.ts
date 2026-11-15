import type { Component } from 'svelte';
import { Bird, Calculator, Cherry, Footprints, Hammer, Layers, Route, Ruler, Swords } from '@lucide/svelte';
import type { ArcadeGameId, ArcadeMatch, ArcadeState } from '$shared/arcade.ts';
import { hb } from '$lib/client.svelte.ts';

export const ARCADE_ICONS: Record<ArcadeGameId, Component<any>> = {
  knife: Swords,
  stack: Layers,
  flap: Bird,
  zig: Route,
  plank: Ruler,
  dodge: Footprints,
  whack: Hammer,
  maths: Calculator,
  slicer: Cherry,
};

export const arcadeState = () => hb.modules.arcade as ArcadeState | undefined;

/** Results this phone closed */
export const arcadeLocal = $state({ closed: '' });

export function myArcadeMatch(): ArcadeMatch | null {
  const me = hb.me?.id;
  if (!me) return null;
  const mine = (arcadeState()?.matches ?? []).filter((m) => m.players.some((p) => p.id === me));
  // The match being played first, then a result that stays until this phone closes it
  return mine.find((m) => m.phase !== 'result') ?? mine.find((m) => arcadeLocal.closed !== m.id) ?? null;
}

/** The phone shows the Arcade's full screen: a challenge sent or received, a match, its result */
export function showArcadeScreen(): boolean {
  const s = arcadeState();
  const me = hb.me?.id;
  if (!s || !me) return false;
  if (myArcadeMatch()) return true;
  return s.invites.some((i) => i.to.id === me || i.from.id === me);
}

/** This guest cannot play until they make their town character */
export function needsCharacter(): boolean {
  const me = hb.me?.id;
  return !!me && arcadeState()?.online.find((p) => p.id === me)?.look === false;
}

/** A game's gradient */
export const gradient = (c: [string, string]) => `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
