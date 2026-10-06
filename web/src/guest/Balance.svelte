<script lang="ts">
  import { untrack } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { hb } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';

  let { amount, onclick }: { amount: number; onclick: () => void } = $props();

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shown = new Tween(untrack(() => amount), { duration: reduced ? 0 : 750, easing: cubicOut });

  // Count in whole coins when both ends are whole, so the number does not flicker through cents
  let unit = $state(100);
  const display = $derived(Math.round(shown.current / unit) * unit);

  let deltas = $state<{ id: number; value: number }[]>([]);
  let seq = 0;
  let btn: HTMLButtonElement;
  let last = untrack(() => amount);

  /** Web animations do not resolve CSS variables everywhere: read the theme colour itself */
  const themeColor = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'currentColor';

  $effect(() => {
    const now = amount;
    if (now === last) return;
    const diff = now - last;
    unit = [100, 10, 1].find((u) => now % u === 0 && last % u === 0) ?? 1;
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
  <button class="balance" bind:this={btn} {onclick}><Money amount={display} /></button>
  {#each deltas as d (d.id)}
    <span class="delta" class:down={d.value < 0}><Money amount={d.value} sign /></span>
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
  .delta {
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
