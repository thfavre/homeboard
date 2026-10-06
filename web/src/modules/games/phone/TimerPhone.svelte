<script lang="ts">
  import { Hand } from '@lucide/svelte';
  import type { MatchState, TimerView } from '$shared/games.ts';
  import { hb, rpc, attempt, serverNow } from '$lib/client.svelte.ts';
  import { Now } from '../store.svelte.ts';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as TimerView);
  const now = new Now(50);
  let mine = $state<number | null>(null);

  const before = $derived(v.startAt !== null && now.value < v.startAt);
  const stopped = $derived(mine !== null || v.stopped.includes(hb.me?.id ?? ''));

  async function stop() {
    if (stopped || !v.startAt) return;
    const elapsed = serverNow() - v.startAt;
    if (elapsed < 0) return;
    mine = elapsed;
    const ok = await attempt(() => rpc('games', 'play', { elapsed }));
    if (!ok) mine = null;
  }
</script>

<div class="timer">
  {#if before}
    <span class="eyebrow">Get ready</span>
    <span class="count mono">{Math.ceil(((v.startAt ?? 0) - now.value) / 1000)}</span>
    <p class="dim">Tap STOP when you think 10.00 seconds have passed.</p>
  {:else if !stopped}
    <span class="eyebrow running">Counting in your head...</span>
    <button class="stop" onpointerdown={(e) => (e.preventDefault(), stop())}>
      <Hand size={44} />
      STOP
    </button>
  {:else}
    <span class="eyebrow">Stopped</span>
    <h1>Locked in</h1>
    <p class="dim">{v.stopped.length} of {m.players.length} stopped. The times show on the TV.</p>
  {/if}
</div>

<style>
  .timer {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
    padding: 1.5rem 0;
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
</style>
