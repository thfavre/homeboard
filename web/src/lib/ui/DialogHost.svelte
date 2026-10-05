<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { dialog } from '$lib/dialog.svelte.ts';

  let box = $state<HTMLDivElement>();

  // Focus the main button so Enter confirms
  $effect(() => {
    if (dialog.current && box) box.querySelector<HTMLButtonElement>('.actions button:last-child')?.focus();
  });

  function onKey(e: KeyboardEvent) {
    if (dialog.current && e.key === 'Escape') dialog.current.resolve(null);
  }
</script>

<svelte:window onkeydown={onKey} />

{#if dialog.current}
  {@const d = dialog.current}
  <div class="backdrop" transition:fade={{ duration: 150 }} onclick={() => d.resolve(null)} role="presentation"></div>
  <div class="wrap">
    <div class="dialog card" role="alertdialog" aria-modal="true" aria-labelledby="hb-dialog-title" bind:this={box} transition:scale={{ start: 0.94, duration: 180 }}>
      <h2 id="hb-dialog-title">{d.title}</h2>
      {#if d.message}<p class="dim">{d.message}</p>{/if}
      <div class="actions" class:stacked={d.options.length > 1}>
        <button class="btn ghost" onclick={() => d.resolve(null)}>{d.cancelLabel}</button>
        {#each d.options as o}
          <button class="btn {o.kind === 'danger' ? 'danger-solid' : o.kind === 'default' ? '' : 'primary'}" onclick={() => d.resolve(o.value)}>{o.label}</button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2000;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
  }
  .wrap {
    position: fixed;
    inset: 0;
    z-index: 2001;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    pointer-events: none;
  }
  .dialog {
    pointer-events: auto;
    width: min(24rem, 100%);
    padding: 1.4rem;
    display: grid;
    gap: 0.8rem;
    background: var(--bg);
    background-image: linear-gradient(var(--surface), var(--surface));
  }
  h2 {
    font-size: 1.2rem;
  }
  p {
    font-size: 0.92rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }
  .actions.stacked {
    flex-direction: column-reverse;
  }
  .actions.stacked .btn {
    width: 100%;
  }
  .danger-solid {
    background: var(--danger);
    border-color: transparent;
    color: #fff;
  }
</style>
