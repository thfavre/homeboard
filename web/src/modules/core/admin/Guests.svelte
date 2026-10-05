<script lang="ts">
  import { ChevronDown, Minus, Plus, UserX } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import AmountInput from '$lib/ui/AmountInput.svelte';
  import { ago } from '$lib/time.ts';

  const guests = $derived(hb.core?.admin?.guests ?? []);
  let open = $state<string | null>(null);
  let amount = $state(1000);
  let reason = $state('');
  let newName = $state('');

  function toggle(id: string, name: string) {
    open = open === id ? null : id;
    newName = name;
    reason = '';
  }

  const give = (guestId: string, sign: 1 | -1) =>
    attempt(() => rpc('core', 'give', { guestId, amount: amount * sign, reason }), sign > 0 ? 'Sent' : 'Taken');

  function kick(guestId: string, name: string) {
    if (confirm(`Remove ${name} from the session? Their balance is lost.`)) attempt(() => rpc('core', 'kick', { guestId }), 'Removed');
  }
</script>

<div class="card list">
  {#each guests as g (g.id)}
    <div class="guest">
      <button class="head" onclick={() => toggle(g.id, g.name)}>
        <Avatar name={g.name} color={g.color} />
        <div class="who">
          <span class="name truncate">{g.name}</span>
          <span class="faint meta">
            {#if g.online}<span class="online">Online</span>{:else}Seen {ago(g.lastSeen)}{/if}
            &middot; key <span class="mono">{g.rejoinKey}</span>
          </span>
        </div>
        <Money amount={g.balance} />
        <ChevronDown size={18} class={open === g.id ? 'chev up' : 'chev'} />
      </button>

      {#if open === g.id}
        <div class="details" transition:slide={{ duration: 180 }}>
          <div class="stats faint">Earned <Money amount={g.earned} /> &middot; Spent <Money amount={g.spent} /></div>
          <div class="row wrap">
            <AmountInput value={amount} oncommit={(v) => (amount = v)} />
            <input class="input reason" bind:value={reason} placeholder="Reason (optional)" maxlength="60" />
          </div>
          <div class="row wrap">
            <button class="btn primary small" onclick={() => give(g.id, 1)}><Plus size={16} /> Give</button>
            <button class="btn small" onclick={() => give(g.id, -1)}><Minus size={16} /> Take</button>
          </div>
          <div class="row wrap">
            <input class="input" bind:value={newName} maxlength="20" />
            <button class="btn small" onclick={() => attempt(() => rpc('core', 'renameGuest', { guestId: g.id, name: newName }), 'Renamed')}>
              Rename
            </button>
          </div>
          <div><button class="btn danger small" onclick={() => kick(g.id, g.name)}><UserX size={16} /> Remove from session</button></div>
        </div>
      {/if}
    </div>
  {:else}
    <p class="empty">No guests yet. They join by scanning the code on the TV.</p>
  {/each}
</div>

<style>
  .list {
    padding: 0.3rem 0;
  }
  .guest {
    border-bottom: 1px solid var(--border);
  }
  .guest:last-child {
    border-bottom: 0;
  }
  .head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.8rem 1rem;
    background: none;
    border: 0;
    text-align: left;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .name {
    font-weight: 600;
  }
  .meta {
    font-size: 0.8rem;
  }
  .online {
    color: var(--success);
  }
  .head :global(.chev) {
    color: var(--text-faint);
    transition: transform 0.2s ease;
  }
  .head :global(.chev.up) {
    transform: rotate(180deg);
  }
  .details {
    display: grid;
    gap: 0.7rem;
    padding: 0 1rem 1rem 4rem;
  }
  .stats {
    font-size: 0.85rem;
  }
  .wrap {
    flex-wrap: wrap;
  }
  .reason {
    flex: 1;
    min-width: 10rem;
  }
  .row .input:not(.reason) {
    flex: 1;
    min-width: 8rem;
  }
  @media (max-width: 600px) {
    .details {
      padding-left: 1rem;
    }
  }
</style>
