<script lang="ts">
  import { GAME_COLORS, type GameColor } from '$shared/games.ts';

  /**
   * Four big color buttons (Light Simon, Color Reflex).
   * `on`: 'down' counts the touch right away (speed games), 'up' when the finger is lifted.
   */
  let {
    onpick,
    disabled = false,
    lit = null,
    on = 'down',
  }: { onpick: (c: GameColor) => void; disabled?: boolean; lit?: GameColor | null; on?: 'down' | 'up' } = $props();
  let pressed: GameColor | null = null;
</script>

<div class="pad">
  {#each GAME_COLORS as c (c.id)}
    <button
      class="key"
      class:lit={lit === c.id}
      style:--c={c.hex}
      aria-label={c.name}
      {disabled}
      onpointerdown={(e) => {
        e.preventDefault();
        if (disabled) return;
        if (on === 'down') return onpick(c.id);
        // Counted on lift even if the finger slid a little (a plain click is lost then)
        pressed = c.id;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onpointerup={() => {
        if (pressed !== c.id) return;
        pressed = null;
        if (!disabled) onpick(c.id);
      }}
      onpointercancel={() => (pressed = null)}
      onclick={(e) => {
        // Keyboard (Enter / Space): pointer taps are handled above
        if (!disabled && on === 'up' && e.detail === 0) onpick(c.id);
      }}
    ></button>
  {/each}
</div>

<style>
  .pad {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
    touch-action: manipulation;
  }
  .key {
    aspect-ratio: 1;
    border: 0;
    border-radius: 1.6rem;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 70%, #fff), var(--c) 60%);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--c) 40%, transparent),
      0 14px 30px -16px var(--c);
    transition:
      transform 0.08s ease,
      filter 0.08s ease;
    -webkit-tap-highlight-color: transparent;
    /* No scroll or zoom gesture can swallow a tap */
    touch-action: none;
  }
  .key:active:not(:disabled),
  .key.lit {
    transform: scale(0.94);
    filter: brightness(1.35);
  }
  .key:disabled {
    filter: saturate(0.3) brightness(0.6);
  }
</style>
