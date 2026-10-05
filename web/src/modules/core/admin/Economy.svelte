<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import type { PriceInfo, EarnRuleInfo } from '$shared/protocol.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import AmountInput from '$lib/ui/AmountInput.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { ago } from '$lib/time.ts';

  const core = $derived(hb.core!);
  const admin = $derived(core.admin!);
  const moduleName = (id: string) => admin.modules.find((m) => m.id === id)?.name ?? id;

  function group<T extends { module: string }>(items: T[]): [string, T[]][] {
    const map = new Map<string, T[]>();
    for (const it of items) map.set(it.module, [...(map.get(it.module) ?? []), it]);
    return [...map.entries()];
  }

  const prices = $derived(group<PriceInfo>(admin.prices.filter((p) => p.active !== false)));
  const earn = $derived(group<EarnRuleInfo>(admin.earnRules));

  const currencyName = new Synced(() => hb.core?.currency.name, '');
  const currencySymbol = new Synced(() => hb.core?.currency.symbol, '');
  const passive = new Synced(() => hb.core?.admin?.passiveMinutes, 5);

  const set = (args: Record<string, unknown>) => attempt(() => rpc('core', 'setGeneral', args));
</script>

<Section title="Economy">
  <div class="line">
    <div>
      <strong>Money system</strong>
      <p class="dim small">When off, everything is free and balances are hidden.</p>
    </div>
    <Toggle checked={core.economyEnabled} label="Economy" onchange={(v) => set({ economyEnabled: v })} />
  </div>
  <div class="grid2">
    <label class="field">
      <span>Currency name</span>
      <input class="input" maxlength="24" bind:value={currencyName.value} onfocus={currencyName.start} onblur={() => { set({ currency: { name: currencyName.value } }); currencyName.end(); }} />
    </label>
    <label class="field">
      <span>Symbol</span>
      <input class="input" maxlength="4" bind:value={currencySymbol.value} onfocus={currencySymbol.start} onblur={() => { set({ currency: { symbol: currencySymbol.value } }); currencySymbol.end(); }} />
    </label>
  </div>
  <div class="grid2">
    <label class="field">
      <span>Passive income every (minutes, 0 = off)</span>
      <input class="input" type="number" min="0" max="120" bind:value={passive.value} onfocus={passive.start} onblur={() => { set({ passiveMinutes: Number(passive.value) }); passive.end(); }} />
    </label>
    <label class="field">
      <span>TV leaderboard</span>
      <select class="input" value={core.leaderboardMode} onchange={(e) => set({ leaderboardMode: e.currentTarget.value })}>
        <option value="balance">Richest guests</option>
        <option value="spent">Big spenders</option>
        <option value="earned">Top earners</option>
        <option value="off">Hidden</option>
      </select>
    </label>
  </div>
</Section>

<Section title="Prices" hint="What each action costs guests.">
  {#each prices as [mod, items] (mod)}
    <div class="group">
      <span class="eyebrow">{moduleName(mod)}</span>
      {#each items as p (p.key)}
        <div class="line">
          <span>{p.label}{#if p.unit}<span class="faint">{` / ${p.unit}`}</span>{/if}</span>
          <AmountInput value={p.amount} oncommit={(v) => attempt(() => rpc('core', 'setPrice', { key: p.key, amount: v }))} />
        </div>
      {/each}
    </div>
  {/each}
</Section>

<Section title="Earning" hint="How guests get money. They see these rules on their Earn tab.">
  {#each earn as [mod, items] (mod)}
    <div class="group">
      <span class="eyebrow">{moduleName(mod)}</span>
      {#each items as r (r.key)}
        <div class="line">
          <div>
            <span>{r.label}</span>
            <p class="faint small">{r.description}</p>
          </div>
          <AmountInput value={r.amount} oncommit={(v) => attempt(() => rpc('core', 'setEarn', { key: r.key, amount: v }))} />
        </div>
      {/each}
    </div>
  {/each}
</Section>

<Section title="Transactions">
  <div class="ledger">
    {#each admin.ledger.slice(0, 40) as e (e.id)}
      <div class="tx">
        <strong class="truncate">{e.guestName}</strong>
        <span class="dim truncate reason">{e.reason}</span>
        <span class="faint when">{ago(e.at)}</span>
        <span class="amt" class:plus={e.amount > 0}><Money amount={e.amount} sign /></span>
      </div>
    {:else}
      <p class="faint">No transactions yet.</p>
    {/each}
  </div>
</Section>

<style>
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.35rem 0;
  }
  .small {
    font-size: 0.82rem;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }
  .group {
    display: grid;
    gap: 0.2rem;
    padding-bottom: 0.6rem;
  }
  .ledger {
    display: grid;
  }
  .tx {
    display: grid;
    grid-template-columns: 7rem 1fr auto auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.88rem;
  }
  .tx:last-child {
    border-bottom: 0;
  }
  .when {
    font-size: 0.78rem;
    white-space: nowrap;
  }
  .amt {
    color: var(--text-dim);
    text-align: right;
  }
  .amt.plus {
    color: var(--success);
  }
  @media (max-width: 600px) {
    .grid2 {
      grid-template-columns: 1fr;
    }
    .tx {
      grid-template-columns: 1fr auto;
    }
    .tx .reason,
    .tx .when {
      display: none;
    }
  }
</style>
