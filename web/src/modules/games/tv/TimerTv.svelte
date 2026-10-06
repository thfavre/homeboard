<script lang="ts">
  import { scale } from 'svelte/transition';
  import type { MatchState, TimerView } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { Now } from '../store.svelte.ts';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as TimerView);
  const now = new Now(50);
  const before = $derived(v.startAt !== null && now.value < v.startAt);
  // Never show the clock running: GO for a second, then question marks
  const elapsed = $derived(v.startAt ? Math.max(0, now.value - v.startAt) : 0);
</script>

<div class="timer">
  <span class="eyebrow">Target</span>
  <span class="target mono">{(v.target / 1000).toFixed(2)} s</span>
  <div class="clock mono" class:hidden={!before && elapsed > 1000}>
    {#if before}
      {Math.ceil(((v.startAt ?? 0) - now.value) / 1000)}
    {:else if elapsed <= 1000}
      GO
    {:else}
      ??.??
    {/if}
  </div>
  <p class="dim lead">{before ? 'Get ready...' : `Stop at ${v.target / 1000} seconds. The clock is hidden.`}</p>

  <div class="players">
    {#each m.players as p (p.id)}
      {@const done = v.stopped.includes(p.id)}
      <div class="p" class:done>
        <Avatar name={p.name} color={p.color} id={p.id} size="4rem" />
        <span class="truncate">{p.name}</span>
        {#if done}<span class="pill success" in:scale>Stopped</span>{/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .timer {
    height: 100%;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 1.5rem;
    text-align: center;
  }
  .eyebrow {
    font-size: 1.2rem;
  }
  .target {
    font-size: 4.5rem;
    font-weight: 700;
    color: var(--accent);
  }
  .clock {
    font-size: 13rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.04em;
  }
  .clock.hidden {
    color: var(--text-faint);
    animation: hb-pulse 1.6s ease-in-out infinite;
  }
  .lead {
    font-size: 1.8rem;
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1.5rem;
    margin-top: 2rem;
    max-width: 90rem;
  }
  .p {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    width: 9rem;
    font-size: 1.2rem;
    font-weight: 600;
    opacity: 0.55;
    transition: opacity 0.3s ease;
  }
  .p.done {
    opacity: 1;
  }
  .pill {
    font-size: 0.95rem;
  }
</style>
