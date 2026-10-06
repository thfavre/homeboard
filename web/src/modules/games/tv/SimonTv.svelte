<script lang="ts">
  import { Lightbulb } from '@lucide/svelte';
  import { GAME_COLORS, type MatchState, type SimonView } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Ring from '../../quiz/Ring.svelte';
  import { gamesState } from '../store.svelte.ts';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as SimonView);
  const s = $derived(gamesState());
  const showColors = $derived(!!s && (s.settings.tvColors || !s.lights));
</script>

<div class="simon">
  <div class="left">
    <span class="eyebrow">Round {v.round}</span>
    <h1>{v.step === 'show' ? 'Watch the lights' : v.step === 'input' ? 'Repeat it on your phone' : 'Get ready'}</h1>
    <p class="dim lead">{v.length} colors</p>
    {#if v.step === 'input' && m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="8rem" />{/if}
  </div>

  <div class="disc" class:off={!showColors}>
    {#if showColors}
      {#each GAME_COLORS as c (c.id)}
        <span class="q" class:on={v.flash === c.id} style:--c={c.hex}></span>
      {/each}
    {:else}
      <span class="lamp" class:on={!!v.flash}><Lightbulb size="40%" /></span>
    {/if}
  </div>

  <div class="players">
    {#each m.players as p (p.id)}
      {@const alive = v.alive.includes(p.id)}
      <div class="p" class:out={!alive}>
        <Avatar name={p.name} color={p.color} id={p.id} size="2.8rem" />
        <span class="name truncate">{p.name}</span>
        {#if !alive}
          <span class="pill danger">Out</span>
        {:else if v.done.includes(p.id)}
          <span class="pill success">Done</span>
        {:else if v.step === 'input'}
          <span class="mono prog">{v.progress[p.id] ?? 0}/{v.length}</span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .simon {
    height: 100%;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 3rem;
  }
  .left {
    display: grid;
    gap: 1rem;
    justify-items: start;
  }
  .eyebrow {
    font-size: 1.2rem;
  }
  h1 {
    font-size: 3.6rem;
    letter-spacing: -0.03em;
  }
  .lead {
    font-size: 1.6rem;
  }
  .disc {
    width: 36rem;
    aspect-ratio: 1;
    border-radius: 50%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.2rem;
    padding: 1.2rem;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    overflow: hidden;
  }
  .q {
    background: color-mix(in srgb, var(--c) 22%, #000);
    transition:
      background 0.08s ease,
      box-shadow 0.08s ease;
  }
  .q:nth-child(1) {
    border-radius: 100% 0 0 0;
  }
  .q:nth-child(2) {
    border-radius: 0 100% 0 0;
  }
  .q:nth-child(3) {
    border-radius: 0 0 0 100%;
  }
  .q:nth-child(4) {
    border-radius: 0 0 100% 0;
  }
  .q.on {
    background: var(--c);
    box-shadow: 0 0 6rem var(--c);
  }
  .disc.off {
    display: grid;
    place-items: center;
    grid-template-columns: 1fr;
  }
  .lamp {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: var(--text-faint);
    transition: color 0.1s ease;
  }
  .lamp.on {
    color: var(--warning);
  }
  .players {
    display: grid;
    gap: 0.7rem;
    align-content: center;
  }
  .p {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    font-size: 1.3rem;
    font-weight: 600;
    transition: opacity 0.3s ease;
  }
  .p.out {
    opacity: 0.4;
  }
  .name {
    flex: 1;
  }
  .prog {
    color: var(--text-dim);
  }
  .pill {
    font-size: 0.95rem;
  }
</style>
