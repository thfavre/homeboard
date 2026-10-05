import { AudioLines } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import SoundboardTv from './SoundboardTv.svelte';
import SoundboardGuest from './SoundboardGuest.svelte';
import SoundboardAdmin from './SoundboardAdmin.svelte';

export default {
  id: 'soundboard',
  tv: [{ slot: 'overlay', order: 40, component: SoundboardTv }],
  guest: { title: 'Soundboard', tagline: 'Play a sound effect on the TV', icon: AudioLines, order: 60, component: SoundboardGuest, priceKey: 'soundboard.sound' },
  admin: { title: 'Soundboard', icon: AudioLines, order: 60, component: SoundboardAdmin },
} satisfies ClientModule;
