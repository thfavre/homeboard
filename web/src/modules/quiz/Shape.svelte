<script lang="ts">
  let { shape, size = '1.5rem', color = 'currentColor' }: { shape: string; size?: string; color?: string } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
  {#if shape === 'triangle'}
    <path d="M12 3 L22 20 H2 Z" fill={color} stroke={color} stroke-width="1.5" stroke-linejoin="round" />
  {:else if shape === 'diamond'}
    <path d="M12 2 L22 12 L12 22 L2 12 Z" fill={color} stroke={color} stroke-width="1.5" stroke-linejoin="round" />
  {:else if shape === 'circle'}
    <circle cx="12" cy="12" r="10" fill={color} />
  {:else}
    <rect x="3" y="3" width="18" height="18" rx="2.5" fill={color} />
  {/if}
</svg>
