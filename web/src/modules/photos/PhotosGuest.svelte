<script lang="ts">
  import { ImagePlus, Send } from '@lucide/svelte';
  import type { PhotosState } from '$shared/photos.ts';
  import { hb, price, toast, upload } from '$lib/client.svelte.ts';
  import { shrinkImage } from '$lib/image.ts';
  import Money from '$lib/ui/Money.svelte';

  const mod = $derived(hb.modules.photos as PhotosState | undefined);
  const cost = $derived(price('photos.photo'));

  let input = $state<HTMLInputElement>();
  let blob = $state<Blob | null>(null);
  let preview = $state('');
  let caption = $state('');
  let busy = $state(false);

  async function pick(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      blob = await shrinkImage(file);
      if (preview) URL.revokeObjectURL(preview);
      preview = URL.createObjectURL(blob);
    } catch (err) {
      toast({ text: (err as Error).message, kind: 'error' });
    }
  }

  async function send() {
    if (!blob) return;
    busy = true;
    try {
      const r = await upload<{ position: number }>('photos', 'upload', blob, { caption });
      toast({ text: r.position > 0 ? `Sent. ${r.position} ahead of yours.` : 'Your photo is on the TV', kind: 'success' });
      blob = null;
      caption = '';
      if (input) input.value = '';
    } catch (err) {
      toast({ text: (err as Error).message, kind: 'error' });
    } finally {
      busy = false;
    }
  }
</script>

{#if mod}
  <div class="photos">
    <p class="dim intro">
      Your photo appears big on the TV for {mod.displaySec} seconds.
      {#if hb.core?.economyEnabled && cost}It costs <Money amount={cost} />.{/if}
    </p>

    {#if blob}
      <div class="card preview">
        <img src={preview} alt="Preview" />
        <input class="input" bind:value={caption} maxlength="80" placeholder="Add a caption (optional)" />
        <div class="row">
          <button class="btn ghost" onclick={() => input?.click()}>Change</button>
          <span class="spacer"></span>
          <button class="btn primary" disabled={busy} onclick={send}><Send size={18} /> {busy ? 'Sending...' : 'Show on TV'}</button>
        </div>
      </div>
    {:else}
      <button class="card picker" onclick={() => input?.click()}>
        <span class="icon"><ImagePlus size={30} /></span>
        <strong>Take or choose a photo</strong>
        <span class="faint">{mod.queued ? `${mod.queued} waiting to be shown` : 'Nothing in the queue, yours goes first'}</span>
      </button>
    {/if}
    <input bind:this={input} type="file" accept="image/*" hidden onchange={pick} />
  </div>
{/if}

<style>
  .photos {
    display: grid;
    gap: 0.9rem;
  }
  .intro {
    font-size: 0.9rem;
  }
  .picker {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    padding: 2.5rem 1rem;
    border-style: dashed;
    border-width: 1.5px;
    text-align: center;
  }
  .picker .icon {
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    border-radius: 1.2rem;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    margin-bottom: 0.4rem;
  }
  .picker .faint {
    font-size: 0.85rem;
  }
  .preview {
    padding: 0.8rem;
    display: grid;
    gap: 0.8rem;
  }
  .preview img {
    width: 100%;
    max-height: 50dvh;
    object-fit: contain;
    border-radius: var(--radius-sm);
    background: #000;
  }
</style>
