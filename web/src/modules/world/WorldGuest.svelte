<script lang="ts">
  import { fly } from 'svelte/transition';
  import { Check, Coins, PersonStanding, Shirt, ShoppingBag, Undo2 } from '@lucide/svelte';
  import { attempt, hb, rpc, storageGet, storageSet } from '$lib/client.svelte.ts';
  import type { Slot } from '$shared/wardrobe.ts';
  import { BEARDS, DEFAULT_CHOICES, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, SKINS, lookCost, type AvatarChoices, type SheetInfo, type WorldState } from '$shared/world.ts';
  import AvatarPreview from './AvatarPreview.svelte';
  import Picker from './Picker.svelte';
  import type { PreviewView } from './preview.ts';
  import Shop from './Shop.svelte';
  import Wardrobe from './Wardrobe.svelte';

  /**
   * The avatar panel: the look editor (body, skin, hair, eyes), the wardrobe of owned clothes
   * and the shop. The server
   * composites a sheet for every look; the preview shows it walking.
   */

  let tab = $state<'look' | 'wardrobe' | 'shop'>('look');
  /** The one preview of the panel; the open tab says what it shows */
  const view = $state<PreviewView>({ url: null, sheet: null, building: false, focus: null, facing: 'down' });

  /** The new tab slides in from the right when going right, from the left when going back */
  const ORDER = ['look', 'wardrobe', 'shop'];
  let slideFrom = $state(0);
  function go(next: typeof tab) {
    slideFrom = Math.sign(ORDER.indexOf(next) - ORDER.indexOf(tab)) * 40;
    tab = next;
  }
  /** The slot the wardrobe sent the guest shopping for */
  let shopSlot = $state<Slot | null>(null);
  let choices = $state<AvatarChoices>({ ...DEFAULT_CHOICES });
  let saved = $state<string | null>(null);
  /** The avatar exists: body and skin are set, only hair, face and clothes change */
  let created = $state(false);
  let url = $state<string | null>(null);
  let sheet = $state<SheetInfo | null>(null);
  let buildingCount = $state(0);
  let firstLoad = $state(true);

  const dirty = $derived(saved !== JSON.stringify(choices));
  const shop = $derived((hb.modules.world as WorldState | undefined)?.shop);
  /** What the changes cost (creating is free; after that, each changed part has its price) */
  const cost = $derived(created && saved && shop ? lookCost(JSON.parse(saved) as AvatarChoices, choices, shop.look) : 0);

  /** Swatch colors, roughly the LPC palettes */
  const SKIN_HEX: Record<string, string> = {
    light: '#f6cfa0', amber: '#dba26a', olive: '#c8a070', taupe: '#b58d68', bronze: '#a9703f', brown: '#8a5a34', black: '#5c3b24',
  };
  const HAIR_HEX: Record<string, string> = {
    black: '#1e1d22', raven: '#2c2b38', dark_brown: '#4b3321', chestnut: '#6d4529', light_brown: '#8d6239', blonde: '#d8ab51',
    platinum: '#e9e2d2', sandy: '#c7a05e', ginger: '#b65c20', redhead: '#953c1c', strawberry: '#c76a48', gray: '#9b9b9f',
    white: '#f1f1ee', pink: '#e481b5', purple: '#8c4bc9', blue: '#4b6cc9', green: '#4b9b5c', red: '#b02d2b',
  };
  const EYE_HEX: Record<string, string> = {
    brown: '#6d4529', blue: '#5686ae', green: '#53b351', gray: '#8b8b94', purple: '#b90da0', red: '#cb4a39', orange: '#d97d2c', yellow: '#d9c32e',
  };

  const colorName = (id: string) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const hairColorItems = HAIR_COLORS.map((c) => ({ id: c, name: colorName(c), color: HAIR_HEX[c] }));

  // ------------------------------------------------------------ preview

  let debounce: ReturnType<typeof setTimeout> | undefined;
  let wanted = '';

  async function build(c: AvatarChoices): Promise<void> {
    const key = JSON.stringify(c);
    wanted = key;
    buildingCount++;
    try {
      const r = await rpc<{ url: string; sheet: SheetInfo }>('world', 'preview', { choices: c });
      if (wanted === key) {
        url = r.url;
        sheet = r.sheet;
      }
    } catch {
      // A broken look stays on the last preview; saving would show the error
    } finally {
      buildingCount--;
    }
  }

  /** Editing the head zooms the preview onto it for a moment; a body or skin change zooms out */
  let focusHead = $state(false);
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  let lastHead = '';
  let lastBody = '';

  /** Half-made looks survive leaving the panel (home, a game starting): kept on the phone */
  const DRAFT_KEY = 'hb.world.draft';

  $effect(() => {
    const snapshot = JSON.stringify(choices);
    const head = JSON.stringify([choices.hair, choices.hairColor, choices.beard, choices.eyes]);
    const body = JSON.stringify([choices.body, choices.skin]);
    if (firstLoad) return;
    if (lastHead && head !== lastHead) {
      focusHead = true;
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => (focusHead = false), 5500);
    }
    if (lastBody && body !== lastBody) {
      focusHead = false;
      clearTimeout(focusTimer);
    }
    lastHead = head;
    lastBody = body;
    storageSet(DRAFT_KEY, snapshot === saved ? null : JSON.stringify({ id: hb.me?.id, choices: JSON.parse(snapshot) }));
    clearTimeout(debounce);
    debounce = setTimeout(() => void build(JSON.parse(snapshot)), 350);
    return () => clearTimeout(debounce);
  });

  // Loaded once connected: a panel opened while offline would otherwise take "no answer" for "no
  // avatar yet" and offer Create, which then pays for a look change back to the defaults
  let loading = false;
  $effect(() => {
    if (!firstLoad || loading || !hb.connected) return;
    loading = true;
    void (async () => {
      let mine: AvatarChoices | null;
      try {
        mine = await rpc<AvatarChoices | null>('world', 'mine');
      } catch {
        // Tried again on the next connection
        loading = false;
        return;
      }
      if (mine) {
        choices = mine;
        saved = JSON.stringify(mine);
        created = true;
      }
      // A half-made look from last time wins over the saved one, so nothing is lost
      // (except body and skin, which never change once the avatar exists)
      try {
        const draft = JSON.parse(storageGet(DRAFT_KEY) ?? 'null');
        if (draft?.id === hb.me?.id && draft.choices) {
          choices = { ...DEFAULT_CHOICES, ...draft.choices, ...(mine ? { body: mine.body, skin: mine.skin } : {}) };
        }
      } catch {
        // A broken draft is just dropped
      }
      firstLoad = false;
      void build($state.snapshot(choices) as AvatarChoices);
    })();
  });

  /** Back from the wardrobe or the shop: redraw, since the clothes may have changed there */
  function backToLook() {
    if (tab === 'look') return;
    go('look');
    if (!firstLoad) void build($state.snapshot(choices) as AvatarChoices);
  }

  $effect(() => {
    if (tab !== 'look') return;
    if (url && sheet) {
      view.url = url;
      view.sheet = sheet;
    }
    view.building = buildingCount > 0;
    view.focus = focusHead ? 'head' : null;
    view.facing = 'down';
  });

  /** Back to the saved look, dropping the changes */
  function cancel() {
    if (!saved) return;
    choices = JSON.parse(saved);
    storageSet(DRAFT_KEY, null);
  }

  async function save() {
    const c = $state.snapshot(choices) as AvatarChoices;
    const done = await attempt(() => rpc('world', 'save', { choices: c }), created ? 'New look' : 'Saved');
    if (done) {
      saved = JSON.stringify(c);
      // Once created, body and skin are set and later changes are paid
      created = true;
      storageSet(DRAFT_KEY, null);
    }
  }
</script>

<!-- The wardrobe and the shop fit the screen: only their item list scrolls -->
<div class="panel" class:fit={tab !== 'look'}>
<!-- The wardrobe and the shop come once the character exists: before that there is only the editor -->
{#if created}
<div class="tabs">
  <button type="button" class="tab" class:on={tab === 'look'} onclick={backToLook}><PersonStanding size={17} />My look</button>
  <button type="button" class="tab" class:on={tab === 'wardrobe'} onclick={() => tab !== 'wardrobe' && go('wardrobe')}><Shirt size={16} />Wardrobe</button>
  <button type="button" class="tab" class:on={tab === 'shop'} onclick={() => tab !== 'shop' && ((shopSlot = null), go('shop'))}><ShoppingBag size={16} />Shop</button>
</div>
{/if}

<!-- Stays put across the tabs: only the character inside changes and zooms -->
<div class="stage-wrap"><AvatarPreview {...view} /></div>

{#key tab}
<div class="pane" in:fly={{ x: slideFrom, duration: 220 }}>
{#if tab === 'shop'}
  <Shop startSlot={shopSlot} {view} />
{:else if tab === 'wardrobe'}
  <Wardrobe
    {view}
    onshop={(s) => {
      shopSlot = s;
      go('shop');
    }}
  />
{:else}
  <div class="editor">
    {#if !created}
      <div class="group">
        <span class="label">Body</span>
        <div class="row">
          {#each ['male', 'female'] as const as b}
            <button type="button" class="pick wide" class:on={choices.body === b} onclick={() => (choices.body = b)}>{b === 'male' ? 'Male' : 'Female'}</button>
          {/each}
        </div>
      </div>

      <div class="group">
        <span class="label">Skin</span>
        <div class="row">
          {#each SKINS as s}
            <button type="button" class="swatch" class:on={choices.skin === s} style:background={SKIN_HEX[s]} aria-label={s} onclick={() => (choices.skin = s)}></button>
          {/each}
        </div>
      </div>
    {/if}

    <Picker label="Hair" items={HAIR_STYLES} value={choices.hair} onchange={(id) => (choices.hair = id)} />
    <Picker label="Hair color" items={hairColorItems} value={choices.hairColor} onchange={(id) => (choices.hairColor = id)} />
    <Picker label="Facial hair" items={BEARDS} value={choices.beard} onchange={(id) => (choices.beard = id)} />

    <div class="group">
      <span class="label">Eyes</span>
      <div class="row">
        {#each EYE_COLORS as c}
          <button type="button" class="swatch" class:on={choices.eyes === c} style:background={EYE_HEX[c]} aria-label={c} onclick={() => (choices.eyes = c)}></button>
        {/each}
      </div>
    </div>

    {#if !created}
      <button type="button" class="btn primary save" disabled={buildingCount > 0 || firstLoad} onclick={save}><Check size={18} />Create</button>
    {:else if dirty}
      <!-- Changing a look is paid: undo the changes, or pay for them -->
      <div class="deal">
        <button type="button" class="btn" onclick={cancel}><Undo2 size={18} />Cancel</button>
        <button type="button" class="btn primary" disabled={buildingCount > 0} onclick={save}>
          {#if cost}
            <Coins size={18} />Buy for {cost} {shop?.currencyName ?? ''}
          {:else}
            <Check size={18} />Save
          {/if}
        </button>
      </div>
    {/if}
  </div>
{/if}
</div>
{/key}
</div>

<style>
  /* Exactly the screen between the page header and the bottom nav (the margin cancels part of
     the page's bottom padding, so the page itself does not scroll) */
  .fit {
    --nav-h: calc(4.2rem + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    height: max(30rem, calc(100dvh - var(--header-h, 4rem) - 0.5rem - var(--nav-h) - 0.75rem));
    margin-bottom: calc(var(--nav-h) + 0.75rem - 6.5rem);
  }
  .fit > .pane {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .fit > .pane > :global(*) {
    flex: 1;
    min-height: 0;
  }
  .stage-wrap {
    flex: none;
    margin-bottom: 1rem;
  }
  .tabs {
    flex: none;
    display: flex;
    gap: 0.4rem;
    margin-bottom: 1rem;
  }
  .tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.55rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: 0.92rem;
    font-weight: 600;
  }
  .tab.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
    color: var(--text);
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .row {
    display: flex;
    gap: 0.45rem;
  }
  .pick {
    padding: 0.42rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.9rem;
  }
  .pick.wide {
    flex: 1;
    padding: 0.6rem;
  }
  .pick.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .swatch {
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
  .save {
    justify-content: center;
  }
  .deal {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.5rem;
  }
  .deal .btn {
    justify-content: center;
  }
</style>
