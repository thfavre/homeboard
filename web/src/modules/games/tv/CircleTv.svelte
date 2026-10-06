<script lang="ts">
  import { Crown } from '@lucide/svelte';
  import { flip } from 'svelte/animate';
  import { fade, scale } from 'svelte/transition';
  import type { CircleView, MatchState } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Ring from '../../quiz/Ring.svelte';
  import CountUp from '../ui/CountUp.svelte';
  import { circlePath } from '../ui/circlePath.ts';
  import { Now } from '../store.svelte.ts';

  /**
   * While drawing: everyone's progress. Then the reveal: the circles appear one by one
   * (1st circle of everyone, then the 2nd...) with their score, totals counting up;
   * once all are out the rows sort themselves and the winner gets the crown.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CircleView);
  const now = new Now(100);

  // How many circles are out: everything once the game is over
  const shownSteps = $derived(
    m.phase === 'result' ? Infinity : v.revealAt && v.stepMs ? Math.max(0, Math.floor((now.value - v.revealAt) / v.stepMs) + 1) : 0,
  );
  const indexOf = (playerIndex: number, circle: number) => circle * m.players.length + playerIndex;
  const visible = (playerIndex: number, circle: number) => indexOf(playerIndex, circle) < shownSteps;
  const allOut = $derived(shownSteps >= m.players.length * v.count);

  const shownTotal = (id: string, playerIndex: number) =>
    (v.drawings?.[id] ?? []).reduce((s, d, c) => s + (visible(playerIndex, c) ? d.score : 0), 0);
  const rows = $derived.by(() => {
    const list = m.players.map((p, i) => ({ p, i, total: shownTotal(p.id, i) }));
    return allOut ? [...list].sort((a, b) => b.total - a.total) : list;
  });
  const winners = $derived(m.result?.winners ?? []);
  // Smaller drawings when there are many players
  const size = $derived(Math.min(9, 58 / Math.max(1, m.players.length) - 1.2));
</script>

{#if v.step === 'draw'}
  <div class="drawing" in:fade>
    <h1>Draw {v.count === 1 ? 'a perfect circle' : `${v.count} perfect circles`}</h1>
    <p class="dim lead">One stroke each, on your phone. The scores stay secret until the end.</p>
    {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="10rem" />{/if}
    <div class="players">
      {#each m.players as p (p.id)}
        {@const n = v.progress[p.id] ?? 0}
        <div class="p" class:done={n >= v.count}>
          <Avatar name={p.name} color={p.color} id={p.id} size="4rem" />
          <span class="truncate">{p.name}</span>
          <span class="dots">{#each Array(v.count) as _, i}<span class="dot" class:on={i < n}></span>{/each}</span>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div class="reveal" style:--size="{size}rem">
    <h1 class="title">{allOut ? (m.result ? m.result.headline : 'Final scores') : 'The reveal'}</h1>
    <ol class="board">
      {#each rows as row (row.p.id)}
        {@const won = allOut && winners.includes(row.p.id)}
        <li class="card" class:won animate:flip={{ duration: 700 }}>
          <span class="who">
            <Avatar name={row.p.name} color={row.p.color} id={row.p.id} size="3rem" />
            <span class="truncate">{row.p.name}</span>
          </span>
          <span class="slots">
            {#each Array(v.count) as _, c}
              {@const d = v.drawings?.[row.p.id]?.[c]}
              <span class="slot">
                {#if visible(row.i, c)}
                  <span class="shown" in:scale={{ start: 1.6, duration: 450, opacity: 0 }}>
                    <svg viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" class="guide" />
                      {#if d}<path d={circlePath(d.points)} style:stroke={row.p.color} />{/if}
                    </svg>
                    <span class="score mono" class:good={(d?.score ?? 0) >= 85} class:bad={!d || d.score < 70}>{d ? `${d.score.toFixed(1)}%` : 'none'}</span>
                  </span>
                {/if}
              </span>
            {/each}
          </span>
          <span class="total mono"><CountUp value={row.total} decimals={1} /></span>
          <span class="prize">
            {#if won}
              <span class="crown" in:scale={{ start: 0.2, duration: 600 }}><Crown size="2rem" /></span>
              {#if hb.core?.economyEnabled && (m.result?.payouts[row.p.id] ?? 0) > 0}<span class="gain"><Money amount={m.result!.payouts[row.p.id]} sign /></span>{/if}
            {/if}
          </span>
        </li>
      {/each}
    </ol>
  </div>
{/if}

<style>
  .drawing {
    height: 100%;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 1.5rem;
    text-align: center;
  }
  h1 {
    font-size: 4.5rem;
    letter-spacing: -0.03em;
  }
  .lead {
    font-size: 1.6rem;
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1.5rem;
    margin-top: 1rem;
  }
  .p {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    width: 9rem;
    font-size: 1.2rem;
    font-weight: 600;
    opacity: 0.7;
  }
  .p.done {
    opacity: 1;
  }
  .dots {
    display: flex;
    gap: 0.3rem;
  }
  .dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: var(--surface-3);
  }
  .dot.on {
    background: var(--success);
  }
  .reveal {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1.2rem;
    justify-items: center;
  }
  .title {
    font-size: 3.6rem;
  }
  .board {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    align-content: center;
    gap: 0.8rem;
    max-width: 100%;
  }
  .board li {
    display: grid;
    /* Sized to the drawings, so the totals sit right next to them */
    grid-template-columns: 14rem auto 9rem 8rem;
    align-items: center;
    gap: 1.5rem;
    padding: 0.6rem 1.4rem;
  }
  .board li.won {
    border-color: var(--coin);
    box-shadow: 0 0 3.5rem -1rem var(--coin);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    font-size: 1.4rem;
    font-weight: 600;
    min-width: 0;
  }
  .slots {
    display: flex;
    gap: 1rem;
  }
  .slot {
    position: relative;
    width: var(--size);
    height: var(--size);
    border-radius: 1rem;
    border: 1px dashed var(--border-strong);
  }
  .shown {
    position: absolute;
    inset: 0;
  }
  svg {
    width: 100%;
    height: 100%;
  }
  .guide {
    fill: none;
    stroke: var(--border-strong);
    stroke-width: 0.6;
    stroke-dasharray: 2 2;
  }
  path {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .score {
    position: absolute;
    left: 50%;
    bottom: -0.2rem;
    translate: -50% 0;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    background: var(--bg);
    font-size: 1rem;
    font-weight: 700;
    color: var(--warning);
    white-space: nowrap;
  }
  .score.good {
    color: var(--success);
  }
  .score.bad {
    color: var(--danger);
  }
  .total {
    text-align: right;
    font-size: 2.4rem;
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
    font-size: 1.3rem;
  }
</style>
