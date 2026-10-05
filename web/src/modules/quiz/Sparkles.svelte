<script lang="ts">
  import { untrack } from 'svelte';
  /** A burst of little stars flying out from the center of the parent. Re-key it to replay. */
  let { count = 14, spread = 9, size = 1.2 }: { count?: number; spread?: number; size?: number } = $props();

  const COLORS = ['#ffd93d', '#ff6b9d', '#7cf2ff', '#b388ff', '#ffffff', '#6bffb8'];
  // The burst is drawn once; replaying it means re-creating the component
  const stars = untrack(() => Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = spread * (0.6 + Math.random() * 0.6);
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      s: size * (0.5 + Math.random() * 0.8),
      c: COLORS[i % COLORS.length],
      d: Math.random() * 120,
    };
  }));
</script>

<span class="burst" aria-hidden="true">
  {#each stars as st}
    <svg viewBox="0 0 24 24" style:--x="{st.x}rem" style:--y="{st.y}rem" style:width="{st.s}rem" style:animation-delay="{st.d}ms">
      <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill={st.c} />
    </svg>
  {/each}
</span>

<style>
  .burst {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 3;
  }
  svg {
    position: absolute;
    left: 0;
    top: 0;
    translate: -50% -50%;
    opacity: 0;
    filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.6));
    animation: fly 0.9s ease-out forwards;
  }
  @keyframes fly {
    0% {
      opacity: 1;
      transform: translate(0, 0) scale(0.3) rotate(0deg);
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(var(--x), var(--y)) scale(1) rotate(180deg);
    }
  }
</style>
