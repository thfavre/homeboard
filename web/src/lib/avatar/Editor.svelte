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
  // A new order every time, so people try different effects (Normal stays first)
  const effects = [AVATAR_EFFECTS[0], ...AVATAR_EFFECTS.slice(1).sort(() => Math.random() - 0.5)];

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
    void [params.effect, params.strength, params.cx, params.cy, params.emoji, params.ex, params.ey, params.esize, params.erot];
    draw();
  });

  // Pointers: one finger drags the emoji (or aims the effect), two fingers pinch the emoji
  let dragging: 'emoji' | 'effect' | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; angle: number; size: number; rot: number } | null = null;

  const between = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const pos = (e: PointerEvent) => {
    const r = canvas!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  function down(e: PointerEvent) {
    const p = pos(e);
    canvas!.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2 && params.emoji) {
      const g = between();
      pinch = { ...g, size: params.esize, rot: params.erot };
      dragging = null;
      return;
    }
    const nearEmoji = params.emoji && Math.hypot(p.x - params.ex, p.y - params.ey) < params.esize * 0.7;
    dragging = nearEmoji ? 'emoji' : aimable ? 'effect' : null;
    if (!dragging) return;
    move(e);
  }

  function move(e: PointerEvent) {
    const p = pos(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const g = between();
      params.esize = Math.min(0.9, Math.max(0.08, (pinch.size * g.dist) / Math.max(0.01, pinch.dist)));
      params.erot = pinch.rot + (g.angle - pinch.angle);
      return;
    }
    if (!dragging) return;
    if (dragging === 'emoji') {
      params.ex = p.x;
      params.ey = p.y;
    } else {
      params.cx = p.x;
      params.cy = p.y;
    }
  }

  function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) dragging = null;
  }

  /** Computer without touch: wheel resizes the emoji, Shift + wheel rotates it */
  function wheel(e: WheelEvent) {
    if (!params.emoji) return;
    e.preventDefault();
    if (e.shiftKey) params.erot += e.deltaY > 0 ? 0.12 : -0.12;
    else params.esize = Math.min(0.9, Math.max(0.08, params.esize * (e.deltaY > 0 ? 0.92 : 1.08)));
  }

  const aimable = $derived(params.effect !== 'none' && params.effect !== 'wave' && params.effect !== 'pixel');
</script>

<div class="editor">
  <div class="preview">
    <canvas bind:this={canvas} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel}></canvas>
    {#if !ready}<p class="loading">Loading...</p>{/if}
  </div>
  <p class="faint tip">
    {aimable ? (params.effect === 'mirror' ? 'Tap where the mirror line goes.' : 'Tap your face to aim the effect.') : 'Pick an effect and an emoji.'}
    {params.emoji ? ' Drag the emoji, pinch it to resize and turn it.' : ''}
  </p>

  <div class="group">
    <span class="eyebrow">Effect</span>
    <div class="chips">
      {#each effects as fx (fx.id)}
        <button class="chip" class:active={params.effect === fx.id} onclick={() => (params.effect = fx.id)}>{fx.name}</button>
      {/each}
    </div>
    <label class="slider" class:off={params.effect === 'none' || params.effect === 'mirror'}>
      <span>Strength</span>
      <input type="range" min="0.1" max="1" step="0.05" bind:value={params.strength} disabled={params.effect === 'none' || params.effect === 'mirror'} />
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
    flex-wrap: wrap;
    gap: 0.4rem;
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
