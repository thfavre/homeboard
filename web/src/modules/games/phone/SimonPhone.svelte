<script lang="ts">
  import { Eye } from '@lucide/svelte';
  import type { GameColor, MatchState, SimonView } from '$shared/games.ts';
  import { hb, rpc } from '$lib/client.svelte.ts';
  import ColorPad from '../ColorPad.svelte';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as SimonView);
  const me = $derived(hb.me?.id ?? '');
  const alive = $derived(v.alive.includes(me));

  // Taps of this round, shown right away (the server confirms each one)
  let taps = $state(0);
  let wrong = $state(false);
  let lit = $state<GameColor | null>(null);
  let round = 0;
  $effect(() => {
    if (v.round !== round) {
      round = v.round;
      taps = 0;
      wrong = false;
    }
  });
  const done = $derived(v.done.includes(me) || taps >= v.length);

  async function pick(c: GameColor) {
    if (wrong || done || v.step !== 'input') return;
    taps += 1;
    lit = c;
    setTimeout(() => lit === c && (lit = null), 180);
    const r = await rpc<{ ok: boolean }>('games', 'play', { color: c }).catch(() => ({ ok: true }));
    if (!r.ok) wrong = true;
  }
</script>

<div class="simon">
  <div class="top">
    <span class="eyebrow">Round {v.round}</span>
    <span class="dots">
      {#each Array(v.length) as _, i}<span class="dot" class:on={i < taps}></span>{/each}
    </span>
  </div>

  {#if !alive || wrong}
    <div class="msg">
      <h1>{wrong ? 'Wrong color' : 'You are out'}</h1>
      <p class="dim">{v.alive.length} still in. Watch the others on the TV.</p>
    </div>
  {:else if v.step === 'show'}
    <div class="msg">
      <span class="eye"><Eye size={44} /></span>
      <h1>Watch the lights</h1>
      <p class="dim">{v.length} colors this round.</p>
    </div>
  {:else if v.step === 'between'}
    <div class="msg">
      <h1>Nice</h1>
      <p class="dim">Next round, one more color.</p>
    </div>
  {:else if done}
    <div class="msg">
      <h1>Done</h1>
      <p class="dim">Waiting for the others.</p>
    </div>
  {:else}
    <p class="dim center">Your turn: repeat the {v.length} colors.</p>
    <ColorPad onpick={pick} {lit} />
  {/if}
</div>

<style>
  .simon {
    display: grid;
    gap: 1.2rem;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .dots {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    justify-content: flex-end;
    max-width: 70%;
  }
  .dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: var(--surface-3);
  }
  .dot.on {
    background: var(--accent);
  }
  .msg {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 0.7rem;
    padding: 3rem 0;
  }
  .eye {
    color: var(--accent);
    animation: hb-pulse 1.2s ease-in-out infinite;
  }
  h1 {
    font-size: 2rem;
  }
  .center {
    text-align: center;
  }
</style>
