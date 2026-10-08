<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { WledState } from '$shared/wled.ts';
  import { hb, showNames } from '$lib/client.svelte.ts';
  import Countdown from './Countdown.svelte';
  import { effectSwatch } from './swatch.ts';

  const current = $derived((hb.modules.wled as WledState | undefined)?.current ?? null);
</script>

{#if current}
  {#key current.id}
    <div class="wled-chip card" transition:fly={{ x: 40, duration: 300 }}>
      <span class="swatch" style:background={effectSwatch(current.effect)}></span>
      <span><strong>{current.effect.name}</strong>{#if showNames('effectNames')}<span class="dim">{` by ${current.guest.name}`}</span>{/if}</span>
      <span class="time dim"><Countdown until={current.until} /></span>
    </div>
  {/key}
{/if}

<style>
  .wled-chip {
    position: fixed;
    /* Bottom right like the soundboard card, which stacks above it while both show */
    right: 2rem;
    bottom: 1.6rem;
    z-index: 45;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 1rem 0.45rem 0.5rem;
    border-radius: 999px;
    font-size: 1rem;
  }
  .swatch {
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    animation: spin 4s linear infinite;
  }
  .time {
    font-size: 0.9rem;
  }
  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
</style>
