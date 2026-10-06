<script lang="ts">
  import { Hand } from '@lucide/svelte';
  import { scale } from 'svelte/transition';
  import type { MatchState, TimerView } from '$shared/games.ts';
  import { hb, rpc, serverNow, toast } from '$lib/client.svelte.ts';
  import { Now } from '../store.svelte.ts';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as TimerView);
  const me = $derived(hb.me?.id ?? '');
  const now = new Now(50);
  /** Round this phone stopped in (the server never says who stopped, so it is kept here) */
  let stoppedRound = $state(0);

  const before = $derived(now.value < v.startAt);
  const stopped = $derived(stoppedRound === v.round);
  const last = $derived(v.step === 'reveal' ? v.history[v.history.length - 1] : null);
  const myTime = $derived(last ? last.times[me] : null);
  const sec = (ms: number) => (ms / 1000).toFixed(2);

  async function stop() {
    if (stopped || before) return;
    const elapsed = serverNow() - v.startAt;
    const round = v.round;
    stoppedRound = round;
    try {
      await rpc('games', 'play', { elapsed });
    } catch (err) {
      const msg = (err as Error).message;
      // After a reload this phone forgot it already stopped: keep the stopped screen
      if (!msg.includes('already')) {
        stoppedRound = 0;
        toast({ text: msg, kind: 'error' });
      }
    }
  }
</script>

<div class="timer">
  <span class="eyebrow">Round {v.round} of {v.rounds}</span>

  {#if v.step === 'reveal'}
    <div class="center" in:scale={{ start: 0.9 }}>
      <span class="label">Target {sec(last?.target ?? v.target)} s</span>
      {#if myTime !== null && myTime !== undefined && last}
        {@const d = myTime - last.target}
        <span class="big mono">{sec(myTime)} s</span>
        <span class="gap mono" class:good={Math.abs(d) < 500} class:bad={Math.abs(d) >= 2000}>{d >= 0 ? '+' : '-'}{sec(Math.abs(d))} s</span>
      {:else}
        <span class="big mono">No stop</span>
        <span class="gap bad">Counts as 10 s off</span>
      {/if}
      <p class="dim">Total so far: <strong class="mono">{sec(v.totals[me] ?? 0)} s</strong> off</p>
      <p class="faint small">{v.round < v.rounds ? 'Next round in a moment.' : 'Final results on the TV.'}</p>
    </div>
  {:else if before}
    <div class="center">
      <span class="label">Your target</span>
      <span class="target mono">{sec(v.target)} s</span>
      <span class="count mono">{Math.ceil((v.startAt - now.value) / 1000)}</span>
      <p class="dim">Tap STOP when you think {v.target / 1000} seconds have passed.</p>
    </div>
  {:else if !stopped}
    <div class="center">
      <span class="label running">Count to {v.target / 1000} in your head...</span>
      <button class="stop" onpointerdown={(e) => (e.preventDefault(), stop())}>
        <Hand size={44} />
        STOP
      </button>
    </div>
  {:else}
    <div class="center" in:scale={{ start: 0.9 }}>
      <h1>Locked in</h1>
      <p class="dim">Keep a straight face. The times are revealed on the TV once everyone is done.</p>
    </div>
  {/if}
</div>

<style>
  .timer {
    display: grid;
    justify-items: center;
    gap: 1rem;
    padding: 1rem 0;
  }
  .center {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 0.9rem;
  }
  .label {
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .target {
    font-size: 2.6rem;
    font-weight: 700;
    color: var(--accent);
  }
  .count {
    font-size: 6rem;
    font-weight: 700;
    line-height: 1;
  }
  .running {
    animation: hb-pulse 1.4s ease-in-out infinite;
  }
  .stop {
    width: min(17rem, 75vw);
    aspect-ratio: 1;
    border-radius: 50%;
    border: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.4rem;
    background: radial-gradient(circle at 35% 30%, #ff8a9a, var(--danger) 65%);
    color: #fff;
    font-family: var(--font-display);
    font-size: 2.4rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    box-shadow: 0 20px 50px -18px var(--danger);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.08s ease;
  }
  .stop:active {
    transform: scale(0.95);
  }
  h1 {
    font-size: 2rem;
  }
  .big {
    font-size: 3.2rem;
    font-weight: 700;
    line-height: 1;
  }
  .gap {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--warning);
  }
  .gap.good {
    color: var(--success);
  }
  .gap.bad {
    color: var(--danger);
  }
  .small {
    font-size: 0.82rem;
  }
</style>
