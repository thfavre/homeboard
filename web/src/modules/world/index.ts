import { PersonStanding } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import WorldTv from './WorldTv.svelte';
import WorldGuest from './WorldGuest.svelte';
import WorldAdmin from './WorldAdmin.svelte';
import WorldBalance from './WorldBalance.svelte';
import LetterHome from './LetterHome.svelte';

export default {
  id: 'world',
  // The town is the home screen: it comes before the pixel canvas while both are enabled
  tv: [{ slot: 'main', order: 5, component: WorldTv }],
  guest: { title: 'Avatar', tagline: 'Your character in the town, its shop, letters and fireworks', icon: PersonStanding, order: 15, component: WorldGuest, header: WorldBalance },
  // A letter the courier brought, waiting to be opened
  guestHome: { order: 2, component: LetterHome },
  admin: { title: 'Avatar world', icon: PersonStanding, order: 25, group: 'screen', keywords: 'town avatar character sprite lpc sleep courier letter fireworks actions', component: WorldAdmin },
} satisfies ClientModule;
