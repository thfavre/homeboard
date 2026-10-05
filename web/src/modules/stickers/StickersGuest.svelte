<script lang="ts">
  import { Send } from '@lucide/svelte';
  import type { StickerDef, StickersState } from '$shared/stickers.ts';
  import { hb, rpc, attempt, price } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import StickerView from './StickerView.svelte';

  const mod = $derived(hb.modules.stickers as StickersState | undefined);
  const cost = $derived(price('stickers.sticker'));
  const full = $derived(!!mod && mod.active.length >= mod.maxActive);
  let text = $state('');
  let busy = $state(false);

  async function send(args: { id?: string; text?: string }, label: string) {
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
    <p class="faint status">{mod.active.length} of {mod.maxActive} on screen{#if full}, wait for one to leave{/if}</p>

    <div class="grid">
      {#each mod.catalog as s (s.id)}
        <button class="item card" disabled={busy || full} onclick={() => send({ id: s.id }, s.name)}>
          <div class="art"><StickerView sticker={s as StickerDef} /></div>
          <span class="name">{s.name}</span>
        </button>
      {/each}
    </div>

    {#if mod.allowText}
      <form
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
</style>
