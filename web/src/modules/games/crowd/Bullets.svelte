<script lang="ts">
  /** Shots left, as little bullets (a number past 5) */
  let { left, size = '1rem' }: { left: number; size?: string } = $props();
</script>

<span class="bullets" style:--s={size} aria-label={`${left} ${left === 1 ? 'shot' : 'shots'} left`}>
  {#if left > 5}
    <svg viewBox="0 0 8 20" aria-hidden="true"><path d="M4 0 C7 3 7 6 7 8 V18 H1 V8 C1 6 1 3 4 0 Z" /></svg><span class="mono">{left}</span>
  {:else if left > 0}
    {#each { length: left } as _, i (i)}<svg viewBox="0 0 8 20" aria-hidden="true"><path d="M4 0 C7 3 7 6 7 8 V18 H1 V8 C1 6 1 3 4 0 Z" /></svg>{/each}
  {:else}
    <span class="none">no shots</span>
  {/if}
</span>

<style>
  .bullets {
    display: inline-flex;
    align-items: center;
    gap: 0.12rem;
    color: var(--coin);
  }
  svg {
    height: var(--s);
    width: calc(var(--s) * 0.4);
    fill: currentColor;
  }
  .mono {
    margin-left: 0.2rem;
    font-weight: 700;
  }
  .none {
    font-size: 0.7em;
    line-height: 1;
    white-space: nowrap;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
</style>
