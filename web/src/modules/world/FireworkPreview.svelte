<script lang="ts">
  import { onMount } from 'svelte';
  import { showMs, type FwDesign } from '$shared/worldActions.ts';
  import { drawShow, type Sky } from './fireworks.ts';

  /**
   * A show playing over a little night town, round and round, drawn by the same code as the TV.
   * `restart` changing plays it from the start. A tap on the sky says where (0..100 across, and how
   * high), for the designer to move a shell there.
   */
  let {
    design,
    restart = 0,
    ontap,
    compact = false,
  }: { design: Pick<FwDesign, 'shells'>; restart?: number; ontap?: (x: number, height: number) => void; compact?: boolean } = $props();

  let canvas: HTMLCanvasElement;
  let start = performance.now();
  /** The world the preview shows: as wide as the TV's town, the rockets going up from the roofs */
  const W = 1600;
  const H = 1000;
  const SKY: Sky = { w: W, ground: 900, low: 760, high: 230, unit: 1.45 };

  $effect(() => {
    void restart;
    start = performance.now();
  });

  /** The roofs along the bottom, with a few lit windows (made once) */
  const roofs = (() => {
    const out: { x: number; w: number; h: number; peak: number; lit: number[] }[] = [];
    let x = -20;
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;
    while (x < W) {
      const w = 110 + r() * 120;
      out.push({ x, w, h: 70 + r() * 90, peak: r() < 0.6 ? 30 + r() * 40 : 0, lit: [0, 1, 2].filter(() => r() < 0.45).map((i) => i) });
      x += w + 6;
    }
    return out;
  })();
  const stars = Array.from({ length: 70 }, (_, i) => [((i * 7919) % 997) / 997, ((i * 104729) % 991) / 991 / 1.6, (i % 5) / 5] as const);

  function draw(now: number) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(canvas.clientWidth * dpr);
    const ch = Math.round(canvas.clientHeight * dpr);
    if (!cw || !ch) return;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const g = canvas.getContext('2d')!;
    const k = cw / W;
    g.setTransform(k, 0, 0, k, 0, ch - H * k);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#060818');
    sky.addColorStop(0.7, '#141a3e');
    sky.addColorStop(1, '#232a57');
    g.fillStyle = sky;
    g.fillRect(0, -H, W, H * 2);
    for (const [sx, sy, tw] of stars) {
      g.globalAlpha = 0.35 + 0.35 * Math.sin(now / 900 + tw * 9);
      g.fillStyle = '#dfe6ff';
      g.fillRect(sx * W, sy * H, 3, 3);
    }
    g.globalAlpha = 1;
    const ms = (now - start) % (showMs(design) + 1200);
    const light = drawShow(g, design, ms, SKY, 'preview');
    // The roofs, lit a little by the bursts
    for (const b of roofs) {
      const top = H - b.h;
      g.fillStyle = '#0a0d1f';
      g.beginPath();
      g.moveTo(b.x, H);
      g.lineTo(b.x, top);
      if (b.peak) g.lineTo(b.x + b.w / 2, top - b.peak);
      g.lineTo(b.x + b.w, top);
      g.lineTo(b.x + b.w, H);
      g.fill();
      g.fillStyle = '#ffcf7a';
      for (const i of b.lit) g.fillRect(b.x + 18 + i * (b.w / 3.2), top + 26, 14, 18);
    }
    if (light > 0.01) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,230,200,${0.08 * light})`;
      g.fillRect(0, -H, W, H * 2);
      g.globalCompositeOperation = 'source-over';
    }
  }

  onMount(() => {
    let raf = 0;
    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  function tap(e: PointerEvent) {
    if (!ontap) return;
    const rect = canvas.getBoundingClientRect();
    const k = rect.width / W;
    const wx = (e.clientX - rect.left) / k;
    const wy = (e.clientY - rect.top - (rect.height - H * k)) / k;
    const height = ((SKY.low - wy) / (SKY.low - SKY.high)) * 100;
    ontap(Math.round(Math.max(0, Math.min(100, (wx / W) * 100))), Math.round(Math.max(0, Math.min(100, height))));
  }
</script>

<canvas bind:this={canvas} class:compact class:tappable={!!ontap} onpointerdown={tap}></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: #060818;
    touch-action: manipulation;
  }
  canvas.compact {
    aspect-ratio: 16 / 7;
  }
  .tappable {
    cursor: crosshair;
  }
</style>
