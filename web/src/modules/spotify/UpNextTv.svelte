<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import type { SpotifyState } from '$shared/spotify.ts';
  import { hb, showNames } from '$lib/client.svelte.ts';
  import Cover from './Cover.svelte';

  const SHOWN = 4;
  const spotify = $derived(hb.modules.spotify as SpotifyState | undefined);
  const queue = $derived((spotify?.queue ?? []).slice(0, SHOWN));
  // The public queue is cut short, so count from the total the server sends
  const more = $derived((spotify?.queueLength ?? spotify?.queue.length ?? 0) - queue.length);
</script>

{#if hb.modules.spotify?.connected && queue.length}
  <div class="card next">
    <span class="eyebrow">Up next</span>
    <ol>
      {#each queue as t, i (t.uri + i)}
        <li animate:flip={{ duration: 400 }} in:fade>
          <Cover src={t.image} size="2.6rem" radius="0.45rem" />
          <div class="text">
            <span class="title truncate">{t.title}</span>
            <span class="artist truncate">{t.artists}</span>
          </div>
          {#if t.requestedBy && showNames('songNames')}<span class="dot" style:background={t.requestedBy.color} title={t.requestedBy.name}></span>{/if}
        </li>
      {/each}
    </ol>
    {#if more > 0}<span class="more" in:fade>+{more} more</span>{/if}
  </div>
{/if}

<style>
  .next {
    padding: 1rem 1.2rem;
    display: grid;
    gap: 0.6rem;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.55rem;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .title {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .artist {
    font-size: 0.82rem;
    color: var(--text-dim);
  }
  .more {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-dim);
    padding-left: 3.3rem;
  }
  .dot {
    flex: none;
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
  }
</style>
