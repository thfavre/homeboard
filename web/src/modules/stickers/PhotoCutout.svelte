<script lang="ts">
  import { Circle, Image, Lasso } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { borderFor, makeCanvas } from './stickerImage.ts';

  /**
   * Cuts a sticker out of a photo: trace around it with a finger, or keep a circle or the whole
   * photo. The parent calls render() to get the cut-out (transparent outside the shape).
   * Mount it again (with {#key}) for another photo.
   */
  let { photo, border }: { photo: HTMLCanvasElement; border: boolean } = $props();
  // Room around the photo, so the border of a shape touching the edge still shows
  const margin = $derived(Math.ceil(borderFor(Math.max(photo.width, photo.height))));

  type Shape = 'trace' | 'circle' | 'whole';
  let shape = $state<Shape>('whole');
  let view = $state<HTMLCanvasElement>();
  // Points are in photo pixels. Kept out of Svelte (it can be hundreds), `version` triggers the redraw.
  let points: { x: number; y: number }[] = [];
  let version = $state(0);
  let tracing = $state(false);
  const minSide = $derived(Math.min(photo.width, photo.height));
  let circle = $state(untrack(() => ({ x: photo.width / 2, y: photo.height / 2, size: 80 })));
  let drag: { x: number; y: number; cx: number; cy: number } | null = null;

  const radius = $derived((minSide / 2) * (circle.size / 100));
  const traced = $derived(version >= 0 && !tracing && points.length > 8);

  /** Whether render() has something to cut */
  export function ready(): boolean {
    return shape !== 'trace' || traced;
  }

  function addShape(ctx: CanvasRenderingContext2D) {
    if (shape === 'trace') {
      ctx.moveTo(points[0].x, points[0].y);
      for (const p of points) ctx.lineTo(p.x, p.y);
      ctx.closePath();
    } else if (shape === 'circle') {
      ctx.moveTo(circle.x + radius, circle.y);
      ctx.arc(circle.x, circle.y, radius, 0, Math.PI * 2);
    } else if (ctx.roundRect) {
      ctx.roundRect(0, 0, photo.width, photo.height, minSide * 0.08);
    } else {
      ctx.rect(0, 0, photo.width, photo.height);
    }
  }

  export function render(): HTMLCanvasElement | null {
    if (!ready()) return null;
    const out = makeCanvas(photo.width, photo.height);
    const ctx = out.getContext('2d')!;
    ctx.beginPath();
    addShape(ctx);
    ctx.clip();
    ctx.drawImage(photo, 0, 0);
    return out;
  }

  /** Longest side of the shape, which sets how wide the border ends up */
  function shapeSide(): number {
    if (shape === 'circle') return radius * 2;
    if (shape === 'whole') return Math.max(photo.width, photo.height);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    return Math.max(x1 - x0, y1 - y0);
  }

  $effect(() => {
    void version;
    void radius;
    void circle.x;
    void circle.y;
    void border;
    if (!view) return;
    const ctx = view.getContext('2d')!;
    const line = minSide / 120;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.translate(margin, margin);
    ctx.drawImage(photo, 0, 0);
    if (shape === 'trace' && (tracing || !traced)) {
      // The line being drawn
      if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const p of points) ctx.lineTo(p.x, p.y);
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.lineWidth = line * 1.6;
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = line * 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      return;
    }
    // Dim everything outside the shape
    ctx.beginPath();
    ctx.rect(-margin, -margin, photo.width + margin * 2, photo.height + margin * 2);
    addShape(ctx);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.fill('evenodd');
    if (border) {
      // The white border as it will be on the sticker: a thick line, the photo drawn back over its inner half
      ctx.beginPath();
      addShape(ctx);
      ctx.lineWidth = borderFor(shapeSide()) * 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.drawImage(photo, 0, 0);
      ctx.restore();
      return;
    }
    ctx.beginPath();
    addShape(ctx);
    ctx.lineWidth = line;
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([line * 3, line * 2]);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  function toPhoto(e: PointerEvent) {
    const r = view!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * view!.width - margin,
      y: ((e.clientY - r.top) / r.height) * view!.height - margin,
    };
  }

  function down(e: PointerEvent) {
    if (!e.isPrimary || shape === 'whole') return;
    view!.setPointerCapture(e.pointerId);
    const p = toPhoto(e);
    if (shape === 'trace') {
      points = [p];
      tracing = true;
    } else {
      drag = { x: p.x, y: p.y, cx: circle.x, cy: circle.y };
    }
    version++;
  }

  function move(e: PointerEvent) {
    if (!e.isPrimary) return;
    const p = toPhoto(e);
    if (shape === 'trace' && tracing) {
      const last = points[points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < minSide / 200) return;
      points.push(p);
      version++;
    } else if (shape === 'circle' && drag) {
      circle.x = Math.min(photo.width, Math.max(0, drag.cx + p.x - drag.x));
      circle.y = Math.min(photo.height, Math.max(0, drag.cy + p.y - drag.y));
    }
  }

  function up() {
    tracing = false;
    drag = null;
    version++;
  }

  function pick(s: Shape) {
    shape = s;
    version++;
  }

  const hint = $derived(
    shape === 'trace'
      ? traced
        ? 'Not quite? Trace again.'
        : 'Draw around what you want to keep with your finger.'
      : shape === 'circle'
        ? 'Drag the circle onto what you want to keep.'
        : 'The whole photo, with rounded corners.',
  );
</script>

<div class="cutout">
  <div class="tabs">
    <button class="btn small" class:primary={shape === 'whole'} onclick={() => pick('whole')}><Image size={16} /> Whole</button>
    <button class="btn small" class:primary={shape === 'trace'} onclick={() => pick('trace')}><Lasso size={16} /> Trace</button>
    <button class="btn small" class:primary={shape === 'circle'} onclick={() => pick('circle')}><Circle size={16} /> Circle</button>
  </div>
  <div class="frame">
    <canvas
      bind:this={view}
      width={photo.width + margin * 2}
      height={photo.height + margin * 2}
      style:aspect-ratio={`${photo.width + margin * 2} / ${photo.height + margin * 2}`}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    ></canvas>
  </div>
  <p class="faint hint">{hint}</p>
  {#if shape === 'circle'}
    <label class="field">
      <span>Size</span>
      <input type="range" min="15" max="100" bind:value={circle.size} />
    </label>
  {/if}
</div>

<style>
  .cutout {
    display: grid;
    gap: 0.6rem;
  }
  .tabs {
    display: flex;
    gap: 0.4rem;
  }
  .tabs .btn {
    flex: 1;
  }
  .frame {
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    overflow: hidden;
  }
  canvas {
    display: block;
    max-width: 100%;
    max-height: 50dvh;
    touch-action: none;
  }
  .hint {
    font-size: 0.85rem;
    text-align: center;
    min-height: 1.3em;
  }
  input[type='range'] {
    width: 100%;
  }
</style>
