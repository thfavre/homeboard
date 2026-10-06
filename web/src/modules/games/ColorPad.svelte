<script lang="ts">
  import { GAME_COLORS, type GameColor } from '$shared/games.ts';

  /** Four big color buttons (Light Simon, Color Reflex). Reacts on touch down, not on release. */
  let { onpick, disabled = false, lit = null }: { onpick: (c: GameColor) => void; disabled?: boolean; lit?: GameColor | null } = $props();
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
        if (!disabled) onpick(c.id);
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
