<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import Coin from '$lib/ui/Coin.svelte';
  import Money from '$lib/ui/Money.svelte';

  /**
   * Money won or lost at the end of a game: coins fly into the amount while it counts up (a win), or
   * fly out of it and fall away while it counts down (a loss). `amount` is signed, `delay` in ms.
   */
  let { amount, delay = 0 }: { amount: number; delay?: number } = $props();
  const win = $derived(amount > 0);
  const COINS = 9;
  // Each coin its own path: where it starts (win) or ends (loss), and when
  const coins = Array.from({ length: COINS }, (_, i) => {
    const a = (i / COINS) * Math.PI * 2 + Math.random() * 0.5;
    const r = 7 + Math.random() * 4;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7 - 2, spin: Math.round((Math.random() - 0.5) * 720), at: i * 70 + Math.random() * 60 };
  });
  const shown = new Tween(0, { duration: 1100, easing: cubicOut });
  $effect(() => {
    const to = amount;
    const t = setTimeout(() => (shown.target = to), delay + 250);
    return () => clearTimeout(t);
  });
  $effect(() => {
    if (amount) setTimeout(() => navigator.vibrate?.(amount > 0 ? [20, 40, 20, 40, 30] : 60), delay + 300);
  });
</script>

<div class="flow" class:win class:lose={!win} style:--delay="{delay}ms">
  <div class="coins" aria-hidden="true">
    {#each coins as c, i (i)}
      <span class="coin" style:--x="{c.x}rem" style:--y="{c.y}rem" style:--spin="{c.spin}deg" style:--at="{delay + c.at}ms"><Coin size="1.5rem" /></span>
    {/each}
  </div>
  <span class="amount mono"><Money amount={Math.round(shown.current)} sign whole={amount % 100 === 0} /></span>
</div>

<style>
  .flow {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 3.2rem;
  }
  .amount {
    position: relative;
    z-index: 1;
    font-size: 2.2rem;
    font-weight: 700;
    animation: arrive 0.5s cubic-bezier(0.3, 1.6, 0.5, 1) var(--delay) both;
  }
  .win .amount {
    color: var(--success);
    text-shadow: 0 0 1.5rem color-mix(in srgb, var(--success) 50%, transparent);
  }
  .lose .amount {
    color: var(--danger);
    animation:
      arrive 0.5s ease var(--delay) both,
      shake 0.45s ease calc(var(--delay) + 0.45s);
  }
  .coins {
    position: absolute;
    inset: 50% auto auto 50%;
  }
  .coin {
    position: absolute;
    left: -0.75rem;
    top: -0.75rem;
    display: grid;
    opacity: 0;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35));
  }
  /* A win: from all around into the amount */
  .win .coin {
    animation: fly-in 0.75s cubic-bezier(0.5, 0, 0.75, 0) var(--at) both;
  }
  /* A loss: out of the amount, up a little, then falling off the screen */
  .lose .coin {
    animation: fly-out 1.2s cubic-bezier(0.3, 0, 0.6, 1) calc(var(--at) + 450ms) both;
  }
  @keyframes fly-in {
    0% {
      opacity: 0;
      transform: translate(var(--x), var(--y)) rotate(var(--spin)) scale(1.2);
    }
    20% {
      opacity: 1;
    }
    90% {
      opacity: 1;
      transform: translate(0, 0) rotate(0deg) scale(0.7);
    }
    100% {
      opacity: 0;
      transform: translate(0, 0) scale(0.3);
    }
  }
  @keyframes fly-out {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.5);
    }
    15% {
      opacity: 1;
    }
    45% {
      opacity: 1;
      transform: translate(calc(var(--x) * 0.6), calc(var(--y) * 0.6 - 2rem)) rotate(calc(var(--spin) * 0.5)) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(var(--x), 16rem) rotate(var(--spin)) scale(0.9);
    }
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
  }
  @keyframes shake {
    20%,
    60% {
      transform: translateX(-0.4rem);
    }
    40%,
    80% {
      transform: translateX(0.4rem);
    }
  }
</style>
