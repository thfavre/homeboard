<script lang="ts">
  import { Crown, Star } from '@lucide/svelte';

  /** A coin spinning in the air until `outcome` is known, then landing on that face */
  let { outcome, size = '12rem' }: { outcome: 'heads' | 'tails' | null; size?: string } = $props();
</script>

<div class="coin" style:--s={size}>
  <div class="body" class:spin={!outcome} class:heads={outcome === 'heads'} class:tails={outcome === 'tails'}>
    <div class="face front"><Crown size="45%" /><span>Heads</span></div>
    <div class="face back"><Star size="45%" /><span>Tails</span></div>
  </div>
</div>

<style>
  .coin {
    width: var(--s);
    height: var(--s);
    perspective: 60rem;
  }
  .body {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
  }
  .spin {
    animation: spin 0.45s linear infinite;
  }
  .heads {
    animation: land-heads 1s cubic-bezier(0.2, 0.8, 0.3, 1.2) both;
  }
  .tails {
    animation: land-tails 1s cubic-bezier(0.2, 0.8, 0.3, 1.2) both;
  }
  .face {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.2em;
    border-radius: 50%;
    backface-visibility: hidden;
    background: radial-gradient(circle at 35% 30%, #fff3c4, var(--coin) 45%, var(--coin-2));
    box-shadow:
      inset 0 0 0 calc(var(--s) * 0.05) color-mix(in srgb, var(--coin-2) 80%, #000),
      0 calc(var(--s) * 0.1) calc(var(--s) * 0.25) -0.1rem rgba(0, 0, 0, 0.5);
    color: #6b3d00;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: calc(var(--s) * 0.12);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .back {
    transform: rotateY(180deg);
  }
  @keyframes spin {
    from {
      transform: rotateY(0) translateY(0);
    }
    to {
      transform: rotateY(360deg);
    }
  }
  @keyframes land-heads {
    from {
      transform: rotateY(-1080deg) scale(1.15);
    }
    to {
      transform: rotateY(0) scale(1);
    }
  }
  @keyframes land-tails {
    from {
      transform: rotateY(-900deg) scale(1.15);
    }
    to {
      transform: rotateY(180deg) scale(1);
    }
  }
</style>
