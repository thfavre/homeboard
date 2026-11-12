<script lang="ts">
  import { onMount } from 'svelte';
  import { Coins } from '@lucide/svelte';
  import { hb, onEvent, rpc } from '$lib/client.svelte.ts';
  import type { WardrobeMine, WorldState } from '$shared/world.ts';

  /**
   * The town money in the page header while the avatar panel is open, next to the party coins.
   * It flashes when it changes (a purchase, a host gift).
   */

  const shop = $derived((hb.modules.world as WorldState | undefined)?.shop);

  let balance = $state<number | null>(null);
  let pill = $state<HTMLSpanElement>();

  function set(next: number) {
    const before = balance;
    balance = next;
    if (before === null || before === next || !pill) return;
    const c = getComputedStyle(document.documentElement).getPropertyValue(next < before ? '--danger' : '--success').trim() || 'currentColor';
    pill.animate([{}, { borderColor: c, transform: 'scale(1.06)' }, {}], { duration: 650, easing: 'ease-out' });
  }

  // Fetched on every connection: the panel may open offline, and changes made while away were missed
  $effect(() => {
    if (!hb.connected) return;
    rpc<WardrobeMine>('world', 'wardrobe')
      .then((w) => set(w.balance))
      .catch(() => {});
  });

  onMount(() => onEvent<{ balance: number }>('world', 'wallet', (w) => set(w.balance)));
</script>

{#if shop && balance !== null}
  <span class="pill" bind:this={pill} title="{shop.currencyName}, the town money: you earn them by being in the town">
    <Coins size={17} />
    <span class="num">{balance}</span>
  </span>
{/if}

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--border-strong, var(--border));
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--accent);
    font-weight: 600;
    white-space: nowrap;
  }
  .num {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
</style>
