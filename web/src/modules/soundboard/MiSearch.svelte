<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Headphones, LoaderCircle, Search, Square } from '@lucide/svelte';
  import type { MiPage, MiSound } from '$shared/soundboard.ts';
  import { rpc, attempt } from '$lib/client.svelte.ts';

  /** Search box over MyInstants. `actions` renders the buttons of each result. */
  let { actions }: { actions: Snippet<[MiSound]> } = $props();

  let query = $state('');
  let items = $state<MiSound[]>([]);
  let page = $state(1);
  let hasNext = $state(false);
  let loading = $state(false);
  let error = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run = 0;

  async function load(q: string, p: number) {
    const mine = ++run;
    loading = true;
    error = '';
    try {
      const res = await rpc<MiPage>('soundboard', 'search', { q, page: p });
      if (mine !== run) return;
      items = p === 1 ? res.items : [...items, ...res.items.filter((r) => !items.some((i) => i.id === r.id))];
      page = res.page;
      hasNext = res.hasNext;
    } catch (err) {
      if (mine === run) error = (err as Error).message;
    } finally {
      if (mine === run) loading = false;
    }
  }

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(() => load(query.trim(), 1), 400);
  }

  // Popular sounds before anything is typed
  load('', 1);

  // ---------------------------------------------------------------- preview on this phone
  let audio: HTMLAudioElement | null = null;
  let previewing = $state<string | null>(null);
  let fetching = $state<string | null>(null);

  function stop() {
    audio?.pause();
    audio = null;
    previewing = null;
  }

  async function preview(s: MiSound) {
    if (previewing === s.id) return stop();
    stop();
    fetching = s.id;
    const url = await attempt(() => rpc<string>('soundboard', 'preview', { mp3: s.mp3 }));
    fetching = null;
    if (!url) return;
    audio = new Audio(url);
    previewing = s.id;
    const self = audio;
    audio.addEventListener('ended', () => audio === self && stop());
    audio.play().catch(() => audio === self && stop());
  }

  $effect(() => () => {
    clearTimeout(timer);
    stop();
  });
</script>

<div class="mi">
  <label class="search">
    <Search size={17} />
    <input class="input" type="search" bind:value={query} oninput={onInput} placeholder="Search MyInstants (bruh, vine boom, sad violin...)" maxlength="60" />
  </label>
  <p class="faint small">{query.trim() ? 'Results' : 'Most popular on MyInstants'}</p>

  <div class="list">
    {#each items as s (s.id)}
      <div class="line">
        <button class="btn ghost small" aria-label={previewing === s.id ? 'Stop preview' : 'Listen on this phone'} onclick={() => preview(s)}>
          {#if fetching === s.id}<LoaderCircle size={15} class="spin" />{:else if previewing === s.id}<Square size={15} />{:else}<Headphones size={15} />{/if}
        </button>
        <span class="grow title">{s.title}</span>
        {@render actions(s)}
      </div>
    {:else}
      {#if !loading}<p class="faint small">{error || 'No sound found.'}</p>{/if}
    {/each}
    {#if loading}
      <p class="faint small loading"><LoaderCircle size={15} class="spin" /> Searching...</p>
    {:else if hasNext && items.length}
      <button class="btn ghost more" onclick={() => load(query.trim(), page + 1)}>Show more</button>
    {/if}
  </div>
  <p class="faint credit">Sounds from myinstants.com</p>
</div>

<style>
  .mi {
    display: grid;
    gap: 0.6rem;
  }
  .search {
    position: relative;
    display: flex;
    align-items: center;
  }
  .search :global(svg) {
    position: absolute;
    left: 0.75rem;
    color: var(--text-dim);
    pointer-events: none;
  }
  .search .input {
    width: 100%;
    padding-left: 2.3rem;
  }
  .list {
    display: grid;
    gap: 0.35rem;
    max-height: 22rem;
    overflow-y: auto;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .small {
    font-size: 0.85rem;
  }
  .loading {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .more {
    justify-self: center;
  }
  .credit {
    font-size: 0.75rem;
    text-align: right;
  }
  .mi :global(.spin) {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
