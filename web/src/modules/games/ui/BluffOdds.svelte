<script lang="ts">
  import { HandCoins, Handshake } from '@lucide/svelte';
  import { bluffGain, type BluffChoice, type BluffDeal } from '$shared/games.ts';
  import Money from '$lib/ui/Money.svelte';

  /**
   * What each of the four outcomes of Bluff pays, as a 2 x 2 table: your choice down the side, theirs
   * across the top. Each cell shows what you get, and what they get under it. `pick` lights up a row.
   */
  let { deal, other, economy, pick = null }: { deal: BluffDeal; other: string; economy: boolean; pick?: BluffChoice | null } = $props();
  const CHOICES: BluffChoice[] = ['share', 'steal'];
  const tone = (mine: BluffChoice, theirs: BluffChoice) => (mine === 'share' && theirs === 'share' ? 'both' : mine === 'steal' && theirs === 'share' ? 'win' : mine === 'share' ? 'lose' : 'none');
  const words = $derived({ both: 'Both win', win: 'You win', lose: `${other} wins`, none: 'Nobody' });
</script>

<div class="odds" class:picked={!!pick}>
  <span class="corner"></span>
  {#each CHOICES as theirs, c (theirs)}
    <span class="head" style:animation-delay="{c * 60}ms"><span class="truncate">{other}</span> <span class="verb">{theirs === 'share' ? 'shares' : 'steals'}</span></span>
  {/each}
  {#each CHOICES as mine, r (mine)}
    <span class="side {mine}" class:on={pick === mine}>
      {#if mine === 'share'}<Handshake size={16} />{:else}<HandCoins size={16} />{/if}
      You {mine}
    </span>
    {#each CHOICES as theirs, c (theirs)}
      {@const t = tone(mine, theirs)}
      {@const you = bluffGain(deal, mine, theirs)}
      {@const them = bluffGain(deal, theirs, mine)}
      <span class="cell {t}" class:on={pick === mine} style:animation-delay="{120 + (r * 2 + c) * 70}ms">
        {#if economy}
          <strong class="mono">{#if you > 0}<Money amount={you} sign />{:else}0{/if}</strong>
          <span class="them truncate">{other} {#if them > 0}<Money amount={them} sign />{:else}0{/if}</span>
        {:else}
          <strong>{words[t]}</strong>
        {/if}
      </span>
    {/each}
  {/each}
</div>

<style>
  .odds {
    display: grid;
    grid-template-columns: auto 1fr 1fr;
    gap: 0.35rem;
    width: 100%;
    font-size: 0.85rem;
  }
  .corner {
    min-width: 0;
  }
  .head {
    display: grid;
    justify-items: center;
    min-width: 0;
    padding-bottom: 0.1rem;
    color: var(--text-dim);
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
    animation: hb-fade-up 0.35s ease both;
  }
  .verb {
    font-weight: 700;
    color: var(--text);
  }
  .side {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding-right: 0.3rem;
    font-weight: 700;
    white-space: nowrap;
    color: var(--success);
    transition: opacity 0.2s ease;
  }
  .side.steal {
    color: var(--danger);
  }
  .cell {
    --c: var(--text-faint);
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.1rem;
    min-width: 0;
    min-height: 3.6rem;
    padding: 0.45rem 0.4rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--c) 10%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
    text-align: center;
    animation: hb-fade-up 0.35s ease both;
    transition:
      opacity 0.2s ease,
      transform 0.2s ease,
      border-color 0.2s ease;
  }
  .cell strong {
    font-size: 1.05rem;
    color: var(--c);
  }
  .cell.both {
    --c: var(--success);
  }
  .cell.win {
    --c: var(--coin);
  }
  .cell.lose {
    --c: var(--danger);
  }
  .them {
    max-width: 100%;
    color: var(--text-faint);
    font-size: 0.7rem;
  }
  /* A choice made: its row stands out, the other one steps back */
  .picked .side:not(.on),
  .picked .cell:not(.on) {
    opacity: 0.4;
  }
  .picked .cell.on {
    border-color: var(--c);
  }
</style>
