<script lang="ts">
  import { fly } from 'svelte/transition';
  import { Crosshair } from '@lucide/svelte';
  import type { CrowdKill } from '$shared/crowd.ts';
  import type { GamePlayer } from '$shared/games.ts';

  /** Who shot whom this round, newest at the top, over the corner of the field */
  let { kills, players, spy = null }: { kills: CrowdKill[]; players: GamePlayer[]; spy?: string | null } = $props();
  const p = (id: string | null) => players.find((x) => x.id === id);
  const shown = $derived([...kills].reverse().slice(0, 5));
</script>

<ol class="feed">
  {#each shown as k (k.at + k.by)}
    {@const by = p(k.by)}
    {@const victim = p(k.victim)}
    <li in:fly={{ x: 40, duration: 300 }}>
      <strong style:color={by?.color}>{by?.name}</strong>
      <Crosshair size="1rem" />
      {#if victim}<strong style:color={victim.color}>{k.victim === spy ? `the spy, ${victim.name}` : victim.id === k.by ? 'themselves' : victim.name}</strong>{:else}<span class="dim">a passer-by</span>{/if}
    </li>
  {/each}
</ol>

<style>
  .feed {
    position: absolute;
    top: 0.8rem;
    right: 0.8rem;
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.35rem;
    justify-items: end;
    pointer-events: none;
  }
  li {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.8rem;
    border-radius: 999px;
    background: rgb(8 8 14 / 0.75);
    color: #fff;
    font-size: 1.05rem;
  }
  .dim {
    color: rgb(255 255 255 / 0.65);
  }
</style>
