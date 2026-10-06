<script lang="ts">
  /** Round glossy push button, like the ones on myinstants.com. The colour comes from `seed`. */
  let {
    seed,
    label,
    active = false,
    disabled = false,
    onpress,
  }: { seed: string; label: string; active?: boolean; disabled?: boolean; onpress: () => void } = $props();

  // Same family of colours as the site
  const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00897b', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41', '#546e7a', '#00acc1'];

  // FNV-1a: spreads similar names (same ".mp3" ending) over all the colours
  const color = $derived.by(() => {
    let h = 0x811c9dc5;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
    return COLORS[(h >>> 0) % COLORS.length];
  });
</script>

<button type="button" class="instant" class:active {disabled} style:--c={color} aria-label={label} onclick={onpress}>
  <span class="shine"></span>
</button>

<style>
  .instant {
    position: relative;
    width: 4.4rem;
    height: 4.4rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--c) 70%, #fff) 0%, var(--c) 45%, color-mix(in srgb, var(--c) 65%, #000) 100%);
    box-shadow:
      inset 0 -0.3rem 0.4rem color-mix(in srgb, var(--c) 50%, #000),
      0 0.3rem 0 color-mix(in srgb, var(--c) 45%, #000),
      0 0.5rem 0.9rem rgb(0 0 0 / 0.35);
    cursor: pointer;
    transition:
      transform 0.08s ease,
      box-shadow 0.08s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .instant:active:not(:disabled) {
    transform: translateY(0.25rem);
    box-shadow:
      inset 0 -0.15rem 0.3rem color-mix(in srgb, var(--c) 50%, #000),
      0 0.05rem 0 color-mix(in srgb, var(--c) 45%, #000),
      0 0.2rem 0.4rem rgb(0 0 0 / 0.3);
  }
  .instant:disabled {
    filter: grayscale(0.6) brightness(0.8);
    cursor: default;
  }
  .shine {
    position: absolute;
    top: 9%;
    left: 22%;
    width: 56%;
    height: 34%;
    border-radius: 50%;
    background: linear-gradient(to bottom, rgb(255 255 255 / 0.65), rgb(255 255 255 / 0));
    pointer-events: none;
  }
  .active {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      outline-offset: 6px;
    }
  }
</style>
