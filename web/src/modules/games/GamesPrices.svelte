<script lang="ts">
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import AmountInput from '$lib/ui/AmountInput.svelte';
  import { gamesState } from './store.svelte.ts';

  /** The games' betting limit, shown with their prices at the top of the admin page */
  const s = $derived(gamesState());
</script>

{#if s && hb.core?.economyEnabled}
  <div class="line">
    <div class="text">
      <span>Highest bet</span>
      <span class="faint small">For a duel or a room game, 0 = no limit</span>
    </div>
    <AmountInput value={s.settings.maxStake} oncommit={(v) => attempt(() => rpc('games', 'setSettings', { maxStake: v }))} />
  </div>
{/if}

<style>
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .text {
    display: grid;
  }
  .small {
    font-size: 0.78rem;
  }
</style>
