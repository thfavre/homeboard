<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import { Trash2, Upload, X } from '@lucide/svelte';
  import type { StickersState } from '$shared/stickers.ts';
  import { hb, rpc, attempt, upload } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import StickerView from './StickerView.svelte';

  const mod = $derived(hb.modules.stickers as StickersState | undefined);
  const minutes = new Synced(() => (hb.modules.stickers ? Math.round((hb.modules.stickers.durationSec / 60) * 100) / 100 : undefined), 2);
  const max = new Synced(() => (hb.modules.stickers?.maxActive ? hb.modules.stickers.maxActive : undefined), 10);
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
      <button class="btn small danger" disabled={!mod.active.length} onclick={() => attempt(() => rpc('stickers', 'clear'))}>Clear all</button>
    {/snippet}
    <!-- Fixed height with its own scroll, so stickers coming and going never move the page -->
    <div class="active-list">
    {#each mod.active as a (a.id)}
      <div class="line">
        <div class="mini">{#if a.sticker}<StickerView sticker={a.sticker} />{/if}</div>
        <span class="truncate">{a.text ? `"${a.text}"` : a.sticker?.name}</span>
        <span class="faint">by {a.guest.name}</span>
        <span class="spacer"></span>
        <button class="btn ghost small" aria-label="Remove" onclick={() => attempt(() => rpc('stickers', 'remove', { id: a.id }))}><X size={16} /></button>
      </div>
    {:else}
      <p class="faint empty-line">No stickers right now.</p>
    {/each}
    </div>
  </Section>

  <Section title="Settings">
    <div class="grid2">
      <label class="field">
        <span>Time on screen (minutes)</span>
        <input class="input" type="number" min="0.5" step="0.5" bind:value={minutes.value} onfocus={minutes.start} onblur={() => { set({ durationSec: Number(minutes.value) * 60 }); minutes.end(); }} />
      </label>
      {#if mod.maxActive > 0}
        <label class="field">
          <span>Max on screen at once</span>
          <input
            class="input"
            type="number"
            min="1"
            max="100"
            bind:value={max.value}
            onfocus={max.start}
            onblur={() => {
              set({ maxActive: Math.max(1, Number(max.value)) });
              max.end();
            }}
          />
        </label>
      {/if}
    </div>
    <div class="line">
      <div>
        <strong>Limit stickers on screen</strong>
        <p class="faint small">When off, guests can send as many as they want.</p>
      </div>
      <Toggle checked={mod.maxActive > 0} label="Limit stickers" onchange={(v) => set({ maxActive: v ? max.value || 10 : 0 })} />
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
            <button class="btn ghost small del" aria-label="Delete" onclick={async () => (await ask({ title: `Delete ${s.name}?`, confirm: 'Delete', danger: true })) && attempt(() => rpc('stickers', 'deleteCustom', { id: s.id }))}>
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
  .active-list {
    height: 11rem;
    overflow-y: auto;
    display: grid;
    align-content: start;
    gap: 0.4rem;
  }
  .empty-line {
    align-self: center;
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
