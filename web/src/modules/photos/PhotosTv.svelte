<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import type { Photo, PhotosState } from '$shared/photos.ts';
  import { hb, showNames } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  const mod = $derived(hb.modules.photos as PhotosState | undefined);
  const current = $derived(mod?.current ?? null);

  /** Bottom of the pile first, so the photo on screen is drawn last (on top) */
  const pile = $derived(current ? [...(mod?.upcoming ?? []).slice(0, 3)].reverse().concat(current) : []);

  /**
   * Each photo keeps the same tilt and offset for its whole life, so the pile
   * does not move when the top photo leaves: the next one just lights up.
   */
  function pose(p: Photo) {
    let h = 0;
    for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return {
      r: `${((h % 13) - 6) * 1.1}deg`,
      x: `${(((h >> 4) % 5) - 2) * 0.9}rem`,
      y: `${(((h >> 8) % 5) - 2) * 0.6}rem`,
    };
  }
</script>

{#if current}
  <div class="scrim" transition:fade={{ duration: 400 }}></div>
  <div class="stage">
    <div class="pile">
      {#each pile as p (p.id)}
        {@const pos = pose(p)}
        {@const top = p.id === current.id}
        <figure
          class="card"
          class:waiting={!top}
          style:--r={pos.r}
          style:--x={pos.x}
          style:--y={pos.y}
          in:fade={{ duration: 500 }}
          out:fly={{ y: -80, duration: 500 }}
        >
          {#if top}<div class="timer" style:animation-duration="{Math.max(0, current.until - Date.now())}ms"></div>{/if}
          <img src={p.url} alt={p.caption || 'Photo from ' + p.guest.name} />
          <figcaption>
            {#if p.caption}<p class="caption">{p.caption}</p>{/if}
            {#if showNames('photoNames')}
              <div class="by">
                <Avatar name={p.guest.name} color={p.guest.color} id={p.guest.id} size="1.9rem" />
                <span>{p.guest.name}</span>
              </div>
            {/if}
          </figcaption>
        </figure>
      {/each}
    </div>
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
    pointer-events: none;
    container-type: size;
  }
  /* Every photo sits in the same cell, centered, with its own size and shape */
  .pile {
    display: grid;
  }
  .card {
    grid-area: 1 / 1;
    place-self: center;
    position: relative;
    margin: 0;
    padding: 1.1rem 1.1rem 0;
    background: #fbfaf7;
    color: #1d1b16;
    border-radius: 0.6rem;
    box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.85);
    overflow: hidden;
    transform: translate(var(--x), var(--y)) rotate(var(--r));
    transition: filter 0.7s ease;
  }
  .waiting {
    filter: brightness(0.32) saturate(0.7);
  }
  img {
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
  @keyframes shrink {
    to {
      transform: scaleX(0);
    }
  }
</style>
