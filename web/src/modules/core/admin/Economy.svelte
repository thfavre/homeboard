<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import type { PriceInfo, EarnRuleInfo } from '$shared/protocol.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import AmountInput from '$lib/ui/AmountInput.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { ago } from '$lib/time.ts';
  import { formatAmount } from '$shared/money.ts';

  const core = $derived(hb.core!);
  const admin = $derived(core.admin!);
  const moduleName = (id: string) => admin.modules.find((m) => m.id === id)?.name ?? id;

  function group<T extends { module: string }>(items: T[]): [string, T[]][] {
    const map = new Map<string, T[]>();
    for (const it of items) map.set(it.module, [...(map.get(it.module) ?? []), it]);
    return [...map.entries()];
  }

  const prices = $derived(group<PriceInfo>(admin.prices.filter((p) => p.active !== false)));
  const passiveRule = $derived(admin.earnRules.find((r) => r.key === 'core.passive'));
  const earn = $derived(group<EarnRuleInfo>(admin.earnRules.filter((r) => r.key !== 'core.passive')));

  const currencyName = new Synced(() => hb.core?.currency.name, '');
  const currencySymbol = new Synced(() => hb.core?.currency.symbol, '');
  const passive = new Synced(() => hb.core?.admin?.passiveMinutes, 5);
  const passiveAway = new Synced(() => hb.core?.admin?.passiveAwayMinutes, 60);

  const set = (args: Record<string, unknown>) => attempt(() => rpc('core', 'setGeneral', args));
  const setEarn = (key: string, amount: number) => attempt(() => rpc('core', 'setEarn', { key, amount }));

  const minutes = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`);
  const passiveSummary = $derived.by(() => {
    const amount = passiveRule?.amount ?? 0;
    if (!amount || !admin.passiveMinutes) return 'Off: guests earn nothing just for being here.';
    const each = `${formatAmount(amount)} ${core.currency.name} every ${minutes(admin.passiveMinutes)} while their page is open`;
    return admin.passiveAwayMinutes
      ? `Guests get ${each}, and keep earning for up to ${minutes(admin.passiveAwayMinutes)} after they leave.`
      : `Guests get ${each}. Nothing while they are away.`;
  });
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
</Section>

<Section title="Earning" hint="How guests get money. They see these rules on their Earn tab.">
  {#if passiveRule}
    <div class="passive">
      <span class="eyebrow">Passive income</span>
      <p class="summary">{passiveSummary}</p>
      <div class="line">
        <div>
          <span>Amount</span>
          <p class="faint small">Paid each time the timer fills up.</p>
        </div>
        <span class="unit">
          <AmountInput value={passiveRule.amount} oncommit={(v) => setEarn('core.passive', v)} />
          <span class="faint">{core.currency.symbol}</span>
        </span>
      </div>
      <div class="line">
        <div>
          <span>Every</span>
          <p class="faint small">Minutes the page must stay open. 0 turns passive income off.</p>
        </div>
        <span class="unit">
          <input class="input num" type="number" min="0" max="120" bind:value={passive.value} onfocus={passive.start} onblur={() => { set({ passiveMinutes: Number(passive.value) }); passive.end(); }} />
          <span class="faint">min</span>
        </span>
      </div>
      <div class="line">
        <div>
          <span>Keeps paying while away</span>
          <p class="faint small">Up to this many minutes after a guest closes the page. 0 = only while it is open.</p>
        </div>
        <span class="unit">
          <input class="input num" type="number" min="0" max="1440" step="5" bind:value={passiveAway.value} onfocus={passiveAway.start} onblur={() => { set({ passiveAwayMinutes: Number(passiveAway.value) }); passiveAway.end(); }} />
          <span class="faint">min</span>
        </span>
      </div>
    </div>
  {/if}
  {#each earn as [mod, items] (mod)}
    <div class="group">
      <span class="eyebrow">{moduleName(mod)}</span>
      {#each items as r (r.key)}
        <div class="line">
          <div>
            <span>{r.label}</span>
            <p class="faint small">{r.description}</p>
          </div>
          <AmountInput value={r.amount} oncommit={(v) => setEarn(r.key, v)} />
        </div>
      {/each}
    </div>
  {/each}
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
  .passive {
    display: grid;
    gap: 0.2rem;
    margin-bottom: 0.9rem;
    padding: 0.8rem 1rem;
    border-radius: 0.9rem;
    border: 1px solid color-mix(in srgb, var(--coin) 30%, var(--border));
    background: color-mix(in srgb, var(--coin) 6%, transparent);
  }
  .summary {
    margin: 0.1rem 0 0.3rem;
    font-size: 0.88rem;
  }
  .unit {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  .unit > .faint {
    min-width: 1.8rem;
  }
  .num {
    width: 6.5rem;
    text-align: right;
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
