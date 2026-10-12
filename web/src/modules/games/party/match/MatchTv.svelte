<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import { hueSatCss, type MatchView, type PartyView } from '$shared/party.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import TvPrompt from '../ui/TvPrompt.svelte';
  import TvPlayers from '../ui/TvPlayers.svelte';

  /** Color Match on the TV: what to do, then whose guess the light shows, with both colors and the score */
  let { m, v }: { m: MatchState; v: PartyView } = $props();
  const mini = $derived(v.mini as MatchView);
  const nameOf = (id: string) => m.players.find((p) => p.id === id);
  const status = (id: string) => (mini.phase === 'input' && mini.done.includes(id) ? { done: true } : null);
</script>

<div class="stage">
  <div class="main">
    {#if mini.phase === 'show'}
      <TvPrompt {m} title="Remember this color" sub="Look at the light strip" />
    {:else if mini.phase === 'input'}
      <TvPrompt {m} title="Make it on your phone" sub="Turn the wheel to the same color" eye={false} />
    {:else if mini.phase === 'reveal' && mini.target && mini.order}
      {@const shown = mini.order[mini.showing ?? -1]}
      {@const p = shown ? nameOf(shown) : undefined}
      {@const guess = p ? mini.guesses?.[p.id] : null}
      {#if p && guess}
        {#key p.id}
          <div class="col" in:fly={{ y: 40, duration: 500 }}>
            <span class="kicker">On the light, at the top</span>
            <Avatar name={p.name} color={p.color} id={p.id} size="8rem" />
            <h1>{p.name}</h1>
            <div class="pair">
              <div class="labeled"><span class="swatch" style:background={hueSatCss(mini.target)}></span><span class="dim">The color (bottom)</span></div>
              <div class="labeled"><span class="swatch" style:background={hueSatCss(guess)}></span><span class="dim">{p.name} (top)</span></div>
            </div>
            <span class="score mono">{(mini.scores?.[p.id] ?? 0).toFixed(1)} %</span>
          </div>
        {/key}
      {:else}
        <div class="col">
          <span class="kicker">{(mini.showing ?? -1) < 0 ? 'The color, at the bottom of the light' : 'Every guess'}</span>
          <span class="swatch hero" style:background={hueSatCss(mini.target)}></span>
          {#if (mini.showing ?? -1) >= mini.order.length}
            <div class="all">
              {#each [...mini.order].reverse() as id (id)}
                {@const q = nameOf(id)}
                {@const g = mini.guesses?.[id]}
                {#if q && g}<span class="one"><span class="dot" style:background={hueSatCss(g)}></span>{q.name} <strong class="mono">{(mini.scores?.[id] ?? 0).toFixed(1)} %</strong></span>{/if}
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
  <TvPlayers players={m.players} {status} />
</div>

<style>
  .stage {
    min-height: 0;
    height: 100%;
    display: grid;
    grid-template-columns: 1fr 22rem;
    gap: 2.5rem;
    align-items: center;
  }
  .main {
    display: grid;
    justify-items: center;
  }
  .col {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
  }
  .kicker {
    font-family: var(--font-display);
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  h1 {
    font-size: 3.4rem;
    line-height: 1.05;
  }
  .pair {
    display: flex;
    gap: 2rem;
  }
  .labeled {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    font-size: 1.1rem;
  }
  .swatch {
    width: 11rem;
    height: 7rem;
    border-radius: 1.4rem;
    box-shadow: 0 0 0 1px var(--border-strong);
  }
  .swatch.hero {
    width: 22rem;
    height: 12rem;
    border-radius: 2rem;
  }
  .score {
    font-size: 3.4rem;
    font-weight: 700;
  }
  .all {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.7rem 1.6rem;
    font-size: 1.4rem;
  }
  .one {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .dot {
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
  }
</style>
