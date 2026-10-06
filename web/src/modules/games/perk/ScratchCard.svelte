<script lang="ts">
  import type { GamesState, ScratchMove } from '$shared/games.ts';
  import { hb, onEvent } from '$lib/client.svelte.ts';
  import { NORMAL_SPEED, Scratcher } from './scratch.ts';
  import Vinyl from './Vinyl.svelte';

  /**
   * Perfect Circle prize, in the side column instead of "Up next": just the record (the winner's
   * best circle), scratched live from their phone, with the sound on the TV.
   */
  const perk = $derived.by(() => {
    const p = (hb.modules.games as GamesState | undefined)?.perk;
    return p?.kind === 'scratch' ? p : null;
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
  <div class="deck" class:touching>
    <span class="platter"><Vinyl points={perk.drawing.points} color={perk.guest.color} name={perk.guest.name} {angle} size="15rem" /></span>
  </div>
{/if}

<style>
  .deck {
    display: grid;
    place-items: center;
    padding: 0.5rem 0;
  }
  .platter {
    display: grid;
    border-radius: 50%;
    transition: filter 0.25s ease;
  }
  .touching .platter {
    filter: drop-shadow(0 0 1.5rem color-mix(in srgb, var(--coin) 55%, transparent));
  }
</style>
