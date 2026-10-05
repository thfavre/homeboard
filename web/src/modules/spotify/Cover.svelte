<script lang="ts">
  import { Music } from '@lucide/svelte';
  let { src, size = '3rem', radius = '0.6rem' }: { src: string | null; size?: string; radius?: string } = $props();
</script>

<div class="cover" style:width={size} style:height={size} style:border-radius={radius}>
  {#if src}<img {src} alt="" />{:else}<Music size="40%" />{/if}
</div>

<style>
  .cover {
    flex: none;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--surface-3);
    color: var(--text-faint);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
