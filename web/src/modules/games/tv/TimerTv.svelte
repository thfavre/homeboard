<script lang="ts">
  import type { MatchState, TimerView } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { Now } from '../store.svelte.ts';
  import TimerReveal from './TimerReveal.svelte';
  import TimerFinal from './TimerFinal.svelte';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as TimerView);
  const now = new Now(50);
  const before = $derived(now.value < v.startAt);
  const sec = (ms: number) => (ms / 1000).toFixed(2);
</script>

{#if m.phase === 'result'}
  <TimerFinal {m} />
{:else if v.step === 'reveal'}
  {#key v.round}
    <TimerReveal r={v.history[v.history.length - 1]} players={m.players} totals={v.totals} round={v.round} rounds={v.rounds} />
  {/key}
{:else}
  <div class="timer">
    <span class="eyebrow">Round {v.round} of {v.rounds}</span>
    <span class="label">Target</span>
    <span class="target mono">{sec(v.target)} s</span>
    <div class="clock mono" class:hidden={!before}>
      {before ? Math.ceil((v.startAt - now.value) / 1000) : '??.??'}
    </div>
    <p class="dim lead">{before ? 'Get ready...' : 'The clock is running, hidden. Stop on your phone.'}</p>
    <!-- Nobody's status is shown: seeing others stop would help -->
    <div class="players">
      {#each m.players as p (p.id)}
        <div class="p">
          <Avatar name={p.name} color={p.color} id={p.id} size="3.6rem" />
          <span class="truncate">{p.name}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .timer {
    height: 100%;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 1.2rem;
    text-align: center;
  }
  .eyebrow {
    font-size: 1.2rem;
  }
  .label {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-top: 1rem;
  }
  .target {
    font-size: 4.5rem;
    font-weight: 700;
    color: var(--accent);
    line-height: 1;
  }
  .clock {
    font-size: 12rem;
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
    margin-top: 1.5rem;
    max-width: 90rem;
  }
  .p {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    width: 8rem;
    font-size: 1.15rem;
    font-weight: 600;
  }
</style>
