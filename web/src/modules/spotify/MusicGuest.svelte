<script lang="ts">
  import { Plus, Search, SkipForward } from '@lucide/svelte';
  import type { SpotifyState, Track } from '$shared/spotify.ts';
  import { hb, rpc, attempt, price } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import { clock } from '$lib/time.ts';
  import Cover from './Cover.svelte';
  import NowPlayingMini from './NowPlayingMini.svelte';

  const mod = $derived(hb.modules.spotify as SpotifyState | undefined);
  const addCost = $derived(price('spotify.queue'));
  const skipCost = $derived(price('spotify.skip'));
  const economy = $derived(!!hb.core?.economyEnabled);

  let q = $state('');
  let results = $state<Track[]>([]);
  let searching = $state(false);
  let adding = $state<string | null>(null);
  let added = $state(new Set<string>());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;

  function onInput() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(search, 400);
  }

  async function search() {
    const query = q.trim();
    if (query.length < 2) {
      results = [];
      return;
    }
    const mine = ++seq;
    searching = true;
    const r = await attempt(() => rpc<Track[]>('spotify', 'search', { q: query }));
    if (mine === seq) {
      results = r ?? [];
      searching = false;
    }
  }

  async function add(t: Track) {
    adding = t.uri;
    const ok = await attempt(() => rpc('spotify', 'queue', { uri: t.uri }), `${t.title} added to the queue`);
    adding = null;
    if (ok) added = new Set([...added, t.uri]);
  }

  function skip() {
    if (confirm(`Skip "${mod?.now?.title}"?`)) attempt(() => rpc('spotify', 'skip'), 'Skipped');
  }
</script>

{#if mod && !mod.connected}
  <div class="card empty">Music is not set up yet. Ask the host.</div>
{:else if mod}
  <div class="music">
    <NowPlayingMini />

    {#if mod.allowSkip && mod.now}
      <button class="btn block" onclick={skip}>
        <SkipForward size={18} /> Skip this song {#if economy && skipCost}&middot; <Money amount={skipCost} />{/if}
      </button>
    {/if}

    <form
      class="search"
      onsubmit={(e) => {
        e.preventDefault();
        search();
      }}
    >
      <Search size={18} />
      <input class="input" type="search" bind:value={q} oninput={onInput} placeholder="Search a song or artist" enterkeyhint="search" />
    </form>
    {#if economy && addCost}<p class="faint hint">Adding a song costs <Money amount={addCost} /></p>{/if}

    {#if results.length}
      <div class="card list">
        {#each results as t (t.uri)}
          <div class="track">
            <Cover src={t.image} size="2.9rem" radius="0.45rem" />
            <div class="text">
              <span class="title truncate">{t.title}{#if t.explicit}<span class="e">E</span>{/if}</span>
              <span class="artist truncate">{t.artists} &middot; {clock(t.durationMs)}</span>
            </div>
            {#if added.has(t.uri)}
              <span class="pill success">Added</span>
            {:else}
              <button class="btn small primary add" disabled={adding !== null} onclick={() => add(t)} aria-label="Add {t.title}">
                <Plus size={16} />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {:else if searching}
      <p class="faint center">Searching...</p>
    {:else if q.trim().length >= 2}
      <p class="faint center">No results</p>
    {/if}

    {#if !results.length && mod.queue.length}
      <h3 class="eyebrow">Up next</h3>
      <div class="card list">
        {#each mod.queue as t, i (t.uri + i)}
          <div class="track">
            <Cover src={t.image} size="2.6rem" radius="0.45rem" />
            <div class="text">
              <span class="title truncate">{t.title}</span>
              <span class="artist truncate">{t.artists}</span>
            </div>
            {#if t.requestedBy}<span class="faint by">{t.requestedBy.name}</span>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .music {
    display: grid;
    gap: 0.85rem;
  }
  .search {
    position: relative;
    display: flex;
    align-items: center;
    color: var(--text-faint);
  }
  .search :global(svg) {
    position: absolute;
    left: 0.9rem;
  }
  .search .input {
    padding-left: 2.6rem;
  }
  .hint {
    font-size: 0.82rem;
    margin-top: -0.4rem;
  }
  .list {
    padding: 0.3rem 0.8rem;
  }
  .track {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--border);
  }
  .track:last-child {
    border-bottom: 0;
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
  .e {
    display: inline-grid;
    place-items: center;
    width: 1rem;
    height: 1rem;
    margin-left: 0.35rem;
    border-radius: 3px;
    background: var(--surface-3);
    font-size: 0.62rem;
    color: var(--text-dim);
    vertical-align: 0.1em;
  }
  .add {
    width: 2.3rem;
    padding: 0;
  }
  .by {
    font-size: 0.8rem;
  }
  .center {
    text-align: center;
    font-size: 0.9rem;
  }
</style>
