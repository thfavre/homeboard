<script lang="ts">
  import { formatAmount } from '$shared/money.ts';
  import Coin from './Coin.svelte';

  let { amount, sign = false, free = false }: { amount: number; sign?: boolean; free?: boolean } = $props();
</script>

<span class="money mono">
  {#if free && amount === 0}
    Free
  {:else}
    <Coin />{sign && amount > 0 ? '+' : ''}{formatAmount(amount)}
  {/if}
</span>

<style>
  .money {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    font-weight: 600;
    white-space: nowrap;
  }
</style>
