<script lang="ts">
  import { Plus, Send, X } from '@lucide/svelte';
  import { MAX_GUEST_STICKERS, type GuestSticker, type StickerDef, type StickersState } from '$shared/stickers.ts';
  import { hb, rpc, attempt, onEvent, price } from '$lib/client.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import StickerMaker from './StickerMaker.svelte';
  import StickerView from './StickerView.svelte';

  const mod = $derived(hb.modules.stickers as StickersState | undefined);
  const cost = $derived(price('stickers.sticker'));
  const full = $derived(!!mod && mod.maxActive > 0 && mod.active.length >= mod.maxActive);
  let text = $state('');
  let busy = $state(false);

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
      Your sticker bounces around the TV for {minutes} min.
      {#if hb.core?.economyEnabled && cost}Each one costs <Money amount={cost} />.{/if}
    </p>
    <p class="faint status truncate">
      {mod.maxActive > 0 ? `${mod.active.length} of ${mod.maxActive} on screen` : `${mod.active.length} on screen`}{full ? ', wait for one to leave' : ''}
    </p>

    {#if mod.allowCustom}
      <div class="head">
        <h4>My stickers</h4>
        {#if mine.length}<span class="faint count">{mine.length}/{MAX_GUEST_STICKERS}</span>{/if}
        <span class="spacer"></span>
        {#if mine.length}<button class="btn ghost small" onclick={() => (editing = !editing)}>{editing ? 'Done' : 'Edit'}</button>{/if}
      </div>
      <div class="grid">
        {#if mine.length < MAX_GUEST_STICKERS}
          <button class="item card make" disabled={editing} onclick={() => (making = true)}>
            <div class="art plus"><Plus size={30} /></div>
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
            <button class="item card" disabled={editing || busy || full} onclick={() => send({ mine: s.id }, s.name)}>
              <div class="art"><StickerView sticker={{ id: s.id, name: s.name, kind: 'image', src: s.src }} /></div>
              <span class="name truncate">{s.name}</span>
            </button>
            {#if editing}
              <button class="remove" aria-label={`Delete ${s.name}`} onclick={() => removeMine(s)}><X size={14} /></button>
            {/if}
          </div>
        {/each}
      </div>
      <div class="head"><h4>Party stickers</h4></div>
    {/if}

    <div class="grid">
      {#if hb.me?.avatar}
        <!-- Only with a selfie: send your own face bouncing -->
        <button class="item card" disabled={busy || full} onclick={() => send({ face: true }, 'Your face')}>
          <div class="art"><StickerView sticker={{ id: 'face', name: 'Your face', kind: 'face', src: hb.me.avatar }} /></div>
          <span class="name">Your face</span>
        </button>
      {/if}
      {#each mod.catalog as s (s.id)}
        <button class="item card" disabled={busy || full} onclick={() => send({ id: s.id }, s.name)}>
          <div class="art"><StickerView sticker={s as StickerDef} /></div>
          <span class="name">{s.name}</span>
        </button>
      {/each}
    </div>

    {#if mod.allowText}
      <form novalidate
        class="card write"
        onsubmit={(e) => {
          e.preventDefault();
          send({ text }, 'Your message');
        }}
      >
        <label class="field">
          <span>Or write something (24 characters)</span>
          <div class="row">
            <input class="input" bind:value={text} maxlength="24" placeholder="Happy birthday!" />
            <button class="btn primary" disabled={busy || full || !text.trim()} aria-label="Send"><Send size={18} /></button>
          </div>
        </label>
      </form>
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
  }
  .intro {
    font-size: 0.9rem;
  }
  .status {
    font-size: 0.82rem;
    margin-top: -0.5rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
  }
  .item {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
    padding: 0.9rem 0.5rem 0.7rem;
    transition: transform 0.12s ease;
  }
  .item:active:not(:disabled) {
    transform: scale(0.95);
  }
  .item:disabled {
    opacity: 0.5;
  }
  .art {
    width: 4.2rem;
    height: 4.2rem;
  }
  .name {
    font-size: 0.8rem;
    color: var(--text-dim);
    font-weight: 500;
  }
  .write {
    padding: 1rem;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: -0.3rem;
  }
  .head h4 {
    margin: 0;
    font-size: 0.95rem;
  }
  .spacer {
    flex: 1;
  }
  .mine {
    position: relative;
    display: grid;
    min-width: 0;
  }
  .mine .name {
    max-width: 100%;
  }
  .make {
    border-style: dashed;
  }
  .full {
    align-content: center;
    text-align: center;
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
    transform: scale(0.75);
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
