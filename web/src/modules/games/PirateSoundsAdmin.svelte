<script lang="ts">
  import { LoaderCircle, Play, RotateCcw, Search, Tv, X } from '@lucide/svelte';
  import { PIRATE_SOUNDS, type PirateSoundId, type PirateSoundPick } from '$shared/games.ts';
  import type { MiPage, MiSound } from '$shared/soundboard.ts';
  import { attempt, rpc } from '$lib/client.svelte.ts';
  import { pirateSound } from './ui/pirateSound.ts';

  /**
   * The Pirate Race sounds: each one is built in (made on the fly), or a MyInstants sound picked here,
   * downloaded once and kept for later parties. Try them here or on the TV.
   */
  let { picks }: { picks: Partial<Record<PirateSoundId, PirateSoundPick>> } = $props();

  let open = $state<PirateSoundId | null>(null);
  let query = $state('');
  let items = $state<MiSound[]>([]);
  let loading = $state(false);
  let error = $state('');
  let saving = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run = 0;
  let audio: HTMLAudioElement | null = null;

  async function load(q: string) {
    const mine = ++run;
    loading = true;
    error = '';
    try {
      const res = await rpc<MiPage>('soundboard', 'search', { q, page: 1 });
      if (mine === run) items = res.items.filter((x) => !x.duration || x.duration <= 8);
    } catch (err) {
      if (mine === run) error = (err as Error).message;
    } finally {
      if (mine === run) loading = false;
    }
  }

  function toggle(kind: PirateSoundId) {
    if (open === kind) {
      open = null;
      return;
    }
    open = kind;
    query = PIRATE_SOUNDS.find((x) => x.id === kind)!.search;
    items = [];
    void load(query);
  }

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(() => load(query.trim()), 400);
  }

  async function listen(x: MiSound) {
    audio?.pause();
    const url = await attempt(() => rpc<string>('soundboard', 'preview', { mp3: x.mp3 }));
    if (typeof url !== 'string') return;
    audio = new Audio(url);
    void audio.play().catch(() => {});
  }

  async function use(kind: PirateSoundId, x: MiSound | null) {
    saving = x?.id ?? 'reset';
    await attempt(() => rpc('games', 'setPirateSound', { kind, mp3: x?.mp3 ?? null, title: x?.title }));
    saving = '';
    if (x) open = null;
  }

  $effect(() => () => audio?.pause());
</script>

<div class="sounds">
  {#each PIRATE_SOUNDS as k (k.id)}
    {@const pick = picks[k.id]}
    <div class="sound" class:open={open === k.id}>
      <div class="head">
        <span class="label">
          <strong>{k.name}</strong>
          <span class="faint small">{k.help} · {pick ? pick.title : 'Built-in'}</span>
        </span>
        <button class="btn small ghost" aria-label="Hear it here" title="Hear it here" onclick={() => pirateSound(k.id, { url: pick?.url })}><Play size={16} /></button>
        <button class="btn small ghost" aria-label="Play it on the TV" title="Play it on the TV" onclick={() => attempt(() => rpc('games', 'testPirateSound', { kind: k.id }))}><Tv size={16} /></button>
        {#if pick}
          <button class="btn small ghost" aria-label="Back to the built-in sound" title="Back to the built-in sound" disabled={!!saving} onclick={() => use(k.id, null)}><RotateCcw size={16} /></button>
        {/if}
        <button class="btn small" onclick={() => toggle(k.id)}>{#if open === k.id}<X size={16} /> Close{:else}<Search size={16} /> Change{/if}</button>
      </div>
      {#if open === k.id}
        <div class="search">
          <label class="box">
            <Search size={15} />
            <input bind:value={query} oninput={onInput} placeholder="Search MyInstants" />
            {#if loading}<LoaderCircle size={15} class="spin" />{/if}
          </label>
          {#if error}<p class="error small">{error}</p>{/if}
          <div class="results">
            {#each items as x (x.id)}
              <div class="hit">
                <button class="btn small ghost" aria-label={`Listen to ${x.title}`} onclick={() => listen(x)}><Play size={15} /></button>
                <span class="truncate">{x.title}{#if x.duration}<span class="faint small"> · {x.duration}s</span>{/if}</span>
                <button class="btn small primary" disabled={!!saving} onclick={() => use(k.id, x)}>{saving === x.id ? '...' : 'Use'}</button>
              </div>
            {:else}
              {#if !loading}<p class="faint small">No sound found.</p>{/if}
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .sounds {
    display: grid;
    gap: 0.45rem;
  }
  .sound {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .sound.open {
    border-color: var(--border-strong);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.5rem 0.6rem;
  }
  .label {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .small {
    font-size: 0.78rem;
  }
  .search {
    display: grid;
    gap: 0.5rem;
    padding: 0 0.6rem 0.6rem;
  }
  .box {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0 0.7rem;
    min-height: 2.4rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    color: var(--text-faint);
  }
  .box input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    font: inherit;
  }
  .results {
    display: grid;
    gap: 0.25rem;
    max-height: 16rem;
    overflow-y: auto;
  }
  .hit {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .hit .truncate {
    flex: 1;
    min-width: 0;
  }
  .error {
    color: var(--danger);
  }
  .box :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
