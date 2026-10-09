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

  // Hearing a song here: from its first beat, with a click on every beat so the grid can be heard
  let playing = $state<string | null>(null);
  let preview: { audio: HTMLAudioElement; ac: AudioContext; timer: ReturnType<typeof setInterval> } | null = null;
  function stopPreview() {
    if (!preview) return;
    preview.audio.pause();
    clearInterval(preview.timer);
    void preview.ac.close();
    preview = null;
    playing = null;
  }
  function listen(song: PirateSong) {
    const was = playing;
    stopPreview();
    if (was === song.id) return;
    const audio = new Audio(song.url);
    const ac = new AudioContext();
    audio.currentTime = song.beats[0];
    // A soft tick on every beat, the first of each 4 higher
    let next = 0;
    const tick = () => {
      if (audio.paused) return;
      const pos = audio.currentTime;
      while (next < song.beats.length && song.beats[next] < pos - 0.02) next++;
      const beat = next;
      if (beat >= song.beats.length) return;
      const wait = song.beats[beat] - pos;
      if (wait > 0.12) return;
      next = beat + 1;
      const t = ac.currentTime + Math.max(0, wait);
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = beat % 4 === 0 ? 1500 : 1000;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.08);
    };
    void audio.play().catch(() => stopPreview());
    audio.onended = stopPreview;
    preview = { audio, ac, timer: setInterval(tick, 20) };
    playing = song.id;
  }
  $effect(() => () => stopPreview());

  const shift = (song: PirateSong, ms: number) => attempt(() => rpc('games', 'shiftPirateSong', { id: song.id, ms }));
  const range = (bpm: number) => `${Math.round(bpm * PIRATE_SONG_DRIFT.slower)} to ${Math.round(bpm * PIRATE_SONG_DRIFT.faster)}`;
</script>

<div class="songs">
  {#each songs as song (song.id)}
    <div class="song">
      <div class="head">
        <button class="btn small ghost" aria-label={playing === song.id ? 'Stop' : 'Hear it here, with a tick on each beat'} title="Hear it here, with a tick on each beat" onclick={() => listen(song)}>
          {#if playing === song.id}<Pause size={16} />{:else}<Play size={16} />{/if}
        </button>
        <span class="label">
          <strong class="truncate">{song.title}</strong>
          <span class="faint small">{song.steady ? `Steady ${song.bpm} BPM` : `About ${Math.round(song.bpm)} BPM, follows the singers`} · the drum plays {range(song.bpm)}</span>
        </span>
        <button class="btn small ghost" aria-label="Try it on the TV with the drum" title="Try it on the TV with the drum" onclick={() => attempt(() => rpc('games', 'testPirateSong', { id: song.id }))}><Tv size={16} /></button>
        <button class="btn small ghost" aria-label="Stop the TV" title="Stop the TV" onclick={() => attempt(() => rpc('games', 'stopPirateSongTest'))}><Square size={14} /></button>
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
