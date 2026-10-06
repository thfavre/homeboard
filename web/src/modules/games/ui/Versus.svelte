<script lang="ts">
  import type { GamePlayer } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  /** Two players face to face. `waiting`: the right one has not answered yet. */
  let { left, right, leftLabel, rightLabel, waiting = false }: { left: GamePlayer; right: GamePlayer; leftLabel?: string; rightLabel?: string; waiting?: boolean } = $props();
</script>

<div class="versus">
  <div class="side">
    <Avatar name={left.name} color={left.color} id={left.id} size="4.6rem" />
    <strong class="truncate">{left.name}</strong>
    {#if leftLabel}<span class="tag">{leftLabel}</span>{/if}
  </div>
  <span class="vs">VS</span>
  <div class="side" class:waiting>
    <Avatar name={right.name} color={right.color} id={right.id} size="4.6rem" />
    <strong class="truncate">{right.name}</strong>
    {#if rightLabel}<span class="tag">{rightLabel}</span>{/if}
  </div>
</div>

<style>
  .versus {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
  }
  .side {
    display: grid;
    justify-items: center;
    gap: 0.35rem;
    min-width: 0;
    font-size: 1rem;
  }
  .side strong {
    max-width: 100%;
  }
  .side.waiting :global(.avatar) {
    animation: hb-pulse 1.6s ease-in-out infinite;
  }
  .tag {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .vs {
    font-family: var(--font-display);
    font-size: 2.2rem;
    font-weight: 700;
    font-style: italic;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding: 0 0.2rem;
  }
</style>
