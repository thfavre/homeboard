<script lang="ts">
  import { flip } from 'svelte/animate';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';

  const TITLES = { balance: 'Richest guests', spent: 'Big spenders', earned: 'Top earners' } as const;
  const mode = $derived(hb.core?.leaderboardMode ?? 'balance');
  const key = $derived(mode === 'off' ? 'balance' : mode);
  const rows = $derived((hb.core?.leaderboard ?? []).slice(0, 10));
  // Smaller rows once the list gets long, so the sidebar keeps room for the join card
  const compact = $derived(rows.length > 6);
</script>

{#if hb.core?.economyEnabled && mode !== 'off' && rows.length}
  <div class="card board" class:compact>
    <span class="eyebrow">{TITLES[key]}</span>
    <ol>
      {#each rows as g, i (g.id)}
        <li animate:flip={{ duration: 500 }} class:first={i === 0}>
          <span class="rank mono">{i + 1}</span>
          <Avatar name={g.name} color={g.color} id={g.id} size={compact ? '1.6rem' : '2rem'} />
          <span class="name truncate">{g.name}</span>
          <Money amount={g[key]} />
        </li>
      {/each}
    </ol>
  </div>
{/if}

<style>
  .board {
    padding: 1.1rem 1.2rem;
    display: grid;
    align-content: start;
    gap: 0.7rem;
    /* Can shrink (cutting the last rows) rather than push the join card off the screen */
    min-height: 0;
    overflow: hidden;
  }
  .compact {
    padding: 0.9rem 1.2rem;
    gap: 0.5rem;
  }
  .compact ol {
    gap: 0.28rem;
  }
  .compact li {
    font-size: 0.92rem;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.45rem;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    font-size: 1.02rem;
  }
  .rank {
    width: 1.1rem;
    color: var(--text-faint);
    font-weight: 700;
    text-align: center;
  }
  .first .rank {
    color: var(--coin);
  }
  .name {
    flex: 1;
    font-weight: 500;
  }
</style>
