<script lang="ts">
  import { Gift, Clock, Trophy, Sparkles } from '@lucide/svelte';
  import type { LedgerEntry } from '$shared/protocol.ts';
  import { hb, rpc } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import { ago } from '$lib/time.ts';

  let history = $state<LedgerEntry[]>([]);

  // Refresh the history every time the balance moves
  $effect(() => {
    void hb.me?.balance;
    rpc<LedgerEntry[]>('core', 'history').then((h) => (history = h)).catch(() => {});
  });

  const icons: Record<string, typeof Gift> = { core: Clock };
  const currency = $derived(hb.core?.currency);
</script>

<div class="earn">
  <div class="card balance">
    <span class="eyebrow">Your {currency?.name}</span>
    <div class="amount"><Money amount={hb.me?.balance ?? 0} /></div>
    <p class="dim">Spend them on music, drawing, lights and more. Here is how to get more.</p>
  </div>

  <div class="rules">
    {#each hb.core?.earn ?? [] as r (r.key)}
      {@const Icon = icons[r.module] ?? Trophy}
      <div class="rule card">
        <span class="icon"><Icon size={20} /></span>
        <div class="text">
          <strong>{r.label}</strong>
          <span class="dim">{r.description}</span>
        </div>
        <span class="value"><Money amount={r.amount} sign /></span>
      </div>
    {/each}
    <div class="rule card">
      <span class="icon"><Gift size={20} /></span>
      <div class="text">
        <strong>Host surprises</strong>
        <span class="dim">The host can make it rain or hand out bonuses at any time. Stay close.</span>
      </div>
      <span class="value"><Sparkles size={18} /></span>
    </div>
  </div>

  <h3 class="eyebrow history-title">History</h3>
  <div class="card history">
    {#each history as e (e.id)}
      <div class="entry">
        <div class="text">
          <span>{e.reason}</span>
          <span class="faint when">{ago(e.at)}</span>
        </div>
        <span class="mono delta" class:plus={e.amount > 0}><Money amount={e.amount} sign /></span>
      </div>
    {:else}
      <p class="empty">Nothing yet</p>
    {/each}
  </div>
</div>

<style>
  .earn {
    display: grid;
    gap: 1rem;
  }
  .balance {
    padding: 1.3rem;
    display: grid;
    gap: 0.4rem;
  }
  .amount {
    font-size: 2.6rem;
    line-height: 1.1;
  }
  .balance p {
    font-size: 0.9rem;
  }
  .rules {
    display: grid;
    gap: 0.6rem;
  }
  .rule {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.9rem 1rem;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.8rem;
    background: color-mix(in srgb, var(--coin) 16%, transparent);
    color: var(--coin);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.1rem;
    font-size: 0.9rem;
  }
  .text strong {
    font-size: 0.98rem;
  }
  .value {
    color: var(--success);
    font-size: 0.95rem;
  }
  .history-title {
    margin-top: 0.5rem;
  }
  .history {
    padding: 0.3rem 1rem;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
  }
  .entry:last-child {
    border-bottom: 0;
  }
  .when {
    font-size: 0.78rem;
  }
  .delta {
    color: var(--text-dim);
  }
  .delta.plus {
    color: var(--success);
  }
</style>
