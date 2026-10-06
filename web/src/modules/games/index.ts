import { Gamepad2 } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import GamesTv from './GamesTv.svelte';
import GamesPlay from './GamesPlay.svelte';
import GamesGuest from './GamesGuest.svelte';
import GamesAdmin from './GamesAdmin.svelte';
import InviteTv from './InviteTv.svelte';
import ScratchCard from './perk/ScratchCard.svelte';
import { gamesState, showGamesScreen } from './store.svelte.ts';

export default {
  id: 'games',
  tv: [
    { slot: 'overlay', order: 40, component: InviteTv },
    // The Perfect Circle prize stands in for the music's "Up next" while it lasts
    { slot: 'side', order: 15, component: ScratchCard, spot: 'next', visible: () => gamesState()?.perk?.kind === 'scratch' },
  ],
  tvTakeover: GamesTv,
  guestTakeover: GamesPlay,
  showGuestTakeover: showGamesScreen,
  guest: { title: 'Games', tagline: 'Duel someone for money, or start a game for everyone', icon: Gamepad2, order: 65, component: GamesGuest, priceKey: 'games.duel' },
  admin: { title: 'Games', icon: Gamepad2, order: 65, component: GamesAdmin },
} satisfies ClientModule;
