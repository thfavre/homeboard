<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Eraser, Hand, Paintbrush, ZoomIn, ZoomOut } from '@lucide/svelte';
  import type { CanvasState } from '$shared/canvas.ts';
  import { hb, rpc, price, toast } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import { PixelBoard } from './board.ts';

  const SEND_MS = 150;

  const mod = $derived(hb.modules.canvas as CanvasState | undefined);
  const board = new PixelBoard(hb.modules.canvas?.palette ?? []);

  let el = $state<HTMLCanvasElement>();
  let viewport = $state<HTMLDivElement>();
  let color = $state(6);
  let mode = $state<'paint' | 'move'>('paint');
  let scale = $state(0);
  let painted = $state(0);

  const unit = $derived(price('canvas.pixel'));

  // Pixels painted locally and not yet confirmed by the server
  let pending = new Map<number, [number, number, number]>();
  let inFlight = 0;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;
  let last: [number, number] | null = null;

  $effect(() => {
    if (!mod) return;
    board.setPalette(mod.palette);
    board.sync(mod.version);
  });
  $effect(() => {
    if (el) board.attach(el);
  });

  // Start zoomed to fit the screen width
  $effect(() => {
    if (!viewport || !mod || scale) return;
    scale = Math.max(1, viewport.clientWidth / mod.width);
  });

  onDestroy(() => {
    flush();
    board.destroy();
  });

  function zoom(factor: number) {
    if (!viewport || !mod) return;
    const min = viewport.clientWidth / mod.width;
    const cx = (viewport.scrollLeft + viewport.clientWidth / 2) / scale;
    const cy = (viewport.scrollTop + viewport.clientHeight / 2) / scale;
    scale = Math.min(40, Math.max(min, scale * factor));
    requestAnimationFrame(() => {
      if (!viewport) return;
      viewport.scrollLeft = cx * scale - viewport.clientWidth / 2;
      viewport.scrollTop = cy * scale - viewport.clientHeight / 2;
    });
  }

  function canAfford(): boolean {
    if (!hb.core?.economyEnabled || unit === 0) return true;
    const committed = (pending.size + inFlight) * unit;
    return (hb.me?.balance ?? 0) - committed >= unit;
  }

  let warned = false;
  function paint(x: number, y: number) {
    if (!mod || x < 0 || y < 0 || x >= mod.width || y >= mod.height) return;
    if (board.get(x, y) === color) return;
    if (!canAfford()) {
      if (!warned) toast({ text: `Out of ${hb.core?.currency.name}. Check the Earn tab.`, kind: 'error' });
      warned = true;
      return;
    }
    board.set(x, y, color);
    pending.set(y * mod.width + x, [x, y, color]);
    sendTimer ??= setTimeout(flush, SEND_MS);
  }

  async function flush() {
    sendTimer = null;
    if (!pending.size) return;
    const batch = [...pending.values()];
    pending = new Map();
    inFlight += batch.length;
    try {
      const r = await rpc<{ painted: number }>('canvas', 'paint', { pixels: batch });
      painted += r.painted;
    } catch (err) {
      toast({ text: (err as Error).message, kind: 'error' });
      board.reload();
    } finally {
      inFlight -= batch.length;
    }
  }

  function cell(e: PointerEvent): [number, number] {
    const r = el!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * mod!.width), Math.floor(((e.clientY - r.top) / r.height) * mod!.height)];
  }

  /** Paint every cell on the line between two points so fast strokes have no gaps */
  function line([x0, y0]: [number, number], [x1, y1]: [number, number]) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      paint(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  function down(e: PointerEvent) {
    if (mode !== 'paint' || !mod) return;
    e.preventDefault();
    warned = false;
    el!.setPointerCapture(e.pointerId);
    last = cell(e);
    paint(...last);
  }

  function move(e: PointerEvent) {
    if (mode !== 'paint' || !last) return;
    const c = cell(e);
    if (c[0] === last[0] && c[1] === last[1]) return;
    line(last, c);
    last = c;
  }

  function up() {
    last = null;
  }
</script>

{#if mod}
  <div class="draw">
    <p class="dim intro">
      Everything you paint shows up live on the TV.
      {#if hb.core?.economyEnabled && unit}Each pixel costs <Money amount={unit} />.{/if}
    </p>

    <div class="viewport card" class:moving={mode === 'move'} bind:this={viewport}>
      <div
        class="paper"
        class:grid={scale >= 6}
        style:width="{mod.width * scale}px"
        style:height="{mod.height * scale}px"
        style:background-size="{scale}px {scale}px"
      >
        <canvas bind:this={el} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}></canvas>
      </div>
    </div>

    <div class="tools">
      <div class="seg">
        <button class:active={mode === 'paint'} onclick={() => (mode = 'paint')} aria-label="Paint"><Paintbrush size={18} /></button>
        <button class:active={mode === 'move'} onclick={() => (mode = 'move')} aria-label="Move"><Hand size={18} /></button>
      </div>
      <div class="seg">
        <button onclick={() => zoom(1 / 1.6)} aria-label="Zoom out"><ZoomOut size={18} /></button>
        <button onclick={() => zoom(1.6)} aria-label="Zoom in"><ZoomIn size={18} /></button>
      </div>
      <span class="spacer"></span>
      {#if painted}<span class="faint count">{painted} painted</span>{/if}
    </div>

    <div class="palette">
      {#each mod.palette as c, i}
        <button
          class="swatch"
          class:active={color === i}
          style:--c={i === 0 ? 'transparent' : c}
          aria-label={i === 0 ? 'Eraser' : c}
          onclick={() => {
            color = i;
            mode = 'paint';
          }}
        >
          {#if i === 0}<Eraser size={16} />{/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .draw {
    display: grid;
    gap: 0.8rem;
  }
  .intro {
    font-size: 0.9rem;
  }
  .viewport {
    height: min(58dvh, 34rem);
    overflow: auto;
    padding: 0;
    border-radius: var(--radius-sm);
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .paper {
    background-color: var(--surface-2);
  }
  .paper.grid {
    background-image:
      linear-gradient(var(--border) 1px, transparent 1px),
      linear-gradient(90deg, var(--border) 1px, transparent 1px);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    touch-action: none;
    cursor: crosshair;
  }
  .moving canvas {
    touch-action: auto;
    cursor: grab;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .seg {
    display: flex;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .seg button {
    display: grid;
    place-items: center;
    width: 2.8rem;
    height: 2.5rem;
    border: 0;
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .seg button + button {
    border-left: 1px solid var(--border-strong);
  }
  .seg button.active {
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .count {
    font-size: 0.85rem;
  }
  .palette {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 0.45rem;
  }
  .swatch {
    aspect-ratio: 1;
    border-radius: 0.6rem;
    border: 1px solid var(--border-strong);
    background: var(--c);
    display: grid;
    place-items: center;
    color: var(--text-dim);
    transition: transform 0.1s ease;
  }
  .swatch.active {
    outline: 2.5px solid var(--text);
    outline-offset: 2px;
    transform: scale(1.06);
  }
</style>
