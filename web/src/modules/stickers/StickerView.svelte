<script lang="ts">
  import '@fontsource/permanent-marker';
  import '@fontsource/pacifico';
  import '@fontsource/bungee';
  import '@fontsource/press-start-2p';
  import { DEFAULT_TEXT_STYLE, TEXT_COLORS, TEXT_FONTS, stickerLabel, type StickerDef, type TextStyle } from '$shared/stickers.ts';

  /** lazy: only load the picture when it scrolls into view (long sticker grids) */
  let {
    sticker,
    text,
    textStyle,
    lazy = false,
  }: { sticker: StickerDef | null | undefined; text?: string; textStyle?: TextStyle; lazy?: boolean } = $props();

  const style = $derived(textStyle ?? DEFAULT_TEXT_STYLE);
  const color = $derived(TEXT_COLORS.find((c) => c.id === style.color) ?? TEXT_COLORS[0]);
  const font = $derived(TEXT_FONTS.find((f) => f.id === style.font) ?? TEXT_FONTS[0]);
</script>

{#if sticker?.kind === 'face'}
  <img class="face" src={sticker.src} alt={sticker.name} draggable="false" />
{:else if sticker?.kind === 'image'}
  <img src={sticker.src} alt={stickerLabel(sticker)} draggable="false" loading={lazy ? 'lazy' : undefined} />
{:else if text}
  <!-- The effect moves the outer span, so it never fights the TV moving the sticker around -->
  <span class="fx fx-{style.effect}">
    <span
      class="text font-{font.id}"
      style:--bg={color.bg}
      style:--fg={color.fg}
      style:--edge={'edge' in color ? color.edge : '#fff'}
      style:font-family={font.family}
    >{text}</span>
  </span>
{/if}

<style>
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.35));
  }
  .face {
    border-radius: 50%;
    border: 4px solid #fff;
    object-fit: cover;
    box-shadow: 0 10px 28px -8px rgba(0, 0, 0, 0.6);
    filter: none;
  }
  .fx {
    display: inline-block;
    max-width: 100%;
  }
  .text {
    display: inline-block;
    max-width: 22em;
    padding: 0.35em 0.8em 0.45em;
    border-radius: 0.7em;
    background: var(--bg);
    color: var(--fg);
    font-weight: 800;
    font-size: 2.1rem;
    letter-spacing: -0.02em;
    line-height: 1.1;
    white-space: nowrap;
    box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.6);
    border: 3px solid var(--edge);
  }
  /* Fonts that come with a single weight, or draw wider than the others */
  .font-marker,
  .font-block {
    font-weight: 400;
    letter-spacing: 0;
  }
  .font-script {
    font-weight: 400;
    letter-spacing: 0;
    padding: 0.2em 0.8em 0.45em;
    line-height: 1.3;
  }
  .font-pixel {
    font-weight: 400;
    letter-spacing: 0;
    font-size: 1.35rem;
    line-height: 1.4;
    padding: 0.55em 0.9em;
  }

  /* Effects */
  .fx-spin {
    animation: spin 3s linear infinite;
  }
  .fx-wobble {
    animation: wobble 0.9s ease-in-out infinite alternate;
  }
  .fx-pulse {
    animation: pulse 0.7s ease-in-out infinite alternate;
  }
  .fx-shake {
    animation: shake 0.45s linear infinite;
  }
  .fx-flip {
    animation: flip 2.4s ease-in-out infinite;
  }
  .fx-rainbow .text {
    animation: rainbow 3s linear infinite;
  }
  .fx-glow .text {
    animation: glow 1.2s ease-in-out infinite alternate;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes wobble {
    from {
      transform: rotate(-9deg);
    }
    to {
      transform: rotate(9deg);
    }
  }
  @keyframes pulse {
    from {
      transform: scale(0.92);
    }
    to {
      transform: scale(1.12);
    }
  }
  @keyframes shake {
    0%,
    100% {
      transform: translate(0, 0);
    }
    20% {
      transform: translate(-4px, 2px) rotate(-2deg);
    }
    40% {
      transform: translate(4px, -2px) rotate(2deg);
    }
    60% {
      transform: translate(-3px, -3px);
    }
    80% {
      transform: translate(3px, 3px) rotate(-1deg);
    }
  }
  @keyframes flip {
    from {
      transform: perspective(600px) rotateY(0deg);
    }
    to {
      transform: perspective(600px) rotateY(360deg);
    }
  }
  @keyframes rainbow {
    to {
      filter: hue-rotate(360deg);
    }
  }
  @keyframes glow {
    from {
      box-shadow: 0 0 0.3em 0 color-mix(in srgb, var(--fg) 30%, transparent);
    }
    to {
      box-shadow:
        0 0 1.4em 0.25em color-mix(in srgb, var(--fg) 75%, transparent),
        0 0 0.6em 0 #fff;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .fx,
    .fx .text {
      animation: none;
    }
  }
</style>
