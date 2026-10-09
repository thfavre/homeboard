import { Sticker } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import StickersTv from './StickersTv.svelte';
import StickersGuest from './StickersGuest.svelte';
import StickersAdmin from './StickersAdmin.svelte';

export default {
  id: 'stickers',
  tv: [{ slot: 'overlay', order: 20, component: StickersTv }],
  guest: { title: 'Stickers', tagline: 'Send a sticker bouncing around the TV', icon: Sticker, order: 30, component: StickersGuest, priceKey: 'stickers.sticker' },
  admin: { title: 'Stickers', icon: Sticker, order: 20, group: 'screen', keywords: 'emoji text bouncing', component: StickersAdmin },
} satisfies ClientModule;
