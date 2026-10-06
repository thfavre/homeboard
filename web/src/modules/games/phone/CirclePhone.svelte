<script lang="ts">
  import { Check } from '@lucide/svelte';
  import { scale } from 'svelte/transition';
  import type { CircleView, MatchState } from '$shared/games.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Ring from '../../quiz/Ring.svelte';

  /** Draw every circle within the minute; each is sent when the finger is lifted. Scores come on the TV. */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CircleView);
  const me = $derived(hb.me?.id ?? '');
  const sent = $derived(v.progress[me] ?? 0);
  const done = $derived(sent >= v.count);

  let canvas = $state<HTMLCanvasElement | null>(null);
  let points: [number, number][] = [];
  let drawing = false;
  let hint = $state('');
  let busy = $state(false);
  /** Short "Sent" flash between two circles */
  let flash = $state(false);

  function size() {
    const c = canvas!;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(rect.width * dpr)) {
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
    }
    return { rect, dpr };
  }

  function redraw() {
    if (!canvas) return;
    const { rect, dpr } = size();
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, rect.width, rect.height);
    if (points.length < 2) return;
    const side = Math.min(rect.width, rect.height);
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#8b7cff';
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x * side, y * side) : g.moveTo(x * side, y * side)));
    g.stroke();
  }

  function at(e: PointerEvent): [number, number] {
    const rect = canvas!.getBoundingClientRect();
    const side = Math.min(rect.width, rect.height);
    return [(e.clientX - rect.left) / side, (e.clientY - rect.top) / side];
  }

  function down(e: PointerEvent) {
    if (done || busy || v.step !== 'draw') return;
    canvas!.setPointerCapture(e.pointerId);
    drawing = true;
    hint = '';
    flash = false;
    points = [at(e)];
    redraw();
  }

  function move(e: PointerEvent) {
    if (!drawing) return;
    const p = at(e);
    const last = points[points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.004) return;
    points.push(p);
    redraw();
  }

  async function up() {
    if (!drawing) return;
    drawing = false;
    if (points.length < 12) {
      hint = 'Too short, draw a whole circle in one go';
      points = [];
      redraw();
      return;
    }
    busy = true;
    const ok = await attempt(() => rpc('games', 'play', { points: points.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) }));
    busy = false;
    if (!ok) return;
    // Clean pad for the next circle
    flash = true;
    setTimeout(() => {
      points = [];
      redraw();
      flash = false;
    }, 600);
  }

  const mine = $derived(v.drawings?.[me] ?? []);
</script>

<div class="circle">
  {#if v.step === 'reveal'}
    <div class="center">
      <span class="eyebrow">Your circles</span>
      <div class="scores">
        {#each mine as d, i}
          <span class="pill mono" in:scale={{ delay: i * 150 }}>{d.score.toFixed(1)}%</span>
        {:else}
          <span class="dim">No circle drawn</span>
        {/each}
      </div>
      <p class="total mono">{(v.totals?.[me] ?? 0).toFixed(1)} pts</p>
      <p class="dim">Look at the TV for everyone's circles.</p>
    </div>
  {:else}
    <div class="top">
      <div class="titles">
        <span class="eyebrow">{done ? 'All done' : `Circle ${sent + 1} of ${v.count}`}</span>
        <p class="dim">{done ? 'Waiting for the others. Scores on the TV.' : 'One stroke. It is sent when you lift your finger.'}</p>
      </div>
      {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="3rem" />{/if}
    </div>
    <div class="dots">
      {#each Array(v.count) as _, i}<span class="dot" class:on={i < sent}></span>{/each}
    </div>
    <div class="pad" class:locked={done}>
      <canvas bind:this={canvas} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}></canvas>
      {#if flash || done}
        <div class="sent" in:scale={{ start: 0.6, duration: 200 }}><Check size={done ? 64 : 48} /><span>{done ? 'All sent' : 'Sent'}</span></div>
      {/if}
    </div>
    {#if hint}<p class="hint">{hint}</p>{/if}
  {/if}
</div>

<style>
  .circle {
    display: grid;
    gap: 0.8rem;
    justify-items: center;
  }
  .top {
    justify-self: stretch;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3rem;
  }
  .titles {
    display: grid;
    gap: 0.2rem;
  }
  .dots {
    display: flex;
    gap: 0.4rem;
  }
  .dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: var(--surface-3);
    transition: background 0.2s ease;
  }
  .dot.on {
    background: var(--accent);
  }
  .pad {
    position: relative;
    width: min(100%, 60dvh);
    aspect-ratio: 1;
    border-radius: var(--radius);
    background:
      radial-gradient(circle, var(--border-strong) 1px, transparent 1.5px) 0 0 / 1.5rem 1.5rem,
      var(--surface);
    border: 1px solid var(--border-strong);
    overflow: hidden;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .locked canvas {
    pointer-events: none;
  }
  .sent {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.3rem;
    color: var(--success);
    font-weight: 700;
    font-size: 1.3rem;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    pointer-events: none;
  }
  .hint {
    color: var(--warning);
    font-size: 0.9rem;
  }
  .center {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
    padding: 2rem 0;
  }
  .scores {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
  .scores .pill {
    font-size: 1rem;
    padding: 0.35em 0.9em;
  }
  .total {
    font-size: 3rem;
    font-weight: 700;
  }
</style>
