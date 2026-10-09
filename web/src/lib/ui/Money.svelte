<script lang="ts">
  import { formatAmount } from '$shared/money.ts';
  import Coin from './Coin.svelte';

  /** whole: a balance, shown without cents */
  let { amount, sign = false, free = false, whole = false }: { amount: number; sign?: boolean; free?: boolean; whole?: boolean } = $props();
</script>

<span class="money mono">
  {#if free && amount === 0}
    Free
  {:else}
    <Coin />{sign && amount > 0 ? '+' : ''}{formatAmount(amount, whole)}
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
