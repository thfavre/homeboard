<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import type { PhotosState } from '$shared/photos.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  const mod = $derived(hb.modules.photos as PhotosState | undefined);
  const current = $derived(mod?.current ?? null);
  const tilt = $derived(current ? ((current.id.charCodeAt(0) % 7) - 3) * 0.7 : 0);
</script>

{#if current}
  <div class="scrim" transition:fade={{ duration: 400 }}></div>
  {#key current.id}
    <div class="stage">
      <figure class="polaroid" style:--tilt="{tilt}deg" in:fly={{ y: 120, duration: 600, opacity: 0 }} out:fade={{ duration: 300 }}>
        <div class="timer" style:animation-duration="{Math.max(0, current.until - Date.now())}ms"></div>
        <img src={current.url} alt={current.caption || 'Photo from ' + current.guest.name} />
        <figcaption>
          {#if current.caption}<p class="caption">{current.caption}</p>{/if}
          <div class="by">
            <Avatar name={current.guest.name} color={current.guest.color} size="1.9rem" />
            <span>{current.guest.name}</span>
          </div>
        </figcaption>
      </figure>
    </div>
  {/key}
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    backdrop-filter: blur(6px);
  }
  .stage {
    position: fixed;
    inset: 0;
    z-index: 31;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .polaroid {
    position: relative;
    margin: 0;
    padding: 1.1rem 1.1rem 0;
    background: #fbfaf7;
    color: #1d1b16;
    border-radius: 0.6rem;
    box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.8);
    transform: rotate(var(--tilt));
    overflow: hidden;
    max-width: 80vw;
  }
  img {
    max-height: 72vh;
    max-width: calc(80vw - 2.2rem);
    border-radius: 0.25rem;
    object-fit: contain;
    background: #111;
  }
  figcaption {
    display: grid;
    gap: 0.5rem;
    padding: 1rem 0.3rem 1.2rem;
  }
  .caption {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.6rem;
    line-height: 1.2;
    max-width: 50rem;
  }
  .by {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-weight: 600;
    font-size: 1.05rem;
    color: #55514a;
  }
  .timer {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 0.3rem;
    width: 100%;
    background: var(--accent);
    transform-origin: left;
    animation: shrink linear forwards;
  }
  @keyframes shrink {
    to {
      transform: scaleX(0);
    }
  }
</style>
