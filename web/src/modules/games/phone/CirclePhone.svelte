<script lang="ts">
  import { RotateCcw } from '@lucide/svelte';
  import type { CircleView, MatchState } from '$shared/games.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Ring from '../../quiz/Ring.svelte';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CircleView);
  const sent = $derived(v.done.includes(hb.me?.id ?? ''));

  let canvas = $state<HTMLCanvasElement | null>(null);
  let points: [number, number][] = [];
  let drawing = false;
  let hint = $state('');
  let result = $state<{ score: number; note?: string } | null>(null);
  let busy = $state(false);

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
    if (sent || busy) return;
    canvas!.setPointerCapture(e.pointerId);
    drawing = true;
    hint = '';
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
    const r = await attempt(() => rpc<{ score: number; note?: string }>('games', 'play', { points: points.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) }));
    busy = false;
    if (r) result = r;
  }

  function clear() {
    points = [];
    hint = '';
    redraw();
  }
</script>

<div class="circle">
  <div class="top">
    <p class="dim">{sent ? 'Sent. Scores show on the TV.' : 'Draw a circle in one stroke.'}</p>
    {#if m.endsAt && !sent}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="3rem" />{/if}
  </div>
  <div class="pad" class:locked={sent}>
    <canvas bind:this={canvas} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}></canvas>
    {#if result}
      <div class="score">
        <span class="mono">{result.score.toFixed(1)} %</span>
        {#if result.note}<span class="note">{result.note}</span>{/if}
      </div>
    {/if}
  </div>
  {#if hint}<p class="hint">{hint}</p>{/if}
  {#if !sent && !result}
    <button class="btn ghost small" onclick={clear}><RotateCcw size={16} /> Clear</button>
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
  .score {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    pointer-events: none;
  }
  .score .mono {
    font-size: 3rem;
    font-weight: 700;
    text-shadow: 0 2px 12px var(--bg);
  }
  .note {
    color: var(--text-dim);
    font-weight: 600;
  }
  .hint {
    color: var(--warning);
    font-size: 0.9rem;
  }
</style>
