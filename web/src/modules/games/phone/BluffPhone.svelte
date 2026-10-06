<script lang="ts">
  import { HandCoins, Handshake } from '@lucide/svelte';
  import type { BluffView, MatchState } from '$shared/games.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as BluffView);
  const other = $derived(m.players.find((p) => p.id !== hb.me?.id));
  let choice = $state<'share' | 'steal' | null>(null);
  const bothChose = $derived(v.chosen.length >= m.players.length);

  async function pick(c: 'share' | 'steal') {
    if (bothChose) return;
    const before = choice;
    choice = c;
    if (!(await attempt(() => rpc('games', 'play', { choice: c })))) choice = before;
  }
</script>

<div class="bluff">
  <div class="pot">
    <span class="eyebrow">In the pot</span>
    <span class="big"><Money amount={m.pot} /></span>
  </div>
  <p class="dim center">
    {#if bothChose}
      Both chose. Look at the TV.
    {:else if other && v.chosen.includes(other.id)}
      {other.name} has chosen. Your move.
    {:else}
      Talk to {other?.name}, then choose in secret. You can change until you both chose.
    {/if}
  </p>
  <div class="choices">
    <button class="choice share" class:active={choice === 'share'} disabled={bothChose} onclick={() => pick('share')}>
      <Handshake size={40} />
      Share
    </button>
    <button class="choice steal" class:active={choice === 'steal'} disabled={bothChose} onclick={() => pick('steal')}>
      <HandCoins size={40} />
      Steal
    </button>
  </div>
  <p class="faint small center">Keep your screen hidden.</p>
</div>

<style>
  .bluff {
    display: grid;
    gap: 1.2rem;
  }
  .pot {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
  }
  .big {
    font-size: 2.2rem;
  }
  .center {
    text-align: center;
  }
  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }
  .choice {
    --c: var(--success);
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.6rem;
    min-height: 11rem;
    border-radius: var(--radius);
    border: 2px solid color-mix(in srgb, var(--c) 40%, transparent);
    background: color-mix(in srgb, var(--c) 10%, transparent);
    color: var(--c);
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
    transition:
      transform 0.1s ease,
      background 0.15s ease;
  }
  .steal {
    --c: var(--danger);
  }
  .choice.active {
    background: var(--c);
    border-color: var(--c);
    color: #fff;
    transform: scale(1.03);
  }
  .small {
    font-size: 0.8rem;
  }
</style>
