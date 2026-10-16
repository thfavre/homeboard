<script lang="ts">
  import { ArrowLeft, Brush, ClipboardPaste, Camera, ImageUp, Pencil } from '@lucide/svelte';
  import type { GuestSticker } from '$shared/stickers.ts';
  import { attempt, upload } from '$lib/client.svelte.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import DrawPad from './DrawPad.svelte';
  import PhotoCutout from './PhotoCutout.svelte';
  import { finish, readImage, toPng, trim } from './stickerImage.ts';

  /**
   * Makes a sticker for the guest's own collection: imported as is (a WhatsApp sticker, any image),
   * cut out of a photo, or drawn with a finger. Everything is done on the phone, the server just
   * stores the finished picture.
   */
  let { onsaved, onclose }: { onsaved: (list: GuestSticker[]) => void; onclose: () => void } = $props();

  type Mode = 'pick' | 'import' | 'photo' | 'draw';
  /** Sent untouched below this size (keeps animated WhatsApp stickers and GIFs moving). Matches the server limit. */
  const KEEP_MAX = 8 * 1024 * 1024;

  /** An animated PNG (APNG) has an acTL chunk before its first image data */
  async function isAnimatedPng(file: Blob): Promise<boolean> {
    if (file.type !== 'image/png') return false;
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const text = String.fromCharCode(...head);
    const at = text.indexOf('acTL');
    return at > 0 && at < text.indexOf('IDAT');
  }

  let mode = $state<Mode>('pick');
  let name = $state('');
  let border = $state(true);
  let busy = $state(false);
  let error = $state('');

  // Import: the original file when it is sent as is, otherwise the image read into a canvas
  let original = $state<Blob | null>(null);
  let imported = $state<HTMLCanvasElement | null>(null);
  let preview = $state('');
  // Photo
  let photo = $state<HTMLCanvasElement | null>(null);
  let cutout = $state<PhotoCutout>();
  let pad = $state<DrawPad>();
  // Draw: a picture to draw over (a cut-out photo, or one picked in the pad)
  let drawOn = $state.raw<HTMLCanvasElement | null>(null);

  function drawOnCutout() {
    const raw = cutout?.render();
    const cut = raw && trim(raw);
    if (!cut) {
      error = 'Trace around something first';
      return;
    }
    error = '';
    drawOn = cut;
    mode = 'draw';
  }

  let fileInput = $state<HTMLInputElement>();
  let pickingFor: 'import' | 'photo' = 'import';
  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.read && window.isSecureContext;

  $effect(() => {
    const url = preview;
    return () => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    };
  });

  function choose(for_: 'import' | 'photo') {
    pickingFor = for_;
    error = '';
    fileInput?.click();
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await take(file, pickingFor);
  }

  async function take(file: Blob, for_: 'import' | 'photo') {
    error = '';
    try {
      if (for_ === 'photo') {
        photo = await readImage(file, 1200);
        border = true;
        mode = 'photo';
        return;
      }
      // WhatsApp stickers are WebP, often animated, and GIFs move: keep them exactly as they are
      if ((file.type === 'image/webp' || file.type === 'image/gif' || (await isAnimatedPng(file))) && file.size <= KEEP_MAX) {
        original = file;
        imported = null;
        preview = URL.createObjectURL(file);
      } else {
        original = null;
        imported = await readImage(file, 1024);
        border = false;
      }
      if (!name && file instanceof File) name = file.name.replace(/\.[^.]+$/, '').slice(0, 24);
      mode = 'import';
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function paste() {
    error = '';
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) return await take(await item.getType(type), 'import');
      }
      error = 'There is no picture to paste. Copy one first.';
    } catch {
      error = 'Could not paste. Pick the picture from your files instead.';
    }
  }

  // The import preview follows the border toggle
  $effect(() => {
    if (mode !== 'import' || !imported) return;
    const done = finish(imported, border);
    if (done) preview = done.toDataURL('image/png');
  });

  async function build(): Promise<Blob | null> {
    if (mode === 'import') {
      if (original) return original;
      const done = imported && finish(imported, border);
      return done ? toPng(done) : null;
    }
    const raw = mode === 'photo' ? cutout?.render() : pad?.render();
    if (!raw) {
      error = mode === 'photo' ? 'Trace around something first' : 'Draw something first';
      return null;
    }
    const done = finish(raw, border);
    if (!done) {
      error = 'There is nothing in it';
      return null;
    }
    return toPng(done);
  }

  async function save() {
    error = '';
    busy = true;
    const blob = await build().catch((err) => ((error = (err as Error).message), null));
    if (blob) {
      const fallback = mode === 'draw' ? 'My drawing' : mode === 'photo' ? 'My photo' : 'My sticker';
      const res = await attempt(
        () => upload<{ mine: GuestSticker[] }>('stickers', 'mine', blob, { name: name.trim() || fallback }),
        'Sticker saved',
      );
      if (res) {
        onsaved(res.mine);
        onclose();
      }
    }
    busy = false;
  }

  function back() {
    mode = 'pick';
    error = '';
    original = imported = photo = drawOn = null;
    preview = '';
  }

  const title = $derived(
    mode === 'photo' ? 'Sticker from a photo' : mode === 'draw' ? 'Draw a sticker' : mode === 'import' ? 'Import a sticker' : 'Make a sticker',
  );
</script>

<Sheet {title} {onclose}>
  <div class="maker">
    {#if mode === 'pick'}
      <p class="dim small">Only you see your stickers. Tap one to send it bouncing on the TV.</p>
      <button class="card choice" onclick={() => choose('photo')}>
        <span class="icon"><Camera size={22} /></span>
        <span><strong>From a photo</strong><span class="faint">Take or pick a photo, then cut out what you want</span></span>
      </button>
      <button
        class="card choice"
        onclick={() => {
          border = true;
          drawOn = null;
          mode = 'draw';
        }}
      >
        <span class="icon"><Pencil size={22} /></span>
        <span><strong>Draw one</strong><span class="faint">With your finger, on a blank sticker or over a picture</span></span>
      </button>
      <button class="card choice" onclick={() => choose('import')}>
        <span class="icon"><ImageUp size={22} /></span>
        <span>
          <strong>Import a picture</strong>
          <span class="faint">A WhatsApp sticker you saved, a PNG, a GIF... Animated ones stay animated.</span>
        </span>
      </button>
      {#if canPaste}
        <button class="btn" onclick={paste}><ClipboardPaste size={18} /> Paste a copied picture</button>
      {/if}
      <p class="faint small tip">
        WhatsApp stickers on Android are in your files, under WhatsApp &gt; Media &gt; WhatsApp Stickers.
      </p>
    {:else}
      {#if mode === 'import'}
        <div class="preview">{#if preview}<img src={preview} alt="Your sticker" />{/if}</div>
      {:else if mode === 'photo' && photo}
        {#key photo}<PhotoCutout bind:this={cutout} {photo} {border} />{/key}
      {:else if mode === 'draw'}
        <DrawPad bind:this={pad} {border} picture={drawOn} />
      {/if}

      <label class="field">
        <span>Name</span>
        <input class="input" bind:value={name} maxlength="24" placeholder="My sticker" />
      </label>
      {#if !original}
        <div class="line">
          <strong>White border</strong>
          <Toggle checked={border} label="White border" onchange={(v) => (border = v)} />
        </div>
      {/if}
    {/if}

    {#if error}<p class="error small">{error}</p>{/if}

    {#if mode !== 'pick'}
      <div class="actions">
        <button class="btn ghost" onclick={back}><ArrowLeft size={18} /> Back</button>
        {#if mode === 'photo'}<button class="btn ghost" onclick={drawOnCutout}><Brush size={18} /> Draw on it</button>{/if}
        <span class="spacer"></span>
        <button class="btn primary" disabled={busy} onclick={save}>{busy ? 'Saving...' : 'Save'}</button>
      </div>
    {/if}
  </div>
  <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onFile} />
</Sheet>

<style>
  .maker {
    display: grid;
    gap: 0.8rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.9rem 1rem;
    text-align: left;
  }
  .choice > span:last-child {
    display: grid;
    gap: 0.15rem;
    font-size: 0.85rem;
  }
  .choice strong {
    font-size: 1rem;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
    background: var(--gradient);
    color: #fff;
  }
  .tip {
    text-align: center;
  }
  .preview {
    display: grid;
    place-items: center;
    height: min(16rem, 40dvh);
    border-radius: var(--radius-sm);
    background:
      repeating-conic-gradient(rgba(127, 127, 127, 0.22) 0 25%, transparent 0 50%) 0 0 / 24px 24px,
      var(--surface-2);
  }
  .preview img {
    max-width: 85%;
    max-height: 85%;
    object-fit: contain;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .error {
    color: var(--danger, #ef4444);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .spacer {
    flex: 1;
  }
</style>
