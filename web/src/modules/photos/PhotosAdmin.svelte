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
  <Section title="On the TV now">
    {#if mod.current}
      <div class="now">
        <img src={mod.current.url} alt="" />
        <div class="info">
          <strong>{mod.current.guest.name}</strong>
          {#if mod.current.caption}<span class="dim">{mod.current.caption}</span>{/if}
          <div class="row">
            <button class="btn small" onclick={() => attempt(() => rpc('photos', 'skip'))}><SkipForward size={16} /> Next</button>
            <button class="btn small danger" onclick={() => mod.current && remove(mod.current)}><Trash2 size={16} /> Remove</button>
          </div>
        </div>
      </div>
    {:else}
      <p class="faint">No photo on screen.</p>
    {/if}
    {#if mod.queue?.length}<p class="dim">{mod.queue.length} waiting</p>{/if}
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
    align-items: flex-start;
  }
  .now img {
    width: 9rem;
    border-radius: var(--radius-sm);
  }
  .info {
    display: grid;
    gap: 0.4rem;
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
