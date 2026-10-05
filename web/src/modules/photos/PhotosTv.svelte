<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import type { PhotosState } from '$shared/photos.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  const mod = $derived(hb.modules.photos as PhotosState | undefined);
  const current = $derived(mod?.current ?? null);
  const upcoming = $derived(mod?.upcoming ?? []);
  const tilt = $derived(current ? ((current.id.charCodeAt(0) % 7) - 3) * 0.7 : 0);

  /** Position of each photo waiting in the pile, from the top of the pile down */
  const PILE = [
    { x: '1.6rem', y: '-1.1rem', r: '5deg' },
    { x: '-1.8rem', y: '-1.7rem', r: '-6deg' },
    { x: '2.6rem', y: '-2.4rem', r: '9deg' },
  ];
  const pile = $derived(
    upcoming
      .slice(0, PILE.length)
      .map((p, i) => ({ photo: p, pos: PILE[i] }))
      .reverse(),
  );
</script>

{#if current}
  <div class="scrim" transition:fade={{ duration: 400 }}></div>
  <div class="stage">
    <div class="pile">
      {#each pile as { photo, pos } (photo.id)}
        <div class="card back" style:--x={pos.x} style:--y={pos.y} style:--r={pos.r} transition:fade={{ duration: 300 }}>
          <img src={photo.url} alt="" />
        </div>
      {/each}

      {#key current.id}
        <figure class="card front" style:--tilt="{tilt}deg" in:fly={{ y: 120, duration: 600, opacity: 0 }} out:fade={{ duration: 300 }}>
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
      {/key}
    </div>

    {#if mod && mod.queued > 0}
      <span class="waiting" transition:fade>{mod.queued} more {mod.queued === 1 ? 'photo' : 'photos'} waiting</span>
    {/if}
  </div>
{/if}

<style>
  /* Only the main area is covered: the sidebar (music, leaderboard, join code) stays sharp */
  .scrim,
  .stage {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: calc(var(--tv-pad-x, 2rem) + var(--tv-side, 27rem) + var(--tv-gap, 1.2rem) / 2);
  }
  .scrim {
    z-index: 30;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    mask-image: linear-gradient(90deg, #000 calc(100% - 1.5rem), transparent);
  }
  .stage {
    z-index: 31;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2.2rem;
    pointer-events: none;
    container-type: size;
  }
  /* The front photo sets the size; the waiting ones sit behind it at the same size */
  .pile {
    position: relative;
    display: grid;
  }
  .front {
    grid-area: 1 / 1;
  }
  .card {
    margin: 0;
    background: #fbfaf7;
    color: #1d1b16;
    border-radius: 0.6rem;
    box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.85);
  }
  .back {
    position: absolute;
    inset: 0;
    padding: 1.1rem 1.1rem 4.5rem;
    transform: translate(var(--x), var(--y)) rotate(var(--r));
    transition: transform 0.6s ease;
    overflow: hidden;
  }
  .back img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 0.25rem;
    filter: brightness(0.8) saturate(0.85);
  }
  .front {
    position: relative;
    z-index: 2;
    padding: 1.1rem 1.1rem 0;
    transform: rotate(var(--tilt));
    overflow: hidden;
  }
  .front img {
    display: block;
    max-height: min(58vh, calc(100cqh - 20rem));
    max-width: calc(100cqw - 14rem);
    border-radius: 0.25rem;
    object-fit: contain;
    background: #111;
  }
  figcaption {
    display: grid;
    gap: 0.5rem;
    padding: 1rem 0.3rem 1.2rem;
    max-width: calc(100cqw - 14rem);
  }
  .caption {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.6rem;
    line-height: 1.2;
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
  .waiting {
    padding: 0.45rem 1.1rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    font-weight: 600;
    font-size: 1rem;
    backdrop-filter: blur(10px);
  }
  @keyframes shrink {
    to {
      transform: scaleX(0);
    }
  }
</style>
