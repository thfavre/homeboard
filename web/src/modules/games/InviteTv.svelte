<script lang="ts">
  import { Swords } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { gameInfo } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { gamesState } from './store.svelte.ts';

  /** Challenges waiting for an answer, announced on the TV like a game show */
  const invites = $derived(gamesState()?.invites ?? []);
</script>

{#if invites.length}
  <div class="invites">
    {#each invites.slice(0, 3) as inv (inv.id)}
      <div class="invite card" transition:fly={{ x: -40, duration: 350 }}>
        <Avatar name={inv.from.name} color={inv.from.color} id={inv.from.id} size="2.6rem" />
        <span class="vs"><Swords size="1.3rem" /></span>
        <Avatar name={inv.to.name} color={inv.to.color} id={inv.to.id} size="2.6rem" />
        <span class="text">
          <strong>{inv.from.name}</strong> challenges <strong>{inv.to.name}</strong>
          <span class="dim">{gameInfo(inv.game)?.name}{#if hb.core?.economyEnabled && inv.stake > 0}<span>{' · pot '}</span><Money amount={inv.stake * 2} />{/if}</span>
        </span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .invites {
    position: fixed;
    left: var(--tv-pad-x, 2rem);
    top: 5rem;
    z-index: 40;
    display: grid;
    gap: 0.6rem;
  }
  .invite {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 1.3rem 0.5rem 0.5rem;
    border-radius: 999px;
    font-size: 1.1rem;
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    animation: glow 2s ease-in-out infinite;
  }
  .vs {
    color: var(--accent);
    display: grid;
  }
  .text {
    display: grid;
    margin-left: 0.4rem;
    line-height: 1.25;
  }
  .text .dim {
    font-size: 0.95rem;
  }
  @keyframes glow {
    50% {
      box-shadow: 0 0 2.4rem -0.6rem var(--accent);
    }
  }
</style>
