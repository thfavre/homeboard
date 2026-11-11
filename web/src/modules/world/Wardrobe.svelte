<script lang="ts">
  import { onMount } from 'svelte';
  import { Check } from '@lucide/svelte';
  import { attempt, onEvent, rpc } from '$lib/client.svelte.ts';
  import { COLOR_HEX, SLOTS, colorName, itemById, type Outfit, type WornItem } from '$shared/wardrobe.ts';
  import type { WardrobeMine } from '$shared/world.ts';

  /**
   * Everything the guest bought, worn or not, on the My look tab: tap a piece to wear it, tap it
   * again to take it off. Buying happens in the shop; this is the closet at home.
   */

  let { onchanged }: { onchanged?: () => void } = $props();

  let wd = $state<WardrobeMine | null>(null);
  let icons = $state<Record<string, string>>({});

  /** Owned pieces in the slot order of the shop */
  const pieces = $derived(
    (wd?.owned ?? [])
      .map((o) => ({ ...o, item: itemById(o.id) }))
      .filter((o) => !!o.item)
      .sort((a, b) => SLOTS.findIndex((s) => s.id === a.item!.slot) - SLOTS.findIndex((s) => s.id === b.item!.slot)),
  );

  const isWorn = (o: WornItem & { item?: { slot: string } }) => {
    const worn = wd?.outfit[o.item!.slot as keyof Outfit];
    return worn?.id === o.id && worn?.color === o.color;
  };

  onMount(() => {
    void (async () => {
      wd = await rpc<WardrobeMine>('world', 'wardrobe').catch(() => null);
      for (const slot of new Set(pieces.map((p) => p.item!.slot))) {
        rpc<Record<string, string>>('world', 'icons', { slot }).then((urls) => (icons = { ...icons, ...urls }));
      }
    })();
    return onEvent<{ balance: number }>('world', 'wallet', (w) => {
      if (wd) wd.balance = w.balance;
    });
  });

  async function toggle(piece: (typeof pieces)[number]) {
    const outfit: Outfit = { ...(wd?.outfit ?? {}) };
    const slot = piece.item!.slot;
    if (isWorn(piece)) {
      delete outfit[slot];
    } else {
      outfit[slot] = { id: piece.id, color: piece.color };
      // A dress replaces top and bottom (and they replace it)
      if (slot === 'dress') {
        delete outfit.top;
        delete outfit.bottom;
      }
      if (slot === 'top' || slot === 'bottom') delete outfit.dress;
    }
    const done = await attempt(() => rpc<WardrobeMine>('world', 'wear', { outfit }));
    if (done) {
      wd = done;
      onchanged?.();
    }
  }
</script>

{#if pieces.length}
  <div class="wardrobe">
    <span class="label">Wardrobe</span>
    <div class="grid">
      {#each pieces as piece (piece.id + piece.color)}
        <button type="button" class="piece" class:worn={isWorn(piece)} onclick={() => toggle(piece)}>
          <span class="pic">
            {#if icons[piece.id]}
              <img src={icons[piece.id]} alt={piece.item!.name} loading="lazy" />
            {/if}
          </span>
          <span class="pname">{piece.item!.name}</span>
          <span class="meta">
            <span class="color" style:background={COLOR_HEX[piece.color] ?? '#888'} title={colorName(piece.color)}></span>
            {#if isWorn(piece)}<span class="worn-tag"><Check size={12} />Worn</span>{/if}
          </span>
        </button>
      {/each}
    </div>
    <p class="faint hint">Tap a piece to wear it or take it off. The shop sells more.</p>
  </div>
{/if}

<style>
  .wardrobe {
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
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(5.6rem, 1fr));
    gap: 0.5rem;
  }
  .piece {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.55rem 0.3rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    min-width: 0;
  }
  .piece.worn {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
  }
  .pic {
    display: grid;
    place-items: center;
    width: 3.4rem;
    height: 3.4rem;
  }
  .pic img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }
  .pname {
    max-width: 100%;
    font-size: 0.78rem;
    line-height: 1.15;
    text-align: center;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .meta {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 0.9rem;
  }
  .color {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    border: 1px solid var(--border);
  }
  .worn-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--accent);
  }
  .hint {
    margin: 0;
    font-size: 0.82rem;
  }
</style>
