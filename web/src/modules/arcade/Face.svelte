<script lang="ts">
  import type { ArcadePlayer } from '$shared/arcade.ts';
  import type { WorldState } from '$shared/world.ts';
  import { enabled, hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Portrait from '../world/Portrait.svelte';

  /** A player's face in the Arcade: their town character's, pixels kept sharp, in a frame of their color (their picture when they have no character) */
  let { player, size = 36 }: { player: ArcadePlayer; size?: number } = $props();

  const character = $derived(enabled('world') ? (hb.modules.world as WorldState | undefined)?.characters.find((c) => c.id === player.id) : undefined);
  const sheet = $derived(character?.sheet ?? (hb.modules.world as WorldState | undefined)?.sheet ?? undefined);
</script>

<span class="face" style:--c={player.color} style:width="{size}px" style:height="{size}px">
  {#if character && sheet}
    <Portrait url={character.url} {sheet} size={size - 6} />
  {:else}
    <Avatar name={player.name} color={player.color} id={player.id} size="{size - 6}px" />
  {/if}
</span>

<style>
  .face {
    flex: none;
    display: inline-grid;
    place-items: center;
    background: #2a1f4a;
    border: 3px solid var(--c);
    border-radius: 3px;
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }
  .face :global(.avatar) {
    border-radius: 0;
  }
</style>
