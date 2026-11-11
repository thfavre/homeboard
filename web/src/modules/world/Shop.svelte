<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Coins, ShoppingBag, X } from '@lucide/svelte';
  import { attempt, hb, onEvent, rpc, storageGet, storageSet } from '$lib/client.svelte.ts';
  import { CATALOG, COLOR_HEX, SLOTS, TIER_NAMES, colorName, type Outfit, type Slot, type WornItem } from '$shared/wardrobe.ts';
  import type { SheetInfo, WardrobeMine, WorldState } from '$shared/world.ts';
  import AvatarPreview from './AvatarPreview.svelte';

  /**
   * The shop and wardrobe: pick a slot, scroll a picture grid of everything it sells, tap a piece
   * to try it on your own avatar, pick its color, then buy it or wear it. One view does both: an
   * owned piece shows Wear instead of a price.
   */

  /** Open on this slot instead of the one browsed last (the wardrobe's shop button) */
  let { startSlot = null }: { startSlot?: Slot | null } = $props();

  const mod = $derived(hb.modules.world as WorldState | undefined);
  const shop = $derived(mod?.shop);

  let wd = $state<WardrobeMine | null>(null);
  let body = $state<'male' | 'female' | null>(null);
  let slot = $state<Slot>('top');
  /** The piece opened in the detail view (null: the grid) */
  let open = $state<WornItem | null>(null);
  /** The swatch picked while browsing this slot: the next items open in it too (reset per slot) */
  let pickedColor = $state<string | null>(null);
  /** Item pictures by id, fetched per slot and kept */
  let icons = $state<Record<string, string>>({});
  let url = $state<string | null>(null);
  let sheet = $state<SheetInfo | null>(null);
  let buildingCount = $state(0);
  let firstLoad = $state(true);

  const slots = $derived(SLOTS.filter((s) => s.id !== 'dress' || body === 'female'));
  /** Where the preview zooms while browsing a slot */
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
  const items = $derived(CATALOG.filter((i) => i.slot === slot && (!i.bodies || (body && i.bodies.includes(body)))));
  const openItem = $derived(open ? (CATALOG.find((i) => i.id === open!.id) ?? null) : null);

  const ownedIs = (id: string, color?: string) => (wd?.owned ?? []).some((o) => o.id === id && (color === undefined || o.color === color));
  const isOwned = $derived(!!open && ownedIs(open.id, open.color));
  const isWorn = $derived(!!open && wd?.outfit[slot]?.id === open.id && wd?.outfit[slot]?.color === open.color);
  const price = $derived(openItem && shop ? shop.prices[openItem.tier] : 0);

  /** What the preview shows: the outfit with the opened piece in its slot */
  function candidate(): Outfit {
    const out: Outfit = { ...(wd?.outfit ?? {}) };
    if (!open) return out;
    out[slot] = { id: open.id, color: open.color };
    // A dress replaces top and bottom (and they replace it)
    if (slot === 'dress') {
      delete out.top;
      delete out.bottom;
    }
    if (slot === 'top' || slot === 'bottom') delete out.dress;
    return out;
  }

  /** Open a piece: in the color picked in this slot, else worn, else owned, else its first */
  function show(id: string) {
    const item = CATALOG.find((i) => i.id === id);
    if (!item) return;
    const worn = wd?.outfit[slot];
    const color =
      pickedColor && item.colors.includes(pickedColor)
        ? pickedColor
        : worn?.id === id
          ? worn.color
          : ((wd?.owned ?? []).find((o) => o.id === id)?.color ?? item.colors[0]);
    open = { id, color };
  }

  // ------------------------------------------------------------ pictures and preview

  const fetchedSlots = new Set<string>();
  $effect(() => {
    const s = slot;
    if (!body || fetchedSlots.has(s)) return;
    fetchedSlots.add(s);
    rpc<Record<string, string>>('world', 'icons', { slot: s })
      .then((urls) => (icons = { ...icons, ...urls }))
      .catch(() => fetchedSlots.delete(s));
  });

  let debounce: ReturnType<typeof setTimeout> | undefined;
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
      // No avatar yet, or a broken piece: the last preview stays
    } finally {
      buildingCount--;
    }
  }

  /** The opened piece survives leaving the panel, like the editor's drafts */
  const DRAFT_KEY = 'hb.world.shop';

  $effect(() => {
    const snapshot = JSON.stringify(candidate());
    const picks = JSON.stringify({ id: hb.me?.id, slot, open });
    if (firstLoad || !body) return;
    storageSet(DRAFT_KEY, picks);
    clearTimeout(debounce);
    debounce = setTimeout(() => void build(JSON.parse(snapshot)), 250);
    return () => clearTimeout(debounce);
  });

  onMount(() => {
    void (async () => {
      const mine = await rpc<{ body: 'male' | 'female' } | null>('world', 'mine').catch(() => null);
      body = mine?.body ?? null;
      wd = await rpc<WardrobeMine>('world', 'wardrobe').catch(() => null);
      try {
        const draft = JSON.parse(storageGet(DRAFT_KEY) ?? 'null');
        if (draft?.id === hb.me?.id) {
          if (SLOTS.some((s) => s.id === draft.slot)) slot = draft.slot;
          if (draft.open?.id) open = draft.open;
        }
      } catch {
        // A broken draft is just dropped
      }
      if (startSlot && startSlot !== slot) {
        slot = startSlot;
        open = null;
      }
      firstLoad = false;
      if (body) void build(candidate());
    })();
    return onEvent<{ balance: number }>('world', 'wallet', (w) => {
      if (wd) wd.balance = w.balance;
    });
  });

  // ------------------------------------------------------------ actions

  async function buy() {
    const piece = open;
    if (!piece) return;
    const bought = await attempt(() => rpc<WardrobeMine>('world', 'buy', { id: piece.id, color: piece.color }));
    if (!bought) return;
    wd = bought;
    await wear();
  }

  async function wear() {
    const done = await attempt(() => rpc<WardrobeMine>('world', 'wear', { outfit: candidate() }), 'On you');
    if (done) wd = done;
  }

  async function takeOff() {
    const outfit: Outfit = { ...(wd?.outfit ?? {}) };
    delete outfit[slot];
    const done = await attempt(() => rpc<WardrobeMine>('world', 'wear', { outfit }));
    if (done) wd = done;
  }
</script>

{#if !shop}
  <p class="faint">The shop is closed.</p>
{:else if firstLoad}
  <p class="faint">Opening the shop...</p>
{:else if !body}
  <div class="closed">
    <ShoppingBag size={28} />
    <p class="faint">Make your look first, then come shopping.</p>
  </div>
{:else}
  <div class="shop">
    <div class="balance-row">
      <span class="balance"><Coins size={16} />{wd?.balance ?? 0} {shop.currencyName}</span>
      <span class="faint small">You earn them by being in the town</span>
    </div>

    <AvatarPreview {url} {sheet} building={buildingCount > 0} focus={FOCUS[slot]} facing={slot === 'back' ? 'up' : 'down'} />

    <div class="slots">
      {#each slots as s (s.id)}
        <button
          type="button"
          class="slot"
          class:on={slot === s.id}
          onclick={() => {
            slot = s.id;
            open = null;
            pickedColor = null;
          }}
        >
          {s.name}
          {#if wd?.outfit[s.id]}<span class="worn-dot"></span>{/if}
        </button>
      {/each}
    </div>

    <div class="scroll">
    <div class="grid">
      {#each items as i (i.id)}
        <button type="button" class="item" class:on={open?.id === i.id} class:worn={wd?.outfit[slot]?.id === i.id} onclick={() => show(i.id)}>
          <span class="pic">
            {#if icons[i.id]}
              <img src={icons[i.id]} alt={i.name} loading="lazy" />
            {/if}
          </span>
          <span class="iname">{i.name}</span>
          {#if wd?.outfit[slot]?.id === i.id}
            <span class="itag worn-tag">Worn</span>
          {:else if ownedIs(i.id)}
            <span class="itag owned-tag"><Check size={12} />Owned</span>
          {:else}
            <span class="itag price {i.tier}">{shop.prices[i.tier]} <Coins size={13} /></span>
          {/if}
        </button>
      {/each}
    </div>
    </div>

    {#if open && openItem}
      <div class="sheet">
        <div class="deal">
          <div class="what">
            <span class="name">{openItem.name}</span>
            <span class="tier {openItem.tier}">{TIER_NAMES[openItem.tier]}</span>
          </div>
          {#if isWorn}
            <button type="button" class="btn" onclick={takeOff}><X size={18} />Take off</button>
          {:else if isOwned}
            <button type="button" class="btn primary" disabled={buildingCount > 0} onclick={wear}><Check size={18} />Wear</button>
          {:else}
            <button type="button" class="btn primary" disabled={buildingCount > 0} onclick={buy}>
              <ShoppingBag size={18} />
              Buy for {price} {shop.currencyName}
            </button>
          {/if}
          <button type="button" class="close" aria-label="Close" onclick={() => (open = null)}><X size={16} /></button>
        </div>
        <div class="colors">
          {#each openItem.colors as c (c)}
            <button
              type="button"
              class="swatch"
              class:on={open.color === c}
              class:dot={ownedIs(openItem.id, c)}
              style:background={COLOR_HEX[c] ?? '#888'}
              aria-label={colorName(c)}
              onclick={() => {
                open = { id: openItem.id, color: c };
                pickedColor = c;
              }}
            ></button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .shop {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .shop > :global(*) {
    flex: none;
  }
  /* Only the item list scrolls; the padding keeps the picked card's outline visible */
  .shop > .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin: -0.2rem;
    padding: 0.2rem;
  }
  .closed {
    display: grid;
    place-items: center;
    gap: 0.5rem;
    padding: 2rem 0;
    color: var(--text-dim);
  }
  .balance-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .balance {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .small {
    font-size: 0.82rem;
  }
  .slots {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .slot {
    position: relative;
    padding: 0.4rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.85rem;
  }
  .slot.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .worn-dot {
    position: absolute;
    top: 0.22rem;
    right: 0.22rem;
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 50%;
    background: var(--accent);
  }

  /* ------------------------------------------------------------ the grid */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.8rem, 1fr));
    grid-auto-rows: 1fr;
    gap: 0.5rem;
  }
  .item {
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
  .item.worn {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
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
  .iname {
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
  .itag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .owned-tag,
  .worn-tag {
    color: var(--accent);
    font-weight: 600;
  }
  .price.epic {
    color: #b06ae0;
  }
  .price.legendary {
    color: #d9a732;
  }

  /* ------------------------------------------------------------ the tried-on piece */
  .item.on {
    border-color: var(--accent);
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  }
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
  .close {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
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
    position: relative;
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
  .swatch.dot::after {
    content: '';
    position: absolute;
    top: -0.1rem;
    right: -0.1rem;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--accent);
    outline: 2px solid var(--surface-1, var(--surface-2));
  }
  .deal {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .what {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .name {
    font-weight: 600;
  }
  .tier {
    font-size: 0.78rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .tier.fancy {
    color: var(--accent);
  }
  .tier.epic {
    color: #b06ae0;
  }
  .tier.legendary {
    color: #d9a732;
  }
</style>
