import { PersonStanding } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import WorldTv from './WorldTv.svelte';
import WorldGuest from './WorldGuest.svelte';
import WorldAdmin from './WorldAdmin.svelte';

export default {
  id: 'world',
  // The town is the home screen: it comes before the pixel canvas while both are enabled
  tv: [{ slot: 'main', order: 5, component: WorldTv }],
  guest: { title: 'Avatar', tagline: 'Your character in the town, and its shop', icon: PersonStanding, order: 15, component: WorldGuest },
  admin: { title: 'Avatar world', icon: PersonStanding, order: 25, group: 'screen', keywords: 'town avatar character sprite lpc sleep', component: WorldAdmin },
} satisfies ClientModule;
