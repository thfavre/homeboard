<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A big button for a thumb: `onpress` when the finger lands, `onrelease` when it lifts (or slides off the
   * edge of the screen). Works with other fingers on other buttons at the same time.
   */
  let {
    onpress,
    onrelease,
    color = 'var(--accent)',
    disabled = false,
    size = 'normal',
    children,
  }: { onpress: () => void; onrelease?: () => void; color?: string; disabled?: boolean; size?: 'normal' | 'big' | 'small' | 'tall' | 'square'; children: Snippet } = $props();

  let finger = $state<number | null>(null);

  function down(e: PointerEvent) {
    if (disabled || finger !== null) return;
    finger = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onpress();
  }
  function up(e: PointerEvent) {
    if (e.pointerId !== finger) return;
    finger = null;
    onrelease?.();
  }
  $effect(() => {
    if (disabled && finger !== null) {
      finger = null;
      onrelease?.();
    }
  });
</script>

<button
  class="hold {size}"
  class:down={finger !== null}
  style:--c={color}
  {disabled}
  onpointerdown={down}
  onpointerup={up}
  onpointercancel={up}
  oncontextmenu={(e) => e.preventDefault()}
>
  {@render children()}
</button>

<style>
  .hold {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.15rem;
    width: 100%;
    padding: 0;
    border-radius: 1.4rem;
    border: 0.25rem solid color-mix(in srgb, var(--c) 45%, #fff);
    background: radial-gradient(circle at 40% 25%, color-mix(in srgb, var(--c) 55%, #fff), var(--c) 60%, color-mix(in srgb, var(--c) 55%, #000));
    color: #fff;
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-shadow: 0 0.15rem 0.4rem rgb(0 0 0 / 0.45);
    box-shadow:
      0 0.45rem 0 color-mix(in srgb, var(--c) 45%, #000),
      0 1rem 2rem -1rem var(--c);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    transition:
      transform 0.06s ease,
      box-shadow 0.06s ease;
  }
  .normal {
    min-height: 5.4rem;
    font-size: 1.5rem;
  }
  .big {
    min-height: 7.5rem;
    font-size: 1.9rem;
  }
  .small {
    min-height: 4rem;
    font-size: 1.15rem;
  }
  .tall {
    min-height: 12rem;
    font-size: 1.9rem;
  }
  .square {
    aspect-ratio: 1;
    font-size: 1.6rem;
  }
  .hold.down {
    transform: translateY(0.35rem);
    box-shadow:
      0 0.1rem 0 color-mix(in srgb, var(--c) 45%, #000),
      0 0.5rem 1.2rem -1rem var(--c);
  }
  .hold:disabled {
    opacity: 0.4;
    filter: grayscale(0.6);
  }
</style>
