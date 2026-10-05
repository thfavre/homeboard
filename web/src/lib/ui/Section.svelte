<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, hint, actions, children }: { title: string; hint?: string; actions?: Snippet; children: Snippet } = $props();
</script>

<section class="section card">
  <header>
    <div>
      <h3>{title}</h3>
      {#if hint}<p class="dim hint">{hint}</p>{/if}
    </div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </header>
  <div class="body">{@render children()}</div>
</section>

<style>
  .section {
    padding: 1.15rem;
    display: grid;
    gap: 1rem;
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }
  header > div:first-child {
    flex: 1;
    min-width: 0;
  }
  h3 {
    font-size: 1.05rem;
  }
  .hint {
    font-size: 0.85rem;
    margin-top: 0.2rem;
  }
  .actions {
    flex: none;
    display: flex;
    gap: 0.5rem;
  }
  .body {
    display: grid;
    gap: 0.85rem;
  }
</style>
