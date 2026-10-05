<script lang="ts">
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import type { AvatarParams } from '$shared/avatar.ts';
  import { hb, postJson, getBlob, toast } from '$lib/client.svelte.ts';
  import Camera from '$lib/avatar/Camera.svelte';
  import Editor from '$lib/avatar/Editor.svelte';
  import { toDataUrl } from '$lib/avatar/render.ts';

  /**
   * Full-screen flow to make or edit the selfie avatar.
   * mode 'new': camera then editor. mode 'edit': editor on the saved original.
   */
  let { mode, onclose }: { mode: 'new' | 'edit'; onclose: () => void } = $props();

  let photo = $state<Blob | null>(null);
  let isNewPhoto = $state(false);
  // The flow starts once with the mode it was opened with
  const startMode = untrack(() => mode);
  let step = $state<'camera' | 'edit' | 'loading'>(startMode === 'new' ? 'camera' : 'loading');
  let busy = $state(false);

  if (startMode === 'edit') {
    getBlob('core', 'avatar/original')
      .then((b) => {
        photo = b;
        step = 'edit';
      })
      .catch(() => {
        // No original on the server (removed): take a new one
        step = 'camera';
      });
  }

  function captured(b: Blob) {
    photo = b;
    isNewPhoto = true;
    step = 'edit';
  }

  async function save(canvas: HTMLCanvasElement, source: ImageData, params: AvatarParams) {
    busy = true;
    try {
      await postJson('core', 'avatar', {
        rendered: await toDataUrl(canvas, 384),
        original: isNewPhoto ? await toDataUrl(source, source.width, 0.9) : undefined,
        params,
      });
      toast({ text: 'Your picture is saved', kind: 'success' });
      onclose();
    } catch (err) {
      toast({ text: (err as Error).message, kind: 'error' });
    } finally {
      busy = false;
    }
  }
</script>

<div class="flow" transition:fade={{ duration: 150 }}>
  <div class="inner">
    <header>
      <h2>{step === 'camera' ? 'Take a selfie' : 'Your picture'}</h2>
      <p class="dim">{step === 'camera' ? 'Center your face in the circle.' : 'Add an effect and an emoji if you like. It shows next to your name on the TV.'}</p>
    </header>

    {#if step === 'camera'}
      <Camera oncapture={captured} oncancel={onclose} />
    {:else if step === 'edit' && photo}
      {#key photo}
        <Editor {photo} initial={isNewPhoto ? undefined : hb.me?.avatarParams} {busy} onsave={save} onretake={() => (step = 'camera')} />
      {/key}
      <button class="btn ghost block" onclick={onclose}>Cancel</button>
    {:else}
      <p class="dim center">Loading your picture...</p>
    {/if}
  </div>
</div>

<style>
  .flow {
    position: fixed;
    inset: 0;
    z-index: 1200;
    overflow-y: auto;
    background: var(--bg-image, none), var(--bg);
  }
  .inner {
    max-width: 30rem;
    margin: 0 auto;
    padding: calc(1.2rem + env(safe-area-inset-top)) 1.1rem calc(1.5rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 1.1rem;
  }
  header {
    display: grid;
    gap: 0.3rem;
  }
  h2 {
    font-size: 1.5rem;
  }
  .center {
    text-align: center;
    padding: 3rem 0;
  }
</style>
