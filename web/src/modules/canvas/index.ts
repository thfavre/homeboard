import { Grid3x3 } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import CanvasTv from './CanvasTv.svelte';
import CanvasGuest from './CanvasGuest.svelte';
import CanvasAdmin from './CanvasAdmin.svelte';

export default {
  id: 'canvas',
  tv: [{ slot: 'main', order: 10, component: CanvasTv }],
  guest: { title: 'Pixel canvas', tagline: 'Paint on the TV, pixel by pixel', icon: Grid3x3, order: 20, component: CanvasGuest, priceKey: 'canvas.pixel' },
  admin: { title: 'Pixel canvas', icon: Grid3x3, order: 20, component: CanvasAdmin },
} satisfies ClientModule;
