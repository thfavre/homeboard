<script lang="ts">
  import type { GameInfo } from '$shared/games.ts';
  import { GAME_ICONS } from '../store.svelte.ts';

  /** The game's poster on the TV: colors, big icon, name, and the 3 steps as cards */
  let { game, eyebrow }: { game: GameInfo; eyebrow?: string } = $props();
  const Icon = $derived(GAME_ICONS[game.id]);
</script>

<section class="poster" style:--g1={game.colors[0]} style:--g2={game.colors[1]}>
  <header class="hero">
    <span class="ring r1"></span>
    <span class="ring r2"></span>
    <span class="badge"><Icon size="4.4rem" strokeWidth={2.1} /></span>
    <div class="titles">
      {#if eyebrow}<span class="kicker">{eyebrow}</span>{/if}
      <h1>{game.name}</h1>
      <p>{game.tagline}</p>
    </div>
  </header>
  <ol class="steps">
    {#each game.steps as step, i}
      <li style:animation-delay="{250 + i * 180}ms">
        <span class="num mono">{i + 1}</span>
        <span class="text">{step}</span>
      </li>
    {/each}
  </ol>
</section>

<style>
  .poster {
    display: grid;
    gap: 1.4rem;
  }
  .hero {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2.2rem;
    padding: 2rem 2.6rem;
    border-radius: 2.2rem;
    background: linear-gradient(120deg, var(--g1), var(--g2));
    color: #fff;
    overflow: hidden;
    isolation: isolate;
    box-shadow: 0 2.5rem 6rem -3rem var(--g1);
  }
  .ring {
    position: absolute;
    z-index: -1;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }
  .r1 {
    width: 22rem;
    height: 22rem;
    right: -6rem;
    top: -9rem;
  }
  .r2 {
    width: 34rem;
    height: 34rem;
    right: -12rem;
    top: -15rem;
    border-color: rgba(255, 255, 255, 0.1);
  }
  .badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 8rem;
    height: 8rem;
    border-radius: 2.2rem;
    background: rgba(255, 255, 255, 0.2);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.35),
      0 1.2rem 2.6rem -1.2rem rgba(0, 0, 0, 0.45);
  }
  .titles {
    display: grid;
    gap: 0.3rem;
    text-shadow: 0 2px 14px rgba(0, 0, 0, 0.18);
  }
  .kicker {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    opacity: 0.85;
  }
  h1 {
    font-size: 4.6rem;
    line-height: 1;
    letter-spacing: -0.04em;
  }
  .titles p {
    font-size: 1.7rem;
    opacity: 0.92;
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.2rem;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 1.4rem 1.6rem;
    border-radius: 1.6rem;
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--g1) 30%, var(--border));
    animation: hb-fade-up 0.5s ease both;
  }
  .num {
    flex: none;
    display: grid;
    place-items: center;
    width: 3.4rem;
    height: 3.4rem;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--g1), var(--g2));
    color: #fff;
    font-size: 1.7rem;
    font-weight: 700;
  }
  .text {
    font-size: 1.55rem;
    font-weight: 600;
    line-height: 1.25;
  }
</style>
