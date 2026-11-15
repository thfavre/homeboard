<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ARCADE_GAMES, arcadeGame, type ArcadeGameId } from '$shared/arcade.ts';
  import PixelText from '$lib/ui/PixelText.svelte';
  import { ARCADE_ICONS } from './store.svelte.ts';

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

<div class="poster" class:landed style:--a={info.colors[0]} style:--b={info.colors[1]}>
  <span class="poster-icon"><Icon size={34} strokeWidth={2.4} /></span>
  <span class="title"><PixelText text={info.name} size={22} color="#ffffff" /></span>
  <p class:hidden={!landed}>{info.tagline}</p>
  {#if landed}<span class="burst" aria-hidden="true"></span>{/if}
</div>

<style>
  /* The cabinet's screen: dark glass with scanlines, lit in the game's colors */
  .poster {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.55rem;
    width: 100%;
    padding: 1.3rem 1rem 1.1rem;
    border: 3px solid #0b0718;
    border-radius: 6px;
    background:
      repeating-linear-gradient(180deg, rgba(0, 0, 0, 0.22) 0 2px, transparent 2px 4px),
      radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--a) 55%, #140c28), color-mix(in srgb, var(--b) 45%, #0b0718) 75%);
    color: #fff;
    overflow: hidden;
    box-shadow:
      0 0 0 3px var(--a),
      0 0 26px -4px var(--a),
      inset 0 0 30px rgba(0, 0, 0, 0.6);
  }
  .poster:not(.landed) .poster-icon,
  .poster:not(.landed) .title {
    filter: blur(0.6px);
    opacity: 0.85;
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
    width: 4rem;
    height: 4rem;
    border: 3px solid #0b0718;
    border-radius: 4px;
    background: linear-gradient(135deg, var(--a), var(--b));
    box-shadow:
      inset 0 3px 0 rgba(255, 255, 255, 0.35),
      inset 0 -3px 0 rgba(0, 0, 0, 0.25),
      3px 3px 0 rgba(0, 0, 0, 0.45);
  }
  .title {
    min-height: 26px;
  }
  p {
    margin: 0;
    max-width: 18rem;
    opacity: 0.92;
    font-size: 0.9rem;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
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
