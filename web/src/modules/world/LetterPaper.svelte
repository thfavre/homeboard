<script lang="ts">
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { Coins, X } from '@lucide/svelte';
  import { hb } from '$lib/client.svelte.ts';
  import { SEALS, type Letter } from '$shared/worldActions.ts';
  import type { WorldState } from '$shared/world.ts';
  import WaxSeal from './WaxSeal.svelte';
  import { HAND, paperStyle } from './papers.ts';

  /**
   * A letter on the phone, as paper. A new one comes sealed in its envelope: a tap breaks the wax,
   * the flap opens and the letter slides out and unfolds. One read before opens straight on the page.
   */
  let { letter, onclose }: { letter: Letter; onclose: () => void } = $props();

  const currency = $derived((hb.modules.world as WorldState | undefined)?.shop?.currencyName ?? '');
  const seal = $derived(SEALS.find((s) => s.id === letter.seal)?.color ?? SEALS[0].color);
  const initial = $derived(letter.fromName.trim().charAt(0).toUpperCase() || '?');

  /** sealed: the envelope, waiting for a tap; open: flap up, the letter sliding out; read: the page */
  let stage = $state<'sealed' | 'open' | 'read'>(untrack(() => letter.readAt) === null ? 'sealed' : 'read');

  function breakSeal() {
    if (stage !== 'sealed') return;
    stage = 'open';
    setTimeout(() => (stage = 'read'), 1250);
  }

  /** A torn-paper edge, the same for the same letter: small jags all around */
  const edge = $derived.by(() => {
    let h = 2166136261;
    for (const c of letter.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const r = () => ((h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0) % 1000) / 1000;
    const pts: string[] = [];
    const side = (from: [number, number], to: [number, number], inward: [number, number]) => {
      for (let i = 0; i < 24; i++) {
        const f = i / 24;
        const j = r() * 0.9;
        pts.push(`${(from[0] + (to[0] - from[0]) * f + inward[0] * j).toFixed(2)}% ${(from[1] + (to[1] - from[1]) * f + inward[1] * j).toFixed(2)}%`);
      }
    };
    side([0, 0], [100, 0], [0, 1]);
    side([100, 0], [100, 100], [-1, 0]);
    side([100, 100], [0, 100], [0, -1]);
    side([0, 100], [0, 0], [1, 0]);
    return `polygon(${pts.join(',')})`;
  });

  const when = $derived(new Date(letter.deliveredAt ?? letter.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="overlay" style:--hand={HAND} transition:fade={{ duration: 200 }} role="dialog" aria-modal="true" aria-label="Letter from {letter.fromName}">
  <button type="button" class="close" onclick={onclose} aria-label="Close"><X size={22} /></button>

  {#if stage !== 'read'}
    <div class="scene">
      <button type="button" class="envelope" style={paperStyle(letter.paper)} class:open={stage === 'open'} onclick={breakSeal} aria-label="Open the letter">
        <span class="back"></span>
        <span class="sheet"></span>
        <span class="pocket"></span>
        <span class="flap"></span>
        <span class="address">
          <span class="to">For {letter.toName}</span>
          <span class="from">from {letter.fromName}</span>
        </span>
        <span class="stamp" aria-hidden="true">
          <svg viewBox="0 0 40 48" width="40" height="48">
            <rect x="1" y="1" width="38" height="46" rx="2" fill="#f7efe0" stroke="#c9b48c" stroke-width="2" stroke-dasharray="3 2" />
            <rect x="6" y="6" width="28" height="36" fill="#e9d29a" />
            <circle cx="27" cy="15" r="4" fill="#f3b443" />
            <path d="M6 42 L15 26 L21 34 L26 28 L34 42 Z" fill="#6a8f5a" />
            <path d="M6 42 L15 30 L20 36 L6 42Z" fill="#4c6e43" />
          </svg>
        </span>
        <span class="seal" class:broken={stage === 'open'}><WaxSeal color={seal} letter={initial} size={64} /></span>
      </button>
      <p class="hint" class:gone={stage === 'open'}>Tap the seal to open</p>
    </div>
  {:else}
    <div class="read" in:fade={{ duration: 250 }}>
      <article class="page" style={paperStyle(letter.paper)} style:clip-path={edge}>
        <div class="corner"><WaxSeal color={seal} letter={initial} size={44} /></div>
        <p class="greeting">Dear {letter.toName},</p>
        <p class="body">{letter.text}</p>
        <p class="sign">
          <span class="name" style:--who={letter.fromColor}>{letter.fromName}</span>
        </p>
        {#if letter.coins}
          <div class="enclosed">
            <Coins size={18} />
            <span>Enclosed: <strong>{letter.coins} {currency}</strong></span>
          </div>
        {/if}
        <p class="date">Brought by the town courier at {when}</p>
      </article>
      <button type="button" class="btn block done" onclick={onclose}>Fold it away</button>
    </div>
  {/if}
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 1600;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    background: radial-gradient(120% 80% at 50% 30%, rgba(30, 24, 18, 0.82), rgba(5, 5, 10, 0.94));
    backdrop-filter: blur(6px);
    overflow-y: auto;
  }
  .close {
    position: fixed;
    top: calc(0.8rem + env(safe-area-inset-top));
    right: 0.8rem;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.35);
    color: #fff;
  }

  /* ---------------------------------------------------------- the envelope */

  .scene {
    display: grid;
    justify-items: center;
    gap: 1.4rem;
    perspective: 900px;
  }
  .envelope {
    --w: min(21rem, 84vw);
    position: relative;
    width: var(--w);
    height: calc(var(--w) * 0.64);
    padding: 0;
    border: 0;
    background: none;
    animation: arrive 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  @keyframes arrive {
    from {
      transform: translateY(40px) rotate(-6deg) scale(0.9);
      opacity: 0;
    }
  }
  .back,
  .pocket,
  .flap {
    position: absolute;
    inset: 0;
    background: var(--env);
  }
  .back {
    border-radius: 6px;
    box-shadow: 0 24px 50px -18px rgba(0, 0, 0, 0.8);
  }
  /* The front pocket: the two side folds and the bottom one meeting in the middle */
  .pocket {
    z-index: 3;
    border-radius: 0 0 6px 6px;
    background: linear-gradient(170deg, var(--env-2), var(--env) 60%, var(--env-shade));
    clip-path: polygon(0 0, 50% 58%, 100% 0, 100% 100%, 0 100%);
  }
  .flap {
    z-index: 4;
    height: 55%;
    background: linear-gradient(var(--env-2), var(--env-shade));
    clip-path: polygon(0 0, 100% 0, 50% 100%);
    transform-origin: top center;
    transition:
      transform 0.55s cubic-bezier(0.5, 0, 0.3, 1),
      z-index 0s 0.27s;
  }
  .envelope.open .flap {
    transform: rotateX(180deg);
    z-index: 1;
  }
  /* The letter inside, sliding up out of the envelope once the flap is open */
  .sheet {
    position: absolute;
    z-index: 2;
    left: 7%;
    right: 7%;
    top: 8%;
    height: 84%;
    border-radius: 3px;
    background: var(--paper);
    transition: transform 0.6s cubic-bezier(0.3, 0.7, 0.3, 1) 0.5s;
  }
  .envelope.open .sheet {
    transform: translateY(-62%);
  }
  /* Under the seal, in the middle (the stamp in the corner) */
  .address {
    position: absolute;
    z-index: 5;
    left: 22%;
    right: 22%;
    bottom: 6%;
    display: grid;
    text-align: center;
    color: var(--ink);
    font-family: var(--hand);
    transition: opacity 0.3s;
  }
  .address span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .envelope.open .address,
  .envelope.open .stamp {
    opacity: 0;
  }
  .to {
    font-size: 1.2rem;
    line-height: 1.15;
  }
  .from {
    font-size: 0.85rem;
    opacity: 0.75;
  }
  .stamp {
    position: absolute;
    z-index: 5;
    right: 6%;
    bottom: 10%;
    transform: rotate(4deg);
    transition: opacity 0.3s;
  }
  .seal {
    position: absolute;
    z-index: 6;
    left: 50%;
    top: 52%;
    translate: -50% -50%;
    transition:
      transform 0.45s cubic-bezier(0.4, 0, 0.6, 1),
      opacity 0.45s;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.45));
    animation: pulse 2.2s ease-in-out infinite 0.8s;
  }
  .seal.broken {
    animation: none;
    transform: translateY(30px) rotate(25deg) scale(0.6);
    opacity: 0;
  }
  @keyframes pulse {
    50% {
      transform: scale(1.07);
    }
  }
  .hint {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.95rem;
    letter-spacing: 0.02em;
    transition: opacity 0.3s;
  }
  .hint.gone {
    opacity: 0;
  }

  /* ---------------------------------------------------------- the page */

  .read {
    width: min(26rem, 100%);
    display: grid;
    gap: 1rem;
    margin: auto 0;
  }
  .page {
    position: relative;
    padding: 2.2rem 1.6rem 1.6rem;
    min-height: 22rem;
    color: var(--ink);
    background:
      /* Two folds across the page, where it was folded in three */
      linear-gradient(transparent 32.9%, rgba(0, 0, 0, 0.07) 33.2%, rgba(255, 255, 255, 0.18) 33.6%, transparent 34.2%),
      linear-gradient(transparent 65.9%, rgba(0, 0, 0, 0.07) 66.2%, rgba(255, 255, 255, 0.18) 66.6%, transparent 67.2%),
      var(--lines, none),
      radial-gradient(130% 100% at 50% 40%, transparent 55%, var(--edge) 100%),
      var(--paper);
    font-family: var(--hand);
    animation: unfold 0.6s cubic-bezier(0.2, 0.8, 0.3, 1);
    transform-origin: top center;
  }
  @keyframes unfold {
    from {
      transform: perspective(700px) rotateX(-55deg) scaleY(0.6);
      opacity: 0;
    }
  }
  .corner {
    position: absolute;
    top: 0.9rem;
    right: 1rem;
    transform: rotate(-8deg);
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));
  }
  .greeting {
    font-size: 1.45rem;
    margin-bottom: 0.9rem;
  }
  .body {
    font-size: 1.3rem;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .sign {
    display: grid;
    justify-items: end;
    margin-top: 1.5rem;
    font-size: 1.2rem;
  }
  .name {
    font-size: 1.6rem;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--who) 70%, transparent);
    text-decoration-thickness: 2px;
    text-underline-offset: 5px;
  }
  .enclosed {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: fit-content;
    margin-top: 1.4rem;
    padding: 0.45rem 0.8rem;
    border: 1.5px dashed color-mix(in srgb, var(--ink) 45%, transparent);
    border-radius: 6px;
    font-family: var(--font-body);
    font-size: 0.95rem;
    transform: rotate(-1.5deg);
  }
  .date {
    margin-top: 1.4rem;
    font-family: var(--font-body);
    font-size: 0.78rem;
    opacity: 0.55;
  }
  .done {
    justify-content: center;
  }

</style>
