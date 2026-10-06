<script lang="ts">
  import { Disc3 } from '@lucide/svelte';
  import { fade, scale } from 'svelte/transition';
  import type { Perk, ScratchMove } from '$shared/games.ts';
  import { onEvent } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Ring from '../../quiz/Ring.svelte';
  import { NORMAL_SPEED, Scratcher } from './scratch.ts';
  import Vinyl from './Vinyl.svelte';

  /** Perfect Circle prize: the winner's best circle on a record, scratched live from their phone */
  let { perk }: { perk: Extract<Perk, { kind: 'scratch' }> } = $props();

  let angle = $state(0);
  let touching = $state(false);

  $effect(() => {
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

<div class="deck" in:fade>
  <div class="who">
    <Avatar name={perk.guest.name} color={perk.guest.color} id={perk.guest.id} size="5rem" />
    <div class="text">
      <span class="eyebrow"><Disc3 size="1.1rem" /> Perfect Circle winner</span>
      <h1>{perk.guest.name} on the decks</h1>
    </div>
  </div>
  <div class="platter" class:touching in:scale={{ start: 0.6, duration: 600 }}>
    <Vinyl points={perk.drawing.points} color={perk.guest.color} label={perk.guest.name} {angle} size="min(36rem, 62vh)" />
  </div>
  <div class="foot">
    <p class="dim">{touching ? 'Scratching...' : `Scratch it from your phone, ${perk.guest.name}!`}</p>
    <Ring endsAt={perk.until} totalMs={perk.totalMs} size="5rem" />
  </div>
</div>

<style>
  .deck {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr auto;
    justify-items: center;
    align-items: center;
    gap: 1.5rem;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 1.2rem;
  }
  .text {
    display: grid;
    gap: 0.3rem;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 1.1rem;
  }
  h1 {
    font-size: 3.4rem;
    letter-spacing: -0.02em;
  }
  .platter {
    border-radius: 50%;
    padding: 1.2rem;
    background: radial-gradient(circle, var(--surface-3), var(--surface));
    border: 1px solid var(--border-strong);
    transition: box-shadow 0.25s ease;
  }
  .platter.touching {
    box-shadow: 0 0 6rem -1rem color-mix(in srgb, var(--coin) 70%, transparent);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    font-size: 1.5rem;
  }
</style>
