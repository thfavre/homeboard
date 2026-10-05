<script lang="ts">
  let { name, color, size = '2.2rem' }: { name: string; color: string; size?: string } = $props();
  const initials = $derived(
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase(),
  );
</script>

<span class="avatar" style:--c={color} style:width={size} style:height={size} style:font-size={`calc(${size} * 0.4)`}>{initials}</span>

<style>
  .avatar {
    flex: none;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c) 22%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--c) 70%, transparent);
    color: var(--c);
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: 0.02em;
  }
</style>
