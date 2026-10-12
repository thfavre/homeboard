<script lang="ts">
  import { scale } from 'svelte/transition';
  import { partyColor, type PartyColor } from '$shared/party.ts';

  /**
   * A Stack tower drawn like the light strip: `blocks` places from the bottom, filled with `list`.
   * `check`: the real tower, to mark each block right (until the first mistake) or wrong.
   */
  let { blocks, list, check, width = '4.5rem' }: { blocks: number; list: PartyColor[]; check?: PartyColor[]; width?: string } = $props();
  /** Right from the bottom until the first mistake */
  const right = $derived.by(() => {
    if (!check) return 0;
    let k = 0;
    while (k < list.length && list[k] === check[k]) k++;
    return k;
  });
</script>

<div class="tower" style:width style:--rows={blocks}>
  {#each Array(blocks) as _, i (i)}
    {@const c = list[i] ? partyColor(list[i]) : undefined}
    <span class="slot" class:filled={!!c} class:wrong={!!check && !!c && i >= right} class:next={!check && i === list.length}>
      {#if c}<span class="block" style:--c={c.hex} in:scale={{ start: 0.6, duration: 160 }}></span>{/if}
    </span>
  {/each}
</div>

<style>
  .tower {
    display: flex;
    flex-direction: column-reverse;
    gap: 0.25rem;
    padding: 0.35rem;
    border-radius: 0.9rem;
    background: #050507;
    border: 1px solid var(--border-strong);
    height: 100%;
    min-height: 0;
  }
  .slot {
    flex: 1 1 0;
    min-height: 0.6rem;
    display: grid;
    border-radius: 0.35rem;
    border: 1px dashed rgba(255, 255, 255, 0.12);
  }
  .slot.filled {
    border-color: transparent;
  }
  .slot.next {
    border-color: rgba(255, 255, 255, 0.4);
  }
  .block {
    border-radius: 0.35rem;
    background: var(--c);
    box-shadow:
      0 0 0.9rem -0.1rem var(--c),
      inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  .wrong .block {
    opacity: 0.35;
    box-shadow: none;
    outline: 2px solid var(--danger);
    outline-offset: -2px;
  }
</style>
