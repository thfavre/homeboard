<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ARCADE_GAMES, arcadeGame, type ArcadeGameId } from '$shared/arcade.ts';
  import { ARCADE_ICONS, gradient } from './store.svelte.ts';

  /**
   * The game of a round, drawn like a slot machine: the games flash by, slow down and stop on the
   * one the Arcade drew, which then lands with a bounce. `pool`: the games it flashes through.
   * `onstep`/`onland` let the page play a click and a chime.
   */
  let { game, pool, onstep, onland }: { game: ArcadeGameId; pool: ArcadeGameId[]; onstep?: () => void; onland?: () => void } = $props();

  /** The pauses between flashes (ms), slowing down */
  const STEPS = [55, 55, 60, 65, 70, 80, 90, 105, 125, 150, 185, 230, 290];
  // svelte-ignore state_referenced_locally
  const list = pool.length ? pool : ARCADE_GAMES.map((g) => g.id);
  // svelte-ignore state_referenced_locally
  let shown = $state<ArcadeGameId>(list[0]);
  let landed = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    // Start somewhere so the flashes end on the drawn game
    let i = (list.indexOf(game) - STEPS.length + list.length * 10) % list.length;
    let k = 0;
    const next = () => {
      if (k >= STEPS.length) {
        shown = game;
        landed = true;
        onland?.();
        return;
      }
      i = (i + 1) % list.length;
      shown = k === STEPS.length - 1 ? game : list[i];
      onstep?.();
      timer = setTimeout(next, STEPS[k++]);
    };
    next();
  });
  onDestroy(() => timer && clearTimeout(timer));

  const info = $derived(arcadeGame(shown)!);
  const Icon = $derived(ARCADE_ICONS[shown]);
</script>

<div class="poster" class:landed style:--g={gradient(info.colors)}>
  <span class="poster-icon"><Icon size={40} strokeWidth={2.2} /></span>
  <h1>{info.name}</h1>
  <p class:hidden={!landed}>{info.tagline}</p>
  {#if landed}<span class="burst" aria-hidden="true"></span>{/if}
</div>

<style>
  .poster {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    width: 100%;
    padding: 1.6rem 1rem 1.3rem;
    border-radius: var(--radius);
    background: var(--g);
    color: #fff;
    overflow: hidden;
    box-shadow: 0 16px 40px -20px rgba(0, 0, 0, 0.8);
  }
  .poster:not(.landed) .poster-icon,
  .poster:not(.landed) h1 {
    filter: blur(0.6px);
    opacity: 0.9;
  }
  .landed {
    animation: land 0.45s cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  @keyframes land {
    0% {
      transform: scale(0.92);
    }
    100% {
      transform: scale(1);
    }
  }
  .poster-icon {
    display: grid;
    place-items: center;
    width: 4.4rem;
    height: 4.4rem;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.22);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  h1 {
    margin: 0.3rem 0 0;
    font-family: var(--font-display);
    font-size: 1.9rem;
  }
  p {
    margin: 0;
    opacity: 0.9;
    font-size: 0.9rem;
    transition: opacity 0.2s;
  }
  p.hidden {
    opacity: 0;
  }
  /* A flash of light when it stops */
  .burst {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.55), transparent 60%);
    animation: burst 0.6s ease-out forwards;
    pointer-events: none;
  }
  @keyframes burst {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
</style>
