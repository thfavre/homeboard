<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { SpotifyState } from '$shared/spotify.ts';
  import { hb, showNames } from '$lib/client.svelte.ts';
  import { clock } from '$lib/time.ts';
  import Cover from './Cover.svelte';
  import { progressOf, ticker } from './progress.svelte.ts';

  const mod = $derived(hb.modules.spotify as SpotifyState | undefined);
  const now = $derived(mod?.now ?? null);
  const tick = ticker();
  const pos = $derived(now ? progressOf(now, tick.now) : 0);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = (d: number) => (reduced ? 0 : d);
</script>

{#if mod?.connected}
  <div class="card np">
    {#if now}
      <!-- The old cover and title stay under the new ones while they fade out -->
      <div class="art">
        {#key now.uri}
          <div class="layer" in:scale={{ start: 0.9, opacity: 0, duration: ms(550), easing: cubicOut }} out:fade={{ duration: ms(450) }}>
            {#if now.image}<img class="blur" src={now.image} alt="" />{/if}
            <Cover src={now.image} size="7.5rem" radius="0.9rem" />
          </div>
        {/key}
      </div>
      <div class="info">
        <span class="eyebrow">{now.isPlaying ? 'Now playing' : 'Paused'}</span>
        <div class="song">
          {#key now.uri}
            <div class="layer" in:fly={{ y: 10, duration: ms(450), delay: ms(120), easing: cubicOut }} out:fade={{ duration: ms(200) }}>
              <p class="title">{now.title}</p>
              <p class="artist truncate">{now.artists}</p>
              {#if now.requestedBy && showNames('songNames')}
                <span class="by" style:--c={now.requestedBy.color}>Requested by {now.requestedBy.name}</span>
              {/if}
            </div>
          {/key}
        </div>
        <!-- A new bar for each song, so it starts empty instead of sliding back -->
        {#key now.uri}
          <div class="bar"><span style:width="{(pos / Math.max(1, now.durationMs)) * 100}%"></span></div>
        {/key}
        <div class="times mono"><span>{clock(pos)}</span><span>{clock(now.durationMs)}</span></div>
      </div>
    {:else}
      <div class="idle">
        <span class="eyebrow">Music</span>
        <p class="dim">Nothing playing. Add a song from your phone.</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .np {
    /* Never squeezed by a full side column (overflow: hidden would let it shrink); the leaderboard gives way instead */
    flex: none;
    position: relative;
    display: flex;
    gap: 1.1rem;
    padding: 1.1rem;
    overflow: hidden;
  }
  .art,
  .song {
    position: relative;
    display: grid;
  }
  .art {
    flex: none;
  }
  .song {
    min-width: 0;
  }
  /* Both songs share one cell while they change */
  .layer {
    grid-area: 1 / 1;
    position: relative;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .blur {
    position: absolute;
    inset: -40%;
    width: 180%;
    height: 180%;
    object-fit: cover;
    filter: blur(40px) saturate(1.6);
    opacity: 0.35;
    z-index: -1;
  }
  .art :global(.cover) {
    position: relative;
    box-shadow: 0 16px 36px -14px rgba(0, 0, 0, 0.8);
  }
  .info {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .title {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.3rem;
    line-height: 1.15;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .artist {
    color: var(--text-dim);
    font-size: 1rem;
  }
  .by {
    align-self: flex-start;
    margin-top: 0.15rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--c);
  }
  .bar {
    margin-top: auto;
    height: 0.3rem;
    border-radius: 999px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--gradient);
    transition: width 0.5s linear;
  }
  .times {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--text-faint);
  }
  .idle {
    display: grid;
    gap: 0.3rem;
  }
</style>
