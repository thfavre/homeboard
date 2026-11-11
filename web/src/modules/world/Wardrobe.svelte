<script lang="ts">
  import { onMount } from 'svelte';
  import { Ban, Shirt, ShoppingBag } from '@lucide/svelte';
  import { attempt, onEvent, rpc } from '$lib/client.svelte.ts';
  import { COLOR_HEX, SLOTS, colorName, itemById, type Outfit, type Slot, type WardrobeItem } from '$shared/wardrobe.ts';
  import type { SheetInfo, WardrobeMine } from '$shared/world.ts';
  import AvatarPreview from './AvatarPreview.svelte';

  /**
   * The closet: everything the guest bought, sorted by slot. The strip on top is the outfit at a
   * glance (one tile per slot, showing what is worn there) and picks the slot; below it, the
   * pieces owned for that slot. Tap a piece to wear it (Nothing leaves the slot empty) and switch
   * between the colors you own of it. Buying happens in the shop.
   */

  let { onshop }: { onshop?: (slot: Slot) => void } = $props();

  let wd = $state<WardrobeMine | null>(null);
  let body = $state<'male' | 'female' | null>(null);
  let slot = $state<Slot>('top');
  let icons = $state<Record<string, string>>({});
  let url = $state<string | null>(null);
  let sheet = $state<SheetInfo | null>(null);
  let buildingCount = $state(0);
  let busy = $state(false);
  let loaded = $state(false);

  /** Where the preview zooms for a slot, as in the shop */
  const FOCUS: Record<Slot, 'head' | 'torso' | 'legs' | 'feet' | null> = {
    hat: 'head',
    face: 'head',
    neck: 'torso',
    top: 'torso',
    bottom: 'legs',
    feet: 'feet',
    dress: null,
    back: null,
  };

  const slots = $derived(SLOTS.filter((s) => s.id !== 'dress' || body === 'female'));
  const slotName = $derived(SLOTS.find((s) => s.id === slot)?.name ?? '');

  /** Owned pieces grouped by item, with the colors owned of each */
  const closet = $derived.by(() => {
    const bySlot = new Map<Slot, { item: WardrobeItem; colors: string[] }[]>();
    for (const o of wd?.owned ?? []) {
      const item = itemById(o.id);
      if (!item) continue;
      const list = bySlot.get(item.slot) ?? [];
      const entry = list.find((e) => e.item.id === item.id);
      if (entry) entry.colors.push(o.color);
      else list.push({ item, colors: [o.color] });
      bySlot.set(item.slot, list);
    }
    // Colors in the catalog's order, so the swatches never jump around
    for (const list of bySlot.values()) {
      for (const e of list) e.colors.sort((a, b) => e.item.colors.indexOf(a) - e.item.colors.indexOf(b));
    }
    return bySlot;
  });
  const pieces = $derived(closet.get(slot) ?? []);
  const worn = $derived(wd?.outfit[slot] ?? null);
  const wornEntry = $derived(worn ? (pieces.find((p) => p.item.id === worn.id) ?? null) : null);
  const ownedCount = $derived((wd?.owned ?? []).length);

  // ------------------------------------------------------------ preview

  let wanted = '';
  async function build(outfit: Outfit): Promise<void> {
    const key = JSON.stringify(outfit);
    wanted = key;
    buildingCount++;
    try {
      const r = await rpc<{ url: string; sheet: SheetInfo }>('world', 'preview', { outfit });
      if (wanted === key) {
        url = r.url;
        sheet = r.sheet;
      }
    } catch {
      // The last preview stays
    } finally {
      buildingCount--;
    }
  }

  onMount(() => {
    void (async () => {
      const mine = await rpc<{ body: 'male' | 'female' } | null>('world', 'mine').catch(() => null);
      body = mine?.body ?? null;
      wd = await rpc<WardrobeMine>('world', 'wardrobe').catch(() => null);
      // Open on the first slot that has something in it
      const first = slots.find((s) => wd?.outfit[s.id]) ?? slots.find((s) => closet.has(s.id));
      if (first) slot = first.id;
      loaded = true;
      if (body && wd) void build($state.snapshot(wd.outfit) as Outfit);
      for (const s of closet.keys()) {
        rpc<Record<string, string>>('world', 'icons', { slot: s })
          .then((urls) => (icons = { ...icons, ...urls }))
          .catch(() => {});
      }
    })();
    return onEvent<{ balance: number }>('world', 'wallet', (w) => {
      if (wd) wd.balance = w.balance;
    });
  });

  // ------------------------------------------------------------ actions

  async function apply(outfit: Outfit) {
    if (busy) return;
    busy = true;
    void build(outfit);
    const done = await attempt(() => rpc<WardrobeMine>('world', 'wear', { outfit }));
    busy = false;
    if (done) wd = done;
    else if (wd) void build($state.snapshot(wd.outfit) as Outfit);
  }

  function wear(id: string, color: string) {
    const outfit: Outfit = { ...($state.snapshot(wd?.outfit) ?? {}) };
    outfit[slot] = { id, color };
    // A dress replaces top and bottom (and they replace it)
    if (slot === 'dress') {
      delete outfit.top;
      delete outfit.bottom;
    }
    if (slot === 'top' || slot === 'bottom') delete outfit.dress;
    void apply(outfit);
  }

  function takeOff() {
    const outfit: Outfit = { ...($state.snapshot(wd?.outfit) ?? {}) };
    delete outfit[slot];
    void apply(outfit);
  }

  /** Tapping a piece wears it in its first owned color; the sheet switches between the others */
  function tap(p: { item: WardrobeItem; colors: string[] }) {
    if (worn?.id === p.item.id) return;
    wear(p.item.id, p.colors[0]);
  }
</script>

{#if !loaded}
  <p class="faint">Opening the wardrobe...</p>
{:else if !body}
  <div class="empty">
    <Shirt size={28} />
    <p class="faint">Make your look first, then fill your wardrobe.</p>
  </div>
{:else if !ownedCount}
  <div class="empty">
    <Shirt size={28} />
    <p class="faint">Your wardrobe is empty. Everything you buy in the shop lands here.</p>
    <button type="button" class="btn primary" onclick={() => onshop?.('top')}><ShoppingBag size={18} />Go shopping</button>
  </div>
{:else}
  <div class="wardrobe">
    <AvatarPreview {url} {sheet} building={buildingCount > 0} focus={FOCUS[slot]} facing={slot === 'back' ? 'up' : 'down'} />

    <span class="label">Wearing</span>
    <div class="outfit" role="tablist" aria-label="Slots">
      {#each slots as s (s.id)}
        {@const w = wd?.outfit[s.id]}
        {@const count = closet.get(s.id)?.length ?? 0}
        <button
          type="button"
          role="tab"
          aria-selected={slot === s.id}
          class="slot"
          class:on={slot === s.id}
          class:none={!count}
          onclick={() => (slot = s.id)}
        >
          <span class="spic">
            {#if w && icons[w.id]}
              <img src={icons[w.id]} alt="" />
            {:else}
              <span class="blank"></span>
            {/if}
            {#if w}<span class="wcolor" style:background={COLOR_HEX[w.color] ?? '#888'}></span>{/if}
          </span>
          <span class="sname">{s.name}</span>
          {#if count}<span class="count">{count}</span>{/if}
        </button>
      {/each}
    </div>

    <section class="closet">
      <div class="chead">
        <span class="ctitle">My {slotName.toLowerCase()}<span class="faint">{pieces.length ? ` · ${pieces.length}` : ''}</span></span>
        <button type="button" class="shoplink" onclick={() => onshop?.(slot)}><ShoppingBag size={15} />Buy more</button>
      </div>
      {#if pieces.length}
        <div class="scroll">
        <div class="grid">
          <!-- Nothing: the slot left empty -->
          <button type="button" class="piece" class:worn={!worn} disabled={busy} onclick={() => worn && takeOff()}>
            <span class="pic"><Ban size={30} strokeWidth={1.5} /></span>
            <span class="pname">Nothing</span>
            <span class="dots"></span>
          </button>
          {#each pieces as p (p.item.id)}
            <button type="button" class="piece" class:worn={worn?.id === p.item.id} disabled={busy} onclick={() => tap(p)}>
              <span class="pic">
                {#if icons[p.item.id]}
                  <img src={icons[p.item.id]} alt={p.item.name} loading="lazy" />
                {/if}
              </span>
              <span class="pname">{p.item.name}</span>
              <span class="dots">
                {#each p.colors as c (c)}
                  <span class="dot" class:cur={worn?.id === p.item.id && worn.color === c} style:background={COLOR_HEX[c] ?? '#888'}></span>
                {/each}
              </span>
            </button>
          {/each}
        </div>
        </div>
      {:else}
        <p class="faint none-yet">Nothing here yet. The shop has some.</p>
      {/if}
    </section>

    <!-- The colors you own of the worn piece, to switch between -->
    {#if worn && wornEntry && wornEntry.colors.length > 1}
      <div class="sheet">
        <span class="name">{wornEntry.item.name}<span class="faint"> · {colorName(worn.color).toLowerCase()}</span></span>
        <div class="colors">
          {#each wornEntry.colors as c (c)}
            <button
              type="button"
              class="swatch"
              class:on={worn.color === c}
              style:background={COLOR_HEX[c] ?? '#888'}
              aria-label={colorName(c)}
              disabled={busy}
              onclick={() => worn.color !== c && wear(wornEntry.item.id, c)}
            ></button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .wardrobe {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .wardrobe > :global(*) {
    flex: none;
  }
  .empty {
    display: grid;
    place-items: center;
    gap: 0.6rem;
    padding: 2rem 0;
    color: var(--text-dim);
    text-align: center;
  }
  .empty p {
    margin: 0;
    max-width: 18rem;
  }

  /* ------------------------------------------------------------ the outfit strip */
  .outfit {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
  }
  .slot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.4rem 0.2rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    min-width: 0;
  }
  .slot.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .slot.none {
    color: var(--text-dim);
  }
  .slot.none:not(.on) .spic {
    opacity: 0.5;
  }
  .spic {
    position: relative;
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
  }
  .spic img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }
  .blank {
    width: 1.7rem;
    height: 1.7rem;
    border: 1.5px dashed var(--border);
    border-radius: 50%;
  }
  .wcolor {
    position: absolute;
    right: -0.1rem;
    bottom: 0;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    border: 1px solid var(--border);
  }
  .sname {
    font-size: 0.74rem;
    font-weight: 600;
  }
  .count {
    position: absolute;
    top: 0.2rem;
    right: 0.3rem;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }

  .label {
    margin-bottom: -0.5rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ------------------------------------------------------------ the pieces */
  /* The panel takes the room left and only its pieces scroll */
  .wardrobe > .closet {
    flex: 1;
    min-height: 0;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin: -0.2rem;
    padding: 0.2rem;
  }
  .closet {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .chead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .ctitle {
    font-weight: 700;
  }
  .ctitle .faint {
    font-weight: 600;
  }
  .shoplink {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.55rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.82rem;
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.8rem, 1fr));
    grid-auto-rows: 1fr;
    gap: 0.5rem;
  }
  .piece {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.3rem 0.3rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    min-width: 0;
  }
  .piece.worn {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .pic {
    display: grid;
    place-items: center;
    width: 100%;
    height: 7.2rem;
  }
  .pic img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }
  /* The name sits over the top of the picture, outlined so it reads on any art */
  .pname {
    position: absolute;
    top: 0.35rem;
    left: 0.3rem;
    right: 0.3rem;
    z-index: 1;
    pointer-events: none;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.15;
    text-align: center;
    color: #fff;
    text-shadow:
      -1px -1px 0 #000,
      1px -1px 0 #000,
      -1px 1px 0 #000,
      1px 1px 0 #000,
      0 0 3px #000;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .dots {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.2rem;
    min-height: 0.7rem;
  }
  .dot {
    width: 0.62rem;
    height: 0.62rem;
    border-radius: 50%;
    border: 1px solid var(--border);
  }
  .dot.cur {
    outline: 1.5px solid var(--accent);
    outline-offset: 1px;
  }
  .none-yet {
    margin: 0;
    padding: 0.8rem 0;
    text-align: center;
  }

  /* ------------------------------------------------------------ the worn piece */
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--border-strong, var(--border));
    border-radius: var(--radius);
    background:
      linear-gradient(var(--surface-2), var(--surface-2)),
      var(--bg);
    box-shadow: var(--shadow);
  }
  .name {
    font-weight: 600;
  }
  .name .faint {
    font-weight: 500;
  }
  .pic :global(svg) {
    color: var(--text-dim);
  }
  .colors {
    display: flex;
    gap: 0.45rem;
    overflow-x: auto;
    padding: 0.15rem 0.1rem 0.25rem;
  }
  .swatch {
    flex: none;
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
