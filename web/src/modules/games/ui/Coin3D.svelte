<script lang="ts">
  import type { GamePlayer } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  /**
   * A gold coin with some thickness, a player's face struck on each side (heads on the front, tails
   * on the back). It flips end over end around its horizontal axis: `transform` turns it (rotateX(180deg)
   * shows tails), `idle` makes it turn slowly on its own to show both faces.
   */
  let {
    heads,
    tails,
    size = '10rem',
    transform,
    idle = false,
  }: { heads: GamePlayer; tails: GamePlayer; size?: string; transform?: string; idle?: boolean } = $props();

  /** Discs stacked between the two faces: seen from the side, they make the edge */
  const SLICES = 14;
  const slices = Array.from({ length: SLICES }, (_, i) => i / (SLICES - 1) - 0.5);
</script>

<div class="coin" style:--s={size}>
  <div class="body" class:idle style:transform>
    {#each slices as z}
      <span class="slice" style:--z={z}></span>
    {/each}
    {#each [heads, tails] as p, i (i)}
      <div class="face" class:back={i === 1}>
        <span class="portrait"><Avatar name={p.name} color={p.color} id={p.id} size="calc(var(--s) * 0.56)" /></span>
        <span class="name">{p.name}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .coin {
    --t: calc(var(--s) * 0.085);
    width: var(--s);
    height: var(--s);
    perspective: calc(var(--s) * 5);
  }
  .body {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
  }
  .idle {
    animation: show 3.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }
  /* The edge: shaded like a cylinder, with fine reeding */
  .slice {
    position: absolute;
    inset: 0.5%;
    border-radius: 50%;
    transform: translateZ(calc(var(--t) * var(--z)));
    background:
      repeating-linear-gradient(90deg, rgba(90, 50, 0, 0.35) 0 1.5px, transparent 1.5px 4px),
      linear-gradient(90deg, #6e4300, #c98d16 18%, #ffe9a3 48%, #d89b1d 70%, #6e4300);
  }
  .face {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: calc(var(--s) * 0.02);
    padding-top: calc(var(--s) * 0.06);
    border-radius: 50%;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    transform: translateZ(calc(var(--t) / 2));
    background: radial-gradient(circle at 32% 26%, #fff7d6 0%, #f8d466 20%, #e0aa26 52%, #b47709 82%, #7c4c00 100%);
    box-shadow:
      inset 0 0 0 calc(var(--s) * 0.018) #ffe8a0,
      inset 0 0 0 calc(var(--s) * 0.042) #a46c08,
      inset 0 0 calc(var(--s) * 0.08) calc(var(--s) * 0.02) rgba(80, 40, 0, 0.45);
    overflow: hidden;
  }
  .back {
    transform: rotateX(180deg) translateZ(calc(var(--t) / 2));
  }
  /* The beaded rim */
  .face::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: repeating-conic-gradient(rgba(255, 244, 196, 0.95) 0 2.2deg, rgba(122, 74, 0, 0.75) 2.2deg 6deg);
    -webkit-mask: radial-gradient(closest-side, transparent 85%, #000 86% 91%, transparent 92%);
    mask: radial-gradient(closest-side, transparent 85%, #000 86% 91%, transparent 92%);
  }
  /* Light catching the metal, over everything */
  .face::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0) 38%, rgba(255, 255, 255, 0) 64%, rgba(255, 255, 255, 0.18) 100%);
    pointer-events: none;
  }
  /* The face, struck in the middle */
  .portrait {
    position: relative;
    display: grid;
    border-radius: 50%;
    box-shadow:
      0 0 0 calc(var(--s) * 0.012) #7c4c00,
      0 0 0 calc(var(--s) * 0.028) #f8d97a,
      0 calc(var(--s) * 0.01) calc(var(--s) * 0.04) calc(var(--s) * 0.02) rgba(80, 40, 0, 0.5);
  }
  /* A face without a selfie: its initials struck in the gold */
  .portrait :global(.avatar) {
    border: none;
    background: radial-gradient(circle at 35% 30%, #fbe39a, #e2b043);
    color: #6b3d00;
    text-shadow: 0 1px 0 rgba(255, 240, 190, 0.8);
  }
  /* A warm gold tint over the picture, so it looks struck in the coin */
  .portrait::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, rgba(255, 236, 170, 0.15), rgba(196, 128, 10, 0.32));
    box-shadow: inset 0 calc(var(--s) * 0.012) calc(var(--s) * 0.03) rgba(60, 30, 0, 0.55);
  }
  .name {
    max-width: calc(var(--s) * 0.6);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: calc(var(--s) * 0.075);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6b3d00;
    text-shadow: 0 1px 0 rgba(255, 240, 190, 0.8);
  }
  @keyframes show {
    0% {
      transform: rotateY(-16deg) rotateX(14deg);
    }
    40%,
    50% {
      transform: rotateY(16deg) rotateX(194deg);
    }
    90%,
    100% {
      transform: rotateY(-16deg) rotateX(374deg);
    }
  }
</style>
