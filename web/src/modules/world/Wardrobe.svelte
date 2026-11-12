<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Ban, Crown, Lock, OctagonMinus, Plus, Shirt, ShoppingBag } from '@lucide/svelte';
  import { attempt, hb, onEvent, rpc, toast } from '$lib/client.svelte.ts';
  import { choose } from '$lib/dialog.svelte.ts';
  import { isNewSlot, markSlotSeen } from './newSlots.svelte.ts';
  import { COLOR_HEX, SLOTS, colorName, isLockedSlot, isSecretSlot, itemById, notForTheKing, openSlots, slotsFor, unlockProgress, type Outfit, type Slot, type WardrobeItem } from '$shared/wardrobe.ts';
  import type { SheetInfo, WardrobeMine, WorldState } from '$shared/world.ts';
  import OutfitThumb from './OutfitThumb.svelte';
  import type { PreviewView } from './preview.ts';

  /**
   * The closet: everything the guest bought, sorted by slot. The strip on top is the outfit at a
   * glance (one tile per slot, showing what is worn there) and picks the slot; below it, the
   * pieces owned for that slot. Tap a piece to wear it (Nothing leaves the slot empty); a piece
   * owned in several colors turns into a square per color to pick from. Buying happens in the shop.
   * Above the strip, a few saved outfits put a whole look back on in one tap.
   */

  let { onshop, view }: { onshop?: (slot: Slot) => void; view: PreviewView } = $props();

  /**
   * The King keeps the crown: while this guest holds the title the hat slot is locked (the server
   * refuses a change too), shows the crown, and says why
   */
  const crowned = $derived(!!hb.me && (hb.modules.world as WorldState | undefined)?.king?.id === hb.me.id);

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
    arms: 'torso',
    shoulders: 'torso',
    costume: 'head',
  };

  const shop = $derived((hb.modules.world as WorldState | undefined)?.shop);
  /** How far the guest is from the locked slots */
  const progress = $derived(body && shop ? unlockProgress(wd?.owned ?? [], body, shop.unlockPieces) : null);
  /** The secret slot shows only once it is found (no lock, no hint before) */
  const found = $derived(!!body && !!shop && openSlots(wd?.owned ?? [], body, shop.unlockPieces, shop.secretPieces).includes('costume'));
  const slots = $derived(slotsFor(body).filter((s) => !isSecretSlot(s.id) || found));
  const lockedNow = (s: Slot) => isLockedSlot(s) && !progress?.unlocked;
  const openNow = $derived(slots.map((s) => s.id).filter((s) => !lockedNow(s)));
  const slotName = $derived(SLOTS.find((s) => s.id === slot)?.name ?? '');
  /** The worn piece that wearing something in this slot would take off: the dress for tops and
   *  bottoms, the costume head for hats */
  function takesOff(s: Slot): string | null {
    const o = wd?.outfit;
    const other = (s === 'top' || s === 'bottom') && o?.dress ? o.dress : s === 'hat' && o?.costume ? o.costume : null;
    return other ? (itemById(other.id)?.name ?? null) : null;
  }

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
  /** The hat slot is open and locked: its pieces show under a crown that says why */
  /** The King's headwear stays as it is: the hat (the crown) and the costume heads that would take it off */
  const headSlot = (id: Slot) => id === 'hat' || id === 'costume';
  const hatLocked = $derived(crowned && headSlot(slot));
  const ownedCount = $derived((wd?.owned ?? []).length);
  /** Saved outfits only show once the closet is big enough to need them: less to learn at first */
  const OUTFITS_FROM = 7;

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

  // Loaded once connected (opened while offline, "no answer" is not "no avatar yet"); a failed load
  // is tried again on the next connection
  let loading = false;
  $effect(() => {
    if (loaded || loading || !hb.connected) return;
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
      // Open on the first slot that has something in it
      const first = slots.find((s) => wd?.outfit[s.id]) ?? slots.find((s) => closet.has(s.id));
      if (first) slot = first.id;
      loaded = true;
      rpc<Record<string, string>>('world', 'ownedIcons')
        .then((urls) => (colored = urls))
        .catch(() => {});
      // The hats too, even with none owned: the crown's picture is among them
      for (const s of new Set<Slot>([...closet.keys(), 'hat'])) {
        rpc<Record<string, string>>('world', 'icons', { slot: s })
          .then((urls) => (icons = { ...icons, ...urls }))
          .catch(() => {});
      }
    })();
  });

  // The preview shows what is worn, from the moment the wardrobe is loaded. It is drawn again when
  // the title comes or goes: the crown with it
  $effect(() => {
    void crowned;
    if (!loaded) return;
    untrack(() => {
      if (body && wd) void build($state.snapshot(wd.outfit) as Outfit);
    });
  });

  onMount(() => {
    const timer = setInterval(() => tick++, 3000);
    const off = onEvent<{ balance: number }>('world', 'wallet', (w) => {
      if (wd) wd.balance = w.balance;
    });
    return () => {
      clearInterval(timer);
      off();
    };
  });

  // ------------------------------------------------------------ saved outfits

  /** The same outfit gives the same key, whatever order its slots came in */
  const outfitKey = (o: Outfit) =>
    JSON.stringify(
      Object.entries(o)
        .filter(([, w]) => w)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  const wornKey = $derived(wd ? outfitKey(wd.outfit) : '');

  /** Pictures of the saved outfits, by outfit key */
  let thumbs = $state<Record<string, { url: string; sheet: SheetInfo }>>({});
  const asking = new Set<string>();
  $effect(() => {
    for (const o of wd?.saved ?? []) {
      if (!o) continue;
      const key = outfitKey(o);
      if (thumbs[key] || asking.has(key)) continue;
      asking.add(key);
      rpc<{ url: string; sheet: SheetInfo }>('world', 'preview', { outfit: $state.snapshot(o) })
        .then((r) => (thumbs = { ...thumbs, [key]: r }))
        .catch(() => asking.delete(key));
    }
  });

  async function saveOutfit(i: number) {
    if (busy) return;
    busy = true;
    const done = await attempt(() => rpc<WardrobeMine>('world', 'saveOutfit', { slot: i }), 'Outfit saved');
    busy = false;
    if (done) wd = done;
  }

  async function putOn(i: number) {
    const o = wd?.saved[i];
    if (busy || !o || outfitKey(o) === wornKey) return;
    busy = true;
    void build($state.snapshot(o) as Outfit);
    const done = await attempt(() => rpc<WardrobeMine>('world', 'applyOutfit', { slot: i }));
    busy = false;
    if (done) wd = done;
    else if (wd) void build($state.snapshot(wd.outfit) as Outfit);
  }

  /** A filled slot always asks first: wear it, or save the current look over it */
  async function tapSaved(i: number) {
    const o = wd?.saved[i];
    if (busy || !o) return;
    const what = await choose({
      title: `Outfit ${i + 1}`,
      message: outfitKey(o) === wornKey ? 'You are wearing this outfit now.' : 'Saving here replaces this outfit with what you wear now.',
      // The dialog stacks the last choice on top
      options: [
        { label: 'Save current look here', value: 'save' as const, kind: 'default' },
        { label: 'Wear this outfit', value: 'wear' as const, kind: 'primary' },
      ],
    });
    if (what === 'wear') void putOn(i);
    if (what === 'save') void saveOutfit(i);
  }

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
    // A costume head replaces the hat (and a hat replaces it)
    if (slot === 'costume') delete outfit.hat;
    if (slot === 'hat') delete outfit.costume;
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

  /** A skirt or dress the King cannot put on (one he already wears stays usable in its other colors) */
  const kingLocked = (item: WardrobeItem) => crowned && notForTheKing(item) && worn?.id !== item.id;

  /** One color: wear it. Several: the card turns into a square per owned color */
  function tap(p: { item: WardrobeItem; colors: string[] }) {
    if (kingLocked(p.item)) {
      picking = null;
      toast({ text: 'Not fit for a King: you could not sit on your throne or greet your court in this', kind: 'info' });
      return;
    }
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
    {#if ownedCount >= OUTFITS_FROM}
    <div class="saved">
      {#each wd?.saved ?? [] as o, i (i)}
        {#if o}
          {@const t = thumbs[outfitKey(o)]}
          {@const on = outfitKey(o) === wornKey}
          <button type="button" class="outfit-slot" class:on disabled={busy} aria-label={on ? `Outfit ${i + 1}, worn` : `Outfit ${i + 1}`} onclick={() => tapSaved(i)}>
            <span class="onum">{i + 1}</span>
            <span class="thumb">
              {#if t}<OutfitThumb url={t.url} sheet={t.sheet} />{/if}
            </span>
          </button>
        {:else}
          <button type="button" class="outfit-slot empty-slot" disabled={busy} aria-label={`Save what I wear as outfit ${i + 1}`} onclick={() => saveOutfit(i)}>
            <Plus size={15} />Save look
          </button>
        {/if}
      {/each}
    </div>
    {/if}

    <span class="label">Wearing</span>
    <!-- Two rows at most: five tiles show per row, more scroll sideways -->
    <div class="outfit" role="tablist" aria-label="Slots" style:--cols={Math.ceil(slots.length / 2)}>
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
          onclick={() => {
            slot = s.id;
            markSlotSeen(s.id);
          }}
        >
          {#if isNewSlot(s.id, openNow)}<span class="new">New</span>{/if}
          <span class="spic">
            {#if crowned && s.id === 'hat'}
              <!-- The King's crown, whatever is worn under it -->
              {#if icons.crown}<img src={icons.crown} alt="Crown" />{:else}<Crown size={26} />{/if}
            {:else if w && pictureOf(w.id, w.color)}
              <img src={pictureOf(w.id, w.color)} alt="" />
            {:else if lockedNow(s.id)}
              <Lock size={20} />
            {:else if takesOff(s.id)}
              <!-- Taken by the dress or the costume head: wearing one here takes it off -->
              <span class="swap" title={`Wearing one takes off the ${takesOff(s.id)}`}><OctagonMinus size={30} strokeWidth={2} /></span>
            {:else}
              <span class="blank"></span>
            {/if}
          </span>
          <span class="sname">{s.name}</span>
          {#if crowned && headSlot(s.id)}
            <span class="count lock"><Lock size={12} /></span>
          {:else if count}
            <span class="count">{count}</span>
          {/if}
        </button>
      {/each}
    </div>

    <section class="closet">
      <div class="chead">
        <span class="ctitle">My {slotName.toLowerCase()}<span class="faint">{pieces.length ? ` · ${pieces.length}` : ''}</span></span>
        <!-- A locked slot is not in the shop yet -->
        {#if !lockedNow(slot)}
          <button type="button" class="shoplink" onclick={() => onshop?.(slot)}><ShoppingBag size={15} />Buy more</button>
        {/if}
      </div>
      {#if takesOff(slot)}
        <p class="swapnote"><OctagonMinus size={14} />Wearing one takes off the {takesOff(slot)}.</p>
      {/if}
      {#if pieces.length || hatLocked}
        <!-- The King's hats stay in sight under the crown, out of reach -->
        <div class="scroll" class:shut={hatLocked}>
        <div class="grid" inert={hatLocked}>
          <!-- Nothing: the slot left empty -->
          <button type="button" class="piece" class:worn={!worn} disabled={busy} onclick={() => ((picking = null), worn && takeOff())}>
            <span class="pic"><Ban size={30} strokeWidth={1.5} /></span>
            <span class="pname">Nothing</span>
            <span class="dots"></span>
          </button>
          {#each pieces as p (p.item.id)}
            <!-- While picking, the color squares lie over the card, so its size never changes -->
            <div class="cell">
              <button type="button" class="piece" class:worn={worn?.id === p.item.id} class:kinglock={kingLocked(p.item)} disabled={busy} onclick={() => tap(p)}>
                {#if kingLocked(p.item)}<span class="klock"><Lock size={12} strokeWidth={2.5} /></span>{/if}
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
        {#if hatLocked}
          <div class="locked">
            <span class="lmark"><Crown size={46} /></span>
            <strong>The King keeps the crown</strong>
            <p>{slot === 'hat' ? 'You cannot change your hat while you are the King.' : 'A costume head would take the crown off.'}</p>
          </div>
        {/if}
        </div>
      {:else if lockedNow(slot) && progress && shop}
        <p class="faint none-yet">
          Opens once you own a piece in every slot and {shop.unlockPieces} pieces in all ({Math.min(progress.pieces, shop.unlockPieces)}/{shop.unlockPieces}{progress.missing.length
            ? `, still missing: ${progress.missing.map((m) => SLOTS.find((x) => x.id === m)?.name.toLowerCase()).join(', ')}`
            : ''}).
        </p>
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

  /* ------------------------------------------------------------ saved outfits */
  .saved {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
  }
  .outfit-slot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 0;
    height: 2.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
  }
  .outfit-slot.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .onum {
    position: absolute;
    top: 0.2rem;
    left: 0.4rem;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .outfit-slot.on .onum {
    color: var(--accent);
  }
  .thumb {
    width: 2.4rem;
    height: 2.4rem;
  }
  .empty-slot {
    justify-content: center;
    gap: 0.3rem;
    padding: 0 0.3rem;
    border-style: dashed;
    background: none;
    color: var(--text-dim);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
  }

  /* ------------------------------------------------------------ the outfit strip */
  /* Tiles shown at once: four and a bit on a phone (the next one peeks out, so the row reads as
     scrollable), five from a tablet up, every tile on a wide screen */
  .wardrobe {
    container-type: inline-size;
  }
  .outfit {
    --gap: 0.4rem;
    --shown: 4.35;
    display: grid;
    grid-template-columns: repeat(var(--cols), calc((100% - (var(--shown) - 1) * var(--gap)) / var(--shown)));
    gap: var(--gap);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .outfit::-webkit-scrollbar {
    display: none;
  }
  @container (min-width: 30rem) {
    .outfit {
      --shown: 5;
    }
  }
  @container (min-width: 44rem) {
    .outfit {
      --shown: var(--cols);
    }
  }
  .slot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    padding: 0.15rem 0.1rem 0.3rem;
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
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.84rem;
    font-weight: 600;
  }
  .spic :global(svg) {
    color: var(--text-dim);
  }
  /* On a slot whose pieces would take off the dress or costume head worn */
  .swap {
    display: grid;
    place-items: center;
    color: var(--warning);
  }
  /* A slot that just opened by buying: a small tag until it is first opened */
  .new {
    position: absolute;
    top: 0.3rem;
    left: 0.35rem;
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    box-shadow: 0 0 0.6rem color-mix(in srgb, var(--accent) 60%, transparent);
  }
  .swapnote {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: -0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--warning);
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

  /* The King's hat slot: a lock where the count is, and the reason in place of the pieces */
  .count.lock {
    color: var(--warning);
  }
  .spic :global(svg) {
    color: var(--warning);
  }
  /* The locked hats: dimmed and out of reach, the crown and the reason over them */
  .scroll.shut {
    position: relative;
    overflow: hidden;
    min-height: 10.5rem;
  }
  .shut .grid {
    opacity: 0.55;
    filter: grayscale(0.5);
  }
  .locked {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.2rem;
    padding: 0.8rem;
    text-align: center;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--bg) 78%, transparent), color-mix(in srgb, var(--bg) 15%, transparent));
  }
  .locked strong {
    font-size: 1.02rem;
  }
  .locked p {
    margin: 0;
    font-size: 0.86rem;
    color: var(--text-dim);
  }
  .lmark {
    display: grid;
    margin-bottom: 0.15rem;
    color: var(--warning);
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
  /* A piece the King cannot put on: dimmed, a small lock in the corner, the reason on a tap */
  .piece.kinglock .pic {
    opacity: 0.4;
  }
  .klock {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-dim);
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
