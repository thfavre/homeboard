<script lang="ts">
  import { fly, scale } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import { partyColor, type CountView, type PartyView } from '$shared/party.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Fuse from '../../ui/Fuse.svelte';
  import Locked from '../ui/Locked.svelte';
  import Watch from '../ui/Watch.svelte';

  /** Color Count on a phone: look at the dots, then pick how many of the color asked */
  let { m, v }: { m: MatchState; v: PartyView } = $props();
  const mini = $derived(v.mini as CountView);
  const me = $derived(hb.me?.id ?? '');
  let picked = $state<number | null>(null);

  async function pick(n: number) {
    if (picked !== null) return;
    picked = n;
    if (!(await attempt(() => rpc('games', 'play', { pick: n })))) picked = null;
  }
</script>

{#if mini.phase === 'show'}
  <Watch title="Look at the light">
    <p class="dim">Count the dots of each color:</p>
    <div class="chips">
      {#each mini.colors as c (c)}<span class="chip" style:--c={partyColor(c)!.hex}>{partyColor(c)!.name}</span>{/each}
    </div>
    {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Dots on for" />{/if}
  </Watch>
{:else if mini.phase === 'ask' && mini.ask && mini.options}
  {@const c = partyColor(mini.ask)!}
  <div class="col" in:fly={{ y: 20 }}>
    <h1>How many <span style:color={c.hex}>{c.name.toLowerCase()}</span>?</h1>
    <div class="options">
      {#each mini.options as n (n)}
        <button class="option mono" class:chosen={picked === n} class:faded={picked !== null && picked !== n} style:--c={c.hex} disabled={picked !== null} onclick={() => pick(n)}>{n}</button>
      {/each}
    </div>
    {#if picked !== null}<Locked text={`Locked in: ${picked}`} />{/if}
    {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Time left" />{/if}
  </div>
{:else if mini.phase === 'reveal' && mini.ask && mini.counts}
  {@const c = partyColor(mini.ask)!}
  {@const answer = mini.counts[mini.ask] ?? 0}
  {@const mine = mini.picks?.[me] ?? null}
  <div class="col reveal" in:scale={{ start: 0.9 }}>
    <span class="eyebrow">There were</span>
    <span class="answer mono" style:color={c.hex}>{answer}</span>
    <h2>{c.name.toLowerCase()} dots</h2>
    <p class="dim">{mine === null ? 'You did not answer' : mine === answer ? 'You got it right!' : `You said ${mine}`}</p>
  </div>
{/if}

<style>
  .col {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
    padding: 0.5rem 0;
  }
  .reveal {
    padding: 2rem 0;
  }
  h1 {
    font-size: 2.3rem;
    line-height: 1.1;
  }
  h2 {
    font-size: 1.4rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
  .chip {
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 20%, transparent);
    color: var(--c);
    font-weight: 700;
  }
  .options {
    display: grid;
    gap: 0.6rem;
    width: 100%;
  }
  .option {
    min-height: 3.6rem;
    border-radius: var(--radius);
    border: 2px solid color-mix(in srgb, var(--c) 40%, var(--border));
    background: var(--surface);
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--text);
    transition:
      opacity 0.2s ease,
      transform 0.1s ease;
  }
  .option:active:not(:disabled) {
    transform: scale(0.97);
  }
  .option.chosen {
    background: color-mix(in srgb, var(--c) 30%, var(--surface));
    border-color: var(--c);
  }
  .option.faded {
    opacity: 0.35;
  }
  .answer {
    font-size: 6rem;
    font-weight: 700;
    line-height: 1;
  }
</style>
