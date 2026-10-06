<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { CircleView, MatchState } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Ring from '../../quiz/Ring.svelte';

  /** During the game: who has drawn. After: every drawing with its score. */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CircleView);
  const drawings = $derived(v.drawings);
  const order = $derived(drawings ? [...m.players].sort((a, b) => (drawings[b.id]?.score ?? -1) - (drawings[a.id]?.score ?? -1)) : m.players);

  /** Center a drawing in a 100x100 box */
  function path(points: [number, number][]): string {
    if (points.length < 2) return '';
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.01);
    const k = 84 / span;
    return points.map(([x, y], i) => `${i ? 'L' : 'M'}${(50 + (x - cx) * k).toFixed(1)} ${(50 + (y - cy) * k).toFixed(1)}`).join(' ');
  }
</script>

{#if !drawings}
  <div class="drawing" in:fade>
    <h1>Draw a perfect circle</h1>
    <p class="dim lead">One stroke, on your phone.</p>
    {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="10rem" />{/if}
    <div class="players">
      {#each m.players as p (p.id)}
        <div class="p" class:done={v.done.includes(p.id)}>
          <Avatar name={p.name} color={p.color} id={p.id} size="4rem" />
          <span class="truncate">{p.name}</span>
          {#if v.done.includes(p.id)}<span class="pill success" in:scale>Done</span>{/if}
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div class="gallery" class:many={m.players.length > 4}>
    {#each order as p, i (p.id)}
      {@const d = drawings[p.id]}
      <div class="item card" class:first={i === 0 && (d?.score ?? 0) > 0} in:scale={{ delay: i * 250, start: 0.8 }}>
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" class="guide" />
          {#if d}<path d={path(d.points)} style:stroke={p.color} />{/if}
        </svg>
        <div class="who">
          <Avatar name={p.name} color={p.color} id={p.id} size="2.4rem" />
          <span class="truncate">{p.name}</span>
          <span class="mono score">{d ? `${d.score.toFixed(1)}%` : '-'}</span>
        </div>
        {#if d?.note}<span class="faint note">{d.note}</span>{/if}
      </div>
    {/each}
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
    opacity: 0.55;
  }
  .p.done {
    opacity: 1;
  }
  .gallery {
    height: 100%;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-content: center;
    gap: 1.5rem;
  }
  .item {
    width: 22rem;
    padding: 1.2rem;
    display: grid;
    gap: 0.8rem;
  }
  .many .item {
    width: 16rem;
  }
  .item.first {
    border-color: var(--coin);
    box-shadow: 0 0 3rem -1rem var(--coin);
  }
  svg {
    width: 100%;
    aspect-ratio: 1;
  }
  .guide {
    fill: none;
    stroke: var(--border-strong);
    stroke-width: 0.6;
    stroke-dasharray: 2 2;
  }
  path {
    fill: none;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 1.2rem;
    font-weight: 600;
  }
  .who .truncate {
    flex: 1;
  }
  .score {
    font-size: 1.6rem;
    font-weight: 700;
  }
  .note {
    font-size: 1rem;
  }
</style>
