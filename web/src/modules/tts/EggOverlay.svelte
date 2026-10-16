<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { OverlayFx } from './eggs.ts';

  /** Full-screen particles of a shoutout easter egg. Random values are drawn once, when the banner appears. */
  let { kind }: { kind: OverlayFx } = $props();

  const rnd = (min: number, max: number) => min + Math.random() * (max - min);
  const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);

  const CONFETTI = ['#ff4d6d', '#ffd23f', '#3bceac', '#4d96ff', '#b388ff', '#ff8c42'];
  const SPOTS = ['#ff2e88', '#00e5ff', '#ffe600', '#7c4dff', '#00ff85'];
  const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789HOMEBOARD';

  // svelte-ignore state_referenced_locally
  const k = kind;

  const falling = range(k === 'snow' ? 70 : k === 'confetti' ? 90 : k === 'coins' ? 34 : k === 'rain' ? 110 : 0).map(() => ({
    x: rnd(0, 100),
    delay: rnd(-8, 0),
    dur: k === 'rain' ? rnd(0.5, 0.9) : k === 'snow' ? rnd(6, 12) : rnd(3.5, 7),
    size: k === 'snow' ? rnd(0.3, 1.1) : k === 'coins' ? rnd(1.8, 3) : rnd(0.5, 1.1),
    drift: rnd(-8, 8),
    spin: rnd(360, 1080) * (Math.random() < 0.5 ? -1 : 1),
    color: pick(CONFETTI),
    opacity: rnd(0.5, 1),
  }));

  const rising = range(k === 'bubbles' ? 45 : k === 'hearts' ? 26 : 0).map(() => ({
    x: rnd(0, 100),
    delay: rnd(-8, 0),
    dur: rnd(5, 10),
    size: k === 'hearts' ? rnd(1.6, 3.6) : rnd(0.6, 2.4),
    sway: rnd(2, 6),
    color: pick(['#ff4d8d', '#ff6b9d', '#ff2e63', '#ff8fab']),
  }));

  const columns = range(k === 'matrix' ? 36 : 0).map((i) => ({
    x: (i / 36) * 100 + rnd(0, 2),
    delay: rnd(-6, 0),
    dur: rnd(3, 7),
    chars: range(Math.round(rnd(12, 26)))
      .map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)])
      .join(''),
  }));

  const bursts = range(k === 'fireworks' ? 7 : 0).map((i) => ({
    x: rnd(8, 92),
    y: rnd(8, 42) + (i % 2) * 40,
    delay: rnd(0, 2.4),
    color: pick(CONFETTI),
    sparks: range(18).map((s) => (s / 18) * 360),
  }));

  const spots = range(k === 'disco' ? 9 : 0).map(() => ({
    x: rnd(0, 100),
    y: rnd(0, 100),
    dx: rnd(-35, 35),
    dy: rnd(-35, 35),
    dur: rnd(2.5, 5),
    color: pick(SPOTS),
  }));

  const embers = range(k === 'embers' ? 55 : 0).map(() => ({
    x: rnd(0, 100),
    delay: rnd(-6, 0),
    dur: rnd(3, 6.5),
    size: rnd(0.15, 0.45),
    sway: rnd(2, 7),
    rise: rnd(55, 95),
    color: pick(['#ffd23f', '#ff9a1f', '#ff6a00', '#ffb347']),
  }));

  const stars = range(k === 'stars' ? 120 : 0).map(() => ({
    angle: rnd(0, 360),
    delay: rnd(-4, 0),
    dur: rnd(1.8, 4),
    size: rnd(0.12, 0.3),
  }));
</script>

<!-- Fixed over the screen, so it never takes room in the TV layout. Global: it fades out with the banner. -->
<div class="egg {k}" aria-hidden="true" in:fade|global={{ duration: 900 }} out:fade|global={{ duration: 1200 }}>
  {#if k === 'snow'}
    {#each falling as p}
      <span class="flake" style:left="{p.x}%" style:--s="{p.size}rem" style:--d="{p.dur}s" style:--delay="{p.delay}s" style:--drift="{p.drift}vw" style:opacity={p.opacity}></span>
    {/each}
  {:else if k === 'confetti'}
    {#each falling as p}
      <span class="confetti-bit" style:left="{p.x}%" style:--s="{p.size}rem" style:--d="{p.dur}s" style:--delay="{p.delay}s" style:--drift="{p.drift}vw" style:--spin="{p.spin}deg" style:background={p.color}></span>
    {/each}
  {:else if k === 'coins'}
    {#each falling as p}
      <span class="coin" style:left="{p.x}%" style:--s="{p.size}rem" style:--d="{p.dur}s" style:--delay="{p.delay}s" style:--drift="{p.drift / 3}vw"></span>
    {/each}
  {:else if k === 'rain'}
    {#each falling as p}
      <span class="drop" style:left="{p.x}%" style:--d="{p.dur}s" style:--delay="{p.delay}s" style:opacity={p.opacity * 0.6}></span>
    {/each}
  {:else if k === 'bubbles'}
    {#each rising as p}
      <span class="bubble" style:left="{p.x}%" style:--s="{p.size}rem" style:--d="{p.dur}s" style:--delay="{p.delay}s" style:--sway="{p.sway}vw"></span>
    {/each}
  {:else if k === 'hearts'}
    {#each rising as p}
      <svg class="heart" viewBox="0 0 24 22" style:left="{p.x}%" style:--s="{p.size}rem" style:--d="{p.dur}s" style:--delay="{p.delay}s" style:--sway="{p.sway}vw">
        <path d="M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5L12 21.4Z" fill={p.color} />
      </svg>
    {/each}
  {:else if k === 'matrix'}
    {#each columns as c}
      <span class="column" style:left="{c.x}%" style:--d="{c.dur}s" style:--delay="{c.delay}s">{c.chars}</span>
    {/each}
  {:else if k === 'fireworks'}
    {#each bursts as b}
      <span class="burst" style:left="{b.x}%" style:top="{b.y}%" style:--delay="{b.delay}s" style:--c={b.color}>
        {#each b.sparks as a}
          <span class="spark" style:--a="{a}deg"></span>
        {/each}
      </span>
    {/each}
  {:else if k === 'disco'}
    {#each spots as s}
      <span class="spot" style:left="{s.x}%" style:top="{s.y}%" style:--dx="{s.dx}vw" style:--dy="{s.dy}vh" style:--d="{s.dur}s" style:--c={s.color}></span>
    {/each}
  {:else if k === 'embers'}
    <span class="glow"></span>
    {#each embers as e}
      <span class="ember" style:left="{e.x}%" style:--s="{e.size}rem" style:--d="{e.dur}s" style:--delay="{e.delay}s" style:--sway="{e.sway}vw" style:--rise="{e.rise}vh" style:--c={e.color}></span>
    {/each}
  {:else if k === 'stars'}
    {#each stars as s}
      <span class="star" style:--a="{s.angle}deg" style:--d="{s.dur}s" style:--delay="{s.delay}s" style:--s="{s.size}rem"></span>
    {/each}
  {/if}
</div>

<style>
  .egg {
    position: fixed;
    inset: 0;
    z-index: 46;
    overflow: hidden;
    pointer-events: none;
  }
  /* In front of the banner: things that fall or float through it */
  .egg.snow,
  .egg.confetti,
  .egg.hearts,
  .egg.coins,
  .egg.embers,
  .egg.rain {
    z-index: 48;
  }

  /* ------------------------------------------------ falling */
  .flake,
  .confetti-bit,
  .coin,
  .drop {
    position: absolute;
    top: -6vh;
    animation: fall var(--d) linear var(--delay) infinite;
  }
  .flake {
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  }
  .confetti-bit {
    width: var(--s);
    height: calc(var(--s) * 0.45);
    border-radius: 2px;
    animation-name: fall-spin;
  }
  .coin {
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff6b0, #ffd23f 35%, #e0a100 70%, #a86f00);
    box-shadow:
      inset 0 0 0 calc(var(--s) * 0.08) #c98a00,
      0 0 14px rgba(255, 200, 40, 0.5);
    animation-name: fall-flip;
  }
  .drop {
    width: 2px;
    height: 4.5rem;
    background: linear-gradient(transparent, #9cc8ff);
    transform: rotate(12deg);
    animation-name: fall-rain;
  }
  .egg.rain {
    background: rgba(10, 20, 40, 0.35);
  }

  @keyframes fall {
    to {
      transform: translate(var(--drift), 112vh);
    }
  }
  @keyframes fall-spin {
    to {
      transform: translate(var(--drift), 112vh) rotate(var(--spin)) rotateX(var(--spin));
    }
  }
  @keyframes fall-flip {
    to {
      transform: translate(var(--drift), 112vh) rotateY(1080deg);
    }
  }
  @keyframes fall-rain {
    from {
      transform: translate(0, 0) rotate(12deg);
    }
    to {
      transform: translate(-22vh, 115vh) rotate(12deg);
    }
  }

  /* ------------------------------------------------ rising */
  .bubble,
  .heart {
    position: absolute;
    bottom: -6vh;
    width: var(--s);
    height: var(--s);
    animation:
      rise var(--d) ease-in var(--delay) infinite,
      sway 2.4s ease-in-out var(--delay) infinite alternate;
  }
  .bubble {
    border-radius: 50%;
    border: 2px solid rgba(255, 236, 170, 0.75);
    background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.7), rgba(255, 220, 120, 0.15) 40%, transparent 70%);
  }
  .heart {
    filter: drop-shadow(0 0 10px rgba(255, 60, 120, 0.6));
  }
  @keyframes rise {
    0% {
      translate: 0 0;
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    85% {
      opacity: 1;
    }
    100% {
      translate: 0 -112vh;
      opacity: 0;
    }
  }
  @keyframes sway {
    from {
      transform: translateX(calc(var(--sway) * -0.5));
    }
    to {
      transform: translateX(calc(var(--sway) * 0.5));
    }
  }

  /* ------------------------------------------------ matrix */
  .egg.matrix {
    background: rgba(0, 8, 0, 0.82);
  }
  .column {
    position: absolute;
    top: 0;
    writing-mode: vertical-rl;
    text-orientation: upright;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 1.5rem;
    letter-spacing: 0.2em;
    color: #3dff6e;
    text-shadow: 0 0 8px #3dff6e;
    -webkit-mask-image: linear-gradient(transparent, black 70%, white);
    mask-image: linear-gradient(transparent, black 70%, white);
    animation: code-fall var(--d) linear var(--delay) infinite;
  }
  @keyframes code-fall {
    from {
      transform: translateY(-100%);
    }
    to {
      transform: translateY(110vh);
    }
  }

  /* ------------------------------------------------ spooky */
  .egg.spooky {
    background: radial-gradient(ellipse at center, transparent 18%, rgba(0, 0, 0, 0.88) 70%);
    animation: flicker 3.2s steps(1) infinite;
  }
  @keyframes flicker {
    0%,
    100% {
      opacity: 1;
    }
    42% {
      opacity: 0.75;
    }
    44% {
      opacity: 1;
    }
    71% {
      opacity: 0.6;
    }
    72% {
      opacity: 1;
    }
  }

  /* ------------------------------------------------ fireworks */
  .burst {
    position: absolute;
    width: 0;
    height: 0;
  }
  .spark {
    position: absolute;
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 10px var(--c);
    opacity: 0;
    animation: spark 2.6s cubic-bezier(0.1, 0.7, 0.3, 1) var(--delay) infinite;
  }
  @keyframes spark {
    0% {
      transform: rotate(var(--a)) translateX(0) scale(1.4);
      opacity: 1;
    }
    55% {
      opacity: 1;
    }
    100% {
      transform: rotate(var(--a)) translateX(24vmin) translateY(5vmin) scale(0.3);
      opacity: 0;
    }
  }

  /* ------------------------------------------------ disco */
  .spot {
    position: absolute;
    width: 34vmin;
    height: 34vmin;
    margin: -17vmin 0 0 -17vmin;
    border-radius: 50%;
    background: radial-gradient(circle, var(--c), transparent 65%);
    mix-blend-mode: screen;
    opacity: 0.55;
    animation: spot-move var(--d) ease-in-out infinite alternate;
  }
  @keyframes spot-move {
    to {
      transform: translate(var(--dx), var(--dy));
    }
  }

  /* ------------------------------------------------ embers */
  .glow {
    position: absolute;
    inset: auto 0 0 0;
    height: 45vh;
    background:
      radial-gradient(ellipse 60% 100% at 30% 100%, rgba(255, 90, 0, 0.45), transparent 70%),
      radial-gradient(ellipse 60% 100% at 75% 100%, rgba(255, 50, 0, 0.4), transparent 70%),
      linear-gradient(to top, rgba(255, 70, 0, 0.3), transparent);
    transform-origin: 50% 100%;
    animation: glow 1.3s ease-in-out infinite alternate;
  }
  @keyframes glow {
    from {
      opacity: 0.7;
      transform: scaleY(0.92);
    }
    to {
      opacity: 1;
      transform: scaleY(1.08);
    }
  }
  .ember {
    position: absolute;
    bottom: -2vh;
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    background: var(--c);
    box-shadow:
      0 0 6px var(--c),
      0 0 14px #ff4d00;
    animation:
      ember-rise var(--d) ease-out var(--delay) infinite,
      sway 1.6s ease-in-out var(--delay) infinite alternate;
  }
  @keyframes ember-rise {
    0% {
      translate: 0 0;
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    70% {
      opacity: 0.9;
    }
    100% {
      translate: 0 calc(var(--rise) * -1);
      opacity: 0;
      scale: 0.3;
    }
  }

  /* ------------------------------------------------ stars */
  .egg.stars {
    background: radial-gradient(ellipse at center, rgba(20, 10, 60, 0.6), rgba(0, 0, 10, 0.9));
  }
  .star {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 6px #cfe0ff;
    animation: warp var(--d) ease-in var(--delay) infinite;
  }
  @keyframes warp {
    from {
      transform: rotate(var(--a)) translateX(2vmin) scale(0.3);
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    to {
      transform: rotate(var(--a)) translateX(80vmax) scale(2.2);
      opacity: 1;
    }
  }
</style>
