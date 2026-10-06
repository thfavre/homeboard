<script lang="ts">
  import { flip } from 'svelte/animate';
  import { GAME_COLORS, type MatchState, type ReflexView } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { gamesState } from '../store.svelte.ts';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as ReflexView);
  const s = $derived(gamesState());
  const showColors = $derived(!!s && (s.settings.tvColors || !s.lights));
  const hex = $derived(GAME_COLORS.find((c) => c.id === v.color)?.hex ?? null);
  const lit = $derived(showColors && hex && (v.step === 'go' || v.step === 'won'));
  const winner = $derived(m.players.find((p) => p.id === v.roundWinner));
  const ranked = $derived([...m.players].sort((a, b) => (v.scores[b.id] ?? 0) - (v.scores[a.id] ?? 0)));
</script>

<div class="reflex">
  <div class="stage" class:lit style:--c={hex ?? 'transparent'}>
    <span class="eyebrow">Round {v.round} of {v.rounds}</span>
    {#if v.step === 'won'}
      {#if winner}
        <div class="winner">
          <Avatar name={winner.name} color={winner.color} id={winner.id} size="7rem" />
          <h1>{winner.name}</h1>
          <span class="mono ms">{v.reactionMs} ms</span>
        </div>
      {:else}
        <h1>Nobody got it</h1>
      {/if}
    {:else if v.step === 'go'}
      <h1 class="now">{showColors ? 'TAP' : 'TAP THE COLOR'}</h1>
    {:else if v.step === 'wait'}
      <h1 class="wait">Wait for it...</h1>
    {:else}
      <h1>Get ready</h1>
    {/if}
  </div>

  <ol class="scores">
    {#each ranked as p (p.id)}
      <li animate:flip={{ duration: 400 }} class:out={v.out.includes(p.id)}>
        <Avatar name={p.name} color={p.color} id={p.id} size="2.8rem" />
        <span class="name truncate">{p.name}</span>
        <span class="mono pts">{v.scores[p.id] ?? 0}</span>
      </li>
    {/each}
  </ol>
</div>

<style>
  .reflex {
    height: 100%;
    display: grid;
    grid-template-columns: 1fr 26rem;
    gap: 2.5rem;
  }
  .stage {
    position: relative;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 2rem;
    border-radius: 2.5rem;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    text-align: center;
    transition:
      background 0.05s linear,
      box-shadow 0.05s linear;
  }
  .stage.lit {
    background: var(--c);
    box-shadow: 0 0 10rem -2rem var(--c);
    color: #fff;
    text-shadow: 0 0.2rem 1rem rgba(0, 0, 0, 0.35);
  }
  .eyebrow {
    position: absolute;
    top: 2rem;
    font-size: 1.2rem;
  }
  .lit .eyebrow {
    color: rgba(255, 255, 255, 0.8);
  }
  h1 {
    font-size: 6rem;
    letter-spacing: -0.03em;
  }
  .wait {
    color: var(--text-dim);
    animation: hb-pulse 1.2s ease-in-out infinite;
  }
  .now {
    font-size: 9rem;
  }
  .winner {
    display: grid;
    justify-items: center;
    gap: 1rem;
  }
  .ms {
    font-size: 2.5rem;
    font-weight: 700;
  }
  .scores {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.7rem;
    align-content: center;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.6rem 1.2rem 0.6rem 0.6rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 1.35rem;
    font-weight: 600;
    transition: opacity 0.2s ease;
  }
  li.out {
    opacity: 0.4;
  }
  .name {
    flex: 1;
  }
  .pts {
    font-size: 1.8rem;
    font-weight: 700;
  }
</style>
