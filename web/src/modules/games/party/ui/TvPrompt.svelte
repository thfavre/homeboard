<script lang="ts">
  import { Eye } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  import type { MatchState } from '$shared/games.ts';
  import Ring from '../../../quiz/Ring.svelte';

  /** TV: a big instruction with the countdown, while the strip or the phones do the work */
  let { m, title, sub, eye = true, children }: { m: MatchState; title: string; sub?: string; eye?: boolean; children?: Snippet } = $props();
</script>

<div class="prompt">
  {#if eye}<span class="eye"><Eye size="4rem" /></span>{/if}
  <h1>{title}</h1>
  {#if sub}<p class="dim lead">{sub}</p>{/if}
  {@render children?.()}
  {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="8rem" />{/if}
</div>

<style>
  .prompt {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1.2rem;
  }
  .eye {
    color: var(--g1);
    animation: hb-pulse 1.2s ease-in-out infinite;
  }
  h1 {
    font-size: 4rem;
    line-height: 1.05;
    letter-spacing: -0.03em;
  }
  .lead {
    font-size: 1.6rem;
  }
</style>
