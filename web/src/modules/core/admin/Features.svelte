<script lang="ts">
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Toggle from '$lib/ui/Toggle.svelte';
</script>

<div class="card list">
  {#each hb.core?.features ?? [] as f (f.id)}
    <div class="feature">
      <div class="text">
        <strong>{f.name}</strong>
        <span class="dim">{f.description}</span>
      </div>
      <Toggle checked={f.enabled} label={f.name} onchange={(v) => attempt(() => rpc('core', 'setFeature', { id: f.id, enabled: v }))} />
    </div>
  {:else}
    <p class="empty">No optional features installed.</p>
  {/each}
</div>

<style>
  .list {
    padding: 0.3rem 0;
  }
  .feature {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1.1rem;
    border-bottom: 1px solid var(--border);
  }
  .feature:last-child {
    border-bottom: 0;
  }
  .text {
    flex: 1;
    display: grid;
    gap: 0.15rem;
  }
  .text span {
    font-size: 0.88rem;
  }
</style>
