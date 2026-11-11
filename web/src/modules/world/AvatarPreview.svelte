<script lang="ts">
  import { Loader2 } from '@lucide/svelte';
  import type { SheetInfo } from '$shared/world.ts';

  /**
   * The live avatar preview of the editor and the shop: the composited sheet walking toward the
   * camera. `focusHead` glides the view onto the head (editing hair, trying on a hat).
   */
  let {
    url,
    sheet,
    building = false,
    focusHead = false,
  }: {
    url: string | null;
    sheet: SheetInfo | null;
    building?: boolean;
    focusHead?: boolean;
  } = $props();

  let canvas = $state<HTMLCanvasElement>();
  const img = new Image();
  let imgReady = $state(false);
  $effect(() => {
    if (!url) return;
    imgReady = false;
    const me = url;
    img.onload = () => {
      if (me === url) imgReady = true;
    };
    img.src = url;
  });

  $effect(() => {
    if (!canvas) return;
    let raf = 0;
    let zoom = 0;
    let last = Date.now();
    const g = canvas.getContext('2d')!;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, canvas!.width, canvas!.height);
      if (!imgReady || !sheet) return;
      // Walking toward the camera, steady: turning around was found annoying
      const row = sheet.rows.walkDown ?? sheet.rows.walk;
      if (!row) return;
      const count = Math.max(1, row.frames - 1);
      const frame = row.frames > 1 ? 1 + (Math.floor(now / 110) % count) : 0;
      const px = sheet.frame;
      // The view glides onto the head and out again
      zoom += ((focusHead ? 1 : 0) - zoom) * Math.min(1, dt * 7);
      const headSize = 34;
      const headY = Math.max(0, (sheet.body.top ?? 8) - 3);
      const ease = zoom * zoom * (3 - 2 * zoom);
      const size = px + (headSize - px) * ease;
      const sx = ((px - headSize) / 2) * ease;
      const sy = headY * ease;
      g.drawImage(img, frame * px + sx, row.row * px + sy, size, size, 0, 0, canvas!.width, canvas!.height);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="stage card">
  <canvas bind:this={canvas} width="192" height="192"></canvas>
  {#if building}
    <span class="building"><Loader2 size={18} class="spin" /></span>
  {/if}
</div>

<style>
  .stage {
    display: grid;
    place-items: center;
    padding: 0.8rem;
    position: relative;
    background:
      linear-gradient(rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.12)),
      var(--surface-2);
  }
  .stage canvas {
    width: 10rem;
    height: 10rem;
    image-rendering: pixelated;
  }
  .building {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    color: var(--text-dim);
    display: grid;
  }
  .building :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
