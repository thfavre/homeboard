<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import { ChevronRight, Trash2, Upload, X } from '@lucide/svelte';
  import { stickerCategories, stickerLabel, type StickerDef, type StickersState } from '$shared/stickers.ts';
  import { hb, rpc, attempt, upload } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import StickerView from './StickerView.svelte';

  const mod = $derived(hb.modules.stickers as StickersState | undefined);
  const minutes = new Synced(() => (hb.modules.stickers ? Math.round((hb.modules.stickers.durationSec / 60) * 100) / 100 : undefined), 2);
  const max = new Synced(() => (hb.modules.stickers?.maxActive ? hb.modules.stickers.maxActive : undefined), 10);
  const perGuest = new Synced(() => hb.modules.stickers?.maxPerGuest, 24);
  let uploadName = $state('');
  let uploadCategory = $state('');
  let fileInput = $state<HTMLInputElement>();
  // The collection, by category (folded by default: there are a lot of stickers)
  const groups = $derived(stickerCategories(mod?.catalog ?? []).map((name) => ({ name, stickers: (mod?.catalog ?? []).filter((s) => s.category === name) })));
  let open = $state<Record<string, boolean>>({});

  const deleteSticker = async (s: StickerDef) =>
    (await ask({ title: `Delete this ${stickerLabel(s).toLowerCase()}?`, confirm: 'Delete', danger: true })) && attempt(() => rpc('stickers', 'deleteCustom', { id: s.id }));

  const set = (args: Record<string, unknown>) => attempt(() => rpc('stickers', 'setOptions', args));

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const category = uploadCategory.trim() || 'Other';
    await attempt(() => upload('stickers', 'upload', file, { name: uploadName.trim(), category }), `Sticker added to ${category}`);
    open[category] = true;
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
        <span class="truncate">{a.text ? `"${a.text}"` : a.sticker && stickerLabel(a.sticker)}</span>
        <span class="faint">by {a.guest.name}</span>
        <span class="spacer"></span>
        {#if a.sticker?.guestMade && a.guest.id}
          <button
            class="btn ghost small"
            aria-label="Delete this sticker"
            title="Take it off the TV and delete it from the guest's stickers"
            onclick={async () =>
              (await ask({ title: `Delete ${a.guest.name}'s sticker?`, message: 'It leaves the TV and their sticker collection.', confirm: 'Delete', danger: true })) &&
              attempt(() => rpc('stickers', 'deleteGuestSticker', { guest: a.guest.id, sticker: a.sticker!.id }))}
          >
            <Trash2 size={16} />
          </button>
        {/if}
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
    <div class="line">
      <div>
        <strong>Guests make their own stickers</strong>
        <p class="faint small">From a photo, a drawing or a picture they import (like a WhatsApp sticker). Each guest keeps up to {mod.maxPerGuest}.</p>
      </div>
      <Toggle checked={mod.allowCustom} label="Guests make their own stickers" onchange={(v) => set({ allowCustom: v })} />
    </div>
    {#if mod.allowCustom}
      <label class="field per-guest">
        <span>Stickers each guest can keep</span>
        <input
          class="input"
          type="number"
          min="1"
          max="200"
          bind:value={perGuest.value}
          onfocus={perGuest.start}
          onblur={() => {
            set({ maxPerGuest: Math.max(1, Number(perGuest.value) || 24) });
            perGuest.end();
          }}
        />
      </label>
    {/if}
  </Section>

  <Section title="Sticker collection" hint="Guests see one tab per category, in a random order of their own. Hide a category to keep it off their phones.">
    <div class="groups">
      {#each groups as g (g.name)}
        {@const hidden = mod.hiddenCategories.includes(g.name)}
        <div class="group" class:hidden>
          <div class="group-head">
            <button class="fold" aria-expanded={!!open[g.name]} onclick={() => (open[g.name] = !open[g.name])}>
              <span class="chev" class:open={open[g.name]}><ChevronRight size={16} /></span>
              <span class="peek"><StickerView sticker={g.stickers[0]} /></span>
              <strong class="truncate">{g.name}</strong>
              <span class="faint small">{g.stickers.length}{hidden ? ', hidden' : ''}</span>
            </button>
            <Toggle checked={!hidden} label={`Show ${g.name} to guests`} onchange={(v) => attempt(() => rpc('stickers', 'setCategoryHidden', { category: g.name, hidden: !v }))} />
          </div>
          {#if open[g.name]}
            <div class="catalog">
              {#each g.stickers as s (s.id)}
                <div class="cat" title={stickerLabel(s)}>
                  <div class="art"><StickerView sticker={s} lazy /></div>
                  {#if s.name}<span class="truncate small">{s.name}</span>{/if}
                  <button class="btn ghost small del" aria-label={`Delete ${stickerLabel(s)}`} onclick={() => deleteSticker(s)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    <div class="upload">
      <label class="field">
        <span>Category</span>
        <input class="input" list="sticker-categories" bind:value={uploadCategory} placeholder="Other" maxlength="24" />
        <datalist id="sticker-categories">
          {#each groups as g (g.name)}<option value={g.name}></option>{/each}
        </datalist>
      </label>
      <label class="field">
        <span>Name (optional)</span>
        <input class="input" bind:value={uploadName} placeholder="Goes by its category" maxlength="30" />
      </label>
      <button class="btn" onclick={() => fileInput?.click()}><Upload size={18} /> Upload</button>
      <input bind:this={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden onchange={onFile} />
    </div>
    <p class="faint small">PNG with transparency works best. GIFs and animated WebP stay animated.</p>
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
  .per-guest {
    max-width: 16rem;
  }
  .groups {
    display: grid;
    gap: 0.5rem;
  }
  .group {
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .group.hidden .peek,
  .group.hidden strong {
    opacity: 0.5;
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.7rem 0.35rem 0.3rem;
  }
  .fold {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.3rem;
    border: 0;
    background: none;
    color: var(--text);
    text-align: left;
  }
  .chev {
    display: grid;
    color: var(--text-faint);
    transition: transform 0.15s ease;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .peek {
    width: 2rem;
    height: 2rem;
    flex: none;
  }
  .upload {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    align-items: end;
    gap: 0.6rem;
    margin-top: 0.4rem;
  }
  .catalog {
    padding: 0 0.6rem 0.6rem;
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
    background: var(--surface);
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
    .grid2,
    .upload {
      grid-template-columns: 1fr;
    }
  }
</style>
