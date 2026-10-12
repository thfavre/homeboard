<script lang="ts">
  import type { Component } from 'svelte';
  import type { GameInfo } from '$shared/games.ts';
  import { GAME_ICONS } from '../store.svelte.ts';

  /** A game's poster: its colors, big icon, name, and how to play in 3 steps */
  /** `game`: a game, or a Light Party mini game with its `icon` */
  let {
    game,
    eyebrow,
    steps = true,
    icon,
  }: { game: Pick<GameInfo, 'name' | 'tagline' | 'steps' | 'colors'> & { id: string }; eyebrow?: string; steps?: boolean; icon?: Component<any> } = $props();
  const Icon = $derived(icon ?? GAME_ICONS[game.id as GameInfo['id']]);
</script>

<article class="card-game" style:--g1={game.colors[0]} style:--g2={game.colors[1]}>
  <header class="hero">
    <span class="ring r1"></span>
    <span class="ring r2"></span>
    <span class="badge"><Icon size={34} strokeWidth={2.2} /></span>
    <div class="titles">
      {#if eyebrow}<span class="kicker">{eyebrow}</span>{/if}
      <h2>{game.name}</h2>
      <p>{game.tagline}</p>
    </div>
  </header>
  {#if steps}
    <ol class="steps">
      {#each game.steps as step, i}
        <li style:animation-delay="{120 + i * 90}ms"><span class="num mono">{i + 1}</span><span>{step}</span></li>
      {/each}
    </ol>
  {/if}
</article>

<style>
  .card-game {
    width: 100%;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--g1) 35%, var(--border));
    box-shadow: 0 24px 50px -30px var(--g1);
    text-align: left;
  }
  .hero {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.3rem 1.2rem;
    background: linear-gradient(135deg, var(--g1), var(--g2));
    color: #fff;
    overflow: hidden;
    isolation: isolate;
  }
  /* Soft rings in the corner, like ripples */
  .ring {
    position: absolute;
    right: -3rem;
    top: -3rem;
    z-index: -1;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.22);
  }
  .r1 {
    width: 9rem;
    height: 9rem;
  }
  .r2 {
    width: 14rem;
    height: 14rem;
    right: -5.5rem;
    top: -5.5rem;
    border-color: rgba(255, 255, 255, 0.12);
  }
  .badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 4.2rem;
    height: 4.2rem;
    border-radius: 1.3rem;
    background: rgba(255, 255, 255, 0.2);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.35),
      0 10px 24px -10px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
  }
  .titles {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.18);
  }
  .kicker {
    font-family: var(--font-display);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.85;
  }
  h2 {
    font-size: 1.55rem;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }
  .titles p {
    font-size: 0.88rem;
    opacity: 0.92;
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0.9rem 1rem 1rem;
    display: grid;
    gap: 0.55rem;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.92rem;
    line-height: 1.3;
    animation: hb-fade-up 0.35s ease both;
  }
  .num {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.7rem;
    height: 1.7rem;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--g1), var(--g2));
    color: #fff;
    font-size: 0.85rem;
    font-weight: 700;
  }
</style>
