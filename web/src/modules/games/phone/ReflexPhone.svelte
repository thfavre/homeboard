<script lang="ts">
  import { GAME_COLORS, type GameColor, type MatchState, type ReflexView } from '$shared/games.ts';
  import { hb, rpc } from '$lib/client.svelte.ts';
  import ColorPad from '../ColorPad.svelte';

  /** One tap per round; right or wrong and the time stay secret until the reveal on the TV */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as ReflexView);
  const me = $derived(hb.me?.id ?? '');
  const tapped = $derived(v.tapped.includes(me));

  // What happened to my tap this round
  let mine = $state<{ round: number; result: string } | null>(null);
  const result = $derived(mine?.round === v.round ? mine.result : null);
  const colorName = (c: GameColor | null) => GAME_COLORS.find((x) => x.id === c)?.name ?? '';

  async function pick(c: GameColor) {
    if (tapped || v.step === 'done' || v.step === 'reveal') return;
    const round = v.round;
    const r = await rpc<{ result: string }>('games', 'play', { color: c }).catch(() => null);
    if (r) mine = { round, result: r.result };
  }
</script>

<div class="reflex">
  <div class="top">
    <span class="eyebrow">{v.step === 'reveal' ? 'All rounds played' : `Round ${v.round} of ${v.rounds}`}</span>
  </div>

  <div class="status" class:go={v.step === 'go' && !tapped}>
    {#if v.step === 'reveal'}
      <h1>Look at the TV</h1>
      <p class="dim">The times are coming...</p>
    {:else if result === 'early'}
      <h1>Too early</h1>
      <p class="dim">Wait for the color next round.</p>
    {:else if tapped}
      <h1>Locked in</h1>
      <p class="dim">{v.step === 'done' ? `It was ${colorName(v.color)}` : 'Your time stays secret until the end.'}</p>
    {:else if v.step === 'done'}
      <h1>Too slow</h1>
      <p class="dim">It was {colorName(v.color)}</p>
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

  <ColorPad onpick={pick} disabled={tapped || v.step === 'done' || v.step === 'reveal'} />
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
