<script lang="ts">
  import { Check, Music, Pause, Play, Plus, RotateCw, Search, ThumbsUp, X } from '@lucide/svelte';
  import { rhythmDifficulty, rhythmFeel, type RhythmSongInfo } from '$shared/games.ts';
  import { rpc, attempt } from '$lib/client.svelte.ts';

  /**
   * The host's Rhythm Rain songs: the ones guests can pick, and a BeatSaver search to add more.
   * Every song can be heard first (BeatSaver's 10 second preview).
   */
  let { songs }: { songs: RhythmSongInfo[] } = $props();

  interface Hit {
    key: string;
    title: string;
    artist: string;
    mapper: string;
    bpm: number;
    durationSec: number;
    upvotes: number;
    rating: number;
    difficulties: string[];
    cover: string;
    preview: string;
    added: boolean;
  }

  let q = $state('');
  let hits = $state<Hit[]>([]);
  let page = $state(0);
  let more = $state(false);
  let searching = $state(false);
  let searched = $state(false);
  let adding = $state<string | null>(null);
  const mine = $derived(new Set(songs.map((s) => s.key)));

  async function search(next = false) {
    searching = true;
    const p = next ? page + 1 : 0;
    const r = await attempt(() => rpc<{ hits: Hit[]; more: boolean }>('games', 'searchSongs', { q, page: p }));
    searching = false;
    if (!r) return;
    hits = next ? [...hits, ...r.hits] : r.hits;
    page = p;
    more = r.more;
    searched = true;
  }

  async function add(key: string) {
    adding = key;
    await attempt(() => rpc('games', 'addSong', { key }));
    adding = null;
  }

  // One preview at a time, from BeatSaver
  let audio: HTMLAudioElement | null = null;
  let playing = $state<string | null>(null);
  function preview(key: string, url?: string) {
    if (playing === key) {
      audio?.pause();
      playing = null;
      return;
    }
    audio?.pause();
    if (!url) return;
    audio = new Audio(url);
    audio.volume = 0.8;
    audio.onended = () => playing === key && (playing = null);
    audio.onerror = () => playing === key && (playing = null);
    playing = key;
    audio.play().catch(() => (playing = null));
  }
  $effect(() => () => audio?.pause());

  const length = (sec?: number) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '');
  const SHORT: Record<string, string> = { Easy: 'E', Normal: 'N', Hard: 'H', Expert: 'X', ExpertPlus: 'X+' };
</script>

{#snippet cover(url: string | undefined, key: string, previewUrl: string | undefined)}
  <button class="cover" style:background-image={url ? `url("${url}")` : undefined} aria-label="Listen" disabled={!previewUrl} onclick={() => preview(key, previewUrl)}>
    {#if !url}<Music size={18} />{/if}
    {#if previewUrl}<span class="play" class:on={playing === key}>{#if playing === key}<Pause size={16} />{:else}<Play size={16} />{/if}</span>{/if}
  </button>
{/snippet}

<div class="part">
  <h4 class="group">Songs</h4>
  <p class="faint small">Guests pick one of these when they pay for a duel or a solo game with music, at one of the difficulties listed under it (with its notes per second). Rhythm: Varied is the most fun, Steady means nearly the same gap between all notes. Tap a cover to hear it.</p>
  <div class="list">
    {#each songs as x (x.key)}
      <div class="row">
        {@render cover(x.cover, x.key, x.preview)}
        <span class="info">
          {#if x.status === 'ready'}
            <strong class="truncate">{x.title}</strong>
            <span class="faint small truncate">{x.artist}{x.durationSec ? ` · ${length(x.durationSec)}` : ''}</span>
            {#if x.upvotes !== undefined}
              <span class="faint small votes"><ThumbsUp size={12} /> {x.upvotes} · {Math.round((x.rating ?? 0) * 100)}%</span>
            {/if}
            {#if x.charts?.length}
              <span class="meta" title="Difficulties guests can play this song at, with the notes per second">
                {#each [rhythmFeel(x.charts)] as feel}
                  {#if feel}
                    <span class="feel {feel.label.toLowerCase()}" title={`${Math.round(feel.steady * 100)}% of the gaps between notes have the same length`}>Rhythm: {feel.label}</span>
                  {/if}
                {/each}
                {#each x.charts as c (c.id)}<span class="diff">{rhythmDifficulty(c.id).name} <span class="nps">{c.nps.toFixed(1)}/s</span></span>{/each}
              </span>
            {/if}
          {:else if x.status === 'loading'}
            <strong class="truncate">Map {x.key}</strong>
            <span class="faint small">Downloading...</span>
          {:else}
            <strong class="truncate">Map {x.key}</strong>
            <span class="small bad">{x.error}</span>
          {/if}
        </span>
        {#if x.status === 'error'}
          <button class="btn small ghost" aria-label="Retry" onclick={() => attempt(() => rpc('games', 'retrySong', { key: x.key }))}><RotateCw size={16} /></button>
        {/if}
        <button class="btn small ghost" aria-label="Remove" onclick={() => attempt(() => rpc('games', 'removeSong', { key: x.key }))}><X size={16} /></button>
      </div>
    {:else}
      <p class="faint small">No song: duels are played without music. Search below to add some.</p>
    {/each}
  </div>
</div>

<div class="part">
  <h4 class="group">Find more songs</h4>
  <p class="faint small">Searches beatsaver.com, a free library of songs with hand made notes. A song is downloaded once, when you add it.</p>
  <form
    class="search"
    novalidate
    onsubmit={(e) => {
      e.preventDefault();
      void search();
    }}
  >
    <input class="input" placeholder="Artist or song, or empty for the best rated" bind:value={q} />
    <button class="btn primary" disabled={searching}><Search size={16} /> Search</button>
  </form>

  <div class="list">
    {#each hits as h (h.key)}
      {@const added = mine.has(h.key)}
      <div class="row">
        {@render cover(h.cover, h.key, h.preview)}
        <span class="info">
          <strong class="truncate">{h.title}</strong>
          <span class="faint small truncate">{h.artist}{h.durationSec ? ` · ${length(h.durationSec)}` : ''} · {h.bpm} bpm</span>
          <span class="meta">
            <span class="faint small votes"><ThumbsUp size={12} /> {h.upvotes} · {Math.round(h.rating * 100)}%</span>
            {#each h.difficulties as d}<span class="diff">{SHORT[d] ?? d}</span>{/each}
          </span>
        </span>
        {#if added}
          <span class="added"><Check size={16} /></span>
        {:else}
          <button class="btn small" disabled={adding !== null} onclick={() => add(h.key)}>
            {#if adding === h.key}...{:else}<Plus size={16} /> Add{/if}
          </button>
        {/if}
      </div>
    {:else}
      {#if searched}<p class="faint small">Nothing found.</p>{/if}
    {/each}
  </div>
  {#if more}<button class="btn ghost block" disabled={searching} onclick={() => search(true)}>More results</button>{/if}
  <p class="faint small">E N H X X+: the difficulties the map has, Easy to Expert+. Guests only get the ones a song has: maps from Easy or Normal up to Expert suit everyone.</p>
</div>

<style>
  .part {
    display: grid;
    gap: 0.6rem;
    margin-top: 0.3rem;
  }
  .group {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .part > .group + .small {
    margin-top: -0.4rem;
  }
  .list {
    display: grid;
    gap: 0.5rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }
  .cover {
    position: relative;
    flex: none;
    width: 3.2rem;
    height: 3.2rem;
    padding: 0;
    border: 0;
    border-radius: 0.6rem;
    background: var(--surface-2) center / cover no-repeat;
    display: grid;
    place-items: center;
    color: var(--text-faint);
    overflow: hidden;
  }
  .play {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.35);
    color: #fff;
    opacity: 0.85;
  }
  .play.on {
    background: color-mix(in srgb, var(--accent) 55%, transparent);
    opacity: 1;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
  }
  .votes {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-right: 0.2rem;
  }
  .diff {
    padding: 0 0.35rem;
    border-radius: 0.3rem;
    background: var(--surface-2);
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-dim);
  }
  .feel {
    padding: 0 0.4rem;
    border-radius: 0.3rem;
    font-size: 0.7rem;
    font-weight: 700;
    border: 1px solid currentColor;
  }
  .feel.varied {
    color: var(--success);
  }
  .feel.mixed {
    color: var(--coin);
  }
  .feel.steady {
    color: var(--danger);
  }
  .nps {
    font-weight: 500;
    color: var(--text-faint);
  }
  .added {
    display: grid;
    place-items: center;
    width: 2.2rem;
    color: var(--success);
  }
  .search {
    display: flex;
    gap: 0.5rem;
  }
  .search .input {
    flex: 1;
    min-width: 0;
  }
  .small {
    font-size: 0.78rem;
  }
  .bad {
    color: var(--danger);
  }
</style>
