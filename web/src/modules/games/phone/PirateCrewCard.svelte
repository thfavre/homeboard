<script lang="ts">
  import { PIRATE_SHIPS, type GamePlayer, type PirateCrewDeal } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import PirateShip from '../ui/PirateShip.svelte';

  /** This player's ship and crew, in the ship's color: on the rules screen and while rowing */
  let { crew, players, me, phase = null, compact = false }: { crew: PirateCrewDeal; players: GamePlayer[]; me: string; phase?: number | null; compact?: boolean } = $props();
  const ship = $derived(PIRATE_SHIPS.find((s) => s.id === crew.ship) ?? PIRATE_SHIPS[0]);
  const mates = $derived(crew.members.map((id) => players.find((p) => p.id === id)).filter((p) => !!p));
</script>

<div class="crew" class:compact style:--team={ship.hex}>
  <span class="sea" aria-hidden="true">
    <span class="boat"><PirateShip ship={crew.ship} color={ship.hex} {phase} speed={phase === null ? 0 : 0.6} /></span>
  </span>
  <span class="text">
    <span class="eyebrow">You row for the</span>
    <strong>{ship.name} ship</strong>
    <span class="mates">
      {#each mates as p (p.id)}
        <span class="mate" class:me={p.id === me}><Avatar name={p.name} color={p.color} id={p.id} size="1.6rem" />{p.id === me ? 'You' : p.name}</span>
      {/each}
    </span>
  </span>
</div>

<style>
  .crew {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem;
    border-radius: var(--radius);
    border: 2px solid var(--team);
    background: linear-gradient(135deg, color-mix(in srgb, var(--team) 28%, #0b1b2e), #0b1b2e 75%);
    box-shadow: 0 0 2.5rem -0.8rem var(--team);
    color: #fff;
  }
  /* A patch of sea with the ship on it, sailing right */
  .sea {
    position: relative;
    width: 7.2rem;
    height: 5.2rem;
    border-radius: 1rem;
    overflow: hidden;
    background:
      url('/pirates/water.png') 0 0 / 90px 90px,
      #2a86c8;
    background-blend-mode: soft-light;
    box-shadow: inset 0 0 1rem rgb(0 20 50 / 0.45);
  }
  .boat {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2.5rem;
    height: 4.3rem;
    translate: -50% -50%;
    rotate: -90deg;
  }
  .text {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .eyebrow {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(255 255 255 / 0.65);
  }
  strong {
    font-family: var(--font-display);
    font-size: 1.9rem;
    line-height: 1;
    color: var(--team);
    text-shadow: 0 0 1.2rem color-mix(in srgb, var(--team) 55%, transparent);
  }
  .mates {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.7rem;
    margin-top: 0.2rem;
  }
  .mate {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.8;
  }
  .mate.me {
    opacity: 1;
    font-weight: 800;
  }
  .compact {
    padding: 0.7rem;
    gap: 0.8rem;
  }
  .compact strong {
    font-size: 1.6rem;
  }
</style>
