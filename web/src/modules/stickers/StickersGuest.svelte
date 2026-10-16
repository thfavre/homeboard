<script lang="ts">
  import { Plus, Send, Type, User, X } from '@lucide/svelte';
  import { MAX_GUEST_STICKERS, stickerCategories, stickerLabel, type GuestSticker, type StickersState } from '$shared/stickers.ts';
  import { hb, rpc, attempt, onEvent, price, storageGet, storageSet } from '$lib/client.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import { guestOrder } from '$lib/guestOrder.ts';
  import Money from '$lib/ui/Money.svelte';
  import StickerMaker from './StickerMaker.svelte';
  import StickerView from './StickerView.svelte';

  const MINE = 'mine';
  const WRITE = 'write';
  const TAB_KEY = 'hb.stickerTab';

  const mod = $derived(hb.modules.stickers as StickersState | undefined);
  const cost = $derived(price('stickers.sticker'));
  const full = $derived(!!mod && mod.maxActive > 0 && mod.active.length >= mod.maxActive);
  let text = $state('');
  let busy = $state(false);

  // Each guest sees the stickers of a category in their own order, the same every time
  const visible = $derived((mod?.catalog ?? []).filter((s) => !mod?.hiddenCategories.includes(s.category ?? '')));
  const categories = $derived(stickerCategories(visible).map((name) => ({ name, stickers: guestOrder(visible.filter((s) => s.category === name), hb.me?.name) })));
  // "Mine": the guest's face and the stickers they made
  const hasMine = $derived(!!mod?.allowCustom || !!hb.me?.avatar);

  // The guest's own stickers ("My stickers")
  let mine = $state<GuestSticker[]>([]);
  let making = $state(false);
  let editing = $state(false);
  $effect(() => {
    rpc<GuestSticker[]>('stickers', 'mine').then((l) => (mine = l)).catch(() => {});
    return onEvent<GuestSticker[]>('stickers', 'mine', (l) => (mine = l));
  });
  $effect(() => {
    if (!mine.length) editing = false;
  });

  // The open tab, remembered on this phone. By default: the guest's own stickers when they have some.
  let picked = $state(storageGet(TAB_KEY));
  const tab = $derived.by(() => {
    if (picked === MINE && hasMine) return MINE;
    if (picked === WRITE && mod?.allowText) return WRITE;
    if (picked && categories.some((c) => c.name === picked)) return picked;
    if (hasMine && mine.length) return MINE;
    return categories[0]?.name ?? (hasMine ? MINE : mod?.allowText ? WRITE : '');
  });
  const current = $derived(categories.find((c) => c.name === tab));
  function pick(name: string) {
    picked = name;
    storageSet(TAB_KEY, name);
    editing = false;
  }

  async function removeMine(s: GuestSticker) {
    if (!(await ask({ title: `Delete ${s.name}?`, confirm: 'Delete', danger: true }))) return;
    const list = await attempt(() => rpc<GuestSticker[]>('stickers', 'removeMine', { id: s.id }));
    if (list) mine = list;
  }

  async function send(args: { id?: string; text?: string; face?: boolean; mine?: string }, label: string) {
    busy = true;
    const ok = await attempt(() => rpc('stickers', 'place', args), `${label} is on the TV`);
    busy = false;
    if (ok !== undefined && args.text) text = '';
  }

  const minutes = $derived(mod ? Math.round(mod.durationSec / 6) / 10 : 0);
</script>

{#if mod}
  <div class="stickers">
    <p class="dim intro">
      Tap a sticker to send it bouncing on the TV for {minutes} min.
      {#if hb.core?.economyEnabled && cost}Each one costs <Money amount={cost} />.{/if}
    </p>
    <p class="faint status truncate">
      {mod.maxActive > 0 ? `${mod.active.length} of ${mod.maxActive} on screen` : `${mod.active.length} on screen`}{full ? ', wait for one to leave' : ''}
    </p>

    <!-- Categories: each chip shows the first sticker the guest will see in it -->
    <div class="chips" role="tablist" aria-label="Sticker categories">
      {#if hasMine}
        <button class="chip" class:active={tab === MINE} role="tab" aria-selected={tab === MINE} onclick={() => pick(MINE)}>
          <span class="thumb icon"><User size={15} /></span>
          Mine
        </button>
      {/if}
      {#if mod.allowText}
        <button class="chip" class:active={tab === WRITE} role="tab" aria-selected={tab === WRITE} onclick={() => pick(WRITE)}>
          <span class="thumb icon"><Type size={15} /></span>
          Write
        </button>
      {/if}
      {#each categories as c (c.name)}
        <button class="chip" class:active={tab === c.name} role="tab" aria-selected={tab === c.name} onclick={() => pick(c.name)}>
          <span class="thumb"><StickerView sticker={c.stickers[0]} /></span>
          {c.name}
        </button>
      {/each}
    </div>

    {#if tab === MINE}
      {#if mod.allowCustom && mine.length}
        <div class="head">
          <span class="faint count">{mine.length}/{MAX_GUEST_STICKERS} made</span>
          <span class="spacer"></span>
          <button class="btn ghost small" onclick={() => (editing = !editing)}>{editing ? 'Done' : 'Edit'}</button>
        </div>
      {/if}
      <div class="grid">
        {#if hb.me?.avatar}
          <!-- Only with a selfie: send your own face bouncing -->
          <button class="item card" disabled={busy || full || editing} aria-label="Your face" onclick={() => send({ face: true }, 'Your face')}>
            <div class="art"><StickerView sticker={{ id: 'face', name: 'Your face', kind: 'face', src: hb.me.avatar }} /></div>
          </button>
        {/if}
        {#if mod.allowCustom}
          {#if mine.length < MAX_GUEST_STICKERS}
            <button class="item card make" disabled={editing} onclick={() => (making = true)}>
              <div class="art plus"><Plus size={26} /></div>
              <span class="name">Make one</span>
            </button>
          {:else}
            <!-- Full: say why there is no new sticker, and how to make room -->
            <button class="item card make full" onclick={() => (editing = true)}>
              <span class="name">{MAX_GUEST_STICKERS} max. Delete one to make another.</span>
            </button>
          {/if}
          {#each mine as s (s.id)}
            <div class="mine">
              <button class="item card" disabled={editing || busy || full} aria-label={s.name} onclick={() => send({ mine: s.id }, s.name)}>
                <div class="art"><StickerView sticker={{ id: s.id, name: s.name, kind: 'image', src: s.src }} /></div>
              </button>
              {#if editing}
                <button class="remove" aria-label={`Delete ${s.name}`} onclick={() => removeMine(s)}><X size={14} /></button>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
      {#if mod.allowCustom && !mine.length}
        <p class="faint hint">Make your own from a photo, a drawing or a WhatsApp sticker. Only you see them.</p>
      {/if}
    {:else if tab === WRITE}
      <form novalidate
        class="card write"
        onsubmit={(e) => {
          e.preventDefault();
          send({ text }, 'Your message');
        }}
      >
        <!-- What it will look like on the TV -->
        <div class="preview" aria-hidden="true"><StickerView sticker={null} text={text.trim() || 'Happy birthday!'} /></div>
        <label class="field">
          <span>Your message (24 characters)</span>
          <div class="row">
            <input class="input" bind:value={text} maxlength="24" placeholder="Happy birthday!" />
            <button class="btn primary" disabled={busy || full || !text.trim()} aria-label="Send"><Send size={18} /></button>
          </div>
        </label>
      </form>
    {:else if current}
      <div class="grid">
        {#each current.stickers as s (s.id)}
          <button class="item card" disabled={busy || full} aria-label={stickerLabel(s)} onclick={() => send({ id: s.id }, 'Your sticker')}>
            <div class="art"><StickerView sticker={s} lazy /></div>
          </button>
        {/each}
      </div>
    {:else}
      <p class="faint hint">No stickers right now.</p>
    {/if}

  </div>

  {#if making}
    <StickerMaker onsaved={(l) => (mine = l)} onclose={() => (making = false)} />
  {/if}
{/if}

<style>
  .stickers {
    display: grid;
    gap: 0.9rem;
    min-width: 0;
  }
  .intro {
    font-size: 0.9rem;
  }
  .status {
    font-size: 0.82rem;
    margin-top: -0.5rem;
  }
  /* One scrolling row of categories */
  .chips {
    display: flex;
    gap: 0.45rem;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 0.1rem 0;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.8rem 0.3rem 0.35rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-dim);
    font-weight: 600;
    font-size: 0.86rem;
    white-space: nowrap;
  }
  .chip.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
  }
  .thumb {
    width: 1.7rem;
    height: 1.7rem;
    flex: none;
    display: grid;
    place-items: center;
  }
  .thumb.icon {
    border-radius: 50%;
    background: color-mix(in srgb, currentColor 14%, transparent);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }
  .item {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.3rem;
    aspect-ratio: 1;
    padding: 0.45rem;
    min-width: 0;
    transition: transform 0.12s ease;
  }
  .item:active:not(:disabled) {
    transform: scale(0.93);
  }
  .item:disabled {
    opacity: 0.5;
  }
  .art {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .make .art {
    width: 2.6rem;
    height: 2.6rem;
  }
  .name {
    font-size: 0.75rem;
    color: var(--text-dim);
    font-weight: 500;
    text-align: center;
    line-height: 1.2;
  }
  .hint {
    font-size: 0.85rem;
    margin-top: -0.3rem;
  }
  .write {
    display: grid;
    gap: 1rem;
    padding: 1rem;
  }
  /* The TV text sticker, scaled down to fit the phone */
  .preview {
    display: grid;
    place-items: center;
    min-height: 5.5rem;
    overflow: hidden;
  }
  .preview :global(.text) {
    font-size: 1.5rem;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: -0.4rem;
  }
  .spacer {
    flex: 1;
  }
  .mine {
    position: relative;
    display: grid;
    min-width: 0;
  }
  .make {
    border-style: dashed;
  }
  .full {
    padding: 0.4rem;
  }
  .count {
    font-size: 0.8rem;
  }
  .plus {
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--gradient);
    color: #fff;
  }
  .remove {
    position: absolute;
    top: -0.4rem;
    right: -0.4rem;
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: var(--danger);
    color: #fff;
    border: 2px solid var(--bg);
  }
</style>
