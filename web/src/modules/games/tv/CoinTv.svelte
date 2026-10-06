<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { CoinView, MatchState } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Ring from '../../quiz/Ring.svelte';
  import { Now } from '../store.svelte.ts';
  import { coinDraw } from '../ui/coinDraw.ts';
  import CoinFace from './CoinFace.svelte';

  /** The roulette picks the caller, they call a side, the flipper swipes the coin up from their phone into the TV */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CoinView);
  const now = new Now(50);
  const draw = $derived(coinDraw(v, m.players, now.value));
  const nameOf = (id: string) => m.players.find((p) => p.id === id)?.name ?? '';
  const sideOf = (id: string) => (!v.side ? null : id === v.caller ? v.side : v.side === 'heads' ? 'tails' : 'heads');
  const title = $derived(
    v.step === 'draw'
      ? draw.settled
        ? `${nameOf(v.caller)} calls it!`
        : 'Who calls it?'
      : v.step === 'call'
        ? `${nameOf(v.caller)}, heads or tails?`
        : v.step === 'toss'
          ? `${nameOf(v.flipper)} flips!`
          : v.outcome
            ? v.outcome === 'heads'
              ? 'Heads!'
              : 'Tails!'
            : 'Flipping...',
  );
</script>

<div class="flip">
  {#each m.players as p, i (p.id)}
    {@const side = sideOf(p.id)}
    <div
      class="who"
      class:lit={v.step === 'draw' && draw.highlighted === p.id}
      class:settled={v.step === 'draw' && draw.settled && draw.highlighted === p.id}
      class:win={v.outcome && v.outcome === side}
      class:lose={v.outcome && v.outcome !== side}
      style:order={i * 2}
    >
      <span class="ring"><Avatar name={p.name} color={p.color} id={p.id} size="9rem" /></span>
      <strong>{p.name}</strong>
      <span class="tag">
        {#if side}
          {#key side}<span class="pill accent side" in:scale={{ start: 0.3, duration: 500 }}>{side}</span>{/key}
        {:else if v.step === 'call' && p.id === v.caller}
          <span class="pill" in:fade>Calling...</span>
        {/if}
      </span>
    </div>
  {/each}
  <div class="mid" style:order="1">
    <div class="stage">
      {#if v.step === 'flight'}
        <div class="launch" style:--peak="{6 + v.power * 12}rem">
          <CoinFace outcome={v.outcome} size="20rem" />
        </div>
      {:else if v.step === 'toss'}
        <p class="hint" in:fade>Swipe up on your phone</p>
      {:else if v.step === 'call' && m.endsAt}
        <Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="10rem" />
      {/if}
    </div>
    {#key title}<h1 in:fade={{ duration: 250 }}>{title}</h1>{/key}
    {#if v.step === 'toss' && m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="6rem" />{/if}
  </div>
</div>

<style>
  .flip {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-evenly;
  }
  .who {
    display: grid;
    justify-items: center;
    gap: 1rem;
    font-size: 2rem;
    transition:
      opacity 0.5s ease,
      transform 0.5s ease;
  }
  .ring {
    display: grid;
    border-radius: 50%;
    transition:
      box-shadow 0.12s ease,
      transform 0.12s ease;
  }
  .who.lit .ring {
    transform: scale(1.08);
    box-shadow:
      0 0 0 0.4rem var(--coin),
      0 0 4rem 0.5rem color-mix(in srgb, var(--coin) 60%, transparent);
  }
  .who.settled .ring {
    animation: pop 0.6s ease;
  }
  .who.win {
    transform: scale(1.12);
  }
  .who.lose {
    opacity: 0.35;
  }
  .tag {
    min-height: 2.4rem;
  }
  .side {
    font-size: 1.3rem;
    text-transform: capitalize;
  }
  .mid {
    width: 36rem;
    display: grid;
    justify-items: center;
    gap: 2.5rem;
    text-align: center;
  }
  /* Same size in every step, so nothing jumps */
  .stage {
    width: 20rem;
    height: 20rem;
    display: grid;
    place-items: center;
  }
  .hint {
    font-size: 1.6rem;
    color: var(--text-dim);
    animation: nudge 1.4s ease-in-out infinite;
  }
  /* The coin comes in from the bottom of the screen, as if thrown from the phone */
  .launch {
    animation: launch 1.3s cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  h1 {
    font-size: 4rem;
  }
  @keyframes launch {
    from {
      transform: translateY(70vh) scale(0.35);
    }
    55% {
      transform: translateY(calc(-1 * var(--peak))) scale(1.2);
    }
    to {
      transform: translateY(0) scale(1);
    }
  }
  @keyframes pop {
    40% {
      transform: scale(1.25);
    }
  }
  @keyframes nudge {
    50% {
      transform: translateY(-0.6rem);
    }
  }
</style>
