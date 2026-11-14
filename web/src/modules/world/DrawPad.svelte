<script lang="ts">
  import { onMount } from 'svelte';
  import { PenLine } from '@lucide/svelte';
  import { FW_MAX_STROKES, FW_STROKE_POINTS, fwHex, type FwPoint, type FwShell } from '$shared/worldActions.ts';
  import { shapePoints } from './fireworks.ts';

  /**
   * Where a guest draws a shell's shape with a finger: the burst's middle is the pad's middle. The
   * pad shows the stars where they will burst (the drawing sampled as the TV does), in the shell's
   * colors; an empty pad is a round burst.
   */
  let { shell, remember }: { shell: FwShell; remember: () => void } = $props();

  let canvas: HTMLCanvasElement;
  /** The line being drawn (null: none) */
  let live: FwPoint[] | null = null;
  /** Points closer than this to the last one are skipped while drawing; a long line gets it bigger */
  const MIN_STEP = 0.025;
  let step = MIN_STEP;

  function toPad(e: PointerEvent): FwPoint {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    return [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
  }

  function down(e: PointerEvent) {
    if (shell.strokes.length >= FW_MAX_STROKES) return;
    canvas.setPointerCapture(e.pointerId);
    live = [toPad(e)];
    step = MIN_STEP;
    draw();
  }
  function move(e: PointerEvent) {
    if (!live) return;
    const p = toPad(e);
    const last = live[live.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < step) return;
    // A long line keeps going: once it has as many points as a line keeps, every other one goes
    // (its shape stays) and the next ones are taken further apart
    if (live.length >= FW_STROKE_POINTS) {
      live = live.filter((_, i) => i % 2 === 0 || i === live!.length - 1);
      step *= 2;
    }
    live.push(p);
    draw();
  }
  function up() {
    if (!live) return;
    // A tap is a single star: kept as a tiny line so it shows
    const st = live.length === 1 ? [live[0], [live[0][0] + 0.001, live[0][1]] as FwPoint] : live;
    remember();
    shell.strokes.push(st.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as FwPoint));
    live = null;
  }

  function draw() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(canvas.clientWidth * dpr);
    if (!size) return;
    if (canvas.width !== size) canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    const h = size / 2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const sky = g.createRadialGradient(h, h, 0, h, h, h * 1.45);
    sky.addColorStop(0, '#1b2150');
    sky.addColorStop(1, '#05071a');
    g.fillStyle = sky;
    g.fillRect(0, 0, size, size);
    // The burst's reach, and its middle
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = dpr;
    g.setLineDash([4 * dpr, 6 * dpr]);
    g.beginPath();
    g.arc(h, h, h * 0.85, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(h - dpr, h - 5 * dpr, 2 * dpr, 10 * dpr);
    g.fillRect(h - 5 * dpr, h - dpr, 10 * dpr, 2 * dpr);
    const colors = shell.colors.map(fwHex);
    const strokes = live ? [...shell.strokes, live] : shell.strokes;
    // The lines as drawn, faint
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2 * dpr;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const st of strokes) {
      g.beginPath();
      st.forEach(([x, y], i) => (i ? g.lineTo(h + x * h, h + y * h) : g.moveTo(h + x * h, h + y * h)));
      g.stroke();
    }
    // The stars where they will burst (round: the burst's ring, faintly)
    const pts = shapePoints({ strokes, size: shell.size });
    g.globalCompositeOperation = 'lighter';
    if (pts.length) {
      pts.forEach(([x, y], i) => star(g, h + x * h, h + y * h, colors[Math.floor((i / pts.length) * colors.length) % colors.length], 3.2 * dpr));
    } else {
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        for (const d of [0.35, 0.6, 0.85]) star(g, h + Math.cos(a + d) * d * h, h + Math.sin(a + d) * d * h, colors[i % colors.length], 2.2 * dpr, 0.45);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  /** A star: a bright core in a soft glow of its color */
  function star(g: CanvasRenderingContext2D, x: number, y: number, color: string, r: number, alpha = 1) {
    g.globalAlpha = 0.35 * alpha;
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r * 2.4, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = alpha;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.globalAlpha = 0.8 * alpha;
    g.beginPath();
    g.arc(x, y, r * 0.45, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  // Drawn again whenever the shell changes (another shell picked, a color, a template)
  $effect(() => {
    void JSON.stringify(shell.strokes);
    void shell.colors.join();
    void shell.size;
    draw();
  });
  onMount(() => {
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  });
</script>

<div class="pad">
  <canvas bind:this={canvas} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}></canvas>
  {#if !shell.strokes.length}
    <p class="hint"><PenLine size={15} />Draw a shape</p>
  {/if}
</div>

<style>
  .pad {
    position: relative;
    width: 100%;
    max-width: 22rem;
    margin: 0 auto;
  }
  canvas {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius);
    border: 1px solid var(--border-strong);
    touch-action: none;
    cursor: crosshair;
    box-shadow: 0 18px 40px -22px rgba(0, 0, 0, 0.9);
  }
  .hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 600;
    font-size: 0.9rem;
    pointer-events: none;
  }
</style>
