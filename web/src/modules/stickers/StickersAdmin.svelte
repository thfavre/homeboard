<script lang="ts">
  import { Trash2, Upload, X } from '@lucide/svelte';
  import type { StickersState } from '$shared/stickers.ts';
  import { hb, rpc, attempt, upload } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import StickerView from './StickerView.svelte';

  const mod = $derived(hb.modules.stickers as StickersState | undefined);
  let minutes = $state(String((hb.modules.stickers?.durationSec ?? 120) / 60));
  let max = $state(String(hb.modules.stickers?.maxActive ?? 10));
  let uploadName = $state('');
  let fileInput = $state<HTMLInputElement>();

  const set = (args: Record<string, unknown>) => attempt(() => rpc('stickers', 'setOptions', args));

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    await attempt(() => upload('stickers', 'upload', file, { name: uploadName || file.name.replace(/\.[^.]+$/, '') }), 'Sticker added');
    uploadName = '';
    if (fileInput) fileInput.value = '';
  }
</script>

{#if mod}
  <Section title="On the TV now">
    {#snippet actions()}
      {#if mod.active.length}
        <button class="btn small danger" onclick={() => attempt(() => rpc('stickers', 'clear'))}>Clear all</button>
      {/if}
    {/snippet}
    {#each mod.active as a (a.id)}
      <div class="line">
        <div class="mini">{#if a.sticker}<StickerView sticker={a.sticker} />{/if}</div>
        <span class="truncate">{a.text ? `"${a.text}"` : a.sticker?.name}</span>
        <span class="faint">by {a.guest.name}</span>
        <span class="spacer"></span>
        <button class="btn ghost small" aria-label="Remove" onclick={() => attempt(() => rpc('stickers', 'remove', { id: a.id }))}><X size={16} /></button>
      </div>
    {:else}
      <p class="faint">No stickers right now.</p>
    {/each}
  </Section>

  <Section title="Settings">
    <div class="grid2">
      <label class="field">
        <span>Time on screen (minutes)</span>
        <input class="input" type="number" min="0.5" step="0.5" bind:value={minutes} onblur={() => set({ durationSec: Number(minutes) * 60 })} />
      </label>
      <label class="field">
        <span>Max on screen at once</span>
        <input class="input" type="number" min="1" max="40" bind:value={max} onblur={() => set({ maxActive: Number(max) })} />
      </label>
    </div>
    <div class="line">
      <div>
        <strong>Text stickers</strong>
        <p class="faint small">Guests can write a short message instead of picking a sticker.</p>
      </div>
      <Toggle checked={mod.allowText} label="Text stickers" onchange={(v) => set({ allowText: v })} />
    </div>
  </Section>

  <Section title="Sticker collection" hint="Add your own images (PNG with transparency works best).">
    <div class="catalog">
      {#each mod.catalog as s (s.id)}
        <div class="cat">
          <div class="art"><StickerView sticker={s} /></div>
          <span class="truncate small">{s.name}</span>
          {#if s.kind === 'image'}
            <button class="btn ghost small del" aria-label="Delete" onclick={() => confirm(`Delete ${s.name}?`) && attempt(() => rpc('stickers', 'deleteCustom', { id: s.id }))}>
              <Trash2 size={15} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
    <div class="row">
      <input class="input" bind:value={uploadName} placeholder="Name (optional)" maxlength="30" />
      <button class="btn" onclick={() => fileInput?.click()}><Upload size={18} /> Upload</button>
      <input bind:this={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden onchange={onFile} />
    </div>
  </Section>
{/if}

<style>
  .line {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .mini {
    width: 2rem;
    height: 2rem;
    flex: none;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }
  .small {
    font-size: 0.82rem;
  }
  .catalog {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
    gap: 0.6rem;
  }
  .cat {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    padding: 0.7rem 0.4rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .art {
    width: 3.2rem;
    height: 3.2rem;
  }
  .del {
    position: absolute;
    top: 0.1rem;
    right: 0.1rem;
    padding: 0;
    width: 1.8rem;
    min-height: 1.8rem;
  }
  @media (max-width: 600px) {
    .grid2 {
      grid-template-columns: 1fr;
    }
  }
</style>
