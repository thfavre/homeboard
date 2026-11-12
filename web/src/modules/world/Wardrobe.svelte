<script lang="ts">
  import { onMount } from 'svelte';
  import { Ban, Shirt, ShoppingBag } from '@lucide/svelte';
  import { attempt, onEvent, rpc } from '$lib/client.svelte.ts';
  import { COLOR_HEX, SLOTS, colorName, itemById, type Outfit, type Slot, type WardrobeItem } from '$shared/wardrobe.ts';
  import type { SheetInfo, WardrobeMine } from '$shared/world.ts';
  import type { PreviewView } from './preview.ts';

  /**
   * The closet: everything the guest bought, sorted by slot. The strip on top is the outfit at a
   * glance (one tile per slot, showing what is worn there) and picks the slot; below it, the
   * pieces owned for that slot. Tap a piece to wear it (Nothing leaves the slot empty); a piece
   * owned in several colors turns into a square per color to pick from. Buying happens in the shop.
   */

  let { onshop, view }: { onshop?: (slot: Slot) => void; view: PreviewView } = $props();

  let wd = $state<WardrobeMine | null>(null);
  let body = $state<'male' | 'female' | null>(null);
  let slot = $state<Slot>('top');
  let icons = $state<Record<string, string>>({});
  /** Pictures of the owned pieces in their own colors, keyed "id:color" */
  let colored = $state<Record<string, string>>({});
  /** Counts up every 3 seconds: cards of pieces owned in several colors fade through them */
  let tick = $state(0);

  /** The picture of a piece in a color, the plain one until the colored one is there */
  const pictureOf = (id: string, color: string) => colored[`${id}:${color}`] ?? icons[id];
  /** The color a card shows now: the worn one for the worn piece, else the next in turn */
  function shownColor(p: { item: WardrobeItem; colors: string[] }): string {
    if (worn?.id === p.item.id) return worn.color;
    return p.colors[tick % p.colors.length];
  }
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
    // Colors in the catalog's order, so the squares never jump around
    for (const list of bySlot.values()) {
      for (const e of list) e.colors.sort((a, b) => e.item.colors.indexOf(a) - e.item.colors.indexOf(b));
    }
    return bySlot;
  });
  const pieces = $derived(closet.get(slot) ?? []);
  const worn = $derived(wd?.outfit[slot] ?? null);
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

  // The panel's shared preview shows the worn outfit, zoomed on the picked slot
  $effect(() => {
    if (url && sheet) {
      view.url = url;
      view.sheet = sheet;
    }
    view.building = buildingCount > 0;
    view.focus = FOCUS[slot];
    view.facing = slot === 'back' ? 'up' : 'down';
  });

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
      rpc<Record<string, string>>('world', 'ownedIcons')
        .then((urls) => (colored = urls))
        .catch(() => {});
      for (const s of closet.keys()) {
        rpc<Record<string, string>>('world', 'icons', { slot: s })
          .then((urls) => (icons = { ...icons, ...urls }))
          .catch(() => {});
      }
    })();
    const timer = setInterval(() => tick++, 3000);
    const off = onEvent<{ balance: number }>('world', 'wallet', (w) => {
      if (wd) wd.balance = w.balance;
    });
    return () => {
      clearInterval(timer);
      off();
    };
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

  /** The piece whose card shows its owned colors to pick from (null: none) */
  let picking = $state<string | null>(null);
  $effect(() => {
    void slot;
    picking = null;
  });

  /** One color: wear it. Several: the card turns into a square per owned color */
  function tap(p: { item: WardrobeItem; colors: string[] }) {
    if (p.colors.length > 1) {
      picking = p.item.id;
      return;
    }
    picking = null;
    if (worn?.id !== p.item.id) wear(p.item.id, p.colors[0]);
  }

  function pick(id: string, color: string) {
    picking = null;
    if (worn?.id !== id || worn.color !== color) wear(id, color);
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
            {#if w && pictureOf(w.id, w.color)}
              <img src={pictureOf(w.id, w.color)} alt="" />
            {:else}
              <span class="blank"></span>
            {/if}
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
          <button type="button" class="piece" class:worn={!worn} disabled={busy} onclick={() => ((picking = null), worn && takeOff())}>
            <span class="pic"><Ban size={30} strokeWidth={1.5} /></span>
            <span class="pname">Nothing</span>
            <span class="dots"></span>
          </button>
          {#each pieces as p (p.item.id)}
            <!-- While picking, the color squares lie over the card, so its size never changes -->
            <div class="cell">
              <button type="button" class="piece" class:worn={worn?.id === p.item.id} disabled={busy} onclick={() => tap(p)}>
                <!-- One picture per owned color, stacked: the shown one fades in over the others -->
                <span class="pic stack">
                  {#each p.colors as c (c)}
                    {#if pictureOf(p.item.id, c)}
                      <img src={pictureOf(p.item.id, c)} alt={c === shownColor(p) ? p.item.name : ''} class:shown={c === shownColor(p)} />
                    {/if}
                  {/each}
                </span>
                <span class="pname">{p.item.name}</span>
                <span class="dots">
                  {#if p.colors.length > 1}
                    {#each p.colors as c (c)}
                      <span class="dot" class:cur={c === shownColor(p)} style:background={COLOR_HEX[c] ?? '#888'}></span>
                    {/each}
                  {/if}
                </span>
              </button>
              {#if picking === p.item.id}
                <div class="picker" class:worn={worn?.id === p.item.id}>
                  <span class="pname">{p.item.name}</span>
                  <div class="squares" style:--cols={p.colors.length <= 4 ? 2 : 3}>
                    {#each p.colors as c (c)}
                      <button
                        type="button"
                        class="square"
                        class:on={worn?.id === p.item.id && worn.color === c}
                        style:background={COLOR_HEX[c] ?? '#888'}
                        aria-label={colorName(c)}
                        disabled={busy}
                        onclick={() => pick(p.item.id, c)}
                      ></button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        </div>
      {:else}
        <p class="faint none-yet">Nothing here yet. The shop has some.</p>
      {/if}
    </section>

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
    gap: 0;
    padding: 0.15rem 0.2rem 0.3rem;
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
  /* The worn piece's picture, as big as the tile allows (the tile keeps its size) */
  .spic {
    position: relative;
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
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
  .sname {
    font-size: 1.05rem;
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
    position: relative;
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
  .cell {
    position: relative;
    display: grid;
  }
  /* The color picker laid over a card: one square per owned color */
  .picker {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    padding: 1.9rem 0.45rem 0.45rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    /* The theme's surface can be see-through: lay it on the page color so the card below hides */
    background:
      linear-gradient(var(--surface-2), var(--surface-2)),
      var(--bg);
  }
  .squares {
    flex: 1;
    width: 100%;
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-auto-rows: 1fr;
    gap: 0.35rem;
    min-height: 0;
  }
  .square {
    padding: 0;
    min-height: 0;
    border: 2px solid color-mix(in srgb, #000 25%, transparent);
    border-radius: var(--radius-sm);
  }
  .square.on {
    border-color: var(--accent);
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
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
  .stack {
    position: relative;
  }
  .stack img {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.8s ease;
  }
  .stack img.shown {
    opacity: 1;
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
  /* Always one row: with many colors the dots shrink instead of wrapping (the card keeps its height) */
  .dots {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.2rem;
    width: 100%;
    height: 0.75rem;
    padding: 0 0.2rem;
  }
  .dot {
    flex: 0 1 0.62rem;
    min-width: 0.3rem;
    aspect-ratio: 1;
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
  .pic :global(svg) {
    color: var(--text-dim);
  }
</style>
