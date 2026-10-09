import { Image } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import PhotosTv from './PhotosTv.svelte';
import PhotosGuest from './PhotosGuest.svelte';
import PhotosAdmin from './PhotosAdmin.svelte';

export default {
  id: 'photos',
  tv: [{ slot: 'overlay', order: 10, component: PhotosTv }],
  guest: { title: 'Photos', tagline: 'Put your photo on the big screen', icon: Image, order: 40, component: PhotosGuest, priceKey: 'photos.photo' },
  admin: { title: 'Photos', icon: Image, order: 10, group: 'screen', keywords: 'pictures gallery caption', component: PhotosAdmin },
} satisfies ClientModule;
