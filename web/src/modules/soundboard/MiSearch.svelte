<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Headphones, LoaderCircle, Search, Square } from '@lucide/svelte';
  import type { MiPage, MiSound } from '$shared/soundboard.ts';
  import { rpc, attempt } from '$lib/client.svelte.ts';
  import InstantButton from './InstantButton.svelte';

  /**
   * Sound search (MyInstants), shown as a grid of round buttons like the site.
   * Pressing a button calls `onpress`, or plays the sound on this phone when there is none.
   * `actions` adds small buttons under each sound, after "listen on this phone".
   */
  let {
    onpress,
    pressDisabled = false,
    busyMp3 = null,
    actions,
  }: { onpress?: (s: MiSound) => void; pressDisabled?: boolean; busyMp3?: string | null; actions?: Snippet<[MiSound]> } = $props();

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

  const seconds = (d: number) => `${d < 10 ? d.toFixed(1) : Math.round(d)}s`;
</script>

<div class="mi">
  <label class="search">
    <Search size={17} />
    <input class="input" type="search" bind:value={query} oninput={onInput} placeholder="Search sounds" maxlength="60" enterkeyhint="search" />
  </label>
  <p class="faint small">{query.trim() ? 'Results' : 'Popular sounds'}</p>

  <div class="grid">
    {#each items as s (s.id)}
      <div class="instant">
        <InstantButton
          seed={s.mp3}
          label={onpress ? `Play ${s.title}` : `Listen to ${s.title}`}
          active={previewing === s.id || busyMp3 === s.mp3}
          disabled={onpress ? pressDisabled || busyMp3 === s.mp3 : false}
          onpress={() => (onpress ? onpress(s) : preview(s))}
        />
        <span class="title">{s.title}</span>
        <div class="tools">
          <button type="button" class="tool" aria-label={previewing === s.id ? 'Stop' : 'Listen on this phone'} onclick={() => preview(s)}>
            {#if fetching === s.id}<LoaderCircle size={15} class="spin" />{:else if previewing === s.id}<Square size={14} />{:else}<Headphones size={15} />{/if}
          </button>
          {@render actions?.(s)}
          {#if s.duration}<span class="len">{seconds(s.duration)}</span>{/if}
        </div>
      </div>
    {/each}
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
    grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
    gap: 1.1rem 0.5rem;
  }
  .instant {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 0.45rem;
    min-width: 0;
    padding-top: 0.2rem;
  }
  .title {
    width: 100%;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .tools {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.15rem;
    color: var(--text-dim);
  }
  /* Shared with the buttons passed in `actions` */
  .tools :global(.tool) {
    display: grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text-dim);
    cursor: pointer;
  }
  .tools :global(.tool:active) {
    background: var(--surface-2);
  }
  .tools :global(.tool.on) {
    color: var(--accent);
  }
  .tools :global(.tool:disabled) {
    opacity: 0.4;
  }
  .len {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-faint);
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
