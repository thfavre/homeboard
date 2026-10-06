<script lang="ts">
  import type { SpotifyState } from '$shared/spotify.ts';
  import { hb } from '$lib/client.svelte.ts';
  import { circlePath } from '../ui/circlePath.ts';

  /**
   * A vinyl record cut to the shape of the winner's drawn circle, turned by `angle` (radians).
   * The label shows the song playing (cover and title), or the winner's color and name.
   */
  let {
    points,
    color,
    name,
    angle = 0,
    size = '20rem',
  }: { points: [number, number][]; color: string; name: string; angle?: number; size?: string } = $props();

  const id = $props.id();
  const d = $derived(circlePath(points, 97));
  const deg = $derived((angle * 180) / Math.PI);
  const song = $derived.by(() => {
    const s = hb.modules.spotify as SpotifyState | undefined;
    return s?.connected && s.now?.isPlaying ? s.now : null;
  });
  const text = $derived(song ? song.title : name);
  const short = $derived(text.length > 14 ? text.slice(0, 13) + '.' : text);

  /** A slice of light from the center, between two angles (degrees) */
  const sector = (a0: number, a1: number) => {
    const p = (a: number) => `${(50 + 60 * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(50 + 60 * Math.sin((a * Math.PI) / 180)).toFixed(1)}`;
    return `M50 50 L${p(a0)} A60 60 0 0 1 ${p(a1)} Z`;
  };
</script>

<svg class="vinyl" viewBox="0 0 100 100" style:width={size} style:height={size}>
  <defs>
    <clipPath id="{id}-disc"><path {d} transform="rotate({deg} 50 50)" /></clipPath>
    <clipPath id="{id}-label"><circle cx="50" cy="50" r="15" /></clipPath>
  </defs>
  <g transform="rotate({deg} 50 50)">
    <path {d} class="disc" />
    <g clip-path="url(#{id}-disc)">
      {#each [46, 43, 40, 37, 34, 31, 28, 25, 22, 19] as r (r)}<circle cx="50" cy="50" {r} class="groove" />{/each}
    </g>
    <!-- The edge of the record is the stroke they drew -->
    <path {d} class="rim" />
  </g>
  <!-- The light reflections stay still while the record turns -->
  <g clip-path="url(#{id}-disc)" class="sheen">
    <path d={sector(25, 55)} />
    <path d={sector(205, 235)} />
  </g>
  <g transform="rotate({deg} 50 50)">
    {#if song?.image}
      <image href={song.image} x="35" y="35" width="30" height="30" preserveAspectRatio="xMidYMid slice" clip-path="url(#{id}-label)" />
      <circle cx="50" cy="50" r="15" class="label-ring" />
    {:else}
      <circle cx="50" cy="50" r="15" fill={color} />
      <circle cx="50" cy="50" r="15" class="label-ring" />
      <!-- The label text shows the record turning -->
      <text x="50" y="45" class="label-name">{short}</text>
      <text x="50" y="58.5" class="label-sub">{song ? song.artists.slice(0, 22) : '33 RPM'}</text>
    {/if}
    <circle cx="50" cy="50" r="1.6" class="hole" />
  </g>
</svg>

<style>
  .vinyl {
    display: block;
    overflow: visible;
    filter: drop-shadow(0 0.6rem 1rem rgba(0, 0, 0, 0.6));
  }
  .disc {
    fill: #111114;
  }
  .groove {
    fill: none;
    stroke: rgba(255, 255, 255, 0.05);
    stroke-width: 0.4;
  }
  .rim {
    fill: none;
    stroke: var(--coin);
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sheen path {
    fill: rgba(255, 255, 255, 0.07);
  }
  .label-ring {
    fill: none;
    stroke: rgba(0, 0, 0, 0.35);
    stroke-width: 0.8;
  }
  .label-name,
  .label-sub {
    fill: rgba(0, 0, 0, 0.7);
    text-anchor: middle;
    font-family: var(--font-display);
    font-weight: 700;
  }
  .label-name {
    font-size: 3.4px;
  }
  .label-sub {
    font-size: 2.2px;
    letter-spacing: 0.2px;
  }
  .hole {
    fill: #050506;
    stroke: rgba(255, 255, 255, 0.4);
    stroke-width: 0.3;
  }
</style>
