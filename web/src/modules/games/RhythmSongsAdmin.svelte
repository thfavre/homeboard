<script lang="ts">
  import { Check, Music, Pause, Play, Plus, RotateCw, Search, Square, Star, ThumbsUp, Trash2 } from '@lucide/svelte';
  import { RHYTHM_COLORS, RHYTHM_DEFAULT_COLORS, RHYTHM_DIFFICULTIES, RHYTHM_GOOD_STARS, RHYTHM_MAX_COLORS, rhythmDifficulty, rhythmFeel, type RhythmDifficulty, type RhythmSongInfo } from '$shared/games.ts';
  import { rpc, attempt } from '$lib/client.svelte.ts';
  import Toggle from '$lib/ui/Toggle.svelte';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';

  /**
   * The host's Rhythm Rain songs: the ones guests can pick, and a BeatSaver search to add more.
   * Every song can be heard first (BeatSaver's 10 second preview).
   */
  /** `light`: a strip is picked for the game. `running`: the Rhythm Rain match going on, if any. */
  let { songs, ratings, light, running }: { songs: RhythmSongInfo[]; ratings: Record<string, number>; light: boolean; running: string | null } = $props();

  // The host's stars: a tap on the current rating clears it
  let hover = $state<{ key: string; n: number } | null>(null);
  const rate = (key: string, n: number) => attempt(() => rpc('games', 'rateSong', { key, stars: ratings[key] === n ? 0 : n }));
  // Only the songs without stars yet, to go through them
  let unratedOnly = $state(false);
  const unrated = $derived(songs.filter((x) => !ratings[x.key]));
  const shown = $derived(unratedOnly ? unrated : songs);

  // A tap on a difficulty plays it on the light: nobody's phone, no fee, no score kept
  let testColors = $state(RHYTHM_DEFAULT_COLORS);
  let testAuto = $state(true);
  /** The host's try on the light: the chip pressed (it turns into its Stop button) and its game */
  let tried = $state<{ key: string; id: string } | null>(null);
  const tryKey = (chart: RhythmDifficulty, song?: string) => `${song ?? ''}:${chart}`;
  /** A guest's game is on: no try meanwhile (it would stop theirs) */
  const busy = $derived(!!running && running !== tried?.id);
  const isTrying = (key: string) => !!running && running === tried?.id && tried.key === key;
  /** A tap on the chip of the try stops it; on another one, the try switches to it */
  async function test(chart: RhythmDifficulty, song?: string) {
    const key = tryKey(chart, song);
    if (running && running === tried?.id) {
      await attempt(() => rpc('games', 'stop', { id: running }));
      const same = tried?.key === key;
      tried = null;
      if (same) return;
    }
    audio?.pause();
    playing = null;
    const id = await attempt(() => rpc<string>('games', 'testRhythm', { colors: testColors, chart, song, autoplay: testAuto }));
    if (typeof id === 'string') tried = { key, id };
  }

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
  <p class="faint small">Guests get a random song from their difficulty, picked among your {RHYTHM_GOOD_STARS}+ star ones. Tap a cover to hear it, a difficulty to try it on the light.</p>
  <div class="test">
    <div class="test-line">
      <span class="faint small">Try with</span>
      {#each Array.from({ length: RHYTHM_MAX_COLORS }, (_, i) => i + 1) as n (n)}
        <button class="pick" class:on={testColors === n} onclick={() => (testColors = n)} aria-label={`${n} colors`}>
          <span class="keys">{#each RHYTHM_COLORS.slice(0, n) as c (c.id)}<span class="key" style:--c={c.hex}></span>{/each}</span>{n}
        </button>
      {/each}
      <span class="auto faint small"><Toggle checked={testAuto} onchange={(v) => (testAuto = v)} label="Autoplay" /> Autoplay</span>
    </div>
    <div class="test-line">
      <span class="faint small">No music</span>
      {#each RHYTHM_DIFFICULTIES as d (d.id)}
        {@const stop = isTrying(tryKey(d.id))}
        <button class="diff" class:stop disabled={!light || busy} title={stop ? 'Stop it' : `Try ${d.name} on the light`} onclick={() => test(d.id)}>
          {#if stop}<Square size={10} fill="currentColor" />{:else}<Play size={10} />{/if}{d.name}
        </button>
      {/each}
    </div>
    {#if running}
      <button class="btn small danger" onclick={() => attempt(() => rpc('games', 'stop', { id: running }))}><Square size={14} /> Stop the game on the light</button>
    {:else if !light}
      <span class="faint small">Pick the light strip above to try them.</span>
    {:else}
      <span class="faint small">Autoplay hits every note on time; off, the notes go by.</span>
    {/if}
  </div>
  {#if songs.length}
    <div class="filter">
      <button class="chip" class:active={!unratedOnly} onclick={() => (unratedOnly = false)}>All <span class="count">{songs.length}</span></button>
      <button class="chip" class:active={unratedOnly} onclick={() => (unratedOnly = true)}>Unrated <span class="count">{unrated.length}</span></button>
    </div>
  {/if}
  <div class="list">
    {#each shown as x (x.key)}
      <div class="row">
        {@render cover(x.cover, x.key, x.preview)}
        <span class="info">
          {#if x.status === 'ready'}
            <span class="title-line">
              <strong class="truncate">{x.title}</strong>
              <span class="stars" role="group" aria-label="Your rating" onpointerleave={() => (hover = null)}>
                {#each [1, 2, 3, 4, 5] as n (n)}
                  {@const lit = n <= (hover?.key === x.key ? hover.n : (ratings[x.key] ?? 0))}
                  <button
                    class="star"
                    class:lit
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    aria-pressed={ratings[x.key] === n}
                    onpointerenter={() => (hover = { key: x.key, n })}
                    onclick={() => rate(x.key, n)}><Star size={15} fill={lit ? 'currentColor' : 'none'} /></button
                  >
                {/each}
              </span>
            </span>
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
                {#each x.charts as c (c.id)}
                  {@const stop = isTrying(tryKey(c.id, x.key))}
                  <button
                    class="diff"
                    class:stop
                    disabled={!light || busy}
                    title={stop ? 'Stop it' : `Try ${rhythmDifficulty(c.id).name} on the light`}
                    onclick={() => test(c.id, x.key)}
                  >
                    {#if stop}<Square size={10} fill="currentColor" />{:else}<Play size={10} />{/if}{rhythmDifficulty(c.id).name} <span class="nps">{stop ? 'Stop' : `${c.nps.toFixed(1)}/s`}</span>
                  </button>
                {/each}
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
        <TwoStepButton class="small ghost" onconfirm={() => attempt(() => rpc('games', 'removeSong', { key: x.key }))}>
          <Trash2 size={16} />
          {#snippet armed()}Remove?{/snippet}
        </TwoStepButton>
      </div>
    {:else}
      <p class="faint small">{songs.length ? 'Every song is rated.' : 'No song: duels are played without music. Search below to add some.'}</p>
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
  .filter {
    display: flex;
    gap: 0.4rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-weight: 600;
    font-size: 0.88rem;
  }
  .chip.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
  }
  .count {
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
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
  .title-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .stars {
    flex: none;
    display: inline-flex;
  }
  .star {
    display: grid;
    place-items: center;
    padding: 0.1rem;
    border: 0;
    background: none;
    color: var(--text-faint);
    opacity: 0.5;
    cursor: pointer;
  }
  .star.lit {
    color: var(--coin);
    opacity: 1;
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
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0 0.35rem;
    border: 1px solid transparent;
    border-radius: 0.3rem;
    background: var(--surface-2);
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-dim);
  }
  button.diff {
    padding: 0.1rem 0.45rem;
    cursor: pointer;
  }
  button.diff:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text);
  }
  button.diff.stop {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 18%, transparent);
    color: var(--danger);
  }
  button.diff.stop .nps {
    color: inherit;
  }
  button.diff:disabled {
    cursor: default;
  }
  .test {
    display: grid;
    gap: 0.4rem;
    padding: 0.6rem;
    border-radius: var(--radius-sm);
    border: 1px dashed var(--border-strong);
  }
  .test-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }
  .pick {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-dim);
  }
  .pick.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .keys {
    display: flex;
    gap: 0.12rem;
  }
  .key {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--c);
  }
  .auto {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: auto;
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
