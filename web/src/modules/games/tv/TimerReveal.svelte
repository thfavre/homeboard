<script lang="ts">
  import { Crown } from '@lucide/svelte';
  import { scale, fade } from 'svelte/transition';
  import type { GamePlayer, TimerRound } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  /**
   * One round revealed with suspense: a clock needle sweeps the time axis and each
   * player's head drops onto their lane when the needle reaches the moment they stopped.
   */
  let {
    r,
    players,
    totals,
    wins,
    round,
    rounds,
  }: { r: TimerRound; players: GamePlayer[]; totals: Record<string, number>; wins: Record<string, number>; round: number; rounds: number } = $props();

  const SWEEP_MS = 5500;
  const sec = (ms: number) => (ms / 1000).toFixed(2);

  // Axis zoomed around the target and the times, at least 4 seconds wide
  const range = $derived.by(() => {
    const ts = Object.values(r.times).filter((t): t is number => t !== null);
    let lo = Math.min(r.target, ...ts) - 1200;
    let hi = Math.max(r.target, ...ts) + 1200;
    if (hi - lo < 4000) {
      const mid = (lo + hi) / 2;
      lo = mid - 2000;
      hi = mid + 2000;
    }
    if (lo < 0) {
      hi -= lo;
      lo = 0;
    }
    return { lo, hi };
  });
  const x = (t: number) => ((t - range.lo) / (range.hi - range.lo)) * 100;
  const ticks = $derived.by(() => {
    const span = range.hi - range.lo;
    const step = span > 16000 ? 4000 : span > 8000 ? 2000 : 1000;
    const out: number[] = [];
    for (let t = Math.ceil(range.lo / step) * step; t <= range.hi; t += step) out.push(t);
    return out;
  });

  // The needle position, from the left edge to the right edge in SWEEP_MS
  let progress = $state(0);
  $effect(() => {
    const start = performance.now();
    let frame = requestAnimationFrame(function loop(now) {
      progress = Math.min(1, (now - start) / SWEEP_MS);
      if (progress < 1) frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  });
  const needle = $derived(range.lo + progress * (range.hi - range.lo));
  const done = $derived(progress >= 1);

  const gapOf = (id: string) => {
    const t = r.times[id];
    return t === null || t === undefined ? null : Math.abs(t - r.target);
  };
  const closest = $derived.by(() => {
    const gaps = players.map((p) => gapOf(p.id)).filter((g): g is number => g !== null);
    if (!gaps.length) return [];
    const best = Math.min(...gaps);
    return players.filter((p) => gapOf(p.id) === best).map((p) => p.id);
  });
</script>

<div class="reveal">
  <header>
    <span class="eyebrow">Round {round} of {rounds}</span>
    <h1>Target <span class="mono accent">{sec(r.target)} s</span></h1>
  </header>

  <div class="board" style:--lanes={players.length}>
    <!-- Axis, ticks, target line and needle sit over every lane -->
    <div class="track-area">
      {#each ticks as t}
        <span class="tick" style:left="{x(t)}%"><span class="mono">{t / 1000}s</span></span>
      {/each}
      <span class="target" class:hit={done} style:left="{x(r.target)}%"><span class="mono">{sec(r.target)}</span></span>
      <span class="total-head">Rounds won</span>
      {#if !done}
        <span class="needle" style:left="{progress * 100}%" out:fade><span class="clock mono">{sec(needle)}</span></span>
      {/if}
    </div>

    {#each players as p (p.id)}
      {@const t = r.times[p.id]}
      {@const landed = t !== null && t !== undefined && needle >= t}
      {@const win = done && closest.includes(p.id)}
      <div class="lane" class:win>
        <div class="who">
          <span class="name truncate">{p.name}</span>
        </div>
        <div class="track">
          {#if t !== null && t !== undefined && landed}
            {@const d = t - r.target}
            <div class="pin" style:left="{x(t)}%" in:scale={{ start: 2.2, duration: 450, opacity: 0 }}>
              {#if win}<span class="crown" in:scale={{ delay: 200 }}><Crown size="1.6rem" /></span>{/if}
              <Avatar name={p.name} color={p.color} id={p.id} size="3.4rem" />
              <span class="time mono">{sec(t)}<small class:good={Math.abs(d) < 500}>{d >= 0 ? '+' : '-'}{sec(Math.abs(d))}</small></span>
            </div>
          {:else if (t === null || t === undefined) && done}
            <span class="miss" in:fade>No stop (+10 s)</span>
          {/if}
        </div>
        <div class="total">
          {#if done}
            {@const w = wins[p.id] ?? 0}
            <span class="wins" class:up={r.winners.includes(p.id)} in:fade>
              <span class="mono">{w} {w === 1 ? 'win' : 'wins'}</span>
              <small class="mono">gap {sec(totals[p.id] ?? 0)} s</small>
            </span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
  <p class="foot dim">{done ? (round < rounds ? 'Next round in a moment' : 'Final results coming up') : 'Who got closest?'}</p>
</div>

<style>
  .reveal {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 1.5rem;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 1.5rem;
  }
  .eyebrow {
    font-size: 1.2rem;
  }
  h1 {
    font-size: 3rem;
    letter-spacing: -0.03em;
  }
  .accent {
    color: var(--accent);
  }
  .board {
    position: relative;
    display: grid;
    grid-template-rows: repeat(var(--lanes), minmax(0, 1fr));
    /* Columns: names | track | totals. The overlay uses the same left and right gutters. */
    --names: 12rem;
    --totals: 9rem;
    padding: 3rem 0 2.5rem;
    border-radius: 2rem;
    background: var(--surface);
    border: 1px solid var(--border);
    min-height: 0;
  }
  .track-area {
    position: absolute;
    top: 1rem;
    bottom: 0.6rem;
    left: calc(var(--names) + 2rem);
    right: calc(var(--totals) + 2rem);
    pointer-events: none;
  }
  .tick {
    position: absolute;
    top: 2rem;
    bottom: 1.8rem;
    border-left: 1px dashed var(--border-strong);
  }
  .tick span {
    position: absolute;
    bottom: -1.8rem;
    translate: -50% 0;
    font-size: 1rem;
    color: var(--text-faint);
  }
  .target {
    position: absolute;
    top: 0;
    bottom: 1.8rem;
    width: 0.3rem;
    translate: -50% 0;
    border-radius: 999px;
    background: var(--accent);
    box-shadow: 0 0 1.5rem var(--accent);
    opacity: 0.7;
    transition:
      opacity 0.4s ease,
      box-shadow 0.4s ease;
  }
  .target.hit {
    opacity: 1;
    box-shadow: 0 0 3rem 0.4rem var(--accent);
  }
  .target span {
    position: absolute;
    top: -0.4rem;
    left: 50%;
    translate: -50% -100%;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-contrast);
    font-weight: 700;
    font-size: 1.05rem;
    white-space: nowrap;
  }
  .total-head {
    position: absolute;
    top: 0.2rem;
    right: calc(-1 * (var(--totals) + 2rem));
    width: var(--totals);
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .needle {
    position: absolute;
    top: 0;
    bottom: 1.8rem;
    width: 2px;
    background: var(--text);
    box-shadow: 0 0 1rem var(--text);
  }
  .clock {
    position: absolute;
    bottom: -1.9rem;
    left: 50%;
    translate: -50% 0;
    padding: 0.1rem 0.6rem;
    border-radius: 0.5rem;
    background: var(--text);
    color: var(--bg);
    font-weight: 700;
    font-size: 1.1rem;
  }
  .lane {
    display: grid;
    grid-template-columns: var(--names) 1fr var(--totals);
    align-items: center;
    gap: 2rem;
    padding: 0 1rem;
    min-height: 0;
    border-radius: 1.2rem;
    transition: background 0.4s ease;
  }
  .lane.win {
    background: color-mix(in srgb, var(--coin) 10%, transparent);
  }
  .who {
    font-size: 1.35rem;
    font-weight: 600;
    text-align: right;
    min-width: 0;
  }
  .track {
    position: relative;
    height: 100%;
    border-bottom: 1px solid var(--border);
  }
  .pin {
    position: absolute;
    top: 50%;
    translate: -50% -50%;
    display: grid;
    justify-items: center;
    z-index: 1;
  }
  .pin :global(.avatar) {
    box-shadow: 0 0.4rem 1.5rem -0.3rem rgba(0, 0, 0, 0.6);
  }
  .crown {
    position: absolute;
    top: -1.7rem;
    color: var(--coin);
    filter: drop-shadow(0 0 0.6rem var(--coin));
  }
  .time {
    position: absolute;
    left: calc(100% + 0.6rem);
    top: 50%;
    translate: 0 -50%;
    display: grid;
    font-weight: 700;
    font-size: 1.15rem;
    white-space: nowrap;
    line-height: 1.15;
  }
  .time small {
    font-size: 0.95rem;
    color: var(--warning);
  }
  .time small.good {
    color: var(--success);
  }
  .miss {
    position: absolute;
    right: 0;
    top: 50%;
    translate: 0 -50%;
    color: var(--danger);
    font-weight: 600;
    font-size: 1.1rem;
  }
  .wins {
    display: grid;
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.15;
  }
  .wins small {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-faint);
  }
  .wins.up > .mono {
    color: var(--coin);
  }
  .foot {
    text-align: center;
    font-size: 1.4rem;
  }
</style>
