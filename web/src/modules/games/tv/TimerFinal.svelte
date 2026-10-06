<script lang="ts">
  import { Crown } from '@lucide/svelte';
  import { fly, scale } from 'svelte/transition';
  import type { MatchState, TimerView } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';

  /** Final standings, revealed from last place up so the winner comes last */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as TimerView);
  const sec = (ms: number) => (ms / 1000).toFixed(2);
  const ranked = $derived([...m.players].sort((a, b) => (v.totals[a.id] ?? 0) - (v.totals[b.id] ?? 0)));
  const winners = $derived(m.result?.winners ?? []);
  const STEP = 900;
</script>

<div class="final">
  <h1 in:fly={{ y: -20 }}>Final standings</h1>
  <ol style:--rounds={v.history.length}>
    {#each ranked as p, i (p.id)}
      {@const won = winners.includes(p.id)}
      <!-- Last place first: the winner appears at the very end -->
      <li class="card" class:won in:fly={{ x: -60, duration: 500, delay: (ranked.length - 1 - i) * STEP }}>
        <span class="rank mono">{i + 1}</span>
        <Avatar name={p.name} color={p.color} id={p.id} size="3.4rem" />
        <span class="name truncate">{p.name}</span>
        <span class="chips">
          {#each v.history as r}
            {@const t = r.times[p.id]}
            {#if t === null || t === undefined}
              <span class="chip bad">miss</span>
            {:else}
              {@const d = t - r.target}
              <span class="chip mono" class:good={Math.abs(d) < 500} class:bad={Math.abs(d) >= 2000}>{d >= 0 ? '+' : '-'}{sec(Math.abs(d))}</span>
            {/if}
          {/each}
        </span>
        <span class="total mono">{sec(v.totals[p.id] ?? 0)} s</span>
        <span class="prize">
          {#if won}
            <span class="crown" in:scale={{ start: 0.2, duration: 600, delay: (ranked.length - i) * STEP }}><Crown size="2rem" /></span>
            {#if hb.core?.economyEnabled && (m.result?.payouts[p.id] ?? 0) > 0}<span class="gain"><Money amount={m.result!.payouts[p.id]} sign /></span>{/if}
          {/if}
        </span>
      </li>
    {/each}
  </ol>
  <p class="dim legend">Gap to the target in each round. The smallest total wins.</p>
</div>

<style>
  .final {
    height: 100%;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 2rem;
  }
  h1 {
    font-size: 4.5rem;
    letter-spacing: -0.04em;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.8rem;
    width: min(80rem, 100%);
  }
  li {
    display: grid;
    grid-template-columns: 2.5rem auto 1fr auto 9rem 10rem;
    align-items: center;
    gap: 1.2rem;
    padding: 0.8rem 1.4rem 0.8rem 1rem;
    font-size: 1.4rem;
  }
  li.won {
    border-color: var(--coin);
    box-shadow: 0 0 3.5rem -1rem var(--coin);
  }
  .rank {
    text-align: center;
    font-weight: 700;
    color: var(--text-faint);
  }
  .won .rank {
    color: var(--coin);
  }
  .name {
    font-weight: 600;
  }
  .chips {
    display: flex;
    gap: 0.5rem;
  }
  .chip {
    min-width: 5.2rem;
    text-align: center;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    font-size: 1.05rem;
    font-weight: 700;
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
  }
  .chip.good {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }
  .chip.bad {
    background: color-mix(in srgb, var(--danger) 15%, transparent);
    color: var(--danger);
  }
  .total {
    text-align: right;
    font-size: 2rem;
    font-weight: 700;
  }
  .prize {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .crown {
    color: var(--coin);
    display: grid;
  }
  .gain {
    color: var(--success);
  }
  .legend {
    font-size: 1.2rem;
  }
</style>
