<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, scale } from 'svelte/transition';
  import type { QuizFx, QuizPlayer, QuizState } from '$shared/quiz.ts';
  import { hb, onEvent, serverNow } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Sparkles from './Sparkles.svelte';

  /**
   * End of the quiz on the TV: podium with everyone's picture. The winner drives
   * their picture with the joystick and spins; 2nd and 3rd have a small effect;
   * everyone else can peek in from the side of the screen.
   */
  let { q }: { q: QuizState } = $props();

  const byId = (id: string) => q.players.find((p) => p.id === id);
  const podium = $derived(q.podium.map(byId).filter(Boolean) as QuizPlayer[]);
  const winner = $derived(podium[0]);

  // ------------------------------------------------------------ winner on the loose
  let stage = $state<HTMLDivElement>();
  let slot = $state<HTMLSpanElement>();
  let pos = $state<{ x: number; y: number } | null>(null);
  let vel = { x: 0, y: 0 };
  let lastMove = 0;
  let spinKey = $state(0);

  onMount(() => {
    // Wait for the podium to land before lifting the winner off it
    const t = setTimeout(() => {
      if (!stage || !slot) return;
      const s = stage.getBoundingClientRect();
      const r = slot.getBoundingClientRect();
      pos = { x: r.left - s.left, y: r.top - s.top };
    }, 1500);

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (pos && stage && Date.now() - lastMove < 400 && (vel.x || vel.y)) {
        const speed = stage.clientHeight * 0.7;
        const size = slot?.offsetWidth ?? 100;
        pos = {
          x: Math.min(stage.clientWidth - size, Math.max(0, pos.x + vel.x * speed * dt)),
          y: Math.min(stage.clientHeight - size, Math.max(0, pos.y + vel.y * speed * dt)),
        };
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const offMove = onEvent<{ id: string; x: number; y: number }>('quiz', 'move', (m) => {
      if (m.id !== winner?.id) return;
      vel = { x: m.x, y: m.y };
      lastMove = Date.now();
    });
    const offFx = onEvent<QuizFx>('quiz', 'fx', onFx);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(frame);
      offMove();
      offFx();
    };
  });

  // ------------------------------------------------------------ effects
  let hopKey = $state(0);
  let wiggleKey = $state(0);
  let peeks = $state<(QuizFx & { key: number; player: QuizPlayer })[]>([]);
  let seq = 0;

  function onFx(fx: QuizFx) {
    if (fx.kind === 'spin') spinKey++;
    else if (fx.kind === 'hop') hopKey++;
    else if (fx.kind === 'wiggle') wiggleKey++;
    else if (fx.kind === 'peek') {
      const player = byId(fx.id);
      if (!player) return;
      const key = ++seq;
      peeks = [...peeks, { ...fx, key, player }];
      setTimeout(() => (peeks = peeks.filter((p) => p.key !== key)), 3200);
    }
  }

  // ------------------------------------------------------------ end bar
  let now = $state(serverNow());
  $effect(() => {
    const t = setInterval(() => (now = serverNow()), 100);
    return () => clearInterval(t);
  });
  const remaining = $derived(q.endsAt ? Math.max(0, q.endsAt - now) : q.pausedLeft);

  // ------------------------------------------------------------ slide of the quiz pictures
  /** Longest an image takes to cross the screen */
  const CROSS_SEC = 10;
  let belt = $state<HTMLDivElement>();
  let strip = $state<HTMLDivElement>();
  let slide = $state<{ from: number; to: number; sec: number; delay: number; gap: number } | null>(null);

  /**
   * The row slides by once, at one steady speed, and the last picture leaves the screen
   * when the end screen closes. Each picture crosses in 10s at most: when there are
   * few of them, they are spread further apart to fill the time (a single one waits).
   */
  onMount(() => {
    const frame = requestAnimationFrame(() => {
      if (!belt || !strip) return;
      const w = belt.clientWidth;
      const row = strip.scrollWidth;
      const left = Math.max(1, (q.endsAt ? q.endsAt - serverNow() : q.pausedLeft || q.phaseMs) / 1000);
      const speed = Math.max(w / CROSS_SEC, (row + w) / left);
      const spare = speed * left - (row + w);
      const gaps = q.images.length - 1;
      const gap = gaps ? spare / gaps : 0;
      const s = row + gap * gaps;
      slide = { from: -s, to: w, sec: (s + w) / speed, delay: gaps ? 0 : spare / speed, gap };
    });
    return () => cancelAnimationFrame(frame);
  });

  /** A small tilt and height change for each picture, alternating sides */
  const tilt = (i: number) => ({ r: `${(i % 2 ? 1 : -1) * (2 + ((i * 37) % 3))}deg`, y: `${(((i * 53) % 5) - 2) * 0.9}rem` });
</script>

<div class="final" bind:this={stage}>
  {#if q.images.length}
    <div class="belt" bind:this={belt} aria-hidden="true">
      <div
        class="strip"
        class:sliding={!!slide}
        bind:this={strip}
        style:--from="{slide?.from ?? 0}px"
        style:--to="{slide?.to ?? 0}px"
        style:gap="calc(5rem + {slide?.gap ?? 0}px)"
        style:animation-duration="{slide?.sec ?? 0}s"
        style:animation-delay="{slide?.delay ?? 0}s"
        style:animation-play-state={q.paused ? 'paused' : 'running'}
      >
        {#each q.images as src, i (src)}
          {@const t = tilt(i)}
          <figure class="pic" style:--r={t.r} style:--y={t.y}><img {src} alt="" /></figure>
        {/each}
      </div>
    </div>
  {/if}

  <h1 class="big">{podium.length ? 'And the winner is' : 'Thanks for playing'}</h1>

  <div class="podium">
    {#each [1, 0, 2] as rank}
      {@const p = podium[rank]}
      {#if p}
        <div class="step s{rank + 1}" in:fly={{ y: 80, delay: (2 - rank) * 400 + 200, duration: 600 }}>
          {#if rank === 0}
            <!-- The winner's picture leaves this spot and flies on top of everything -->
            <span class="slot" bind:this={slot} class:empty={!!pos}>
              {#if !pos}<Avatar name={p.name} color={p.color} id={p.id} size="7rem" />{/if}
            </span>
          {:else if rank === 1}
            <span class="fx-wrap">
              {#key hopKey}
                <span class:hop={hopKey > 0}><Avatar name={p.name} color={p.color} id={p.id} size="5rem" /></span>
                {#if hopKey}<Sparkles count={8} spread={5} size={0.9} />{/if}
              {/key}
            </span>
          {:else}
            <span class="fx-wrap">
              {#key wiggleKey}
                <span class:wiggle={wiggleKey > 0}><Avatar name={p.name} color={p.color} id={p.id} size="4.5rem" /></span>
              {/key}
            </span>
          {/if}
          <strong class="truncate">{p.name}</strong>
          <span class="mono dim">{p.score} pts</span>
          {#if p.reward && hb.core?.economyEnabled}<span class="reward"><Money amount={p.reward} sign /></span>{/if}
          <div class="block"><span class="mono">{rank + 1}</span></div>
        </div>
      {/if}
    {/each}
  </div>

  {#if winner && pos}
    <div class="winner" style:transform="translate({pos.x}px, {pos.y}px)" in:scale={{ duration: 300, start: 0.8 }}>
      {#key spinKey}
        <!-- Rotation and zoom on two layers, so the spin is one smooth turn that slows down -->
        <span class="spinner" class:spin={spinKey > 0}>
          <span class="glow" class:pulse={spinKey > 0}><Avatar name={winner.name} color={winner.color} id={winner.id} size="7rem" /></span>
        </span>
        {#if spinKey}<Sparkles count={20} spread={10} size={1.4} />{/if}
      {/key}
    </div>
  {/if}

  {#each peeks as pk (pk.key)}
    <div class="peek {pk.side}" style:--pos="{(pk.pos ?? 0.5) * 100}%">
      <Avatar name={pk.player.name} color={pk.player.color} id={pk.player.id} size="8rem" />
    </div>
  {/each}

  <!-- Time left on the end screen, without numbers -->
  <div class="endbar"><span style:width="{(remaining / Math.max(1, q.phaseMs)) * 100}%"></span></div>
</div>

<style>
  .final {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr;
    justify-items: center;
    gap: 2rem;
  }
  .big {
    position: relative;
    font-size: 5rem;
    letter-spacing: -0.04em;
  }
  /* Behind the title and podium, across the whole quiz area */
  .belt {
    position: absolute;
    top: 8rem;
    bottom: 0;
    left: -2.5rem;
    right: -2.5rem;
    display: flex;
    /* Just under the title (the padding leaves room for the tilt) */
    align-items: flex-start;
    padding-top: 2.5rem;
    overflow: hidden;
    pointer-events: none;
    mask-image: linear-gradient(90deg, transparent, #000 6rem, #000 calc(100% - 6rem), transparent);
  }
  /* Question 1 last in the row, so it is the first to come in from the left */
  .strip {
    flex: none;
    display: flex;
    flex-direction: row-reverse;
    visibility: hidden;
    will-change: transform;
  }
  .strip.sliding {
    visibility: visible;
    animation: slide linear both;
  }
  @keyframes slide {
    from {
      transform: translateX(var(--from));
    }
    to {
      transform: translateX(var(--to));
    }
  }
  /* Like the photos on the TV: a white frame, a little tilted */
  .pic {
    flex: none;
    margin: 0;
    padding: 0.8rem;
    background: #fbfaf7;
    border-radius: 0.5rem;
    box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.85);
    transform: translateY(var(--y)) rotate(var(--r));
    filter: brightness(0.72);
  }
  .pic img {
    width: 17rem;
    height: 12.5rem;
    object-fit: cover;
    border-radius: 0.25rem;
    background: #111;
  }
  .podium {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: 2rem;
    padding-bottom: 2rem;
  }
  .step {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    width: 17rem;
    font-size: 1.5rem;
  }
  .slot {
    display: block;
    width: 7rem;
    height: 7rem;
  }
  .fx-wrap {
    position: relative;
    display: block;
  }
  .reward {
    font-size: 1.3rem;
    color: var(--success);
  }
  .block {
    width: 100%;
    display: grid;
    place-items: center;
    border-radius: var(--radius) var(--radius) 0 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-bottom: 0;
    font-family: var(--font-display);
    font-size: 4rem;
    font-weight: 700;
    color: var(--text-faint);
  }
  .s1 .block {
    height: 14rem;
    background: var(--gradient);
    color: #fff;
  }
  .s2 .block {
    height: 9.5rem;
  }
  .s3 .block {
    height: 6.5rem;
  }
  .winner {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 5;
    will-change: transform;
  }
  .spinner {
    position: relative;
    display: block;
    border-radius: 50%;
    box-shadow: 0 0 0 0.4rem rgba(255, 217, 61, 0.6), 0 0 3rem rgba(255, 217, 61, 0.5);
  }
  .glow {
    display: block;
    border-radius: 50%;
  }
  /* One continuous spin: very fast at first, slowing down smoothly to a stop */
  .spin {
    animation: beyblade 1.6s cubic-bezier(0.1, 0.75, 0.25, 1);
  }
  @keyframes beyblade {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(2160deg);
    }
  }
  .pulse {
    animation: pulse 1.6s ease-out;
  }
  @keyframes pulse {
    0% {
      transform: scale(1);
    }
    15% {
      transform: scale(1.25);
      filter: drop-shadow(0 0 1.5rem #fff) brightness(1.3);
    }
    70% {
      transform: scale(1.15);
      filter: drop-shadow(0 0 1rem #ffd93d);
    }
    100% {
      transform: scale(1);
    }
  }
  .hop {
    display: block;
    animation: hop 0.8s ease-out;
  }
  @keyframes hop {
    0%,
    100% {
      transform: translateY(0);
    }
    30% {
      transform: translateY(-2.5rem) scale(1.08);
    }
    55% {
      transform: translateY(0);
    }
    75% {
      transform: translateY(-1rem);
    }
  }
  .wiggle {
    display: block;
    animation: wiggle 0.7s ease-in-out;
  }
  @keyframes wiggle {
    0%,
    100% {
      transform: rotate(0);
    }
    20% {
      transform: rotate(-14deg);
    }
    40% {
      transform: rotate(12deg);
    }
    60% {
      transform: rotate(-8deg);
    }
    80% {
      transform: rotate(5deg);
    }
  }
  /* A picture slides in from an edge, looks at the screen, and leaves */
  /* Slides in slowly, stays a moment, slides back out */
  .peek {
    position: fixed;
    z-index: 6;
    animation-duration: 3.2s;
    animation-fill-mode: forwards;
  }
  .peek.left {
    left: 0;
    top: var(--pos);
    animation-name: peek-left;
  }
  .peek.right {
    right: 0;
    top: var(--pos);
    animation-name: peek-right;
  }
  .peek.top {
    top: 0;
    left: var(--pos);
    animation-name: peek-top;
  }
  .peek.bottom {
    bottom: 0;
    left: var(--pos);
    animation-name: peek-bottom;
  }
  @keyframes peek-left {
    0% {
      transform: translate(-110%, -50%) rotate(30deg);
      animation-timing-function: cubic-bezier(0.25, 0.8, 0.35, 1);
    }
    35% {
      transform: translate(-35%, -50%) rotate(30deg);
    }
    65% {
      transform: translate(-35%, -50%) rotate(30deg);
      animation-timing-function: cubic-bezier(0.55, 0, 0.75, 0.2);
    }
    100% {
      transform: translate(-110%, -50%) rotate(30deg);
    }
  }
  @keyframes peek-right {
    0% {
      transform: translate(110%, -50%) rotate(-30deg);
      animation-timing-function: cubic-bezier(0.25, 0.8, 0.35, 1);
    }
    35% {
      transform: translate(35%, -50%) rotate(-30deg);
    }
    65% {
      transform: translate(35%, -50%) rotate(-30deg);
      animation-timing-function: cubic-bezier(0.55, 0, 0.75, 0.2);
    }
    100% {
      transform: translate(110%, -50%) rotate(-30deg);
    }
  }
  @keyframes peek-top {
    0% {
      transform: translate(-50%, -110%) rotate(180deg);
      animation-timing-function: cubic-bezier(0.25, 0.8, 0.35, 1);
    }
    35% {
      transform: translate(-50%, -35%) rotate(180deg);
    }
    65% {
      transform: translate(-50%, -35%) rotate(180deg);
      animation-timing-function: cubic-bezier(0.55, 0, 0.75, 0.2);
    }
    100% {
      transform: translate(-50%, -110%) rotate(180deg);
    }
  }
  @keyframes peek-bottom {
    0% {
      transform: translate(-50%, 110%);
      animation-timing-function: cubic-bezier(0.25, 0.8, 0.35, 1);
    }
    35% {
      transform: translate(-50%, 35%);
    }
    65% {
      transform: translate(-50%, 35%);
      animation-timing-function: cubic-bezier(0.55, 0, 0.75, 0.2);
    }
    100% {
      transform: translate(-50%, 110%);
    }
  }
  .endbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 0.45rem;
    background: var(--surface-2);
  }
  .endbar span {
    display: block;
    height: 100%;
    background: var(--gradient);
    transition: width 0.1s linear;
  }
</style>
