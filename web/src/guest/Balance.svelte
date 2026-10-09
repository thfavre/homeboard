<script lang="ts">
  import { untrack } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { Clock } from '@lucide/svelte';
  import type { PassivePaid } from '$shared/protocol.ts';
  import { formatAmount } from '$shared/money.ts';
  import { hb, onEvent } from '$lib/client.svelte.ts';
  import Coin from '$lib/ui/Coin.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { passiveTimer } from './passive.svelte.ts';

  let { amount, onclick }: { amount: number; onclick: () => void } = $props();

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shown = new Tween(untrack(() => amount), { duration: reduced ? 0 : 750, easing: cubicOut });


  let deltas = $state<{ id: number; value: number; passive?: boolean }[]>([]);
  let seq = 0;
  let btn: HTMLButtonElement;
  let coin: HTMLSpanElement;
  let ring = $state<SVGCircleElement>();
  let last = untrack(() => amount);

  /** Web animations do not resolve CSS variables everywhere: read the theme colour itself */
  const themeColor = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'currentColor';

  $effect(() => {
    const now = amount;
    if (now === last) return;
    const diff = now - last;
    last = now;
    shown.target = now;
    const d = { id: ++seq, value: diff };
    deltas = [...deltas, d];
    setTimeout(() => (deltas = deltas.filter((x) => x.id !== d.id)), 1500);
    const c = themeColor(diff < 0 ? '--danger' : '--success');
    btn?.animate(
      [{}, { borderColor: c, boxShadow: `0 0 0 3px color-mix(in srgb, ${c} 25%, transparent)`, transform: 'scale(1.06)' }, {}],
      { duration: 650, easing: 'ease-out' },
    );
  });

  // Passive income: a ring fills around the coin, then the coin flips when it pays
  const timer = $derived(passiveTimer());
  let lastProgress = 0;
  $effect(() => {
    const p = timer?.progress ?? 0;
    // Jump back to empty at once instead of sweeping backwards
    if (ring) ring.style.transition = p < lastProgress ? 'none' : '';
    lastProgress = p;
  });

  $effect(() =>
    onEvent<PassivePaid>('core', 'passive', ({ amount }) => {
      const d = [...deltas].reverse().find((x) => x.value === amount && !x.passive);
      if (d) d.passive = true;
      if (reduced) return;
      coin?.animate(
        [{ transform: 'none' }, { transform: 'rotateY(360deg) scale(1.4)', offset: 0.5 }, { transform: 'rotateY(720deg)' }],
        { duration: 900, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
      );
    }),
  );

  const label = $derived(timer ? `Next passive income in ${Math.ceil(timer.remainingMs / 60_000)} min` : undefined);

  // Could not afford something: shake and glow red
  let seenAlert = untrack(() => hb.moneyAlert);
  $effect(() => {
    if (hb.moneyAlert === seenAlert) return;
    seenAlert = hb.moneyAlert;
    const red = themeColor('--danger');
    const hot = { borderColor: red, color: red, boxShadow: `0 0 0 4px color-mix(in srgb, ${red} 30%, transparent), 0 0 18px color-mix(in srgb, ${red} 45%, transparent)` };
    const shake = reduced ? [0, 0, 0] : [-5, 5, -3];
    btn?.animate([{}, ...shake.map((x) => ({ ...hot, transform: `translateX(${x}px)` })), { ...hot, transform: 'none', offset: 0.75 }, {}], {
      duration: 1200,
      easing: 'ease-out',
    });
  });
</script>

<span class="wrap">
  <button class="balance" bind:this={btn} {onclick} title={label}>
    <span class="money mono">
      <span class="coin-slot" class:timed={!!timer} class:paused={!hb.connected}>
        {#if timer}
          <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle class="track" cx="18" cy="18" r="16" pathLength="100" />
            <circle class="fill" bind:this={ring} cx="18" cy="18" r="16" pathLength="100" style:stroke-dashoffset={100 - timer.progress * 100} />
          </svg>
        {/if}
        <span class="coin" bind:this={coin}><Coin /></span>
      </span>
      {formatAmount(shown.current, true)}
    </span>
  </button>
  {#each deltas as d (d.id)}
    <span class="delta" class:down={d.value < 0}>
      {#if d.passive}<Clock size={12} strokeWidth={2.5} />{/if}<Money amount={d.value} sign />
    </span>
  {/each}
</span>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
  }
  .balance {
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    border-radius: 999px;
    padding: 0.4rem 0.85rem;
    font-size: 1rem;
  }
  .money {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    font-weight: 600;
    white-space: nowrap;
  }
  .coin-slot {
    position: relative;
    display: inline-grid;
    place-items: center;
    perspective: 10em;
  }
  .coin-slot.timed {
    width: 1.45em;
    height: 1.45em;
    margin: -0.2em 0 -0.2em -0.25em;
  }
  .coin {
    display: grid;
  }
  .ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
    fill: none;
    stroke-width: 3;
  }
  .ring .track {
    stroke: color-mix(in srgb, var(--coin) 18%, transparent);
  }
  .ring .fill {
    stroke: var(--coin);
    stroke-linecap: round;
    stroke-dasharray: 100;
    transition: stroke-dashoffset 1s linear;
  }
  .paused .ring {
    opacity: 0.35;
  }
  .delta {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    position: absolute;
    right: 0.4rem;
    top: 100%;
    margin-top: 0.3rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.82rem;
    pointer-events: none;
    color: var(--success);
    background: color-mix(in srgb, var(--success) 16%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--success) 40%, transparent);
    animation: hb-delta-up 1.5s ease-out forwards;
  }
  .delta.down {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 16%, var(--bg));
    border-color: color-mix(in srgb, var(--danger) 40%, transparent);
    animation-name: hb-delta-down;
  }
  @keyframes hb-delta-down {
    0% {
      opacity: 0;
      transform: translateY(-0.6rem) scale(0.8);
    }
    15% {
      opacity: 1;
      transform: none;
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(0.8rem);
    }
  }
  @keyframes hb-delta-up {
    0% {
      opacity: 0;
      transform: translateY(0.6rem) scale(0.8);
    }
    15% {
      opacity: 1;
      transform: none;
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(-0.5rem);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .delta {
      animation-name: hb-delta-fade;
    }
    .delta.down {
      animation-name: hb-delta-fade;
    }
  }
  @keyframes hb-delta-fade {
    0%,
    100% {
      opacity: 0;
    }
    15%,
    70% {
      opacity: 1;
    }
  }
</style>
