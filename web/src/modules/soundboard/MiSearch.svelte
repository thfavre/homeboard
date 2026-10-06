<script lang="ts">
  import type { Snippet } from 'svelte';
  import { LoaderCircle, Search } from '@lucide/svelte';
  import type { MiPage, MiSound } from '$shared/soundboard.ts';
  import { rpc } from '$lib/client.svelte.ts';
  import { stopPreview } from './preview.svelte.ts';

  /** Sound search (MyInstants). `item` draws each result (a SoundCard), in the same grid as the board. */
  let { item }: { item: Snippet<[MiSound, number]> } = $props();

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

  $effect(() => () => {
    clearTimeout(timer);
    stopPreview();
  });
</script>

<div class="mi">
  <label class="search">
    <Search size={17} />
    <input class="input" type="search" bind:value={query} oninput={onInput} placeholder="Search sounds" maxlength="60" enterkeyhint="search" />
  </label>
  <p class="faint small">{query.trim() ? 'Results' : 'Popular sounds'}</p>

  <div class="grid">
    {#each items as s, i (s.id)}{@render item(s, i)}{/each}
  </div>

  {#if loading}
    <p class="faint small loading"><LoaderCircle size={15} class="spin" /> Searching...</p>
  {:else if !items.length}
    <p class="faint small">{error || 'No sound found.'}</p>
  {:else if hasNext}
    <button class="btn ghost more" onclick={() => load(query.trim(), page + 1)}>Show more</button>
  {/if}
</div>

<style>
  .mi {
    display: grid;
    gap: 0.7rem;
    min-width: 0;
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
    min-width: 0;
    padding-left: 2.3rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.6rem;
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
  .mi :global(.spin) {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
