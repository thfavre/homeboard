<script lang="ts">
  import { onEvent, resyncClock, rpc } from '$lib/client.svelte.ts';
  import { preloadMusic, warmAudio } from './ui/rhythmMusic.ts';

  /**
   * Nothing to see: keeps the TV's sound output awake while the host has Rhythm Rain songs, and
   * when a duel with music begins, decodes its song and tells the server it is ready: the count-in
   * only starts then, so the music starts on the beat.
   */
  $effect(() => {
    void warmAudio();
  });
  $effect(() =>
    onEvent<{ url: string }>('games', 'rhythmPrepare', async ({ url }) => {
      try {
        // The song starts at a server time: this TV's idea of it must be right
        await Promise.all([preloadMusic(url), resyncClock()]);
        await warmAudio();
      } finally {
        // Ready or not (broken file), the game must go on
        void rpc('games', 'play', { ready: url }).catch(() => {});
      }
    }),
  );
</script>
