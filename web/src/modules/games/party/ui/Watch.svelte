<script lang="ts">
  import { Eye } from '@lucide/svelte';
  import { fade } from 'svelte/transition';
  import type { Snippet } from 'svelte';

  /** Phone: "look at the light" while the strip shows something to remember */
  let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div class="watch" in:fade>
  <span class="eye"><Eye size={48} /></span>
  <h1>{title}</h1>
  {@render children?.()}
</div>

<style>
  .watch {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
    padding: 2.5rem 0;
  }
  .eye {
    color: var(--g1);
    animation: hb-pulse 1.2s ease-in-out infinite;
  }
  h1 {
    font-size: 2rem;
    line-height: 1.1;
  }
</style>
