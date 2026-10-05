<script lang="ts">
  import { ask } from '$lib/dialog.svelte.ts';
  import { ChevronRight, Minus, Plus, UserX } from '@lucide/svelte';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import AmountInput from '$lib/ui/AmountInput.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { ago } from '$lib/time.ts';

  // In joining order, so a new guest is added at the end and the list does not jump
  const guests = $derived([...(hb.core?.admin?.guests ?? [])].sort((a, b) => a.joinedAt - b.joinedAt));
  const openGuest = $derived(guests.find((g) => g.id === open));
  let open = $state<string | null>(null);
  let amount = $state(1000);
  let reason = $state('');
  let newName = $state('');
  let newPin = $state('');

  /** For a guest who forgot their PIN */
  async function setPin(guestId: string) {
    const ok = await attempt(() => rpc('core', 'setGuestPin', { guestId, pin: newPin }), 'PIN set');
    if (ok) newPin = '';
  }

  function toggle(id: string, name: string) {
    open = id;
    newName = name;
    reason = '';
  }

  const give = (guestId: string, sign: 1 | -1) =>
    attempt(() => rpc('core', 'give', { guestId, amount: amount * sign, reason }), sign > 0 ? 'Sent' : 'Taken');

  async function kick(guestId: string, name: string) {
    if (await ask({ title: `Remove ${name}?`, message: 'They leave the session and their balance is lost.', confirm: 'Remove', danger: true })) attempt(() => rpc('core', 'kick', { guestId }), 'Removed');
  }
</script>

{#if openGuest}
  {@const g = openGuest}
  <Sheet title={g.name} onclose={() => (open = null)}>
    <div class="details">
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
          <div class="row wrap">
            <input
              class="input mono"
              type="password"
              bind:value={newPin}
              oninput={() => (newPin = newPin.replace(/\D/g, '').slice(0, 4))}
              inputmode="numeric"
              maxlength="4"
              placeholder="New PIN"
              autocomplete="off"
            />
            <button class="btn small" disabled={newPin.length !== 4} onclick={() => setPin(g.id)}>Set PIN</button>
          </div>
          <div class="row wrap">
            <button class="btn small" disabled={!g.avatar} onclick={() => attempt(() => rpc('core', 'removeGuestAvatar', { guestId: g.id }), 'Picture removed')}>
              Remove picture
            </button>
            <button class="btn danger small" onclick={() => kick(g.id, g.name)}><UserX size={16} /> Remove from session</button>
          </div>
    </div>
  </Sheet>
{/if}

<div class="card list">
  {#each guests as g (g.id)}
    <div class="guest">
      <button class="head" onclick={() => toggle(g.id, g.name)}>
        <Avatar name={g.name} color={g.color} id={g.id} />
        <div class="who">
          <span class="name truncate">{g.name}</span>
          <span class="faint meta">
            {#if g.online}<span class="online">Online</span>{:else}Seen {ago(g.lastSeen)}{/if}
            &middot; {g.hasPin ? 'PIN set' : 'no PIN'}
          </span>
        </div>
        <Money amount={g.balance} />
        <ChevronRight size={18} class="chev" />
      </button>


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
  .details {
    display: grid;
    gap: 0.8rem;
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
</style>
