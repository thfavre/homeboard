<script lang="ts">
  import { Trophy } from '@lucide/svelte';
  import { ARCADE_GAMES } from '$shared/arcade.ts';
  import ArcadeChallenge from './ArcadeChallenge.svelte';
  import { ARCADE_ICONS, arcadeState, gradient } from './store.svelte.ts';

  /** The Arcade's panel: the challenge (how many games, who, the bet), the games that can come up, the best scores */
  const s = $derived(arcadeState());
  const games = $derived(ARCADE_GAMES.filter((g) => s?.settings.games.includes(g.id)));
  const records = $derived(games.filter((g) => s?.records[g.id]).map((g) => ({ g, r: s!.records[g.id]! })));
</script>

<div class="arcade">
  <header class="hero">
    <div class="marquee" aria-hidden="true">
      {#each Array.from({ length: 14 }) as _, i (i)}<span class="bulb" style:animation-delay="{i * 0.12}s"></span>{/each}
    </div>
    <h1>Arcade</h1>
    <p class="dim">Challenge someone to quick games on your phones. The Arcade picks them at random, the same run for both of you, best score wins.</p>
  </header>

  <section class="card form">
    <ArcadeChallenge />
  </section>

  <section class="pool">
    <span class="eyebrow">The games that can come up</span>
    <div class="grid">
      {#each games as g (g.id)}
        {@const Icon = ARCADE_ICONS[g.id]}
        <div class="game" style:--g={gradient(g.colors)}>
          <span class="icon"><Icon size={24} strokeWidth={2.2} /></span>
          <strong>{g.name}</strong>
          <span class="tag">{g.tagline}</span>
        </div>
      {/each}
    </div>
  </section>

  {#if records.length}
    <section class="card records">
      <span class="eyebrow"><Trophy size={14} /> Best scores this party</span>
      {#each records as { g, r } (g.id)}
        {@const Icon = ARCADE_ICONS[g.id]}
        <div class="record">
          <span class="mini" style:--g={gradient(g.colors)}><Icon size={16} /></span>
          <span class="truncate">{g.name}</span>
          <span class="holder truncate" style:color={r.color}>{r.name}</span>
          <strong class="mono">{r.score}</strong>
        </div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .arcade {
    display: grid;
    gap: 1rem;
  }
  .hero {
    position: relative;
    display: grid;
    gap: 0.35rem;
    padding: 1.4rem 1.2rem 1.2rem;
    border-radius: var(--radius);
    background:
      radial-gradient(80% 120% at 100% 0%, rgba(255, 61, 139, 0.35), transparent 60%),
      radial-gradient(80% 120% at 0% 100%, rgba(61, 214, 255, 0.3), transparent 60%),
      #120a24;
    overflow: hidden;
    color: #fff;
  }
  .hero h1 {
    margin: 0.4rem 0 0;
    font-family: var(--font-display);
    font-size: 2.1rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-shadow:
      0 0 12px rgba(255, 79, 163, 0.9),
      0 0 30px rgba(255, 79, 163, 0.5);
  }
  .hero p {
    margin: 0;
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.9rem;
  }
  .marquee {
    display: flex;
    justify-content: space-between;
  }
  .bulb {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ffd23d;
    box-shadow: 0 0 8px #ffd23d;
    animation: blink 1.7s infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.25;
      box-shadow: none;
    }
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
  }
  .pool {
    display: grid;
    gap: 0.6rem;
  }
  .game {
    position: relative;
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 0.25rem;
    padding: 0.8rem;
    border: 0;
    border-radius: var(--radius);
    background: var(--g);
    color: #fff;
    text-align: left;
    box-shadow: 0 10px 24px -14px rgba(0, 0, 0, 0.8);
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }
  .game strong {
    font-family: var(--font-display);
    font-size: 1.05rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .tag {
    font-size: 0.78rem;
    line-height: 1.25;
    color: rgba(255, 255, 255, 0.88);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    margin-bottom: 0.15rem;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.2);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }
  .form {
    display: grid;
    padding: 1.1rem;
  }
  .records {
    display: grid;
    gap: 0.6rem;
    padding: 1.1rem;
  }
  .record {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.9rem;
  }
  .mini {
    display: grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 9px;
    background: var(--g);
    color: #fff;
  }
  .holder {
    max-width: 7rem;
    font-weight: 600;
  }
</style>
