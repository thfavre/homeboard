import { Gamepad2 } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import GamesTv from './GamesTv.svelte';
import GamesPlay from './GamesPlay.svelte';
import GamesGuest from './GamesGuest.svelte';
import GamesAdmin from './GamesAdmin.svelte';
import GamesPrices from './GamesPrices.svelte';
import InviteTv from './InviteTv.svelte';
import ScratchCard from './perk/ScratchCard.svelte';
import RhythmCard from './RhythmCard.svelte';
import RhythmPreload from './RhythmPreload.svelte';
import CoinCard from './CoinCard.svelte';
import PirateAudio from './PirateAudio.svelte';
import CoinTossTv from './tv/CoinTossTv.svelte';
import type { CoinView } from '$shared/games.ts';
import { gamesState, showGamesScreen } from './store.svelte.ts';

export default {
  id: 'games',
  tv: [
    { slot: 'overlay', order: 40, component: InviteTv },
    // Rhythm Rain is played on a light: just a card with the scores above the main widget
    { slot: 'above', order: 10, component: RhythmCard, visible: () => gamesState()?.match?.game === 'rhythm' },
    // Coin Flip is played on the two phones: a card, then the throw itself in the middle of the TV
    { slot: 'above', order: 11, component: CoinCard, visible: () => gamesState()?.match?.game === 'coin' },
    {
      slot: 'overlay',
      order: 35,
      component: CoinTossTv,
      visible: () => {
        const m = gamesState()?.match;
        return m?.game === 'coin' && (m.view as CoinView | null)?.step === 'flight';
      },
    },
    // Keeps the sound awake on the TV and gets a duel's song ready, so the music starts on time
    { slot: 'overlay', order: 90, component: RhythmPreload, visible: () => (gamesState()?.rhythmSongs.length ?? 0) > 0 },
    // The drum and the sounds of Pirate Race (and the host trying them)
    { slot: 'overlay', order: 91, component: PirateAudio },
    // The Perfect Circle prize stands in for the music's "Up next" while it lasts
    { slot: 'side', order: 15, component: ScratchCard, spot: 'next', visible: () => gamesState()?.perk?.kind === 'scratch' },
  ],
  tvTakeover: GamesTv,
  guestTakeover: GamesPlay,
  showGuestTakeover: showGamesScreen,
  guest: { title: 'Games', tagline: 'Duel someone for money, or start a game for everyone', icon: Gamepad2, order: 65, component: GamesGuest, priceKey: 'games.duel' },
  admin: { title: 'Games', icon: Gamepad2, order: 10, group: 'play', keywords: 'duel bet stake rhythm rain guitar songs beatsaver coin flip timer simon reflex circle bluff room pirate race ship row drum team', component: GamesAdmin, prices: GamesPrices },
} satisfies ClientModule;
