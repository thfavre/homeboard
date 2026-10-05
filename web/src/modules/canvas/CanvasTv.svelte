<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { CanvasState } from '$shared/canvas.ts';
  import { hb, price } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import { PixelBoard } from './board.ts';

  const mod = $derived(hb.modules.canvas as CanvasState | undefined);
  let el = $state<HTMLCanvasElement>();
  let frame = $state<HTMLDivElement>();
  let scale = $state(1);
  const board = new PixelBoard(hb.modules.canvas?.palette ?? []);

  $effect(() => {
    if (!mod) return;
    board.setPalette(mod.palette);
    board.sync(mod.version);
  });
  $effect(() => {
    if (el) board.attach(el);
  });
  onDestroy(() => board.destroy());

  // Integer scaling keeps every pixel perfectly square and sharp
  $effect(() => {
    if (!frame || !mod) return;
    const { width, height } = mod;
    const ro = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      scale = Math.max(1, Math.floor(Math.min(w / width, h / height)));
    });
    ro.observe(frame);
    return () => ro.disconnect();
  });
</script>

<div class="card panel">
  <div class="label">
    <span class="eyebrow">Pixel canvas</span>
    <span class="hint">
      Paint from your phone
      {#if hb.core?.economyEnabled}<span class="sep">&middot;</span><Money amount={price('canvas.pixel')} /> per pixel{/if}
    </span>
  </div>
  <div class="frame" bind:this={frame}>
    {#if mod}
      <div
        class="paper"
        style:width="{mod.width * scale}px"
        style:height="{mod.height * scale}px"
        style:background-size="{scale * 8}px {scale * 8}px"
      >
        <canvas bind:this={el}></canvas>
      </div>
    {/if}
  </div>
</div>

<style>
  .panel {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 0.8rem;
    padding: 1rem 1.2rem 1.2rem;
    min-height: 0;
  }
  .label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--text-dim);
    font-size: 0.95rem;
  }
  .sep {
    margin: 0 0.2rem;
  }
  .frame {
    min-height: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .paper {
    position: relative;
    border-radius: 6px;
    background-color: var(--surface-2);
    background-image: radial-gradient(circle, var(--border-strong) 1px, transparent 1.2px);
    background-position: center;
    box-shadow: 0 0 0 1px var(--border);
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
</style>
