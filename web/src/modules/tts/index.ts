import { Megaphone } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import { hb } from '$lib/client.svelte.ts';
import type { TtsState } from '$shared/tts.ts';
import TtsTv from './TtsTv.svelte';
import TtsGuest from './TtsGuest.svelte';
import TtsAdmin from './TtsAdmin.svelte';

export default {
  id: 'tts',
  tv: [{ slot: 'overlay', order: 45, component: TtsTv }],
  guest: {
    title: 'Shoutout',
    tagline: 'Speak through the TV',
    icon: Megaphone,
    order: 45,
    component: TtsGuest,
    get priceKey() {
      const mod = hb.modules.tts as TtsState | undefined;
      return mod?.pricingMode === 'per_char' ? 'tts.char' : 'tts.message';
    },
  },
  admin: {
    title: 'Text-to-Speech',
    icon: Megaphone,
    order: 30,
    group: 'sound',
    keywords: 'voice announcement speech say',
    component: TtsAdmin,
  },
} satisfies ClientModule;
