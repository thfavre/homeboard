<script lang="ts">
  import { LoaderCircle, Minus, Pause, Play, Plus, Square, Trash2, Tv, Upload } from '@lucide/svelte';
  import { PIRATE_SONG_DRIFT, type PirateSong } from '$shared/games.ts';
  import { attempt, rpc, upload } from '$lib/client.svelte.ts';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import { detectBeats } from './ui/beatDetect.ts';

  /**
   * The race songs: sailors singing. In a race they play one after the other in a random order, each from
   * its start, 2 to 10 s apart. On upload, this page finds the song's
   * beats (a steady grid, or following the singers when they hurry or slow down); they can be shifted all
   * together. Hear a song here with a tick on each beat, or on the TV with the drum on top.
   */
  let { songs }: { songs: PirateSong[] } = $props();

  let busy = $state('');
  let error = $state('');
  let input: HTMLInputElement | undefined = $state();

  async function add(file: File) {
    error = '';
    busy = 'Measuring the tempo...';
    try {
      const ac = new AudioContext();
      const buffer = await ac.decodeAudioData(await file.arrayBuffer());
      void ac.close();
      const map = detectBeats(buffer);
      if (map.beats.length < 8) throw new Error('No steady beat found in this song');
      busy = 'Uploading...';
      await upload('games', 'pirateSong', file, {
        name: file.name.replace(/\.[^.]+$/, '').replace(/\s*\[[^\]]*\]\s*$/, ''),
        beats: map.beats.join(','),
        bpm: String(map.bpm),
        steady: map.steady ? '1' : '0',
        duration: String(Math.round(buffer.duration * 100) / 100),
      });
    } catch (err) {
      error = err instanceof Error && err.message ? err.message : 'This file could not be read';
    } finally {
      busy = '';
      if (input) input.value = '';
    }
  }

  // Hearing a song here: from its first beat, with a click on every beat so the grid can be heard. The
  // song and the clicks go through the same audio clock, so what is heard is exactly where the beats are.
  let playing = $state<string | null>(null);
  let preview: { ac: AudioContext; timer: ReturnType<typeof setInterval> | null } | null = null;
  function stopPreview() {
    if (!preview) return;
    if (preview.timer) clearInterval(preview.timer);
    void preview.ac.close();
    preview = null;
    playing = null;
  }
  async function listen(song: PirateSong) {
    const was = playing;
    stopPreview();
    if (was === song.id) return;
    const ac = new AudioContext();
    const mine = { ac, timer: null as ReturnType<typeof setInterval> | null };
    preview = mine;
    playing = song.id;
    let buffer: AudioBuffer;
    try {
      buffer = await ac.decodeAudioData(await (await fetch(song.url)).arrayBuffer());
    } catch {
      if (preview === mine) stopPreview();
      return;
    }
    if (preview !== mine) return;
    const from = song.beats[0];
    const t0 = ac.currentTime + 0.15;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(ac.destination);
    src.start(t0, from);
    src.onended = () => preview === mine && stopPreview();
    // A soft tick on every beat, the first of each 4 higher, scheduled a second ahead
    let next = 0;
    const tick = () => {
      while (next < song.beats.length && t0 + song.beats[next] - from < ac.currentTime + 1) {
        const t = t0 + song.beats[next] - from;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.value = next % 4 === 0 ? 1500 : 1000;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + 0.08);
        next++;
      }
    };
    tick();
    mine.timer = setInterval(tick, 250);
  }
  $effect(() => () => stopPreview());

  // Trying the race sound on the TV: a random song (another one than last time) with the drum, as loud as
  // in a race, for a few seconds. The button turns into Stop meanwhile.
  let onTv = $state<{ title: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  function endTv() {
    if (onTv) clearTimeout(onTv.timer);
    onTv = null;
  }
  async function tryOnTv() {
    if (onTv) {
      endTv();
      await attempt(() => rpc('games', 'stopPirateSongTest'));
      return;
    }
    const r = await attempt(() => rpc<{ title: string; sec: number }>('games', 'testPirateSong', {}));
    if (r) onTv = { title: r.title, timer: setTimeout(endTv, r.sec * 1000) };
  }
  $effect(() => () => endTv());

  const shift = (song: PirateSong, ms: number) => attempt(() => rpc('games', 'shiftPirateSong', { id: song.id, ms }));
  const range = (bpm: number) => `${Math.round(bpm * PIRATE_SONG_DRIFT.slower)} to ${Math.round(bpm * PIRATE_SONG_DRIFT.faster)}`;
</script>

<div class="songs">
  {#if songs.length}
    <div class="tv">
      <button class="btn small" class:primary={!!onTv} onclick={() => void tryOnTv()}>
        {#if onTv}<Square size={14} /> Stop{:else}<Tv size={16} /> Try on TV{/if}
      </button>
      <span class="faint small truncate">{onTv ? `Playing ${onTv.title} with the drum` : 'A random song with the drum, as loud as in a race'}</span>
    </div>
  {/if}
  {#each songs as song (song.id)}
    <div class="song">
      <div class="head">
        <button class="btn small ghost" aria-label={playing === song.id ? 'Stop' : 'Hear it here, with a tick on each beat'} title="Hear it here, with a tick on each beat" onclick={() => void listen(song)}>
          {#if playing === song.id}<Pause size={16} />{:else}<Play size={16} />{/if}
        </button>
        <span class="label">
          <strong class="truncate">{song.title}</strong>
          <span class="faint small">{song.steady ? `Steady ${song.bpm} BPM` : `About ${Math.round(song.bpm)} BPM, follows the singers`} · the drum plays {range(song.bpm)}</span>
        </span>
        <TwoStepButton class="small ghost" onconfirm={() => attempt(() => rpc('games', 'removePirateSong', { id: song.id }))}>
          <Trash2 size={16} />
          {#snippet armed()}Remove?{/snippet}
        </TwoStepButton>
      </div>
      <div class="tune">
        <span class="faint small">Beats</span>
        <button class="btn small ghost" aria-label="Beats 20 ms earlier" onclick={() => shift(song, -20)}><Minus size={14} /></button>
        <strong class="mono">{song.beats.length} from {song.beats[0].toFixed(2)} s</strong>
        <button class="btn small ghost" aria-label="Beats 20 ms later" onclick={() => shift(song, 20)}><Plus size={14} /></button>
      </div>
    </div>
  {:else}
    <p class="faint small">No song: the crews row to the drum alone.</p>
  {/each}

  <input bind:this={input} type="file" accept="audio/*" hidden onchange={(e) => e.currentTarget.files?.[0] && add(e.currentTarget.files[0])} />
  <button class="btn" disabled={!!busy} onclick={() => input?.click()}>
    {#if busy}<LoaderCircle size={16} class="spin" /> {busy}{:else}<Upload size={16} /> Add a song{/if}
  </button>
  {#if error}<p class="error small">{error}</p>{/if}
  <p class="faint small">Sailors singing works best, with a steady beat. Its beats are found when you add it: if the ticks or the TV drum come a little early or late on the singing, shift them.</p>
</div>

<style>
  .songs {
    display: grid;
    gap: 0.45rem;
  }
  .song {
    display: grid;
    gap: 0.2rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .tv {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .label {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .tune {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.3rem;
  }
  .tune .faint:not(:first-child) {
    margin-left: 0.6rem;
  }
  .small {
    font-size: 0.78rem;
  }
  .error {
    color: var(--danger);
  }
  .songs :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
