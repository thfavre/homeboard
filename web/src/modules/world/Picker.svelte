<script lang="ts">
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';

  /**
   * A paged option picker for the avatar editor, for groups with too many options for one row:
   * the header names the current pick and its place (7/26), the arrows step to the previous or
   * next option, and the row shows the page of options around the pick (tap one to jump to it).
   */
  interface Item {
    id: string;
    name: string;
    /** A color swatch instead of a text pill */
    color?: string;
  }
  let {
    label,
    items,
    value,
    per = 4,
    onchange,
  }: {
    label: string;
    items: Item[];
    value: string;
    /** Options shown at once */
    per?: number;
    onchange: (id: string) => void;
  } = $props();

  const idx = $derived(Math.max(0, items.findIndex((i) => i.id === value)));
  const page = $derived(Math.floor(idx / per));
  const shown = $derived(items.slice(page * per, page * per + per));

  const step = (by: number) => onchange(items[(idx + by + items.length) % items.length].id);
</script>

<div class="picker">
  <div class="head">
    <span class="label">{label}</span>
    <span class="pick">{items[idx]?.name} <span class="count">{idx + 1}/{items.length}</span></span>
  </div>
  <div class="row">
    <button type="button" class="arrow" aria-label="Previous {label}" onclick={() => step(-1)}><ChevronLeft size={20} /></button>
    <div class="options" style:--per={per}>
      {#each shown as item (item.id)}
        {#if item.color}
          <button type="button" class="swatch" class:on={item.id === value} style:background={item.color} aria-label={item.name} onclick={() => onchange(item.id)}></button>
        {:else}
          <button type="button" class="pill" class:on={item.id === value} onclick={() => onchange(item.id)}>{item.name}</button>
        {/if}
      {/each}
    </div>
    <button type="button" class="arrow" aria-label="Next {label}" onclick={() => step(1)}><ChevronRight size={20} /></button>
  </div>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .pick {
    font-size: 0.9rem;
    font-weight: 600;
  }
  .count {
    margin-left: 0.3rem;
    font-weight: 400;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .arrow {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.2rem;
    height: 2.4rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .arrow:active {
    color: var(--text);
    background: var(--surface-3, var(--surface-2));
  }
  .options {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(var(--per), 1fr);
    gap: 0.35rem;
  }
  .pill {
    min-width: 0;
    padding: 0.5rem 0.2rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.8rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pill.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .swatch {
    justify-self: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 50%;
    border: 2px solid var(--border);
    padding: 0;
  }
  .swatch.on {
    border-color: var(--accent);
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  }
</style>
