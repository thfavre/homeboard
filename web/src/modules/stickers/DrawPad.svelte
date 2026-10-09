<script lang="ts">
  import { Eraser, ImageOff, ImagePlus, Trash2, Undo2 } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { STICKER_SIZE, borderFor, makeCanvas, readImage } from './stickerImage.ts';

  /**
   * Draws a sticker with a finger on a transparent square, alone or over a picture (which the
   * eraser leaves alone). The parent calls render() to get it.
   */
  let { border, picture: initial = null }: { border: boolean; picture?: HTMLCanvasElement | null } = $props();

  const COLORS = ['#111111', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#8b5a2b'];
  const SIZES = [6, 14, 30];

  let pad = $state<HTMLCanvasElement>();
  // Under the drawing: the picture, and under it the white border preview
  let under = $state<HTMLCanvasElement>();
  let back_ = $state<HTMLCanvasElement>();
  let picture = $state.raw<HTMLCanvasElement | null>(untrack(() => initial));
  let fileInput = $state<HTMLInputElement>();
  let color = $state(COLORS[2]);
  let size = $state(SIZES[1]);
  let erasing = $state(false);
  let empty = $state(true);
  let undo = $state.raw<ImageData[]>([]);
  let last: { x: number; y: number } | null = null;

  const ctx = () => pad!.getContext('2d', { willReadFrequently: true })!;

  /** Whether anything was drawn */
  export function ready(): boolean {
    return !empty || !!picture;
  }

  export function render(): HTMLCanvasElement | null {
    if (!pad || !ready()) return null;
    const out = makeCanvas(pad.width, pad.height);
    const c = out.getContext('2d')!;
    if (back_) c.drawImage(back_, 0, 0);
    c.drawImage(pad, 0, 0);
    return out;
  }

  // The picture, fitted in the square
  $effect(() => {
    if (!back_) return;
    const c = back_.getContext('2d')!;
    c.clearRect(0, 0, STICKER_SIZE, STICKER_SIZE);
    if (picture) {
      const scale = Math.min(STICKER_SIZE / picture.width, STICKER_SIZE / picture.height);
      const w = picture.width * scale;
      const h = picture.height * scale;
      c.imageSmoothingQuality = 'high';
      c.drawImage(picture, (STICKER_SIZE - w) / 2, (STICKER_SIZE - h) / 2, w, h);
    }
    refreshBorder();
  });

  $effect(() => {
    void border;
    refreshBorder();
  });

  let borderFrame = 0;
  /** Redraws the white border preview (at most once a frame) */
  function refreshBorder() {
    if (borderFrame) return;
    borderFrame = requestAnimationFrame(() => {
      borderFrame = 0;
      if (!under || !pad || !back_) return;
      const c = under.getContext('2d')!;
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, STICKER_SIZE, STICKER_SIZE);
      if (!border || !ready()) return;
      const b = borderFor(STICKER_SIZE * 0.9);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        c.drawImage(back_, Math.cos(a) * b, Math.sin(a) * b);
        c.drawImage(pad, Math.cos(a) * b, Math.sin(a) * b);
      }
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = '#fff';
      c.fillRect(0, 0, STICKER_SIZE, STICKER_SIZE);
    });
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) picture = await readImage(file, 1024).catch(() => picture);
  }

  function snapshot() {
    undo = [...undo.slice(-24), ctx().getImageData(0, 0, STICKER_SIZE, STICKER_SIZE)];
  }

  function toPad(e: PointerEvent) {
    const r = pad!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * STICKER_SIZE, y: ((e.clientY - r.top) / r.height) * STICKER_SIZE };
  }

  function stroke(from: { x: number; y: number }, to: { x: number; y: number }) {
    const c = ctx();
    c.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    c.strokeStyle = color;
    c.lineWidth = erasing ? size * 2 : size;
    c.lineCap = c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(from.x, from.y);
    // A zero-length line still draws a round dot
    c.lineTo(to.x + 0.01, to.y);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    refreshBorder();
  }

  function down(e: PointerEvent) {
    if (!e.isPrimary) return;
    pad!.setPointerCapture(e.pointerId);
    snapshot();
    last = toPad(e);
    stroke(last, last);
    if (!erasing) empty = false;
  }

  function move(e: PointerEvent) {
    if (!e.isPrimary || !last) return;
    // Coalesced events keep fast strokes smooth
    for (const ev of e.getCoalescedEvents?.() ?? [e]) {
      const p = toPad(ev);
      stroke(last, p);
      last = p;
    }
  }

  function up() {
    if (last && erasing) empty = isBlank();
    last = null;
  }

  function isBlank(): boolean {
    const data = ctx().getImageData(0, 0, STICKER_SIZE, STICKER_SIZE).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 8) return false;
    return true;
  }

  function back() {
    const prev = undo.at(-1);
    if (!prev) return;
    ctx().putImageData(prev, 0, 0);
    undo = undo.slice(0, -1);
    empty = isBlank();
    refreshBorder();
  }

  function clear() {
    if (empty) return;
    snapshot();
    ctx().clearRect(0, 0, STICKER_SIZE, STICKER_SIZE);
    empty = true;
    refreshBorder();
  }
</script>

<div class="draw">
  <div class="frame">
    <canvas class="layer" bind:this={under} width={STICKER_SIZE} height={STICKER_SIZE}></canvas>
    <canvas class="layer" bind:this={back_} width={STICKER_SIZE} height={STICKER_SIZE}></canvas>
    <canvas
      class="top"
      bind:this={pad}
      width={STICKER_SIZE}
      height={STICKER_SIZE}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    ></canvas>
  </div>

  <div class="colors">
    {#each COLORS as c (c)}
      <button
        class="swatch"
        class:on={!erasing && color === c}
        style:--c={c}
        aria-label={`Color ${c}`}
        onclick={() => {
          color = c;
          erasing = false;
        }}
      ></button>
    {/each}
  </div>

  <div class="tools">
    {#each SIZES as s (s)}
      <button class="btn small size" class:primary={size === s} aria-label={`Brush ${s}`} onclick={() => (size = s)}>
        <span class="dot" style:--d={`${4 + s / 2.4}px`}></span>
      </button>
    {/each}
    <span class="spacer"></span>
    {#if picture}
      <button class="btn small" aria-label="Remove the picture" title="Remove the picture" onclick={() => (picture = null)}><ImageOff size={17} /></button>
    {:else}
      <button class="btn small" aria-label="Draw on a picture" title="Draw on a picture" onclick={() => fileInput?.click()}><ImagePlus size={17} /></button>
    {/if}
    <button class="btn small" class:primary={erasing} aria-label="Eraser" onclick={() => (erasing = !erasing)}><Eraser size={17} /></button>
    <button class="btn small" disabled={!undo.length} aria-label="Undo" onclick={back}><Undo2 size={17} /></button>
    <button class="btn small" disabled={empty} aria-label="Clear" onclick={clear}><Trash2 size={17} /></button>
  </div>
  <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onFile} />
</div>

<style>
  .draw {
    display: grid;
    gap: 0.6rem;
  }
  .frame {
    position: relative;
    justify-self: center;
    width: min(100%, 50dvh);
    aspect-ratio: 1;
    border-radius: var(--radius-sm);
    overflow: hidden;
    /* Checkerboard: what stays transparent on the TV */
    background:
      repeating-conic-gradient(rgba(127, 127, 127, 0.22) 0 25%, transparent 0 50%) 0 0 / 24px 24px,
      var(--surface-2);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .top {
    position: relative;
    touch-action: none;
  }
  .colors {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.4rem;
  }
  .swatch {
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 50%;
    background: var(--c);
    border: 2px solid color-mix(in srgb, var(--text) 25%, transparent);
    transition: transform 0.12s ease;
  }
  .swatch.on {
    transform: scale(1.18);
    outline: 3px solid var(--text);
    outline-offset: 2px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .size {
    width: 2.6rem;
    padding: 0;
  }
  .dot {
    display: block;
    width: var(--d);
    height: var(--d);
    border-radius: 50%;
    background: currentColor;
  }
  .spacer {
    flex: 1;
  }
</style>
