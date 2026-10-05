<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { hb } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';

  const items = $derived(hb.activity.slice(0, 4));
</script>

<div class="ticker">
  {#each items as it (it.id)}
    <div class="item card" animate:flip={{ duration: 400 }} in:fly={{ x: -40, duration: 450 }}>
      {#if it.guest}<span class="dot" style:background={it.guest.color}></span>{/if}
      <span class="text truncate">{it.text}</span>
      {#if it.amount}<span class="amount"><Money amount={it.amount} /></span>{/if}
    </div>
  {:else}
    <div class="item card faint">Things happening at the party will show up here</div>
  {/each}
</div>

<style>
  .ticker {
    display: flex;
    gap: 0.7rem;
    overflow: hidden;
    mask-image: linear-gradient(90deg, #000 85%, transparent);
  }
  .item {
    flex: none;
    max-width: 28rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 1rem;
    border-radius: 999px;
    font-size: 0.95rem;
  }
  .dot {
    flex: none;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
  }
  .amount {
    color: var(--text-dim);
    font-size: 0.85rem;
  }
</style>
