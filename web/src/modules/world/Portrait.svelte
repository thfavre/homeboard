<script lang="ts">
  import type { SheetInfo } from '$shared/world.ts';

  /**
   * A character's face, cut from its sprite sheet: the smiling row facing us (the plain standing
   * one on a sheet drawn before it), from the top of the hair down, pixels kept sharp
   */
  let { url, sheet, size = 48 }: { url: string; sheet?: SheetInfo; size?: number } = $props();

  let canvas: HTMLCanvasElement;

  $effect(() => {
    const info = sheet;
    if (!canvas || !info) return;
    const img = new Image();
    img.src = url;
    let gone = false;
    img.onload = () => {
      if (gone) return;
      const f = info.frame || 64;
      const row = info.rows.happy ?? info.rows.idleDown;
      if (!row) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.height = Math.round(size * dpr);
      const g = canvas.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      // A square around the head: from just over the hair, as wide as the shoulders
      const side = Math.round(f * 0.42);
      const sx = Math.round(f / 2 - side / 2);
      const sy = Math.max(0, info.body.top - 3);
      g.drawImage(img, sx, row.row * f + sy, side, side, 0, 0, canvas.width, canvas.height);
    };
    return () => (gone = true);
  });
</script>

<canvas bind:this={canvas} style:width="{size}px" style:height="{size}px" aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
    image-rendering: pixelated;
  }
</style>
