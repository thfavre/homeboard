<script lang="ts">
  import { Check } from '@lucide/svelte';
  import { fade } from 'svelte/transition';

  /** "Locked in": what a phone shows once its answer is sent */
  let { text }: { text: string } = $props();
</script>

<div class="locked" in:fade><Check size={20} /> {text}</div>

<style>
  .locked {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 3.2rem;
    padding: 0 1.4rem;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--success) 14%, transparent);
    color: var(--success);
    font-weight: 700;
  }
</style>
