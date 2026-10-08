<script lang="ts">
  import { Volume2, VolumeX } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import type { PlayEvent } from '$shared/soundboard.ts';
  import { onEvent, rpc, showNames } from '$lib/client.svelte.ts';
  import { audioBlocked, playSound, unlockAudio } from './player.ts';

  let blocked = $state(audioBlocked());
  let playing = $state<(PlayEvent & { key: number }) | null>(null);
  let seq = 0;

  $effect(() => {
    // Browsers only allow sound after a click, unless Chrome runs with --autoplay-policy=no-user-gesture-required
    const unlock = () => unlockAudio().then(() => (blocked = audioBlocked()));
    void unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const off = onEvent<PlayEvent>('soundboard', 'play', (e) => {
      blocked = audioBlocked();
      // Tell the server when the sound is over, so the music comes back up
      void playSound(e.sound, e.volume, e.maxSec).finally(() => rpc('soundboard', 'ended', { id: e.id }).catch(() => {}));
      const key = ++seq;
      playing = { ...e, key };
      setTimeout(() => playing?.key === key && (playing = null), 3000);
    });
    return () => {
      off();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  });
</script>

{#if blocked}
  <button class="unlock card" onclick={() => unlockAudio().then(() => (blocked = audioBlocked()))}>
    <VolumeX size={18} /> Click anywhere to enable sound
  </button>
{/if}

{#if playing}
  {#key playing.key}
    <div class="playing card" transition:fly={{ x: 40, duration: 300 }}>
      <span class="bars"><i></i><i></i><i></i><i></i></span>
      <span><strong>{playing.sound.name}</strong>{#if showNames('effectNames')}<span class="dim">{` ${playing.by}`}</span>{/if}</span>
      <Volume2 size={18} />
    </div>
  {/key}
{/if}

<style>
  .unlock,
  .playing {
    position: fixed;
    /* In the footer row, under the side column (the activity ticker stays left of it) */
    right: 2rem;
    bottom: 1.6rem;
    z-index: 45;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 1rem;
    border-radius: 999px;
    font-size: 0.95rem;
  }
  /* Sit above the light effect chip, which takes the same corner */
  :global(.wled-chip) ~ .unlock,
  :global(.wled-chip) ~ .playing {
    bottom: 4.9rem;
  }
  .unlock {
    color: var(--warning);
    cursor: pointer;
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 1.1rem;
  }
  .bars i {
    width: 4px;
    border-radius: 2px;
    background: var(--accent);
    animation: eq 0.6s ease-in-out infinite alternate;
  }
  .bars i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .bars i:nth-child(3) {
    animation-delay: 0.3s;
  }
  .bars i:nth-child(4) {
    animation-delay: 0.45s;
  }
  @keyframes eq {
    from {
      height: 20%;
    }
    to {
      height: 100%;
    }
  }
</style>
