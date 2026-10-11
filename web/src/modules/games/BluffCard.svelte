<script lang="ts">
  import { Check, HandCoins, Handshake, VenetianMask } from '@lucide/svelte';
  import { scale } from 'svelte/transition';
  import type { BluffView } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Coin from '$lib/ui/Coin.svelte';
  import { Now, gameMatch } from './store.svelte.ts';

  /**
   * Bluff is played on the two phones: the TV keeps its screen and shows this small card at the top.
   * Each player has a face-down card that lights up once they have chosen; at the end both turn over.
   * The amounts stay on the phones: the TV only shows the pot, then what each winner takes (coins
   * burst out of their face and the amount pops in under their name).
   */
  const m = $derived(gameMatch('bluff'));
  const v = $derived(m?.phase === 'play' || m?.phase === 'result' ? (m.view as BluffView | null) : null);
  const now = new Now(250);
  const economy = $derived(!!hb.core?.economyEnabled);
  const left = $derived(m?.phase === 'play' && m.endsAt && m.phaseMs ? Math.max(0, Math.min(1, (m.endsAt - now.value) / m.phaseMs)) : 0);
  /** Coins flying out of a winner's face: angle (deg), distance (rem), when (s) */
  const BURST = Array.from({ length: 7 }, (_, i) => ({ a: -160 + i * 23 + Math.random() * 10, d: 2.4 + Math.random() * 1.2, at: Math.random() * 0.25 }));
  /** The reveal: both cards have turned over (the second one 0.5 s after the first) */
  const PAY_DELAY = 1.4;
  const status = $derived.by(() => {
    if (!m) return '';
    if (m.phase === 'intro') return 'Reading the rules';
    if (m.phase === 'result') return m.result?.headline ?? 'Over';
    const chosen = v?.chosen ?? [];
    if (chosen.length >= m.players.length) return 'Both have chosen...';
    if (chosen.length === 1) return `${m.players.find((p) => p.id === chosen[0])?.name} has chosen`;
    return 'Share or steal?';
  });
</script>

{#if m}
  <div class="card bluff" in:scale={{ start: 0.95 }}>
    <div class="title">
      <span class="icon"><VenetianMask size="1.1rem" /></span>
      <span class="what">
        <span class="eyebrow">Bluff{#if economy && (m.bluff?.steal ?? m.pot) > 0}<span>{' · pot '}</span><Money amount={m.bluff?.steal ?? m.pot} />{/if}</span>
        {#key status}<strong class="truncate" in:scale={{ start: 0.9, duration: 250 }}>{status}</strong>{/key}
      </span>
    </div>
    <div class="duo">
      {#each m.players as p, i (p.id)}
        {@const choice = v?.choices?.[p.id]}
        {@const chosen = !!v?.chosen.includes(p.id)}
        {@const ready = m.phase === 'intro' && m.ready.includes(p.id)}
        {@const won = economy && choice ? (m.result?.payouts[p.id] ?? 0) : 0}
        <span class="player" class:won={won > 0} style:order={i * 2} style:--pay="{PAY_DELAY}s">
          <span class="face">
            <Avatar name={p.name} color={p.color} id={p.id} size="2rem" />
            {#if ready}<span class="badge"><Check size="0.7rem" strokeWidth={3} /></span>{/if}
            {#if won > 0}
              <span class="burst" aria-hidden="true">
                {#each BURST as c, k (k)}<span class="spark" style:--a="{c.a}deg" style:--d="{c.d}rem" style:--at="{c.at}s"><Coin size="1.1rem" /></span>{/each}
              </span>
            {/if}
          </span>
          <span class="who">
            <span class="name truncate">{p.name}</span>
            {#if won > 0}<span class="gain mono"><Money amount={won} sign /></span>{/if}
          </span>
          <span class="flip" class:open={!!choice} style:--delay="{i * 0.5}s">
            <span class="side back" class:chosen class:thinking={m.phase === 'play' && !chosen}>
              {#if chosen}<Check size="0.9rem" strokeWidth={3} />{:else}<span class="dots"><i></i><i></i><i></i></span>{/if}
            </span>
            <span class="side front" class:steal={choice === 'steal'}>
              {#if choice === 'steal'}<HandCoins size="0.9rem" />{:else}<Handshake size="0.9rem" />{/if}
            </span>
          </span>
        </span>
        {#if i === 0}<span class="vs" style:order="1">VS</span>{/if}
      {/each}
    </div>
    {#if left > 0}<span class="bar" style:width="calc((100% - 2rem) * {left})"></span>{/if}
  </div>
{/if}

<style>
  .bluff {
    position: relative;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem;
    padding: 0.45rem 1rem;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    flex: none;
    border-radius: 0.6rem;
    background: linear-gradient(135deg, #ff3b8d, #8b3dff);
    color: #fff;
  }
  .what {
    display: grid;
    min-width: 0;
  }
  .what .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.65rem;
  }
  .what strong {
    font-size: 1rem;
  }
  .duo {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
  }
  .player {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
  }
  .face {
    position: relative;
    flex: none;
    display: grid;
    border-radius: 50%;
  }
  .badge {
    position: absolute;
    right: -0.3rem;
    bottom: -0.3rem;
    display: grid;
    place-items: center;
    width: 1.05rem;
    height: 1.05rem;
    border-radius: 50%;
    background: var(--success);
    color: #fff;
    box-shadow: 0 0 0 0.15rem var(--surface);
  }
  .who {
    display: grid;
    min-width: 0;
    line-height: 1.15;
  }
  .gain {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--success);
    animation: pop-in 0.5s cubic-bezier(0.3, 1.8, 0.5, 1) var(--pay) both;
  }
  .won .face {
    animation: ring 1.2s ease var(--pay) both;
  }
  .burst {
    position: absolute;
    inset: 50% auto auto 50%;
  }
  .spark {
    position: absolute;
    left: -0.55rem;
    top: -0.55rem;
    display: grid;
    opacity: 0;
    animation: spark 1.1s cubic-bezier(0.2, 0.7, 0.4, 1) calc(var(--pay) + var(--at)) both;
  }
  @keyframes spark {
    0% {
      opacity: 1;
      transform: rotate(var(--a)) translateX(0) rotate(calc(var(--a) * -1)) scale(0.4);
    }
    60% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: rotate(var(--a)) translateX(var(--d)) rotate(calc(var(--a) * -1)) scale(1);
    }
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(0.4rem) scale(0.5);
    }
  }
  @keyframes ring {
    0% {
      box-shadow: 0 0 0 0 var(--coin);
    }
    30% {
      box-shadow: 0 0 0 0.35rem color-mix(in srgb, var(--coin) 40%, transparent);
    }
    100% {
      box-shadow: 0 0 0 0.15rem var(--coin);
    }
  }
  .name {
    max-width: 7rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .vs {
    font-family: var(--font-display);
    font-weight: 700;
    font-style: italic;
    color: var(--text-faint);
  }

  /* A small playing card: face down until the reveal, then it turns over */
  .flip {
    position: relative;
    flex: none;
    width: 1.6rem;
    height: 2.1rem;
    transform: perspective(10rem) rotateY(0deg);
    transform-style: preserve-3d;
    transition: transform 0.7s cubic-bezier(0.3, 1.4, 0.5, 1) var(--delay);
  }
  .flip.open {
    transform: perspective(10rem) rotateY(180deg);
  }
  .side {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 0.35rem;
    backface-visibility: hidden;
  }
  /* Same family as the cards on the phones: the deck's purple back, green Share, red Steal */
  .back {
    background:
      repeating-linear-gradient(45deg, rgba(255, 59, 141, 0.16) 0 1px, transparent 1px 0.22rem),
      repeating-linear-gradient(-45deg, rgba(139, 61, 255, 0.2) 0 1px, transparent 1px 0.22rem),
      linear-gradient(160deg, #3a1660, #170a26);
    border: 1.5px solid rgba(255, 59, 141, 0.45);
    color: var(--text-faint);
    transition:
      border-color 0.3s ease,
      color 0.3s ease,
      box-shadow 0.3s ease;
  }
  .back.chosen {
    border-color: #ff3b8d;
    color: #ff3b8d;
    box-shadow: 0 0 0.8rem -0.2rem #ff3b8d;
    animation: settle 0.4s ease-out;
  }
  .front {
    transform: rotateY(180deg);
    background: linear-gradient(160deg, #3be0a0, #0f8f63);
    color: #fff;
  }
  .front.steal {
    background: linear-gradient(160deg, #ff6a86, #c3123f);
  }
  .dots {
    display: flex;
    gap: 0.12rem;
  }
  .dots i {
    width: 0.2rem;
    height: 0.2rem;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.3;
  }
  .thinking .dots i {
    animation: blink 1.2s ease-in-out infinite;
  }
  .thinking .dots i:nth-child(2) {
    animation-delay: 0.2s;
  }
  .thinking .dots i:nth-child(3) {
    animation-delay: 0.4s;
  }
  /* Inside the rounded corners: the card does not clip, so the winner's coins can fly out of it */
  .bar {
    position: absolute;
    left: 1rem;
    bottom: 0;
    border-radius: 999px;
    height: 0.18rem;
    background: linear-gradient(90deg, #ff3b8d, #8b3dff);
    transition: width 0.25s linear;
  }
  @keyframes blink {
    50% {
      opacity: 1;
    }
  }
  @keyframes settle {
    from {
      transform: translateY(-0.3rem) scale(1.15);
    }
  }
</style>
