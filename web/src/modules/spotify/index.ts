import { Music } from '@lucide/svelte';
import type { SpotifyState } from '$shared/spotify.ts';
import { hb } from '$lib/client.svelte.ts';
import type { ClientModule } from '../types.ts';
import NowPlayingTv from './NowPlayingTv.svelte';
import UpNextTv from './UpNextTv.svelte';
import NowPlayingMini from './NowPlayingMini.svelte';
import MusicGuest from './MusicGuest.svelte';
import SpotifyAdmin from './SpotifyAdmin.svelte';

export default {
  id: 'spotify',
  tv: [
    { slot: 'side', order: 10, component: NowPlayingTv },
    {
      slot: 'side',
      order: 20,
      component: UpNextTv,
      spot: 'next',
      visible: () => {
        const s = hb.modules.spotify as SpotifyState | undefined;
        return !!s?.connected && s.queue.length > 0;
      },
    },
  ],
  guestHome: { order: 10, component: NowPlayingMini },
  guest: { title: 'Music', tagline: 'Add songs to the playlist', icon: Music, order: 10, component: MusicGuest, priceKey: 'spotify.queue' },
  admin: { title: 'Music', icon: Music, order: 10, group: 'sound', keywords: 'spotify songs queue skip explicit playback volume', component: SpotifyAdmin },
} satisfies ClientModule;
