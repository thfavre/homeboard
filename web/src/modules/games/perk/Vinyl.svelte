<script lang="ts">
  import { circlePath } from '../ui/circlePath.ts';

  /** A vinyl record with a drawn circle pressed on it and a name on the label, turned by `angle` (radians) */
  let {
    points,
    color,
    label,
    angle = 0,
    size = '20rem',
  }: { points: [number, number][]; color: string; label: string; angle?: number; size?: string } = $props();
  const d = $derived(circlePath(points, 62));
</script>

<div class="vinyl" style:--s={size}>
  <svg viewBox="0 0 100 100" style:transform="rotate({angle}rad)">
    <circle cx="50" cy="50" r="49.5" class="disc" />
    {#each [46, 43, 40, 37, 34, 31, 28, 25, 22] as r (r)}<circle cx="50" cy="50" {r} class="groove" />{/each}
    <circle cx="50" cy="50" r="15" fill={color} />
    <circle cx="50" cy="50" r="15" class="label-ring" />
    <!-- The label text shows the record turning, even with a perfect circle on it -->
    <text x="50" y="45" class="label-name">{label.length > 12 ? label.slice(0, 11) + '.' : label}</text>
    <text x="50" y="58.5" class="label-sub">33 RPM</text>
    <path {d} class="drawn" />
    <circle cx="50" cy="50" r="1.6" class="hole" />
  </svg>
  <!-- The light reflections stay still while the record turns -->
  <span class="sheen"></span>
</div>

<style>
  .vinyl {
    position: relative;
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    box-shadow: 0 calc(var(--s) * 0.06) calc(var(--s) * 0.15) -0.2rem rgba(0, 0, 0, 0.7);
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .disc {
    fill: #111114;
    stroke: #26262c;
    stroke-width: 0.6;
  }
  .groove {
    fill: none;
    stroke: rgba(255, 255, 255, 0.05);
    stroke-width: 0.4;
  }
  .label-ring {
    fill: none;
    stroke: rgba(0, 0, 0, 0.35);
    stroke-width: 0.8;
  }
  .drawn {
    fill: none;
    stroke: var(--coin);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 1.2px rgba(0, 0, 0, 0.8));
  }
  .label-name,
  .label-sub {
    fill: rgba(0, 0, 0, 0.7);
    text-anchor: middle;
    font-family: var(--font-display);
    font-weight: 700;
  }
  .label-name {
    font-size: 3.6px;
  }
  .label-sub {
    font-size: 2.2px;
    letter-spacing: 0.3px;
  }
  .hole {
    fill: #050506;
  }
  .sheen {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
    background: conic-gradient(
      from 20deg,
      transparent 0deg,
      rgba(255, 255, 255, 0.1) 25deg,
      transparent 60deg,
      transparent 180deg,
      rgba(255, 255, 255, 0.08) 205deg,
      transparent 240deg
    );
    mask-image: radial-gradient(circle, transparent 31%, #000 32%);
  }
</style>
