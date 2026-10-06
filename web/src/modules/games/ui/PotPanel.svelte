<script lang="ts">
  import { ArrowRight } from '@lucide/svelte';
  import Money from '$lib/ui/Money.svelte';

  /** What you put in, and what the winner takes */
  let { inLabel, stake, outLabel, pot }: { inLabel: string; stake: number; outLabel: string; pot: number } = $props();
</script>

<div class="pot">
  <div class="cell">
    <span class="label">{inLabel}</span>
    <span class="amount"><Money amount={stake} /></span>
  </div>
  <span class="arrow"><ArrowRight size={20} /></span>
  <div class="cell win">
    <span class="label">{outLabel}</span>
    <span class="amount big"><Money amount={pot} /></span>
  </div>
</div>

<style>
  .pot {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    width: 100%;
    padding: 0.9rem 1rem;
    border-radius: var(--radius);
    background: linear-gradient(135deg, color-mix(in srgb, var(--coin) 14%, transparent), color-mix(in srgb, var(--coin-2) 6%, transparent));
    border: 1px solid color-mix(in srgb, var(--coin) 35%, transparent);
  }
  /* Same rows on both sides, so the labels line up whatever the amount size */
  .cell {
    display: grid;
    grid-template-rows: 1.1rem 2.6rem;
    justify-items: center;
    align-items: center;
    gap: 0.2rem;
  }
  .label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .amount {
    font-size: 1.3rem;
  }
  .big {
    font-size: 1.8rem;
    color: var(--coin);
  }
  .arrow {
    color: var(--coin);
    opacity: 0.8;
  }
</style>
