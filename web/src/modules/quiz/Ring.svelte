<script lang="ts">
  /** Circular countdown until `endsAt` */
  let { endsAt, totalMs, size = '5rem', pausedLeft = 0 }: { endsAt: number | null; totalMs: number; size?: string; pausedLeft?: number } = $props();
  let now = $state(Date.now());
  $effect(() => {
    let frame = requestAnimationFrame(function loop() {
      now = Date.now();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  });
  // While paused there is no end time: show the time that was left
  const left = $derived(endsAt ? Math.max(0, endsAt - now) : pausedLeft);
  const ratio = $derived(totalMs ? left / totalMs : 0);
  const C = 2 * Math.PI * 45;
</script>

<div class="ring" style:width={size} style:height={size}>
  <svg viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="45" class="track" />
    <circle cx="50" cy="50" r="45" class="fill" class:low={left < 5000} stroke-dasharray={C} stroke-dashoffset={C * (1 - ratio)} />
  </svg>
  <span class="mono">{Math.ceil(left / 1000)}</span>
</div>

<style>
  .ring {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
  }
  svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }
  circle {
    fill: none;
    stroke-width: 8;
  }
  .track {
    stroke: var(--surface-3);
  }
  .fill {
    stroke: var(--accent);
    stroke-linecap: round;
  }
  .fill.low {
    stroke: var(--danger);
  }
  span {
    font-size: calc(var(--s, 1) * 1.6em);
    font-weight: 700;
  }
</style>
