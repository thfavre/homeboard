<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Coins, Crown, ShoppingBag, X } from '@lucide/svelte';
  import { attempt, hb, onEvent, rpc, storageGet, storageSet } from '$lib/client.svelte.ts';
  import { CATALOG, COLOR_HEX, TIER_NAMES, colorName, openSlots, slotsFor, splitColor, validWorn, type Outfit, type Slot, type WornItem } from '$shared/wardrobe.ts';
  import type { SheetInfo, WardrobeMine, WorldState } from '$shared/world.ts';
  import type { PreviewView } from './preview.ts';
  import KingCard from './KingCard.svelte';

  /**
   * The shop and wardrobe: pick a slot, scroll a picture grid of everything it sells, tap a piece
   * to try it on your own avatar, pick its color, then buy it or wear it. One view does both: an
   * owned piece shows Wear instead of a price.
   */

  /** Open on this slot instead of the one browsed last (the wardrobe's shop button) */
  let { startSlot = null, view }: { startSlot?: Slot | null; view: PreviewView } = $props();

  const mod = $derived(hb.modules.world as WorldState | undefined);
  const shop = $derived(mod?.shop);

  let wd = $state<WardrobeMine | null>(null);
  let body = $state<'male' | 'female' | null>(null);
  let slot = $state<Slot>('top');
  /** The King's title is shown instead of a slot's items */
  let kingTab = $state(false);
  /** The piece opened in the detail view (null: the grid) */
  let open = $state<WornItem | null>(null);
  /** Item pictures by id, fetched per slot and kept */
  let icons = $state<Record<string, string>>({});
  /** Pictures of the owned pieces in their own colors, keyed "id:color" */
  let colored = $state<Record<string, string>>({});

  /**
   * The color an item opens in and shows on its card: its own color when not owned, or owned among
   * others; else the worn color; else the color it was bought in
   */
  function colorOf(id: string): string | undefined {
    const item = CATALOG.find((i) => i.id === id);
    if (!item) return undefined;
    const mine = (wd?.owned ?? []).filter((o) => o.id === id).map((o) => o.color);
    const worn = wd?.outfit[slot];
    if (!mine.length || mine.includes(item.colors[0])) return item.colors[0];
    return worn?.id === id ? worn.color : mine[0];
  }
  function pictureOf(id: string): string | undefined {
    const color = colorOf(id);
    return (color && colored[`${id}:${color}`]) || icons[id];
  }
  const loadColored = () =>
    rpc<Record<string, string>>('world', 'ownedIcons')
      .then((urls) => (colored = urls))
      .catch(() => {});
  let url = $state<string | null>(null);
  let sheet = $state<SheetInfo | null>(null);
  let buildingCount = $state(0);
  let firstLoad = $state(true);

  /** Locked slots stay out of the shop until they open (the wardrobe tells what opens them), the
   *  secret one until it is found */
  const open_ = $derived(body && shop ? openSlots(wd?.owned ?? [], body, shop.unlockPieces, shop.secretPieces) : []);
  const slots = $derived(slotsFor(body).filter((s) => open_.includes(s.id)));
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
    arms: 'torso',
    shoulders: 'torso',
    costume: 'head',
  };
  const items = $derived(CATALOG.filter((i) => i.slot === slot && (!i.bodies || (body && i.bodies.includes(body)))));
  const openItem = $derived(open ? (CATALOG.find((i) => i.id === open!.id) ?? null) : null);
  /** The opened piece's colors in one row: its own color first, then the two-color ones ("navy+gold",
   *  so they never hide at the end of a long scroll), then the other single colors */
  const swatches = $derived.by(() => {
    const all = openItem?.colors ?? [];
    const rest = all.slice(1);
    return [...all.slice(0, 1), ...rest.filter((c) => !!splitColor(c)[1]), ...rest.filter((c) => !splitColor(c)[1])];
  });

  const ownedIs = (id: string, color?: string) => (wd?.owned ?? []).some((o) => o.id === id && (color === undefined || o.color === color));
  const isOwned = $derived(!!open && ownedIs(open.id, open.color));
  const isWorn = $derived(!!open && wd?.outfit[slot]?.id === open.id && wd?.outfit[slot]?.color === open.color);
  const price = $derived(openItem && shop ? shop.prices[openItem.tier] : 0);

  /** What the preview shows: the outfit with the opened piece in its slot */
  function candidate(piece: WornItem | null = open, at: Slot = slot): Outfit {
    const out: Outfit = { ...(wd?.outfit ?? {}) };
    if (!piece) return out;
    out[at] = { id: piece.id, color: piece.color };
    // A dress replaces top and bottom (and they replace it)
    if (at === 'dress') {
      delete out.top;
      delete out.bottom;
    }
    if (at === 'top' || at === 'bottom') delete out.dress;
    // A costume head replaces the hat (and a hat replaces it)
    if (at === 'costume') delete out.hat;
    if (at === 'hat') delete out.costume;
    return out;
  }

  /** Open a piece in the color its card shows (every piece starts fresh, whatever was picked before) */
  function show(id: string) {
    const item = CATALOG.find((i) => i.id === id);
    if (!item) return;
    open = { id, color: colorOf(id) ?? item.colors[0] };
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

  // The panel's shared preview shows the tried-on outfit, zoomed on the browsed slot
  $effect(() => {
    if (url && sheet) {
      view.url = url;
      view.sheet = sheet;
    }
    view.building = buildingCount > 0;
    view.focus = kingTab ? 'head' : FOCUS[slot];
    view.facing = slot === 'back' ? 'up' : 'down';
  });

  /** The opened piece survives leaving the panel, like the editor's drafts */
  const DRAFT_KEY = 'hb.world.shop';

  $effect(() => {
    // On the King's title: the guest tries the crown on
    const snapshot = JSON.stringify(kingTab && wd?.outfit.hat?.id !== 'crown' ? { ...candidate(null), hat: { id: 'crown', color: 'crown_gold' } } : candidate());
    const picks = JSON.stringify({ id: hb.me?.id, slot, open });
    if (firstLoad || !body) return;
    storageSet(DRAFT_KEY, picks);
    clearTimeout(debounce);
    debounce = setTimeout(() => void build(JSON.parse(snapshot)), 250);
    return () => clearTimeout(debounce);
  });

  // Loaded once connected (opened while offline, "no answer" is not "no avatar yet"); a failed load
  // is tried again on the next connection
  let loading = false;
  $effect(() => {
    if (!firstLoad || loading || !hb.connected) return;
    loading = true;
    void (async () => {
      try {
        const mine = await rpc<{ body: 'male' | 'female' } | null>('world', 'mine');
        body = mine?.body ?? null;
        wd = mine ? await rpc<WardrobeMine>('world', 'wardrobe') : null;
      } catch {
        loading = false;
        return;
      }
      void loadColored();
      try {
        const draft = JSON.parse(storageGet(DRAFT_KEY) ?? 'null');
        if (draft?.id === hb.me?.id) {
          if (slots.some((s) => s.id === draft.slot)) slot = draft.slot;
          // The catalog may have changed since: only a piece that still exists, in a color it still has
          const piece = validWorn(draft.open, body ?? undefined);
          if (piece && piece.item.slot === slot) open = { id: piece.id, color: piece.color };
        }
      } catch {
        // A broken draft is just dropped
      }
      if (startSlot && startSlot !== slot && slots.some((s) => s.id === startSlot)) {
        slot = startSlot;
        open = null;
      }
      firstLoad = false;
      if (body) void build(candidate());
    })();
  });

  onMount(() =>
    onEvent<{ balance: number }>('world', 'wallet', (w) => {
      if (wd) wd.balance = w.balance;
    }),
  );

  // ------------------------------------------------------------ actions

  /** A purchase or a wear is on its way: a second tap would buy the piece again (refused) */
  let busy = $state(false);

  async function buy() {
    // The piece and its slot as they are now: the guest may browse on while the purchase goes through
    const piece = open;
    const at = slot;
    if (!piece || busy) return;
    busy = true;
    try {
      const bought = await attempt(() => rpc<WardrobeMine>('world', 'buy', { id: piece.id, color: piece.color }));
      if (!bought) return;
      wd = bought;
      void loadColored();
      await putOn(piece, at);
    } finally {
      busy = false;
    }
  }

  async function wear() {
    if (busy) return;
    busy = true;
    try {
      await putOn(open, slot);
    } finally {
      busy = false;
    }
  }

  async function putOn(piece: WornItem | null, at: Slot) {
    const done = await attempt(() => rpc<WardrobeMine>('world', 'wear', { outfit: candidate(piece, at) }), 'On you');
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
    <div class="slots">
      {#each slots as s (s.id)}
        <button
          type="button"
          class="slot"
          class:on={!kingTab && slot === s.id}
          onclick={() => {
            slot = s.id;
            open = null;
            kingTab = false;
          }}
        >
          {s.name}
        </button>
      {/each}
      {#if mod?.king?.on}
        <button
          type="button"
          class="slot king"
          class:on={kingTab}
          onclick={() => {
            kingTab = true;
            open = null;
          }}
        >
          <Crown size={14} />King
        </button>
      {/if}
    </div>

    <div class="scroll">
    {#if kingTab}
      <KingCard balance={wd?.balance ?? null} />
    {:else}
    <div class="grid">
      {#each items as i (i.id)}
        <button
          type="button"
          class="item {i.tier}"
          class:on={open?.id === i.id}
          class:owned={ownedIs(i.id)}
          class:wearing={wd?.outfit[slot]?.id === i.id}
          onclick={() => show(i.id)}
        >
          <span class="pic">
            {#if pictureOf(i.id)}
              <img src={pictureOf(i.id)} alt={i.name} loading="lazy" />
            {/if}
          </span>
          <span class="iname">{i.name}</span>
          {#if wd?.outfit[slot]?.id === i.id}
            <span class="itag owned-tag"><Check size={12} />Wearing</span>
          {:else if ownedIs(i.id)}
            <span class="itag owned-tag"><Check size={12} />Owned</span>
          {:else}
            <span class="itag price {i.tier}">{shop.prices[i.tier]} <Coins size={13} /></span>
          {/if}
        </button>
      {/each}
    </div>
    {/if}
    </div>

    {#if open && openItem}
      <div class="sheet">
        <div class="deal">
          <div class="what">
            <span class="name">{openItem.name}</span>
            <span class="tier {openItem.tier}">{TIER_NAMES[openItem.tier]}</span>
          </div>
          {#if isWorn}
            <span class="wearing"><Check size={16} />Wearing</span>
          {:else if isOwned}
            <button type="button" class="btn primary" disabled={buildingCount > 0 || busy} onclick={wear}><Check size={18} />Wear</button>
          {:else}
            <button type="button" class="btn primary" disabled={buildingCount > 0 || busy} onclick={buy}>
              <ShoppingBag size={18} />
              Buy for {price} {shop.currencyName}
            </button>
          {/if}
          <button type="button" class="close" aria-label="Close" onclick={() => (open = null)}><X size={16} /></button>
        </div>
        {#snippet swatch(c: string)}
          <button
            type="button"
            class="swatch"
            class:on={open?.color === c}
            class:dot={ownedIs(openItem!.id, c)}
            style:background={COLOR_HEX[c] ?? '#888'}
            aria-label={colorName(c)}
            title={colorName(c)}
            onclick={() => (open = { id: openItem!.id, color: c })}
          ></button>
        {/snippet}
        <span class="cname">{colorName(open.color)}</span>
        <div class="colors">
          {#each swatches as c (c)}{@render swatch(c)}{/each}
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
  /* Two rows at most, filled column by column; more slots scroll sideways */
  .slots {
    display: grid;
    grid-template-rows: repeat(2, auto);
    grid-auto-flow: column;
    grid-auto-columns: max-content;
    gap: 0.35rem;
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .slots::-webkit-scrollbar {
    display: none;
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
  .slot.king {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--warning);
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
    isolation: isolate;
    overflow: hidden;
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
  .item > .iname {
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
  .owned-tag {
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
  /* Epic and legendary cards: a faint wash of their color rising from the bottom, and now and then
     a thin sheen of light sweeping across, behind the picture and the price */
  .item.epic {
    --glow: #b06ae0;
    --sheen: 8s;
    --sheen-alpha: 7%;
  }
  .item.legendary {
    --glow: #e8b83e;
    --sheen: 6s;
    --sheen-alpha: 13%;
  }
  /* Cheap cards lean a little brown, fancy ones a little blue (over the owned tint, if any) */
  .item.cheap::before,
  .item.fancy::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: inherit;
    pointer-events: none;
    background: color-mix(in srgb, var(--tint) 7%, transparent);
  }
  .item.cheap {
    --tint: #8a5a34;
  }
  .item.fancy {
    --tint: #4f8fe0;
  }
  .item.epic::before,
  .item.legendary::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(to top, color-mix(in srgb, var(--glow) 14%, transparent), transparent 55%);
  }
  .item.epic::after,
  .item.legendary::after {
    content: '';
    position: absolute;
    inset: -20% -60%;
    z-index: 0;
    pointer-events: none;
    background: linear-gradient(
      105deg,
      transparent 42%,
      color-mix(in srgb, #fff var(--sheen-alpha), transparent) 50%,
      transparent 58%
    );
    transform: translateX(-60%);
    animation: sheen var(--sheen) ease-in-out infinite;
  }
  @keyframes sheen {
    0%,
    70% {
      transform: translateX(-60%);
    }
    100% {
      transform: translateX(60%);
    }
  }
  /* The content stays above the wash and the sheen */
  .item > :global(*) {
    position: relative;
    z-index: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .item::after {
      animation: none !important;
      opacity: 0;
    }
  }
  /* Owned pieces get a frame in the accent color (the background stays the rarity's), the worn
     one a bolder frame */
  .item.owned {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
  }
  .item.wearing {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
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
  /* The name of the color tried on, above the swatches */
  .cname {
    margin-bottom: -0.3rem;
    font-size: 0.82rem;
    color: var(--text-dim);
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
  /* Bought pieces are worn at once; taking them off happens in the wardrobe */
  .wearing {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0 0.4rem;
    font-weight: 600;
    color: var(--accent);
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
