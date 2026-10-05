import { Lightbulb } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import WledTv from './WledTv.svelte';
import WledGuest from './WledGuest.svelte';
import WledAdmin from './WledAdmin.svelte';

export default {
  id: 'wled',
  tv: [{ slot: 'overlay', order: 30, component: WledTv }],
  guest: { title: 'Lights', tagline: 'Start a light show in the room', icon: Lightbulb, order: 50, component: WledGuest, priceKey: 'wled.all' },
  admin: { title: 'Lights', icon: Lightbulb, order: 50, component: WledAdmin },
} satisfies ClientModule;
