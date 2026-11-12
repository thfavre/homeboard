<script lang="ts">
  import type { SheetInfo } from '$shared/world.ts';

  /**
   * A still picture of a look: the first frame of the sheet facing the camera, cut down to the
   * character (head to feet) so it fills a small tile.
   */

  let { url, sheet }: { url: string; sheet: SheetInfo } = $props();

  let canvas = $state<HTMLCanvasElement>();

  $effect(() => {
    if (!canvas) return;
    const me = canvas;
    const info = sheet;
    const img = new Image();
    img.onload = () => {
      const g = me.getContext('2d');
      const row = info.rows.walkDown ?? info.rows.walk;
      if (!g || !row) return;
      const px = info.frame;
      const top = Math.max(0, (info.body.top ?? 8) - 3);
      const feet = Math.min(px, (info.feet ?? px - 4) + 2);
      const size = Math.max(1, feet - top);
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, me.width, me.height);
      g.drawImage(img, (px - size) / 2, row.row * px + top, size, size, 0, 0, me.width, me.height);
    };
    img.src = url;
  });
</script>

<canvas bind:this={canvas} width="64" height="64"></canvas>

<style>
  canvas {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
</style>
