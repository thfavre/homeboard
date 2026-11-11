<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Coins, ShoppingBag, X } from '@lucide/svelte';
  import { attempt, hb, onEvent, rpc, storageGet, storageSet } from '$lib/client.svelte.ts';
  import {
    CATALOG,
    COLOR_HEX,
    SLOTS,
    TIER_NAMES,
    colorName,
    type Outfit,
    type Slot,
    type WardrobeItem,
    type WornItem,
  } from '$shared/wardrobe.ts';
  import type { SheetInfo, WardrobeMine, WorldState } from '$shared/world.ts';
  import AvatarPreview from './AvatarPreview.svelte';
  import Picker from './Picker.svelte';

  /**
   * The shop and wardrobe: browse the catalog by slot, try everything on your own avatar before
   * paying, buy with the town's money, and switch owned pieces freely. One view does both: an
   * owned piece shows Wear instead of a price.
   */

  const mod = $derived(hb.modules.world as WorldState | undefined);
  const shop = $derived(mod?.shop);

  let wd = $state<WardrobeMine | null>(null);
  let body = $state<'male' | 'female' | null>(null);
  let slot = $state<Slot>('top');
  /** The browsed piece per slot, so flipping between slots keeps the picks */
  let sel = $state<Partial<Record<Slot, WornItem>>>({});
  let url = $state<string | null>(null);
  let sheet = $state<SheetInfo | null>(null);
  let buildingCount = $state(0);
  let firstLoad = $state(true);

  const slots = $derived(SLOTS.filter((s) => s.id !== 'dress' || body === 'female'));
  const items = $derived(CATALOG.filter((i) => i.slot === slot && (!i.bodies || (body && i.bodies.includes(body)))));
  const selected = $derived.by((): (WornItem & { item: WardrobeItem }) | null => {
    const w = sel[slot] ?? wd?.outfit[slot];
    const item = (w && items.find((i) => i.id === w.id)) ?? items[0];
    if (!item) return null;
    const color = w?.id === item.id && item.colors.includes(w.color) ? w.color : item.colors[0];
    return { id: item.id, color, item };
  });

  const ownedIs = (id: string, color?: string) => (wd?.owned ?? []).some((o) => o.id === id && (color === undefined || o.color === color));
  const isOwned = $derived(!!selected && ownedIs(selected.id, selected.color));
  const isWorn = $derived(!!selected && wd?.outfit[slot]?.id === selected.id && wd?.outfit[slot]?.color === selected.color);
  const wornInSlot = $derived(wd?.outfit[slot]);
  const price = $derived(selected && shop ? shop.prices[selected.item.tier] : 0);

  const itemOptions = $derived(items.map((i) => ({ id: i.id, name: i.name, dot: ownedIs(i.id) })));
  const colorOptions = $derived(
    (selected?.item.colors ?? []).map((c) => ({ id: c, name: colorName(c), color: COLOR_HEX[c] ?? '#888', dot: !!selected && ownedIs(selected.id, c) })),
  );

  /** What the preview shows: the outfit with the browsed piece in its slot */
  function candidate(): Outfit {
    const out: Outfit = { ...(wd?.outfit ?? {}) };
    if (!selected) return out;
    out[slot] = { id: selected.id, color: selected.color };
    // A dress replaces top and bottom (and they replace it)
    if (slot === 'dress') {
      delete out.top;
      delete out.bottom;
    }
    if (slot === 'top' || slot === 'bottom') delete out.dress;
    return out;
  }

  // ------------------------------------------------------------ preview

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

  /** Browsing picks survive leaving the panel, like the editor's drafts */
  const DRAFT_KEY = 'hb.world.shop';

  $effect(() => {
    const snapshot = JSON.stringify(candidate());
    const picks = JSON.stringify({ id: hb.me?.id, slot, sel });
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
        if (draft?.id === hb.me?.id && draft.sel) {
          sel = draft.sel;
          if (SLOTS.some((s) => s.id === draft.slot)) slot = draft.slot;
        }
      } catch {
        // A broken draft is just dropped
      }
      firstLoad = false;
      if (body) void build(candidate());
    })();
    return onEvent<{ balance: number }>('world', 'wallet', (w) => {
      if (wd) wd.balance = w.balance;
    });
  });

  function pick(id: string, color?: string) {
    const item = items.find((i) => i.id === id) ?? selected?.item;
    if (!item) return;
    const c = color ?? (selected && selected.id === id ? selected.color : undefined);
    sel[slot] = { id: item.id, color: c && item.colors.includes(c) ? c : item.colors[0] };
  }

  async function buy() {
    if (!selected) return;
    const bought = await attempt(() => rpc<WardrobeMine>('world', 'buy', { id: selected.id, color: selected.color }));
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
    delete sel[slot];
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

    <AvatarPreview {url} {sheet} building={buildingCount > 0} focusHead={slot === 'hat' || slot === 'face' || slot === 'neck'} />

    <div class="slots">
      {#each slots as s (s.id)}
        <button type="button" class="slot" class:on={slot === s.id} onclick={() => (slot = s.id)}>
          {s.name}
          {#if wd?.outfit[s.id]}<span class="worn-dot"></span>{/if}
        </button>
      {/each}
    </div>

    {#if selected}
      <Picker label={SLOTS.find((s) => s.id === slot)?.name ?? ''} items={itemOptions} value={selected.id} onchange={(id) => pick(id)} />
      <Picker label="Color" items={colorOptions} value={selected.color} per={6} onchange={(c) => pick(selected!.id, c)} />

      <div class="deal card">
        <div class="what">
          <span class="name">{selected.item.name}</span>
          <span class="tier {selected.item.tier}">{TIER_NAMES[selected.item.tier]}</span>
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
      </div>
      {#if !isOwned && wornInSlot}
        <p class="faint small hint">You are wearing {items.find((i) => i.id === wornInSlot.id)?.name ?? 'something'} here.</p>
      {/if}
    {:else}
      <p class="faint">Nothing here fits your body.</p>
    {/if}
  </div>
{/if}

<style>
  .shop {
    display: flex;
    flex-direction: column;
    gap: 1rem;
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
  .deal {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.7rem 0.8rem;
  }
  .what {
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
  .hint {
    margin: -0.5rem 0 0;
  }
</style>
