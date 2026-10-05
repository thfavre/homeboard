<script lang="ts">
  import { Camera, RefreshCw } from '@lucide/svelte';

  /**
   * Takes a selfie with the camera. Uses the live camera in the page when the browser allows it
   * (needs https), otherwise opens the phone camera directly. Never the photo library.
   */
  let { oncapture, oncancel }: { oncapture: (photo: Blob) => void; oncancel: () => void } = $props();

  const canStream = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
  let video = $state<HTMLVideoElement>();
  let fileInput = $state<HTMLInputElement>();
  let facing = $state<'user' | 'environment'>('user');
  let live = $state(false);
  let failed = $state(!canStream);
  let stream: MediaStream | null = null;

  function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    live = false;
  }

  $effect(() => {
    if (!canStream || !video) return;
    const mode = facing;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        video!.srcObject = s;
        await video!.play();
        live = true;
      })
      .catch(() => (failed = true));
    return () => {
      cancelled = true;
      stop();
    };
  });

  function snap() {
    if (!video || !live) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const side = Math.min(vw, vh);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 640;
    const ctx = canvas.getContext('2d')!;
    // The front camera preview is mirrored: keep the picture as the guest saw it
    if (facing === 'user') {
      ctx.translate(640, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, 640, 640);
    canvas.toBlob((b) => b && (stop(), oncapture(b)), 'image/jpeg', 0.92);
  }

  function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (file) oncapture(file);
  }
</script>

<div class="camera">
  <div class="frame">
    {#if !failed}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} class:mirror={facing === 'user'} playsinline muted></video>
      <div class="guide"></div>
      {#if !live}<p class="hint">Starting the camera...</p>{/if}
    {:else}
      <div class="fallback">
        <Camera size={40} />
        <p>Your phone camera opens to take the picture.</p>
      </div>
    {/if}
  </div>

  <div class="controls">
    <button class="btn ghost" onclick={oncancel}>Cancel</button>
    {#if !failed}
      <button class="shutter" disabled={!live} onclick={snap} aria-label="Take the picture"></button>
      <button class="btn ghost icon" onclick={() => (facing = facing === 'user' ? 'environment' : 'user')} aria-label="Switch camera">
        <RefreshCw size={20} />
      </button>
    {:else}
      <button class="btn primary" onclick={() => fileInput?.click()}><Camera size={18} /> Open camera</button>
      <span class="spacer-btn"></span>
    {/if}
  </div>
  <!-- capture="user" opens the front camera directly instead of the photo library -->
  <input bind:this={fileInput} type="file" accept="image/*" capture="user" hidden onchange={onFile} />
</div>

<style>
  .camera {
    display: grid;
    gap: 1.2rem;
  }
  .frame {
    position: relative;
    width: 100%;
    max-width: 24rem;
    aspect-ratio: 1;
    margin: 0 auto;
    border-radius: var(--radius);
    overflow: hidden;
    background: #000;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .mirror {
    transform: scaleX(-1);
  }
  .guide {
    position: absolute;
    inset: 12% 18% 8%;
    border: 2px dashed rgba(255, 255, 255, 0.45);
    border-radius: 50% / 45%;
    pointer-events: none;
  }
  .hint {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.9rem;
  }
  .fallback {
    height: 100%;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.8rem;
    padding: 2rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.92rem;
  }
  .controls {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    justify-items: center;
  }
  .shutter {
    width: 4.4rem;
    height: 4.4rem;
    border-radius: 50%;
    border: 4px solid var(--text);
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--bg) inset;
    transition: transform 0.1s ease;
  }
  .shutter:active:not(:disabled) {
    transform: scale(0.92);
  }
  .shutter:disabled {
    opacity: 0.4;
  }
  .icon {
    padding: 0;
    width: 3rem;
  }
</style>
