<script lang="ts">
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import AmountInput from '$lib/ui/AmountInput.svelte';

  /**
   * Prices and rewards of one module, shown at the top of its admin page.
   * The same amounts are also listed together in Economy.
   */
  let { module }: { module: string } = $props();

  const admin = $derived(hb.core?.admin);
  const prices = $derived(admin?.prices.filter((p) => p.module === module) ?? []);
  const rewards = $derived(admin?.earnRules.filter((r) => r.module === module) ?? []);
</script>

{#if prices.length || rewards.length}
  <Section title="Prices and rewards" hint={hb.core?.economyEnabled ? undefined : 'The money system is off: everything is free for now.'}>
    {#each prices as p (p.key)}
      <div class="line">
        <span>{p.label}{#if p.unit}<span class="faint">{` / ${p.unit}`}</span>{/if}</span>
        <AmountInput value={p.amount} oncommit={(v) => attempt(() => rpc('core', 'setPrice', { key: p.key, amount: v }))} />
      </div>
    {/each}
    {#each rewards as r (r.key)}
      <div class="line">
        <div class="text">
          <span>{r.label}</span>
          <span class="faint small">Reward</span>
        </div>
        <AmountInput value={r.amount} oncommit={(v) => attempt(() => rpc('core', 'setEarn', { key: r.key, amount: v }))} />
      </div>
    {/each}
  </Section>
{/if}

<style>
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .text {
    display: grid;
  }
  .small {
    font-size: 0.78rem;
  }
</style>
