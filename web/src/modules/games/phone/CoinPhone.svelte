<script lang="ts">
  import type { CoinView, MatchState } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Coin from '../tv/CoinFace.svelte';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CoinView);
  const mySide = $derived(v.caller === hb.me?.id ? v.side : v.side === 'heads' ? 'tails' : 'heads');
</script>

<div class="coin">
  <span class="eyebrow">You have</span>
  <h1>{mySide === 'heads' ? 'Heads' : 'Tails'}</h1>
  <Coin outcome={v.outcome} size="10rem" />
  <p class="dim">{v.outcome ? (v.outcome === mySide ? 'It landed on your side!' : 'Not your side...') : 'The coin is in the air. Watch the TV.'}</p>
</div>

<style>
  .coin {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
    padding: 1.5rem 0;
  }
  h1 {
    font-size: 2.4rem;
  }
</style>
