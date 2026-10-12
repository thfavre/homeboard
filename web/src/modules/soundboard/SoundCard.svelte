<script lang="ts">
  import type { Snippet } from 'svelte';
  import { AudioLines } from '@lucide/svelte';
  import { formatDuration } from '$shared/soundboard.ts';

  /**
   * One sound on a board: tap to play. `aside` puts small buttons on the right of the card
   * (listen, save, add to the board), on one line with the name cut with "..." if too long;
   * with `asideBelow` they go under the name on phones instead. `badge` puts one on its
   * top-right corner (remove while editing). `duration` (seconds) shows the sound's length.
   */
  let {
    name,
    hue,
    duration,
    active = false,
    disabled = false,
    onclick,
    aside,
    asideBelow = false,
    badge,
  }: { name: string; hue: number; duration?: number; active?: boolean; disabled?: boolean; onclick: () => void; aside?: Snippet; asideBelow?: boolean; badge?: Snippet } = $props();
</script>

<div class="sound card" class:active class:has-aside={!!aside} class:below={asideBelow} style:--h={hue}>
  <button class="main" {disabled} {onclick}>
    <span class="icon"><AudioLines size={20} /></span>
    <span class="name">{name}</span>
    {#if duration}<span class="len">{formatDuration(duration)}</span>{/if}
  </button>
  {#if aside}<span class="aside">{@render aside()}</span>{/if}
  {#if badge}<span class="badge">{@render badge()}</span>{/if}
</div>

<style>
  .sound {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    transition: transform 0.1s ease;
  }
  .sound:has(.main:active:not(:disabled)) {
    transform: scale(0.96);
  }
  .active {
    border-color: var(--accent);
  }
  .main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
    padding: 0.9rem;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .main:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 0.8rem;
    background: hsl(var(--h) 80% 60% / 0.16);
    color: hsl(var(--h) 85% 68%);
  }
  .name {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 600;
    font-size: 0.92rem;
    line-height: 1.2;
  }
  /* Length: never cut, the name gives way */
  .len {
    flex: none;
    margin-left: auto;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text-faint);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }
  /* With buttons on the same line, the name stays on one line and ends with "..." */
  .has-aside .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .aside {
    flex: none;
    display: flex;
    gap: 0.1rem;
    padding-right: 0.4rem;
  }
  /* On phones, `asideBelow` moves the buttons under the name so it keeps the full width */
  @media (max-width: 640px) {
    .below {
      flex-wrap: wrap;
    }
    .below .main {
      flex-basis: 100%;
      padding-bottom: 0.3rem;
    }
    .below .name {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .below .aside {
      padding: 0 0.5rem 0.4rem;
    }
  }
  .aside :global(button) {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--text-faint);
    cursor: pointer;
  }
  .aside :global(button:active) {
    background: var(--surface-2);
  }
  .aside :global(button.on) {
    color: var(--accent);
  }
  .aside :global(button:disabled) {
    opacity: 0.4;
  }
  .badge {
    position: absolute;
    top: -0.4rem;
    right: -0.4rem;
  }
</style>
