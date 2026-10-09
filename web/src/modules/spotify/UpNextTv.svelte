<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { SpotifyState } from '$shared/spotify.ts';
  import { hb, showNames } from '$lib/client.svelte.ts';
  import Cover from './Cover.svelte';

  const SHOWN = 4;
  const spotify = $derived(hb.modules.spotify as SpotifyState | undefined);
  // Keyed by song and which copy of it, so a row keeps its identity as the list moves up
  // (the same song can be queued by a guest and come up again from the playlist)
  const queue = $derived.by(() => {
    const seen = new Map<string, number>();
    return (spotify?.queue ?? []).slice(0, SHOWN).map((t) => {
      const n = seen.get(t.uri) ?? 0;
      seen.set(t.uri, n + 1);
      return { ...t, key: `${t.uri}#${n}` };
    });
  });
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = (d: number) => (reduced ? 0 : d);
  // Guest songs play first, so the ones past the list are the guest total minus the rows shown
  const more = $derived(Math.max(0, (spotify?.guestQueued ?? 0) - SHOWN));
</script>

{#if hb.modules.spotify?.connected && queue.length}
  <div class="card next">
    <span class="eyebrow">Up next</span>
    <ol>
      {#each queue as t (t.key)}
        <li
          animate:flip={{ duration: ms(500), easing: cubicOut }}
          in:fly={{ x: 28, duration: ms(450), delay: ms(150), easing: cubicOut }}
          out:fly={{ x: -28, duration: ms(300) }}
        >
          <Cover src={t.image} size="2.6rem" radius="0.45rem" />
          <div class="text">
            <span class="title truncate">{t.title}</span>
            <span class="artist truncate">{t.artists}</span>
          </div>
          {#if t.requestedBy && showNames('songNames')}<span class="dot" style:background={t.requestedBy.color} title={t.requestedBy.name}></span>{/if}
        </li>
      {/each}
    </ol>
    {#if more > 0}<span class="more" transition:fade={{ duration: ms(250) }}>+{more} more</span>{/if}
  </div>
{/if}

<style>
  .next {
    padding: 1rem 1.2rem;
    display: grid;
    gap: 0.6rem;
  }
  ol {
    /* Rows leaving are taken out of the flow while they slide away */
    position: relative;
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
