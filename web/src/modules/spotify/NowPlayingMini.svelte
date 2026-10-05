<script lang="ts">
  import type { SpotifyState } from '$shared/spotify.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Cover from './Cover.svelte';
  import { progressOf, ticker } from './progress.svelte.ts';

  const now = $derived((hb.modules.spotify as SpotifyState | undefined)?.now ?? null);
  const tick = ticker(1000);
</script>

<!-- Shown as soon as Spotify is connected, even with nothing playing, so the page does not jump -->
{#if hb.modules.spotify?.connected}
  <div class="card mini">
    <Cover src={now?.image ?? null} size="3.2rem" />
    <div class="text">
      <span class="eyebrow">{now ? (now.isPlaying ? 'Now playing' : 'Paused') : 'Music'}</span>
      <span class="title truncate">{now ? now.title : 'Nothing playing'}</span>
      <span class="artist truncate">{now ? now.artists : 'Add a song to get things going'}</span>
    </div>
    <div class="bar"><span style:width="{now ? (progressOf(now, tick.now) / Math.max(1, now.durationMs)) * 100 : 0}%"></span></div>
  </div>
{/if}

<style>
  .mini {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.75rem 0.9rem 0.9rem;
    overflow: hidden;
  }
  .text {
    min-width: 0;
    display: grid;
  }
  .title {
    font-weight: 600;
  }
  .artist {
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--surface-3);
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--gradient);
  }
</style>
