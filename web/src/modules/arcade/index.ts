import { Joystick } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import { enabled } from '$lib/client.svelte.ts';
import ArcadeGuest from './ArcadeGuest.svelte';
import ArcadePlay from './ArcadePlay.svelte';
import ArcadeAdmin from './ArcadeAdmin.svelte';
import { showArcadeScreen } from './store.svelte.ts';

export default {
  id: 'arcade',
  // The players' phones only (no takeover of the TV: the town's arcade shows the scores)
  guestTakeover: ArcadePlay,
  showGuestTakeover: showArcadeScreen,
  // Reached from the Games' 1 vs 1 list and the avatar's actions: its own home tile only when the Games are off
  guest: { title: 'Arcade', tagline: 'Challenge someone to quick games on your phones', icon: Joystick, order: 66, component: ArcadeGuest, priceKey: 'arcade.challenge', hidden: () => enabled('games') },
  admin: { title: 'Arcade', icon: Joystick, order: 11, group: 'play', keywords: 'arcade duel challenge 1v1 knife throw tower stack flap zig quick maths slicer phone mini games', component: ArcadeAdmin },
} satisfies ClientModule;
