<script lang="ts" module>
  export interface StandingRow {
    id: string;
    /** One chip per round (`won`: this player won that round) */
    chips: { text: string; tone: 'good' | 'mid' | 'bad'; won?: boolean }[];
    total: string;
    /** Smaller line under the total */
    sub?: string;
  }
</script>

<script lang="ts">
  import { Crown } from '@lucide/svelte';
  import { fly, scale } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';

  /**
   * Final standings of a game played in rounds (best first), revealed from last place up
   * so the winner comes last. Each game gives its rows: one chip per round and a total.
   */
  let { m, rows, legend }: { m: MatchState; rows: StandingRow[]; legend: string } = $props();
  const winners = $derived(m.result?.winners ?? []);
  const playerOf = (id: string) => m.players.find((p) => p.id === id);
  const STEP = 900;
</script>

<div class="final">
  <h1 in:fly={{ y: -20 }}>Final standings</h1>
  <ol>
    {#each rows as row, i (row.id)}
      {@const p = playerOf(row.id)}
      {@const won = winners.includes(row.id)}
      {#if p}
        <!-- Last place first: the winner appears at the very end -->
        <li class="card" class:won in:fly={{ x: -60, duration: 500, delay: (rows.length - 1 - i) * STEP }}>
          <span class="rank mono">{i + 1}</span>
          <Avatar name={p.name} color={p.color} id={p.id} size="3.4rem" />
          <span class="name truncate">{p.name}</span>
          <span class="chips">
            {#each row.chips as chip}
              <span class="chip mono {chip.tone}" class:won={chip.won}>{#if chip.won}<Crown size="0.95rem" />{/if}{chip.text}</span>
            {/each}
          </span>
          <span class="total">
            <span class="mono">{row.total}</span>
            {#if row.sub}<small class="dim">{row.sub}</small>{/if}
          </span>
          <span class="prize">
            {#if won}
              <span class="crown" in:scale={{ start: 0.2, duration: 600, delay: (rows.length - i) * STEP }}><Crown size="2rem" /></span>
              {#if hb.core?.economyEnabled && (m.result?.payouts[p.id] ?? 0) > 0}<span class="gain"><Money amount={m.result!.payouts[p.id]} sign /></span>{/if}
            {/if}
          </span>
        </li>
      {/if}
    {/each}
  </ol>
  <p class="dim legend">{legend}</p>
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
  }
  .chip.mid {
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
    display: grid;
    justify-items: end;
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .total small {
    font-size: 1rem;
    font-weight: 600;
  }
  .chip.won {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    box-shadow: inset 0 0 0 2px currentColor;
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
