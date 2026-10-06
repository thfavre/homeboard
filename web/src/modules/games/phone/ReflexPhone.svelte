<script lang="ts">
  import { GAME_COLORS, type GameColor, type MatchState, type ReflexView } from '$shared/games.ts';
  import { hb, rpc } from '$lib/client.svelte.ts';
  import ColorPad from '../ColorPad.svelte';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as ReflexView);
  const me = $derived(hb.me?.id ?? '');
  const out = $derived(v.out.includes(me));

  // What happened to my tap this round
  let mine = $state<{ round: number; result: string; ms?: number } | null>(null);
  const result = $derived(mine?.round === v.round ? mine : null);
  const nameOf = (id: string | null) => m.players.find((p) => p.id === id)?.name ?? '';
  const colorName = (c: GameColor | null) => GAME_COLORS.find((x) => x.id === c)?.name ?? '';

  async function pick(c: GameColor) {
    if (out || (result && result.result !== 'ignored')) return;
    const round = v.round;
    const r = await rpc<{ result: string; ms?: number }>('games', 'play', { color: c }).catch(() => null);
    if (r) mine = { round, ...r };
  }
</script>

<div class="reflex">
  <div class="top">
    <span class="eyebrow">Round {v.round} of {v.rounds}</span>
    <span class="mono score">{v.scores[me] ?? 0} pts</span>
  </div>

  <div class="status" class:go={v.step === 'go' && !out}>
    {#if v.step === 'won'}
      {#if v.roundWinner === me}
        <h1>You got it</h1>
        <p class="dim">{v.reactionMs} ms</p>
      {:else if v.roundWinner}
        <h1>{nameOf(v.roundWinner)} was faster</h1>
        <p class="dim">It was {colorName(v.color)}, {v.reactionMs} ms</p>
      {:else}
        <h1>Nobody got it</h1>
        <p class="dim">It was {colorName(v.color)}</p>
      {/if}
    {:else if result?.result === 'early'}
      <h1>Too early</h1>
      <p class="dim">Wait for the color next round.</p>
    {:else if result?.result === 'wrong' || out}
      <h1>Wrong color</h1>
      <p class="dim">Out for this round.</p>
    {:else if v.step === 'go'}
      <h1>NOW</h1>
    {:else if v.step === 'wait'}
      <h1>Wait for it...</h1>
      <p class="dim">Watch the lights.</p>
    {:else}
      <h1>Get ready</h1>
      <p class="dim">Watch the lights.</p>
    {/if}
  </div>

  <ColorPad onpick={pick} disabled={out || v.step === 'won'} />
</div>

<style>
  .reflex {
    display: grid;
    gap: 1.2rem;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .score {
    font-weight: 700;
    font-size: 1.1rem;
  }
  .status {
    display: grid;
    justify-items: center;
    align-content: center;
    text-align: center;
    gap: 0.3rem;
    min-height: 6.5rem;
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .status.go {
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    border-color: var(--accent);
  }
  h1 {
    font-size: 1.8rem;
  }
</style>
