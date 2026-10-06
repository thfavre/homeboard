<script lang="ts">
  import { Disc3 } from '@lucide/svelte';
  import type { GamesState, ScratchMove } from '$shared/games.ts';
  import type { SpotifyState } from '$shared/spotify.ts';
  import { hb, onEvent } from '$lib/client.svelte.ts';
  import Ring from '../../quiz/Ring.svelte';
  import { NORMAL_SPEED, Scratcher } from './scratch.ts';
  import Vinyl from './Vinyl.svelte';

  /**
   * Perfect Circle prize, in the side column instead of "Up next": the winner's best circle on a
   * record, scratched live from their phone, with the sound on the TV.
   */
  const perk = $derived.by(() => {
    const p = (hb.modules.games as GamesState | undefined)?.perk;
    return p?.kind === 'scratch' ? p : null;
  });

  // The record plays the song on now
  const song = $derived.by(() => {
    const s = hb.modules.spotify as SpotifyState | undefined;
    return s?.connected && s.now?.isPlaying ? s.now : null;
  });

  // Only on and off: every state update brings a new perk object, the deck must not restart for it
  const active = $derived(!!perk);
  let angle = $state(0);
  let touching = $state(false);

  $effect(() => {
    if (!active) return;
    const deck = new Scratcher();
    // The phone sends its own angle: keep the record where it is when a hand lands on it
    let offset = 0;
    const off = onEvent<ScratchMove>('games', 'scratch', (mv) => {
      if (mv.touching && !deck.touching) offset = deck.target - mv.angle;
      if (mv.touching) deck.target = mv.angle + offset;
      deck.touching = mv.touching;
      touching = mv.touching;
    });
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(t) {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      // Left alone, the record turns at its normal speed
      if (!deck.touching) deck.target += NORMAL_SPEED * dt;
      angle += (deck.target - angle) * Math.min(1, dt * 25);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      off();
      cancelAnimationFrame(frame);
      deck.stop();
    };
  });
</script>

{#if perk}
  <div class="card deck" class:touching>
    <div class="head">
      <span class="eyebrow"><Disc3 size="0.9rem" /> On the decks</span>
      <Ring endsAt={perk.until} totalMs={perk.totalMs} size="2.4rem" />
    </div>
    <div class="body">
      <span class="platter"><Vinyl points={perk.drawing.points} color={perk.guest.color} name={perk.guest.name} {angle} size="8.5rem" /></span>
      <div class="text">
        <strong class="truncate">{perk.guest.name}</strong>
        {#if song}<span class="song truncate">{song.title}</span>{/if}
        <span class="dim">{touching ? 'Scratching...' : 'Perfect Circle winner. Scratch it from your phone!'}</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .deck {
    padding: 1rem 1.2rem;
    display: grid;
    gap: 0.6rem;
    transition: box-shadow 0.25s ease;
  }
  .deck.touching {
    box-shadow: 0 0 3rem -1rem color-mix(in srgb, var(--coin) 70%, transparent);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .body {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .platter {
    flex: none;
    display: grid;
  }
  .text {
    min-width: 0;
    display: grid;
    gap: 0.3rem;
  }
  strong {
    font-size: 1.15rem;
  }
  .dim {
    font-size: 0.9rem;
  }
  .song {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--coin);
  }
</style>
