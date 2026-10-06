<script lang="ts">
  import type { Snippet } from 'svelte';
  import { AudioLines } from '@lucide/svelte';

  /**
   * One sound on a board: tap to play. `aside` puts a small button on the right of the card
   * (save, add to the board), `badge` one on its top-right corner (remove while editing).
   */
  let {
    name,
    hue,
    active = false,
    disabled = false,
    onclick,
    aside,
    badge,
  }: { name: string; hue: number; active?: boolean; disabled?: boolean; onclick: () => void; aside?: Snippet; badge?: Snippet } = $props();
</script>

<div class="wrap">
  <button class="sound card" class:active class:has-aside={!!aside} {disabled} {onclick} style:--h={hue}>
    <span class="icon"><AudioLines size={20} /></span>
    <span class="name">{name}</span>
  </button>
  {#if aside}<span class="aside">{@render aside()}</span>{/if}
  {#if badge}<span class="badge">{@render badge()}</span>{/if}
</div>

<style>
  .wrap {
    position: relative;
    display: grid;
    min-width: 0;
  }
  .sound {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
    padding: 0.9rem;
    text-align: left;
    transition: transform 0.1s ease;
  }
  .has-aside {
    padding-right: 2.4rem;
  }
  .sound:active:not(:disabled) {
    transform: scale(0.96);
  }
  .sound:disabled {
    opacity: 0.5;
  }
  .active {
    border-color: var(--accent);
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
  .aside {
    position: absolute;
    top: 50%;
    right: 0.4rem;
    translate: 0 -50%;
    display: flex;
  }
  /* Button passed in `aside` */
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
