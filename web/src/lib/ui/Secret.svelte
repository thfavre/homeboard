<script lang="ts">
  import { Eye, EyeOff } from '@lucide/svelte';

  /** A value shown blurred until the eye is pressed (PINs, passwords) */
  let { value, label = 'value', size = '1rem' }: { value: string; label?: string; size?: string } = $props();
  let shown = $state(false);
</script>

<span class="secret">
  <span class="text mono" class:hidden={!shown} style:font-size={size} aria-label={shown ? value : `${label} hidden`}>{value}</span>
  <button type="button" class="btn ghost eye" onclick={() => (shown = !shown)} aria-label={shown ? `Hide ${label}` : `Show ${label}`}>
    {#if shown}<EyeOff size={19} />{:else}<Eye size={19} />{/if}
  </button>
</span>

<style>
  .secret {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .text {
    font-weight: 700;
    letter-spacing: 0.15em;
    transition: filter 0.2s ease;
    user-select: none;
  }
  .text.hidden {
    filter: blur(0.32em);
  }
  .eye {
    padding: 0;
    width: 2.5rem;
    min-height: 2.4rem;
    color: var(--text-dim);
  }
</style>
