<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { Crown } from '@lucide/svelte';
  import type { CoinView, MatchState } from '$shared/games.ts';
  import { hb, serverNow } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Coin from '$lib/ui/Coin.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { gameMatch } from '../store.svelte.ts';
  import Coin3D from '../ui/Coin3D.svelte';

  /**
   * The only part of Coin Flip on the TV: the coin flies in from the bottom, thrown from the phone,
   * tumbling end over end, wobbling a little, never quite the same way twice. When the server tells
   * where it landed, it bounces and settles on that face, and the pot flies to the winner.
   */
  const live = $derived(gameMatch('coin'));
  // Kept from the moment the coin is thrown: the show goes on while the match closes
  const m: MatchState = untrack(() => live!);
  const v = $derived(live?.id === m.id && live.game === 'coin' ? (live.view as CoinView) : (m.view as CoinView));
  const heads = m.players.find((p) => p.id === (m.view as CoinView).heads) ?? m.players[0];
  const tails = m.players.find((p) => p.id !== heads.id) ?? m.players[1];
  const pot = m.pot;
  const economy = $derived(!!hb.core?.economyEnabled);

  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  const easeOut = (u: number) => 1 - (1 - u) ** 3;
  const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

  // This throw, from the swipe's strength and a bit of chance
  const power = (m.view as CoinView).power ?? 0.5;
  const T = (m.view as CoinView).flipMs ?? 2600;
  /** Degrees a millisecond around its axis: harder swipes spin faster */
  const w = ((rnd(5, 7) + power * 5) * 360) / T;
  const throwX = rnd(-0.32, 0.32);
  const landX = rnd(-0.03, 0.03);
  /** Heights as a share of the stage: from below the screen, up to the peak, down to the landing */
  const below = 0.75;
  const peak = 0.18 + power * 0.14 + rnd(0, 0.04);
  // Free fall through those three points in T: gravity and launch speed, in stage heights and ms
  const g = (2 * (Math.sqrt(below + peak) + Math.sqrt(peak)) ** 2) / T ** 2;
  const v0 = Math.sqrt(2 * g * (below + peak));
  const tiltFrom = rnd(-38, 38);
  const tiltTo = rnd(-10, 10);
  const wobble = rnd(12, 28);
  const wobbleTurns = rnd(1.2, 2.6);
  const wobblePhase = rnd(0, Math.PI * 2);
  /** The landing: two bounces, then the coin rocks on its edge before it lies flat */
  const bounce = rnd(0.05, 0.09);
  const rock = rnd(9, 16);

  let stageW = $state(1000);
  let stageH = $state(800);
  let pose = $state({ x: 0, y: 0, k: 0.4, spin: 0, ry: 0, rz: 0 });
  let landedAt = 0;
  let land: { from: number; to: number; ms: number } | null = null;
  let settled = $state(false);
  let gone = $state(false);

  const frame = () => {
    const t = serverNow() - (v.flipAt ?? serverNow());
    if (!land && v.outcome && t >= T - 50) {
      // Lands on the right face, still turning at about its own speed: the more to turn, the longer it takes
      const from = w * Math.max(t, T);
      const face = v.outcome === 'heads' ? 0 : 180;
      const to = Math.ceil((from + w * 450 - face) / 360) * 360 + face;
      land = { from, to, ms: (3 * (to - from)) / w };
      landedAt = Math.max(t, T);
    }
    if (t < T) {
      // In the air
      const u = t / T;
      const h = -below + v0 * t - (g * t * t) / 2;
      pose = {
        x: lerp(throwX, landX, u),
        y: -h,
        k: 0.45 + 0.6 * easeOut(clamp01(t / (T * 0.45))) - 0.05 * clamp01((t - T * 0.45) / (T * 0.55)),
        spin: w * t,
        ry: wobble * Math.sin(Math.PI * 2 * wobbleTurns * u + wobblePhase) * (1 - 0.5 * u),
        rz: lerp(tiltFrom, tiltTo, u),
      };
    } else if (!land) {
      // Landed but the server has not told the face yet: it keeps spinning where it is
      pose = { ...pose, y: Math.sin((t - T) / 120) * 0.006, spin: w * t };
    } else {
      const u = clamp01((t - landedAt) / land.ms);
      const hop = bounce * Math.abs(Math.sin(Math.PI * 2 * u)) * (1 - u) ** 2;
      const endRy = wobble * Math.sin(Math.PI * 2 * wobbleTurns + wobblePhase) * 0.5;
      pose = {
        x: landX,
        y: -hop,
        k: 1,
        spin: lerp(land.from, land.to, easeOut(u)),
        ry: lerp(endRy, 0, easeOut(u)) + rock * Math.sin(u * Math.PI * 6) * (1 - u) ** 2,
        rz: lerp(tiltTo, 0, easeOut(u)),
      };
      if (u >= 1 && !settled) {
        settled = true;
        setTimeout(() => (gone = true), 4600);
      }
    }
  };

  $effect(() => {
    let raf = 0;
    const loop = () => {
      frame();
      if (!settled) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  const winner = $derived(settled && v.outcome ? (v.outcome === 'heads' ? heads : tails) : null);
  const winnerLeft = $derived(winner?.id === heads.id);
  /** The pot, coin by coin, from the coin to the winner */
  const drops = Array.from({ length: 14 }, (_, i) => ({ delay: 0.5 + i * 0.07, lift: rnd(5, 11), size: rnd(1.8, 2.8), spin: rnd(-540, 540) }));
</script>

{#if !gone}
  <div class="scrim" transition:fade={{ duration: 500 }}></div>
  <div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH} transition:fade={{ duration: 500 }}>
    <div class="row">
      {#each [heads, tails] as p, i (p.id)}
        <div class="player" class:left={i === 0} class:won={winner?.id === p.id} class:lost={winner && winner.id !== p.id} in:scale={{ start: 0.6, delay: 150 + i * 120, duration: 400 }}>
          <span class="face">
            <Avatar name={p.name} color={p.color} id={p.id} size="6.5rem" />
            {#if winner?.id === p.id}<span class="crown" in:scale={{ start: 0.2, duration: 500 }}><Crown size="1.6rem" /></span>{/if}
          </span>
          <strong class="truncate">{p.name}</strong>
          {#if winner?.id === p.id && economy && pot > 0}
            <span class="gain" in:scale={{ start: 0.4, delay: 1300, duration: 400 }}><Money amount={pot} sign /></span>
          {/if}
        </div>
      {/each}
    </div>

    <div class="flyer" style:transform="translate({pose.x * stageW}px, {pose.y * stageH}px) scale({pose.k})">
      {#if settled}<span class="burst"></span>{/if}
      <div class:landed={settled}>
        <Coin3D {heads} {tails} size="15rem" transform="rotateZ({pose.rz}deg) rotateY({pose.ry}deg) rotateX({-pose.spin}deg)" />
      </div>
    </div>

    {#if winner}
      <h1 class="headline" in:scale={{ start: 0.6, duration: 450 }}>{winner.name} wins!</h1>
      {#if economy && pot > 0}
        {#each drops as d}
          <span class="drop-x" style:--dx={winnerLeft ? '-21rem' : '21rem'} style:animation-delay="{d.delay}s">
            <span class="drop-y" style:--lift="-{d.lift}rem" style:--spin="{d.spin}deg" style:animation-delay="{d.delay}s"><Coin size="{d.size}rem" /></span>
          </span>
        {/each}
      {/if}
    {/if}
  </div>
{/if}

<style>
  /* Only the main area: the sidebar (music, leaderboard, join code) stays as it is */
  .scrim,
  .stage {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: calc(var(--tv-pad-x, 2rem) + var(--tv-side, 27rem) + var(--tv-gap, 1.2rem) / 2);
  }
  /* Above the bouncing stickers, under the light and sound notices */
  .scrim {
    z-index: 41;
    background: radial-gradient(ellipse at 50% 55%, color-mix(in srgb, var(--bg) 85%, transparent), color-mix(in srgb, var(--bg) 35%, transparent) 75%);
    mask-image: linear-gradient(90deg, #000 calc(100% - 1.5rem), transparent);
  }
  .stage {
    z-index: 42;
    display: grid;
    place-items: center;
    pointer-events: none;
    overflow: hidden;
  }
  .stage > * {
    grid-area: 1 / 1;
  }
  .row {
    width: 54rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .player {
    width: 12rem;
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    font-size: 1.6rem;
    transition:
      opacity 0.6s ease,
      transform 0.6s ease,
      filter 0.6s ease;
  }
  .player.won {
    transform: scale(1.15);
  }
  .player.lost {
    opacity: 0.35;
    filter: grayscale(0.7);
  }
  .face {
    position: relative;
    display: grid;
    border-radius: 50%;
    transition: box-shadow 0.6s ease;
  }
  .won .face {
    box-shadow:
      0 0 0 0.35rem var(--coin),
      0 0 3.5rem 0.4rem color-mix(in srgb, var(--coin) 55%, transparent);
    animation: catch 0.25s ease 1.3s 4 alternate;
  }
  .crown {
    position: absolute;
    top: -1.7rem;
    left: 50%;
    translate: -50% 0;
    color: var(--coin);
    filter: drop-shadow(0 0 0.6rem var(--coin));
  }
  .gain {
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--success);
  }
  .flyer {
    position: relative;
    display: grid;
    place-items: center;
    will-change: transform;
  }
  .landed {
    animation: thud 0.5s ease;
    filter: drop-shadow(0 1.2rem 2rem rgba(0, 0, 0, 0.45));
  }
  .burst {
    position: absolute;
    width: 15rem;
    height: 15rem;
    border-radius: 50%;
    border: 0.4rem solid var(--coin);
    animation: burst 0.9s ease-out both;
  }
  .headline {
    align-self: end;
    margin-bottom: 12%;
    font-size: 4.2rem;
    letter-spacing: -0.03em;
  }
  /* A coin of the pot: across to the winner (x), up then down into their face (y) */
  .drop-x {
    display: grid;
    opacity: 0;
    animation: drop-x 0.85s linear both;
  }
  .drop-y {
    display: grid;
    animation: drop-y 0.85s linear both;
  }
  @keyframes drop-x {
    0% {
      opacity: 0;
      transform: translateX(0);
    }
    10% {
      opacity: 1;
    }
    90% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateX(var(--dx));
    }
  }
  @keyframes drop-y {
    0% {
      transform: translateY(0) rotate(0) scale(0.6);
      animation-timing-function: cubic-bezier(0.3, 0.6, 0.6, 1);
    }
    45% {
      transform: translateY(var(--lift)) rotate(calc(var(--spin) / 2)) scale(1.1);
      animation-timing-function: cubic-bezier(0.5, 0, 0.8, 0.5);
    }
    100% {
      transform: translateY(0) rotate(var(--spin)) scale(0.7);
    }
  }
  @keyframes thud {
    30% {
      transform: scale(1.08);
    }
  }
  @keyframes burst {
    from {
      opacity: 0.9;
      transform: scale(0.9);
    }
    to {
      opacity: 0;
      transform: scale(1.9);
    }
  }
  @keyframes catch {
    to {
      transform: scale(1.08);
    }
  }
</style>
