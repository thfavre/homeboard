<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import { choose } from '$lib/dialog.svelte.ts';
  import { Repeat, SkipForward, Trash2 } from '@lucide/svelte';
  import type { Photo, PhotosState } from '$shared/photos.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import { ago } from '$lib/time.ts';

  const mod = $derived(hb.modules.photos as PhotosState | undefined);
  const seconds = new Synced(() => hb.modules.photos?.displaySec, 12);
  const maxQueue = new Synced(() => hb.modules.photos?.maxQueue, 20);

  async function remove(p: Photo) {
    const refund = await choose({
      title: `Remove this photo from ${p.guest.name}?`,
      options: [
        { label: 'Remove', value: false, kind: 'default' },
        { label: 'Remove and refund', value: true, kind: 'danger' },
      ],
    });
    if (refund === null) return;
    attempt(() => rpc('photos', 'remove', { id: p.id, refund }), refund ? 'Removed and refunded' : 'Removed');
  }

  const set = (args: Record<string, unknown>) => attempt(() => rpc('photos', 'setOptions', args));
</script>

{#if mod}
  <!-- Fixed size, so the page below never moves when the photo on the TV changes -->
  <Section title="On the TV now">
    <div class="now">
      <div class="thumb">
        {#if mod.current}<img src={mod.current.url} alt="" />{:else}<span class="faint">Nothing</span>{/if}
      </div>
      <div class="info">
        <strong class="truncate">{mod.current ? mod.current.guest.name : 'No photo on screen'}</strong>
        <span class="dim caption">{mod.current?.caption ?? ''}</span>
        <span class="faint small">{mod.queue?.length ? `${mod.queue.length} waiting` : 'Nothing waiting'}</span>
        <div class="row">
          <button class="btn small" disabled={!mod.current} onclick={() => attempt(() => rpc('photos', 'skip'))}><SkipForward size={16} /> Next</button>
          <button class="btn small danger" disabled={!mod.current} onclick={() => mod.current && remove(mod.current)}><Trash2 size={16} /> Remove</button>
        </div>
      </div>
    </div>
  </Section>

  <Section title="All photos" hint="Photos are deleted when you start a new session.">
    <div class="gallery">
      {#each mod.gallery ?? [] as p (p.id)}
        <div class="photo">
          <img src={p.url} alt="" loading="lazy" />
          <div class="meta">
            <span class="truncate">{p.guest.name}</span>
            <span class="faint">{ago(p.at)}</span>
          </div>
          <div class="actions">
            <button class="btn ghost small" aria-label="Show again" onclick={() => attempt(() => rpc('photos', 'showAgain', { id: p.id }), 'Queued')}>
              <Repeat size={15} />
            </button>
            <button class="btn ghost small" aria-label="Remove" onclick={() => remove(p)}><Trash2 size={15} /></button>
          </div>
        </div>
      {:else}
        <p class="faint">No photos yet.</p>
      {/each}
    </div>
  </Section>

  <Section title="Settings">
    <div class="grid2">
      <label class="field">
        <span>Seconds on screen</span>
        <input class="input" type="number" min="3" max="120" bind:value={seconds.value} onfocus={seconds.start} onblur={() => { set({ displaySec: Number(seconds.value) }); seconds.end(); }} />
      </label>
      <label class="field">
        <span>Max photos waiting</span>
        <input class="input" type="number" min="1" max="100" bind:value={maxQueue.value} onfocus={maxQueue.start} onblur={() => { set({ maxQueue: Number(maxQueue.value) }); maxQueue.end(); }} />
      </label>
    </div>
  </Section>
{/if}

<style>
  .now {
    display: flex;
    gap: 1rem;
    height: 9rem;
  }
  .thumb {
    flex: none;
    width: 9rem;
    height: 9rem;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    overflow: hidden;
    font-size: 0.85rem;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    gap: 0.3rem;
  }
  .caption {
    font-size: 0.88rem;
    line-height: 1.3;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .small {
    font-size: 0.8rem;
  }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.7rem;
  }
  .photo {
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    overflow: hidden;
  }
  .photo img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.4rem 0.6rem 0;
    font-size: 0.8rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    padding: 0 0.2rem 0.2rem;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }
</style>
