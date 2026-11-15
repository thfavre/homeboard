<script lang="ts">
  import { drawPixelText, pixelClean, pixelTextWidth } from '$lib/pixelFont.ts';

  /**
   * Text in the 5 x 7 pixel font (the Arcade's and the town arcade's), drawn on a canvas with sharp
   * pixels. `size` is the CSS height of a letter; a dark shadow under it unless `shadow` is false.
   */
  let { text, size = 14, color = '#ffffff', shadow = true }: { text: string | number; size?: number; color?: string; shadow?: boolean } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  const clean = $derived(pixelClean(String(text)));
  /** CSS pixels a font pixel */
  const k = $derived(size / 7);

  $effect(() => {
    const s = clean;
    const c = color;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    // A whole number of device pixels a font pixel: crisp at any size
    const p = Math.max(1, Math.round(k * dpr));
    const extra = shadow ? 1 : 0;
    canvas.width = Math.max(1, (pixelTextWidth(s) + extra) * p);
    canvas.height = (7 + extra) * p;
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (shadow) drawPixelText(g, s, p, p, 'rgba(10,5,25,0.7)', p);
    drawPixelText(g, s, 0, 0, c, p);
  });
</script>

<canvas bind:this={canvas} class="pixel-text" aria-label={String(text)}></canvas>

<style>
  .pixel-text {
    display: inline-block;
    vertical-align: middle;
    image-rendering: pixelated;
  }
</style>
