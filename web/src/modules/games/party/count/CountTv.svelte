<script lang="ts">
  import { scale } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import { partyColor, type CountView, type PartyView } from '$shared/party.ts';
  import Ring from '../../../quiz/Ring.svelte';
  import TvPrompt from '../ui/TvPrompt.svelte';
  import TvPlayers from '../ui/TvPlayers.svelte';

  /** Color Count on the TV: what to do, the question with its answers, then the count and every pick */
  let { m, v }: { m: MatchState; v: PartyView } = $props();
  const mini = $derived(v.mini as CountView);

  function status(id: string) {
    if (mini.phase === 'reveal') {
      const pick = mini.picks?.[id] ?? null;
      return { text: pick === null ? '-' : String(pick), good: !!mini.ask && pick === mini.counts?.[mini.ask] };
    }
    return mini.phase === 'ask' && mini.answered.includes(id) ? { done: true } : null;
  }
</script>

<div class="stage">
  <div class="main">
    {#if mini.phase === 'show'}
      <TvPrompt {m} title="Look at the light" sub="Count the dots of each color">
        <div class="chips">
          {#each mini.colors as c (c)}<span class="chip" style:--c={partyColor(c)!.hex}>{partyColor(c)!.name}</span>{/each}
        </div>
      </TvPrompt>
    {:else if mini.phase === 'ask' && mini.ask}
      {@const c = partyColor(mini.ask)!}
      <div class="col" in:scale={{ start: 0.9 }}>
        <h1>How many <span style:color={c.hex}>{c.name.toLowerCase()}</span>?</h1>
        <div class="options">
          {#each mini.options ?? [] as n (n)}<span class="option mono" style:--c={c.hex}>{n}</span>{/each}
        </div>
        {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="8rem" />{/if}
      </div>
    {:else if mini.phase === 'reveal' && mini.ask && mini.counts}
      {@const c = partyColor(mini.ask)!}
      <div class="col">
        <span class="kicker">There were</span>
        <span class="answer mono" style:color={c.hex} in:scale={{ start: 0.4, duration: 600 }}>{mini.counts[mini.ask] ?? 0}</span>
        <h2>{c.name.toLowerCase()} dots</h2>
        <div class="counts">
          {#each mini.colors.filter((x) => x !== mini.ask) as x (x)}
            <span class="dim">{partyColor(x)!.name}: <strong class="mono">{mini.counts[x]}</strong></span>
          {/each}
        </div>
      </div>
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
    gap: 1.2rem;
  }
  h1 {
    font-size: 4.6rem;
    line-height: 1.05;
    letter-spacing: -0.03em;
  }
  h2 {
    font-size: 2.4rem;
  }
  .kicker {
    font-family: var(--font-display);
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .chips {
    display: flex;
    gap: 0.8rem;
  }
  .chip {
    font-size: 1.6rem;
    padding: 0.5rem 1.4rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 20%, transparent);
    color: var(--c);
    font-weight: 700;
  }
  .options {
    display: flex;
    gap: 1rem;
  }
  .option {
    display: grid;
    place-items: center;
    min-width: 7rem;
    padding: 1rem 1.4rem;
    border-radius: 1.4rem;
    background: var(--surface);
    border: 2px solid color-mix(in srgb, var(--c) 40%, var(--border));
    font-size: 2.6rem;
    font-weight: 700;
  }
  .answer {
    font-size: 12rem;
    font-weight: 700;
    line-height: 1;
  }
  .counts {
    display: flex;
    gap: 2rem;
    font-size: 1.5rem;
  }
</style>
