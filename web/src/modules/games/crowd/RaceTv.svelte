<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { Trophy } from '@lucide/svelte';
  import type { CrowdRaceView } from '$shared/crowd.ts';
  import type { MatchState } from '$shared/games.ts';
  import { Now } from '../store.svelte.ts';
  import CrowdField from './CrowdField.svelte';
  import Bullets from './Bullets.svelte';
  import KillFeed from './KillFeed.svelte';
  import { crowdSound } from './sound.ts';

  /** Crowd Race on the TV: the street, the players with their shots and rounds won, the count down and the result of each round */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CrowdRaceView | null);
  const now = new Now(100);
  const player = (id: string | null) => m.players.find((p) => p.id === id);


  /** Count down: a beep on each of the last 3 seconds */
  const count = $derived(v && v.step === 'ready' ? Math.max(1, Math.ceil((v.goAt - now.value) / 1000)) : null);
  let beeped = -1;
  $effect(() => {
    if (count !== null && count >= 1 && count <= 3 && count !== beeped) {
      beeped = count;
      crowdSound('beep', v?.soundVolume ?? 0);
    }
  });
  // The end of a round: a fanfare for a winner, a sad tune otherwise
  let endedRound = 0;
  $effect(() => {
    if (!v || v.step !== 'reveal' || endedRound === v.round) return;
    endedRound = v.round;
    crowdSound(v.winner ? 'win' : 'round', v.soundVolume);
  });

  const verdict = $derived.by(() => {
    if (!v || v.step !== 'reveal') return null;
    const w = player(v.winner);
    switch (v.why) {
      case 'crossed':
        return { big: `${w?.name} wins the round!`, small: 'First across the line', color: w?.color };
      case 'npc':
        return { big: 'A passer-by won', small: 'Nobody gets the round' };
      case 'none':
        return { big: 'Nobody left', small: 'Everyone was shot' };
      default:
        return { big: 'Time up', small: 'Nobody made it' };
    }
  });
</script>

{#if v}
  <div class="race">
    <div class="bar">
      <span class="round mono">Round {v.round}<span class="faint">/{v.rounds}</span></span>
      <div class="players">
        {#each m.players as p (p.id)}
          {@const out = !v.alive.includes(p.id)}
          <span class="player" class:out style:--c={p.color}>
            <span class="dot"></span>
            <strong class="truncate">{p.name}</strong>
            <Bullets left={v.shots[p.id] ?? 0} />
            {#if v.points[p.id]}<span class="points"><Trophy size="1rem" />{v.points[p.id]}</span>{/if}
          </span>
        {/each}
      </div>
    </div>

    <div class="arena">
      <CrowdField
        kind="race"
        round={v.round}
        looks={v.looks ?? []}
        players={m.players}
        soundVolume={v.soundVolume}
        readyAt={v.readyAt}
        reloadMs={v.reloadMs}
        reveal={v.reveal ?? null}
        winner={v.winner}
        startX={v.startX}
        finishX={v.finishX}
      />
      <KillFeed kills={v.kills} players={m.players} />

      {#if v.step === 'ready'}
        <div class="banner" transition:fade>
          {#if count !== null && count <= 3}
            {#key count}<span class="count mono" in:scale={{ start: 1.8, duration: 300 }}>{count}</span>{/key}
          {:else}
            <span class="big">Round {v.round}</span>
            <span class="small">Press WALK and find who you are</span>
          {/if}
        </div>
      {:else if v.step === 'race' && now.value - v.goAt < 1200}
        <div class="banner" out:fade><span class="count go" in:scale={{ start: 2 }}>GO!</span></div>
      {:else if verdict}
        <div class="banner result" in:fly={{ y: 30 }} style:--c={verdict.color ?? 'var(--text)'}>
          <span class="big">{verdict.big}</span>
          <span class="small">{verdict.small}{v.round < v.rounds ? ' · next round soon' : ''}</span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .race {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 0.9rem;
    min-height: 0;
    height: 100%;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    min-width: 0;
  }
  .round {
    font-size: 1.6rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
  }
  .player {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 16rem;
    padding: 0.3rem 0.8rem;
    border-radius: 999px;
    background: var(--surface);
    border: 2px solid color-mix(in srgb, var(--c) 70%, transparent);
    font-size: 1.1rem;
    line-height: 1.2;
    white-space: nowrap;
    transition: opacity 0.3s ease;
  }
  .player.out {
    opacity: 0.4;
  }
  .player.out strong {
    text-decoration: line-through;
  }
  .dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: var(--c);
    flex: none;
  }
  .points {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    color: var(--coin);
    font-weight: 700;
  }
  .arena {
    position: relative;
    min-height: 0;
  }
  .banner {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.6rem;
    pointer-events: none;
    text-align: center;
  }
  .big {
    font-family: var(--font-display);
    font-size: 4.2rem;
    font-weight: 800;
    color: #fff;
    text-shadow:
      0 0.3rem 1.6rem rgb(0 0 0 / 0.8),
      0 0 0.2rem rgb(0 0 0 / 0.9);
  }
  .result .big {
    color: var(--c);
  }
  .small {
    padding: 0.4rem 1.2rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 1.5rem;
    font-weight: 600;
  }
  .count {
    grid-area: 1 / 1;
    font-size: 11rem;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 0.4rem 2rem rgb(0 0 0 / 0.8);
  }
  .go {
    font-family: var(--font-display);
    color: #7dff9c;
  }
</style>
