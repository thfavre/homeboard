import type { ClientModule } from '../types.ts';
import { hb } from '$lib/client.svelte.ts';
import JoinCard from './tv/JoinCard.svelte';
import Leaderboard from './tv/Leaderboard.svelte';
import ActivityTicker from './tv/ActivityTicker.svelte';
import Welcome from './tv/Welcome.svelte';

export default {
  id: 'core',
  tv: [
    { slot: 'main', order: 999, component: Welcome },
    { slot: 'side', order: 50, component: Leaderboard },
    { slot: 'side', order: 100, component: JoinCard },
    { slot: 'footer', order: 10, component: ActivityTicker, visible: () => hb.core?.privacy.activity !== 'off' },
  ],
} satisfies ClientModule;
