<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import type { WelcomeBack } from '$shared/protocol.ts';
  import { formatAmount } from '$shared/money.ts';
  import { hb, onEvent } from '$lib/client.svelte.ts';
  import Coin from '$lib/ui/Coin.svelte';

  /** Held back while something else fills the screen (a game, the selfie offer...) */
  let { paused = false }: { paused?: boolean } = $props();

  let news = $state<WelcomeBack | null>(null);

  $effect(() =>
    onEvent<WelcomeBack>('core', 'welcomeBack', (msg) => {
      // Two absences before the guest looked: add them up
      news = news ? { awayMs: msg.awayMs, paidMs: news.paidMs + msg.paidMs, amount: news.amount + msg.amount } : msg;
    }),
  );

  function duration(ms: number): string {
    const min = Math.max(1, Math.round(ms / 60_000));
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
    const d = Math.floor(h / 24);
    return `${d} ${d === 1 ? 'day' : 'days'}${h % 24 ? ` ${h % 24} h` : ''}`;
  }

  const capped = $derived(news ? news.awayMs - news.paidMs >= 60_000 : false);
  const close = () => (news = null);
</script>

{#if news && !paused && hb.me && hb.core}
  <div class="wrap" transition:fade={{ duration: 180 }} onclick={(e) => e.target === e.currentTarget && close()} role="presentation">
    <div class="card welcome" in:scale={{ start: 0.85, duration: 380, easing: backOut }} role="dialog" aria-modal="true" aria-labelledby="welcome-title" tabindex="-1">
      <span class="coin-badge"><Coin size="2.6rem" /></span>
      <h2 id="welcome-title">Welcome back, {hb.me.name}</h2>
      <p class="dim">You were away for <strong>{duration(news.awayMs)}</strong>. You earned this while you were gone:</p>
      <p class="amount mono">+{formatAmount(news.amount)} <span>{hb.core.currency.name}</span></p>
      {#if capped}
        <p class="faint small">Being away pays for up to {duration(news.paidMs)}. Keep this page open to keep earning.</p>
      {/if}
      <button class="btn primary block" onclick={close}>Nice</button>
    </div>
  </div>
{/if}

<style>
  .wrap {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
  }
  .welcome {
    width: min(24rem, 100%);
    padding: 1.6rem;
    display: grid;
    gap: 0.7rem;
    text-align: center;
    justify-items: center;
    background: var(--bg);
    background-image: linear-gradient(var(--surface), var(--surface));
  }
  .coin-badge {
    display: grid;
    place-items: center;
    width: 4.4rem;
    height: 4.4rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--coin) 18%, transparent);
    animation: bob 2.4s ease-in-out infinite;
  }
  .welcome p {
    font-size: 0.92rem;
  }
  .amount {
    font-size: 2.2rem !important;
    font-weight: 800;
    line-height: 1.1;
    color: var(--success);
  }
  .amount span {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  .small {
    font-size: 0.8rem !important;
  }
  @keyframes bob {
    50% {
      transform: translateY(-4px) rotate(-6deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .coin-badge {
      animation: none;
    }
  }
</style>
