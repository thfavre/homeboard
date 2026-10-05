<script lang="ts">
  import { hb } from '$lib/client.svelte.ts';
  import Money from './Money.svelte';
  import { CircleAlert, CircleCheck, Info } from '@lucide/svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each hb.toasts as t (t.id)}
    <div class="toast card {t.kind ?? 'info'}">
      {#if t.kind === 'error'}<CircleAlert size={18} />{:else if t.kind === 'success'}<CircleCheck size={18} />{:else}<Info size={18} />{/if}
      <span class="text">{t.text}</span>
      {#if t.amount}<span class="amount"><Money amount={t.amount} sign /></span>{/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    top: max(0.75rem, env(safe-area-inset-top));
    transform: translateX(-50%);
    width: min(28rem, calc(100% - 1.5rem));
    display: grid;
    gap: 0.5rem;
    z-index: 1000;
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-sm);
    background: var(--surface);
    --blur: 24px;
    animation: hb-fade-up 0.25s ease;
    font-size: 0.92rem;
    font-weight: 500;
  }
  .text {
    flex: 1;
  }
  .error {
    color: var(--danger);
  }
  .error .text {
    color: var(--text);
  }
  .success {
    color: var(--success);
  }
  .success .text {
    color: var(--text);
  }
  .amount {
    color: var(--text);
  }
</style>
