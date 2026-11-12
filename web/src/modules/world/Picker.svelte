<script lang="ts">
  import { tick } from 'svelte';

  /**
   * An option picker for the avatar editor, for groups with too many options for one row: the
   * header names the current pick and its place (7/26), and the row of options scrolls sideways,
   * with a finger, a mouse wheel or by dragging with the mouse. The picked option scrolls into view.
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
    onchange,
  }: {
    label: string;
    items: Item[];
    value: string;
    onchange: (id: string) => void;
  } = $props();

  const idx = $derived(Math.max(0, items.findIndex((i) => i.id === value)));

  let row = $state<HTMLDivElement>();
  /** The pick stays in view (on opening, and when it changes from elsewhere, like Cancel) */
  $effect(() => {
    void value;
    void tick().then(() => {
      const el = row?.querySelector<HTMLElement>('.on');
      if (!row || !el) return;
      // Centered in the row, measured on screen (the row is not the option's offset parent)
      const r = row.getBoundingClientRect();
      const o = el.getBoundingClientRect();
      row.scrollLeft += o.left + o.width / 2 - (r.left + r.width / 2);
    });
  });

  // A mouse wheel scrolls the row sideways
  function wheel(e: WheelEvent) {
    if (!row || Math.abs(e.deltaX) > Math.abs(e.deltaY) || row.scrollWidth <= row.clientWidth) return;
    const atStart = row.scrollLeft <= 0 && e.deltaY < 0;
    const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1 && e.deltaY > 0;
    // At either end the page scrolls on, so the wheel never gets stuck on the row
    if (atStart || atEnd) return;
    e.preventDefault();
    row.scrollLeft += e.deltaY;
  }

  // Dragging with the mouse scrolls too (fingers scroll natively); a drag is not a tap
  let drag = $state<{ x: number; left: number; moved: boolean } | null>(null);
  function down(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !row) return;
    drag = { x: e.clientX, left: row.scrollLeft, moved: false };
  }
  function move(e: PointerEvent) {
    if (!drag || !row) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    if (drag.moved) row.scrollLeft = drag.left - dx;
  }
  function up() {
    // Cleared after the click that ends a drag, which pick then ignores
    setTimeout(() => (drag = null));
  }
  function pick(id: string) {
    if (drag?.moved) return;
    onchange(id);
  }
</script>

<div class="picker">
  <div class="head">
    <span class="label">{label}</span>
    <span class="pick">{items[idx]?.name} <span class="count">{idx + 1}/{items.length}</span></span>
  </div>
  <div
    class="options"
    class:dragging={drag?.moved}
    bind:this={row}
    onwheel={wheel}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointerleave={up}
    role="listbox"
    tabindex="-1"
    aria-label={label}
  >
    {#each items as item (item.id)}
      {#if item.color}
        <button
          type="button"
          class="swatch"
          class:on={item.id === value}
          style:background={item.color}
          aria-label={item.name}
          role="option"
          aria-selected={item.id === value}
          onclick={() => pick(item.id)}
        ></button>
      {:else}
        <button type="button" class="pill" class:on={item.id === value} role="option" aria-selected={item.id === value} onclick={() => pick(item.id)}>{item.name}</button>
      {/if}
    {/each}
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
  /* One row of every option, scrolling sideways; the edges fade so it reads as more to scroll */
  .options {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    padding: 0.2rem 0.15rem;
    mask-image: linear-gradient(to right, transparent, #000 1.2rem, #000 calc(100% - 1.2rem), transparent);
    cursor: grab;
    user-select: none;
  }
  .options::-webkit-scrollbar {
    display: none;
  }
  .options.dragging {
    cursor: grabbing;
  }
  .options > :first-child {
    margin-left: 0.6rem;
  }
  .options > :last-child {
    margin-right: 0.6rem;
  }
  .pill {
    flex: none;
    min-width: 5.2rem;
    padding: 0.55rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.85rem;
    text-align: center;
    justify-content: center;
    white-space: nowrap;
  }
  .pill.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .swatch {
    flex: none;
    width: 2.3rem;
    height: 2.3rem;
    border-radius: 50%;
    border: 2px solid var(--border);
    padding: 0;
  }
  .swatch.on {
    border-color: var(--accent);
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  }
</style>
