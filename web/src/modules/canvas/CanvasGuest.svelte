<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Eraser, Maximize, Palette, ZoomIn, ZoomOut } from '@lucide/svelte';
  import type { CanvasState } from '$shared/canvas.ts';
  import { hb, moneyAlert, rpc, price, toast } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import { PixelBoard } from './board.ts';

  const SEND_MS = 150;
  /** A second finger landing this soon after the first means a gesture, not a stroke */
  const GESTURE_MS = 120;
  const MAX_SCALE = 40;
  const RECENT = 6;

  const mod = $derived(hb.modules.canvas as CanvasState | undefined);
  const board = new PixelBoard(hb.modules.canvas?.palette ?? []);

  let root = $state<HTMLDivElement>();
  let el = $state<HTMLCanvasElement>();
  let viewport = $state<HTMLDivElement>();
  let color = $state(6);
  let recent = $state([6, 8, 10, 13, 1, 5]);
  let paletteOpen = $state(false);
  let painted = $state(0);
  let spent = $state(0);

  // View: canvas pixel size on screen and offset of the canvas in the viewport
  let scale = $state(0);
  let tx = $state(0);
  let ty = $state(0);
  let vw = $state(0);
  let vh = $state(0);

  // The panel fills exactly what is left between the header and the bottom bar, so nothing below it moves
  let height = $state(0);
  let navHeight = $state(0);

  const unit = $derived(price('canvas.pixel'));
  const economy = $derived(!!hb.core?.economyEnabled && unit > 0);

  // Pixels painted locally and not yet confirmed by the server
  let pending = new Map<number, [number, number, number]>();
  let inFlight = 0;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (!mod) return;
    board.setPalette(mod.palette);
    board.sync(mod.version);
  });
  $effect(() => {
    if (el) board.attach(el);
  });

  function measure() {
    if (!root) return;
    const top = root.getBoundingClientRect().top + window.scrollY;
    navHeight = (document.querySelector('.app > nav') as HTMLElement | null)?.offsetHeight ?? 0;
    height = Math.max(320, window.innerHeight - top - navHeight - 12);
  }

  $effect(() => {
    if (!root) return;
    const node = root;
    measure();
    // Older iOS zooms the whole page on pinch even with touch-action set
    const noPageZoom = (e: Event) => e.preventDefault();
    window.addEventListener('resize', measure);
    node.addEventListener('gesturestart', noPageZoom);
    return () => {
      window.removeEventListener('resize', measure);
      node.removeEventListener('gesturestart', noPageZoom);
    };
  });

  // Wheel listeners added by Svelte are passive: this one has to stop the page from scrolling
  $effect(() => {
    if (!viewport) return;
    const node = viewport;
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  });

  onDestroy(() => {
    flush();
    board.destroy();
  });

  // Track the viewport size; start (and stay, after a size change) fitted when not zoomed in
  $effect(() => {
    if (!viewport) return;
    const ro = new ResizeObserver(() => {
      const fitted = !scale || scale <= fitScale() + 0.001;
      vw = viewport!.clientWidth;
      vh = viewport!.clientHeight;
      if (fitted) fit();
      else clampView();
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  });

  // Canvas resized by the host: fit again
  const size = $derived(mod ? `${mod.width}x${mod.height}` : '');
  let fittedSize = '';
  $effect(() => {
    if (!size || !vw || size === fittedSize) return;
    fittedSize = size;
    fit();
  });

  function fitScale(): number {
    if (!mod || !vw || !vh) return 1;
    return Math.min(vw / mod.width, vh / mod.height);
  }

  function fit() {
    if (!mod || !vw) return;
    scale = fitScale();
    tx = (vw - mod.width * scale) / 2;
    ty = (vh - mod.height * scale) / 2;
  }

  /** Keep the canvas on screen: centered when smaller than the viewport, edge to edge otherwise */
  function clampView() {
    if (!mod) return;
    const cw = mod.width * scale;
    const ch = mod.height * scale;
    tx = cw <= vw ? (vw - cw) / 2 : Math.min(0, Math.max(vw - cw, tx));
    ty = ch <= vh ? (vh - ch) / 2 : Math.min(0, Math.max(vh - ch, ty));
  }

  /** Zoom around a point of the viewport (in viewport px) */
  function zoomAt(next: number, px: number, py: number) {
    const s = Math.min(MAX_SCALE, Math.max(fitScale(), next));
    tx = px - ((px - tx) / scale) * s;
    ty = py - ((py - ty) / scale) * s;
    scale = s;
    clampView();
  }

  function zoom(factor: number) {
    zoomAt(scale * factor, vw / 2, vh / 2);
  }

  // ---- Painting ----

  function canAfford(): boolean {
    if (!economy) return true;
    const committed = (pending.size + inFlight + (stroke?.cells.size ?? 0)) * unit;
    return (hb.me?.balance ?? 0) - committed >= unit;
  }

  /** The current finger stroke. Kept apart until we know it is not the start of a pinch. */
  let stroke: { cells: Map<number, [number, number, number, number]>; confirmed: boolean; timer: ReturnType<typeof setTimeout> } | null = null;
  let last: [number, number] | null = null;
  let warned = false;

  function paint(x: number, y: number) {
    if (!mod || !stroke || x < 0 || y < 0 || x >= mod.width || y >= mod.height) return;
    const old = board.get(x, y);
    if (old === color) return;
    const i = y * mod.width + x;
    // A cell already waiting to be sent is only recolored, it costs nothing more
    if (!pending.has(i) && !stroke.cells.has(i) && !canAfford()) {
      if (!warned) {
        toast({ text: `Out of ${hb.core?.currency.name}. Check the Earn tab.`, kind: 'error' });
        moneyAlert();
      }
      warned = true;
      return;
    }
    board.set(x, y, color);
    if (stroke.confirmed) queue(i, x, y);
    else if (!stroke.cells.has(i)) stroke.cells.set(i, [x, y, color, old]);
    else stroke.cells.get(i)![2] = color;
  }

  function queue(i: number, x: number, y: number) {
    pending.set(i, [x, y, color]);
    sendTimer ??= setTimeout(flush, SEND_MS);
  }

  function startStroke(c: [number, number]) {
    warned = false;
    stroke = { cells: new Map(), confirmed: false, timer: setTimeout(confirmStroke, GESTURE_MS) };
    last = c;
    paint(...c);
    if (color) remember(color);
  }

  function confirmStroke() {
    if (!stroke || stroke.confirmed) return;
    clearTimeout(stroke.timer);
    stroke.confirmed = true;
    for (const [i, [x, y, c]] of stroke.cells) {
      pending.set(i, [x, y, c]);
      sendTimer ??= setTimeout(flush, SEND_MS);
    }
    stroke.cells.clear();
  }

  /** A second finger came down right away: that was a pinch, undo the dot */
  function cancelStroke() {
    if (!stroke) return;
    clearTimeout(stroke.timer);
    if (!stroke.confirmed) for (const [x, y, , old] of [...stroke.cells.values()].reverse()) board.set(x, y, old);
    stroke = null;
    last = null;
  }

  function endStroke() {
    confirmStroke();
    stroke = null;
    last = null;
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
      if (economy) spent += r.painted * unit;
    } catch (err) {
      toast({ text: (err as Error).message, kind: 'error' });
      board.reload();
    } finally {
      inFlight -= batch.length;
    }
  }

  function cell(x: number, y: number): [number, number] {
    const r = el!.getBoundingClientRect();
    return [Math.floor(((x - r.left) / r.width) * mod!.width), Math.floor(((y - r.top) / r.height) * mod!.height)];
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

  // ---- Gestures: one finger paints, two fingers pinch and move ----

  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { dist: number; mx: number; my: number } | null = null;
  /** Mouse: the right or middle button drags the view */
  let dragging: { x: number; y: number } | null = null;

  function local(e: { clientX: number; clientY: number }) {
    const r = viewport!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  function down(e: PointerEvent) {
    if (!mod || !viewport) return;
    e.preventDefault();
    paletteOpen = false;
    viewport.setPointerCapture(e.pointerId);
    if (e.pointerType === 'mouse' && e.button !== 0) {
      dragging = local(e);
      return;
    }
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      startStroke(cell(e.clientX, e.clientY));
    } else if (pointers.size === 2) {
      if (stroke && !stroke.confirmed) cancelStroke();
      else endStroke();
      gesture = pinchInfo();
    }
  }

  function move(e: PointerEvent) {
    if (dragging) {
      const p = local(e);
      tx += p.x - dragging.x;
      ty += p.y - dragging.y;
      dragging = p;
      clampView();
      return;
    }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (gesture && pointers.size >= 2) {
      const g = pinchInfo();
      tx += g.mx - gesture.mx;
      ty += g.my - gesture.my;
      zoomAt(scale * (g.dist / gesture.dist), g.mx, g.my);
      gesture = g;
      return;
    }
    if (stroke && last) {
      const c = cell(e.clientX, e.clientY);
      if (c[0] === last[0] && c[1] === last[1]) return;
      line(last, c);
      last = c;
    }
  }

  function up(e: PointerEvent) {
    if (dragging) {
      dragging = null;
      return;
    }
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size < 2) gesture = null;
    // Lifting the fingers of a pinch one at a time must not start painting
    if (stroke) endStroke();
  }

  function wheel(e: WheelEvent) {
    if (!viewport) return;
    e.preventDefault();
    const p = local(e);
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomAt(scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), p.x, p.y);
    else {
      tx -= e.deltaX;
      clampView();
    }
  }

  // ---- Colors ----

  function remember(c: number) {
    if (recent.includes(c)) return;
    recent = [c, ...recent].slice(0, RECENT);
  }

  function pick(c: number) {
    color = c;
    if (c) remember(c);
    paletteOpen = false;
  }

  const zoomed = $derived(scale > fitScale() + 0.001);
</script>

{#if mod}
  <div class="draw" bind:this={root} style:height={height ? `${height}px` : undefined} style:--nav="{navHeight}px">
    <div
      class="viewport card"
      bind:this={viewport}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      oncontextmenu={(e) => e.preventDefault()}
      role="application"
      aria-label="Pixel canvas"
    >
      <div
        class="paper"
        class:grid={scale >= 8}
        style:width="{mod.width * scale}px"
        style:height="{mod.height * scale}px"
        style:transform="translate3d({tx}px, {ty}px, 0)"
        style:background-size="{scale}px {scale}px"
      >
        <canvas bind:this={el}></canvas>
      </div>

      <div class="zoom">
        <button onclick={() => zoom(1 / 1.6)} onpointerdown={(e) => e.stopPropagation()} aria-label="Zoom out"><ZoomOut size={17} /></button>
        <button onclick={() => zoom(1.6)} onpointerdown={(e) => e.stopPropagation()} aria-label="Zoom in"><ZoomIn size={17} /></button>
        {#if zoomed}
          <button onclick={fit} onpointerdown={(e) => e.stopPropagation()} aria-label="Show the whole canvas"><Maximize size={16} /></button>
        {/if}
      </div>

      {#if paletteOpen}
        <div class="sheet card" onpointerdown={(e) => e.stopPropagation()} role="dialog" tabindex="-1" aria-label="All colors">
          {#each mod.palette as c, i}
            <button
              class="swatch"
              class:active={color === i}
              style:--c={i === 0 ? 'transparent' : c}
              aria-label={i === 0 ? 'Eraser' : c}
              onclick={() => pick(i)}
            >
              {#if i === 0}<Eraser size={16} />{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="status faint">
      {#if painted}
        <span>{painted} {painted === 1 ? 'pixel' : 'pixels'} painted</span>
        {#if economy}<span class="spent"><Money amount={-spent} /></span>{/if}
      {:else}
        <span>Pinch to zoom, two fingers to move</span>
        {#if economy}<span class="spent"><Money amount={unit} /> / pixel</span>{/if}
      {/if}
    </div>

    <div class="colors">
      <button class="current" class:open={paletteOpen} onclick={() => (paletteOpen = !paletteOpen)} aria-label="All colors" aria-expanded={paletteOpen}>
        <span class="dot" style:--c={color === 0 ? 'transparent' : mod.palette[color]}>
          {#if color === 0}<Eraser size={14} />{/if}
        </span>
        <Palette size={18} />
      </button>
      <div class="recent">
        {#each recent as c (c)}
          <button class="swatch" class:active={color === c} style:--c={mod.palette[c]} aria-label={mod.palette[c]} onclick={() => pick(c)}></button>
        {/each}
      </div>
      <button class="swatch eraser" class:active={color === 0} style:--c="transparent" aria-label="Eraser" onclick={() => pick(0)}>
        <Eraser size={16} />
      </button>
    </div>
  </div>
{/if}

<style>
  .draw {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-height: 0;
    /* main keeps room for the bottom bar; take back the part the bar does not cover so the page never scrolls */
    margin-bottom: calc(var(--nav, 0px) - 6.5rem + 12px);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0;
    border-radius: var(--radius-sm);
    touch-action: none;
    cursor: crosshair;
  }
  .paper {
    position: absolute;
    left: 0;
    top: 0;
    background-color: var(--surface-2);
    box-shadow: 0 0 0 1px var(--border);
    will-change: transform;
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
    pointer-events: none;
  }
  .zoom {
    position: absolute;
    right: 0.5rem;
    bottom: 0.5rem;
    display: flex;
    gap: 0.35rem;
  }
  .zoom button {
    display: grid;
    place-items: center;
    width: 2.3rem;
    height: 2.3rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: color-mix(in srgb, var(--bg) 80%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: var(--text-dim);
    cursor: pointer;
  }
  .sheet {
    position: absolute;
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--bg);
    background-image: linear-gradient(var(--surface), var(--surface));
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    cursor: default;
    animation: sheet-in 0.16s ease-out;
  }
  @keyframes sheet-in {
    from {
      opacity: 0;
      transform: translateY(0.6rem);
    }
  }
  .status {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    padding: 0 0.15rem;
    min-height: 1.2rem;
  }
  .spent {
    color: var(--text-dim);
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .colors {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .current {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    height: 2.75rem;
    padding: 0 0.7rem 0 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    color: var(--text-dim);
    flex: none;
  }
  .current.open {
    border-color: var(--accent);
    color: var(--accent);
  }
  .dot {
    display: grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--c);
  }
  .recent {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.4rem;
  }
  .swatch {
    aspect-ratio: 1;
    max-height: 2.75rem;
    border-radius: 0.6rem;
    border: 1px solid var(--border-strong);
    background: var(--c);
    display: grid;
    place-items: center;
    color: var(--text-dim);
    transition: transform 0.1s ease;
    padding: 0;
  }
  .eraser {
    width: 2.75rem;
    flex: none;
  }
  .swatch.active {
    outline: 2.5px solid var(--text);
    outline-offset: 2px;
    transform: scale(1.06);
  }
</style>
