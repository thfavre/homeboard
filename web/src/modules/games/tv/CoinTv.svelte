<script lang="ts">
  import type { CoinView, MatchState } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import CoinFace from './CoinFace.svelte';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CoinView);
  const sideOf = (id: string) => (id === v.caller ? v.side : v.side === 'heads' ? 'tails' : 'heads');
</script>

<div class="flip">
  {#each m.players as p, i (p.id)}
    <div class="who" class:win={v.outcome === sideOf(p.id)} class:lose={v.outcome && v.outcome !== sideOf(p.id)} style:order={i * 2}>
      <Avatar name={p.name} color={p.color} id={p.id} size="9rem" />
      <strong>{p.name}</strong>
      <span class="pill accent side">{sideOf(p.id)}</span>
    </div>
  {/each}
  <div class="mid" style:order="1">
    <CoinFace outcome={v.outcome} size="20rem" />
    <h1>{v.outcome ? (v.outcome === 'heads' ? 'Heads!' : 'Tails!') : 'Flipping...'}</h1>
  </div>
</div>

<style>
  .flip {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-evenly;
  }
  .who {
    display: grid;
    justify-items: center;
    gap: 1rem;
    font-size: 2rem;
    transition:
      opacity 0.5s ease,
      transform 0.5s ease;
  }
  .who.win {
    transform: scale(1.12);
  }
  .who.lose {
    opacity: 0.35;
  }
  .side {
    font-size: 1.3rem;
    text-transform: capitalize;
  }
  .mid {
    display: grid;
    justify-items: center;
    gap: 2.5rem;
  }
  h1 {
    font-size: 4rem;
  }
</style>
