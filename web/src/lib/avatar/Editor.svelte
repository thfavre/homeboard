<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Camera, X } from '@lucide/svelte';
  import { AVATAR_EFFECTS, AVATAR_EMOJI, DEFAULT_AVATAR_PARAMS, type AvatarParams } from '$shared/avatar.ts';
  import { applyEffect, drawEmoji, loadSquare } from './render.ts';

  /**
   * Edits a selfie: head effect (tap the face to aim it) and one emoji (drag to move).
   * Calls onsave with the finished canvas and the settings used.
   */
  let {
    photo,
    initial,
    busy = false,
    onsave,
    onretake,
  }: {
    photo: Blob;
    initial?: AvatarParams;
    busy?: boolean;
    onsave: (canvas: HTMLCanvasElement, source: ImageData, params: AvatarParams) => void;
    onretake: () => void;
  } = $props();

  // Starts from the saved settings, then the editor owns them
  let params = $state<AvatarParams>({ ...DEFAULT_AVATAR_PARAMS, ...(untrack(() => initial) ?? {}) });
  let canvas = $state<HTMLCanvasElement>();
  let source: ImageData | null = null;
  let effected: ImageData | null = null;
  let effectKey = '';
  let frame = 0;
  let ready = $state(false);

  onMount(async () => {
    source = await loadSquare(photo);
    ready = true;
    draw();
  });

  /** Redraw on the next frame; the effect is only recomputed when it changes */
  function draw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!canvas || !source) return;
      const key = `${params.effect}|${params.strength}|${params.cx}|${params.cy}`;
      if (key !== effectKey || !effected) {
        effected = applyEffect(source, params);
        effectKey = key;
      }
      canvas.width = canvas.height = source.width;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(effected, 0, 0);
      drawEmoji(ctx, params, source.width);
    });
  }

  $effect(() => {
    // Track every setting
    void [params.effect, params.strength, params.cx, params.cy, params.emoji, params.ex, params.ey, params.esize];
    draw();
  });

  // Pointer: drag the emoji when grabbing it, otherwise aim the effect
  let dragging: 'emoji' | 'effect' | null = null;
  const pos = (e: PointerEvent) => {
    const r = canvas!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  function down(e: PointerEvent) {
    const p = pos(e);
    const nearEmoji = params.emoji && Math.hypot(p.x - params.ex, p.y - params.ey) < params.esize * 0.7;
    dragging = nearEmoji ? 'emoji' : params.effect !== 'none' && params.effect !== 'wave' && params.effect !== 'pixel' ? 'effect' : null;
    if (!dragging) return;
    canvas!.setPointerCapture(e.pointerId);
    move(e);
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    const p = pos(e);
    if (dragging === 'emoji') {
      params.ex = p.x;
      params.ey = p.y;
    } else {
      params.cx = p.x;
      params.cy = p.y;
    }
  }

  const aimable = $derived(params.effect !== 'none' && params.effect !== 'wave' && params.effect !== 'pixel');
</script>

<div class="editor">
  <div class="preview">
    <canvas bind:this={canvas} onpointerdown={down} onpointermove={move} onpointerup={() => (dragging = null)} onpointercancel={() => (dragging = null)}></canvas>
    {#if !ready}<p class="loading">Loading...</p>{/if}
  </div>
  <p class="faint tip">
    {aimable ? 'Tap your face to aim the effect.' : 'Pick an effect and an emoji.'}
    {params.emoji ? ' Drag the emoji to move it.' : ''}
  </p>

  <div class="group">
    <span class="eyebrow">Effect</span>
    <div class="chips">
      {#each AVATAR_EFFECTS as fx (fx.id)}
        <button class="chip" class:active={params.effect === fx.id} onclick={() => (params.effect = fx.id)}>{fx.name}</button>
      {/each}
    </div>
    <label class="slider" class:off={params.effect === 'none'}>
      <span>Strength</span>
      <input type="range" min="0.1" max="1" step="0.05" bind:value={params.strength} disabled={params.effect === 'none'} />
    </label>
  </div>

  <div class="group">
    <span class="eyebrow">Emoji</span>
    <div class="emoji-grid">
      <button class="emoji none" class:active={!params.emoji} onclick={() => (params.emoji = null)} aria-label="No emoji"><X size={18} /></button>
      {#each AVATAR_EMOJI as em}
        <button class="emoji" class:active={params.emoji === em} onclick={() => (params.emoji = em)}>{em}</button>
      {/each}
    </div>
    <label class="slider" class:off={!params.emoji}>
      <span>Size</span>
      <input type="range" min="0.12" max="0.6" step="0.01" bind:value={params.esize} disabled={!params.emoji} />
    </label>
  </div>

  <div class="actions">
    <button class="btn" onclick={onretake}><Camera size={18} /> Retake</button>
    <button class="btn primary" disabled={!ready || busy} onclick={() => canvas && source && onsave(canvas, source, $state.snapshot(params))}>
      {busy ? 'Saving...' : 'Save'}
    </button>
  </div>
</div>

<style>
  .editor {
    display: grid;
    gap: 1rem;
  }
  .preview {
    position: relative;
    width: 100%;
    max-width: 22rem;
    margin: 0 auto;
    aspect-ratio: 1;
    border-radius: 50%;
    overflow: hidden;
    background: var(--surface-3);
    box-shadow: 0 0 0 3px var(--accent);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text-dim);
  }
  .tip {
    text-align: center;
    font-size: 0.85rem;
    min-height: 2.6em;
  }
  .group {
    display: grid;
    gap: 0.55rem;
  }
  .chips {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scrollbar-width: none;
  }
  .chip {
    flex: none;
    padding: 0.45rem 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-weight: 600;
    font-size: 0.85rem;
  }
  .chip.active {
    background: var(--accent);
    border-color: transparent;
    color: var(--accent-contrast);
  }
  .slider {
    display: grid;
    grid-template-columns: 5rem 1fr;
    align-items: center;
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .slider.off {
    opacity: 0.4;
  }
  .slider input {
    width: 100%;
    accent-color: var(--accent);
  }
  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.6rem, 1fr));
    gap: 0.35rem;
  }
  .emoji {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 0.7rem;
    border: 1px solid var(--border);
    background: var(--surface-2);
    font-size: 1.4rem;
    line-height: 1;
  }
  .emoji.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .none {
    color: var(--text-dim);
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
</style>
