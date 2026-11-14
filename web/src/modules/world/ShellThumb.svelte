<script lang="ts">
  import { fwHex, type FwShell } from '$shared/worldActions.ts';
  import { shapePoints } from './fireworks.ts';

  /** A shell in small: its stars where they burst (its drawing, or a round burst), in its colors */
  let { shell, size = 32 }: { shell: Pick<FwShell, 'strokes' | 'colors' | 'size'>; size?: number } = $props();

  const dots = $derived.by(() => {
    const pts = shapePoints(shell);
    if (pts.length) return pts;
    const out: [number, number][] = [];
    for (let i = 0; i < 12; i++) for (const d of [0.45, 0.85]) out.push([Math.cos((i / 12) * Math.PI * 2) * d, Math.sin((i / 12) * Math.PI * 2) * d]);
    return out;
  });
</script>

<svg viewBox="-1.15 -1.15 2.3 2.3" width={size} height={size} aria-hidden="true">
  {#each dots as [x, y], i (i)}
    <circle cx={x} cy={y} r={dots.length > 40 ? 0.07 : 0.1} fill={fwHex(shell.colors[Math.floor((i / dots.length) * shell.colors.length) % shell.colors.length])} />
  {/each}
</svg>
