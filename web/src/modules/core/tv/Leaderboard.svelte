<script lang="ts">
  import { flip } from 'svelte/animate';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';

  const TITLES = { balance: 'Richest', spent: 'Big spenders', earned: 'Top earners' } as const;
  const mode = $derived(hb.core?.leaderboardMode ?? 'balance');
  const key = $derived(mode === 'off' ? 'balance' : mode);
  const rows = $derived((hb.core?.leaderboard ?? []).slice(0, 10));
  // Smaller rows once the list gets long, so the sidebar keeps room for the join card
  const compact = $derived(rows.length > 6);
  /** The podium is bigger: 1st, 2nd and 3rd, then normal size */
  const PODIUM = [1.5, 1.3, 1.15];
  const scaleOf = (i: number) => PODIUM[i] ?? 1;
  const avatarSize = (i: number) => `${(compact ? 1.6 : 2) * scaleOf(i)}rem`;
</script>

{#if hb.core?.economyEnabled && mode !== 'off' && rows.length}
  <div class="card board" class:compact>
    <span class="eyebrow">{TITLES[key]}</span>
    <ol>
      {#each rows as g, i (g.id)}
        <li animate:flip={{ duration: 500 }} class="place-{i + 1}" style:--k={scaleOf(i)}>
          <span class="rank mono">{i + 1}</span>
          <Avatar name={g.name} color={g.color} id={g.id} size={avatarSize(i)} />
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
    font-size: calc(0.92rem * var(--k, 1));
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
    font-size: calc(1.02rem * var(--k, 1));
  }
  .rank {
    width: 1.1rem;
    color: var(--text-faint);
    font-weight: 700;
    text-align: center;
  }
  .place-1 .rank {
    color: var(--coin);
  }
  .place-2 .rank {
    color: #c9d1e0;
  }
  .place-3 .rank {
    color: #d99a6c;
  }
  .name {
    flex: 1;
    font-weight: 500;
  }
  .place-1 .name,
  .place-2 .name,
  .place-3 .name {
    font-weight: 700;
  }
  /* A bit of air between the podium and the rest */
  .place-3 {
    padding-bottom: 0.3rem;
  }
</style>
