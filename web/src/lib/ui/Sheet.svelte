<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { X } from '@lucide/svelte';

  /**
   * A panel over the page (bottom sheet on phones, centered window on large screens).
   * Used instead of forms that open inside the page, so the page never moves.
   */
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop" transition:fade={{ duration: 150 }} onclick={onclose} role="presentation"></div>
<div class="wrap">
  <div class="sheet card" role="dialog" aria-modal="true" aria-label={title} transition:fly={{ y: 40, duration: 220 }}>
    <header>
      <h2 class="truncate">{title}</h2>
      <button class="btn ghost close" onclick={onclose} aria-label="Close"><X size={20} /></button>
    </header>
    <div class="body">{@render children()}</div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1500;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
  }
  .wrap {
    position: fixed;
    inset: 0;
    z-index: 1501;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    pointer-events: none;
  }
  .sheet {
    pointer-events: auto;
    width: min(32rem, 100%);
    max-height: calc(100dvh - 2.5rem);
    display: grid;
    grid-template-rows: auto 1fr;
    background: var(--bg);
    background-image: linear-gradient(var(--surface), var(--surface));
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 0.8rem 0.4rem 1.2rem;
  }
  h2 {
    flex: 1;
    font-size: 1.15rem;
  }
  .close {
    padding: 0;
    width: 2.4rem;
    min-height: 2.4rem;
  }
  .body {
    overflow-y: auto;
    padding: 0.6rem 1.2rem 1.3rem;
    display: grid;
    gap: 0.8rem;
  }
  @media (max-width: 600px) {
    .wrap {
      place-items: end stretch;
      padding: 0;
    }
    .sheet {
      width: 100%;
      border-radius: var(--radius) var(--radius) 0 0;
      padding-bottom: env(safe-area-inset-bottom);
    }
  }
</style>
