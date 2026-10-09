<script lang="ts">
  import { Coins, Crown, Hand } from '@lucide/svelte';
  import { scale } from 'svelte/transition';
  import type { CoinView } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { Now, gamesState } from './store.svelte.ts';
  import { coinDraw } from './ui/coinDraw.ts';

  /**
   * Coin Flip is played on the two phones: the TV keeps its screen and shows this small card above
   * the main widget, until the throw (CoinTossTv) takes the middle of the screen.
   */
  const m = $derived(gamesState()?.match ?? null);
  const v = $derived(m?.phase === 'play' || m?.phase === 'result' ? (m.view as CoinView | null) : null);
  const now = new Now(50);
  const draw = $derived(v && m ? coinDraw(v, m.players, now.value) : null);
  const economy = $derived(!!hb.core?.economyEnabled);
  const nameOf = (id: string) => m?.players.find((p) => p.id === id)?.name ?? '';
  const status = $derived.by(() => {
    if (!m) return '';
    if (m.phase === 'intro') return 'Reading the rules on their phones';
    if (m.phase === 'result') return m.result?.headline ?? 'Over';
    if (!v) return '';
    if (v.step === 'draw') return draw?.settled ? `${nameOf(v.flipper)} throws!` : 'Who throws the coin?';
    if (v.step === 'toss') return `${nameOf(v.flipper)}, swipe the coin up to the TV!`;
    if (!v.outcome) return 'In the air...';
    return `It landed on ${nameOf(v.outcome === 'heads' ? v.heads : v.tails)}'s face!`;
  });
</script>

{#if m}
  <div class="card coin" in:scale={{ start: 0.95 }}>
    <div class="title">
      <span class="icon"><Coins size="1.1rem" /></span>
      <span class="what">
        <span class="eyebrow">Coin Flip duel{#if economy && m.pot > 0}<span>{' · pot '}</span><Money amount={m.pot} />{/if}</span>
        {#key status}<strong class="truncate" in:scale={{ start: 0.9, duration: 250 }}>{status}</strong>{/key}
      </span>
    </div>
    <div class="duo">
      {#each m.players as p, i (p.id)}
        {@const lit = v?.step === 'draw' ? draw?.highlighted === p.id : v?.step === 'toss' && v.flipper === p.id}
        {@const won = m.result?.winners.includes(p.id)}
        <span class="player" class:lit class:won>
          <span class="face">
            <Avatar name={p.name} color={p.color} id={p.id} size="2rem" />
            {#if won}<span class="badge"><Crown size="0.7rem" /></span>{:else if v?.step === 'toss' && v.flipper === p.id}<span class="badge"><Hand size="0.7rem" /></span>{/if}
          </span>
          <span class="name truncate">{p.name}</span>
        </span>
        {#if i === 0}<span class="vs">VS</span>{/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  .coin {
    width: 50%;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
    padding: 0.45rem 1rem;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    flex: none;
    border-radius: 0.6rem;
    background: linear-gradient(135deg, #ffc861, #ff8a3a);
    color: #fff;
  }
  .what {
    display: grid;
    min-width: 0;
  }
  .what .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.65rem;
  }
  .what strong {
    font-size: 1rem;
  }
  .duo {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.7rem;
    min-width: 0;
  }
  .player {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    opacity: 0.75;
    transition: opacity 0.12s ease;
  }
  .player.lit,
  .player.won {
    opacity: 1;
  }
  .face {
    position: relative;
    flex: none;
    display: grid;
    border-radius: 50%;
    transition: box-shadow 0.12s ease;
  }
  .lit .face,
  .won .face {
    box-shadow: 0 0 0 0.18rem var(--coin);
  }
  .badge {
    position: absolute;
    right: -0.3rem;
    bottom: -0.3rem;
    display: grid;
    place-items: center;
    width: 1.05rem;
    height: 1.05rem;
    border-radius: 50%;
    background: var(--coin);
    color: #fff;
    box-shadow: 0 0 0 0.15rem var(--surface);
  }
  .name {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .vs {
    font-family: var(--font-display);
    font-weight: 700;
    font-style: italic;
    color: var(--text-faint);
  }
</style>
