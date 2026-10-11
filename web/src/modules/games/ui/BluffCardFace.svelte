<script lang="ts">
  import { HandCoins, Handshake, VenetianMask } from '@lucide/svelte';

  /**
   * One Bluff playing card: Share (green), Steal (red) or the back (the game's mask). Portrait, with
   * an inner frame, the symbol in two corners like a real card, a big emblem and a light sheen.
   * Its width is `width`; the height follows (5 by 7). `alive`: it never sits still (the emblem
   * breathes, a light sweeps over now and then, the back's pattern drifts and its mask glows).
   */
  let { kind, width = '8rem', shine = false, alive = false }: { kind: 'share' | 'steal' | 'back'; width?: string; shine?: boolean; alive?: boolean } = $props();
  const Icon = $derived(kind === 'share' ? Handshake : kind === 'steal' ? HandCoins : VenetianMask);
</script>

<span class="bcard {kind}" class:shine class:alive style:--w={width}>
  <span class="frame"></span>
  {#if kind === 'back'}
    <span class="emblem"><Icon size="45%" strokeWidth={1.8} /></span>
  {:else}
    <span class="corner tl"><Icon size="100%" strokeWidth={2.4} /></span>
    <span class="corner br"><Icon size="100%" strokeWidth={2.4} /></span>
    <span class="emblem"><Icon size="50%" strokeWidth={1.9} /></span>
    <strong class="word">{kind === 'share' ? 'Share' : 'Steal'}</strong>
  {/if}
</span>

<style>
  .bcard {
    --a: #3be0a0;
    --b: #0f8f63;
    --glow: #2fd27a;
    position: relative;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: calc(var(--w) * 0.06);
    width: var(--w);
    aspect-ratio: 5 / 7;
    border-radius: calc(var(--w) * 0.09);
    background: linear-gradient(160deg, var(--a), var(--b));
    color: #fff;
    box-shadow:
      0 calc(var(--w) * 0.1) calc(var(--w) * 0.22) calc(var(--w) * -0.1) color-mix(in srgb, var(--glow) 70%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.35);
    overflow: hidden;
    isolation: isolate;
    user-select: none;
    -webkit-user-select: none;
  }
  .steal {
    --a: #ff6a86;
    --b: #c3123f;
    --glow: #ff3b5c;
  }
  .back {
    --a: #3a1660;
    --b: #170a26;
    --glow: #ff3b8d;
    /* Fine diamonds, like the back of a deck */
    background:
      repeating-linear-gradient(45deg, rgba(255, 59, 141, 0.13) 0 2px, transparent 2px calc(var(--w) * 0.07)),
      repeating-linear-gradient(-45deg, rgba(139, 61, 255, 0.16) 0 2px, transparent 2px calc(var(--w) * 0.07)),
      radial-gradient(circle at 50% 45%, rgba(255, 59, 141, 0.35), transparent 60%),
      linear-gradient(160deg, var(--a), var(--b));
  }
  /* The inner border of a printed card */
  .frame {
    position: absolute;
    inset: calc(var(--w) * 0.05);
    border-radius: calc(var(--w) * 0.06);
    border: 1.5px solid rgba(255, 255, 255, 0.35);
    pointer-events: none;
  }
  .back .frame {
    border-color: rgba(255, 59, 141, 0.7);
    box-shadow: inset 0 0 0 calc(var(--w) * 0.025) rgba(23, 10, 38, 0.6), inset 0 0 0 calc(var(--w) * 0.03 + 1.5px) rgba(255, 59, 141, 0.35);
  }
  .corner {
    position: absolute;
    width: calc(var(--w) * 0.14);
    height: calc(var(--w) * 0.14);
    display: grid;
    opacity: 0.9;
  }
  .tl {
    top: calc(var(--w) * 0.1);
    left: calc(var(--w) * 0.1);
  }
  .br {
    right: calc(var(--w) * 0.1);
    bottom: calc(var(--w) * 0.1);
    transform: rotate(180deg);
  }
  .emblem {
    display: grid;
    place-items: center;
    width: calc(var(--w) * 0.52);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0.08) 70%);
    box-shadow:
      inset 0 0 0 1.5px rgba(255, 255, 255, 0.35),
      0 calc(var(--w) * 0.03) calc(var(--w) * 0.08) rgba(0, 0, 0, 0.18);
  }
  .back .emblem {
    width: calc(var(--w) * 0.5);
    background: radial-gradient(circle at 35% 30%, #ff5fa8, #8b3dff);
    box-shadow:
      0 0 0 calc(var(--w) * 0.025) rgba(23, 10, 38, 0.9),
      0 0 0 calc(var(--w) * 0.035) rgba(255, 59, 141, 0.6),
      0 0 calc(var(--w) * 0.2) rgba(255, 59, 141, 0.55);
  }
  .word {
    font-family: var(--font-display);
    font-size: calc(var(--w) * 0.15);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  /* The sheen: a soft light across the top, and a streak that sweeps over once when `shine` */
  .bcard::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(170deg, rgba(255, 255, 255, 0.22), transparent 40%);
    pointer-events: none;
  }
  .bcard::before {
    content: '';
    position: absolute;
    inset: -20% -60%;
    z-index: 2;
    background: linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.35) 50%, transparent 60%);
    transform: translateX(-70%);
    pointer-events: none;
  }
  .shine::before {
    animation: sweep 1.1s ease-out 0.15s;
  }
  /* Alive: the light comes back every few seconds, the emblem breathes */
  .alive::before {
    animation: sweep-again 4.5s ease-in-out infinite;
  }
  .alive .emblem {
    animation: breathe 2.6s ease-in-out infinite;
  }
  .alive .emblem :global(svg) {
    animation: nudge 2.6s ease-in-out infinite;
  }
  /* The diamonds slide along: one stripe period, horizontally (period x sqrt 2 for 45deg stripes) */
  .alive.back {
    animation: drift 3s linear infinite;
  }
  .alive.back .emblem {
    animation: glow 2.2s ease-in-out infinite;
  }
  @keyframes sweep-again {
    0%,
    55% {
      transform: translateX(-70%);
    }
    80%,
    100% {
      transform: translateX(70%);
    }
  }
  @keyframes breathe {
    50% {
      transform: scale(1.07);
      box-shadow:
        inset 0 0 0 1.5px rgba(255, 255, 255, 0.5),
        0 0 calc(var(--w) * 0.12) rgba(255, 255, 255, 0.35);
    }
  }
  @keyframes nudge {
    25% {
      transform: rotate(-8deg);
    }
    75% {
      transform: rotate(8deg);
    }
  }
  @keyframes drift {
    to {
      background-position:
        calc(var(--w) * 0.07 * 1.4142) 0,
        calc(var(--w) * 0.07 * 1.4142) 0,
        0 0,
        0 0;
    }
  }
  @keyframes glow {
    50% {
      transform: scale(1.06);
      box-shadow:
        0 0 0 calc(var(--w) * 0.025) rgba(23, 10, 38, 0.9),
        0 0 0 calc(var(--w) * 0.035) rgba(255, 59, 141, 0.9),
        0 0 calc(var(--w) * 0.35) rgba(255, 59, 141, 0.8);
    }
  }
  @keyframes sweep {
    to {
      transform: translateX(70%);
    }
  }
</style>
