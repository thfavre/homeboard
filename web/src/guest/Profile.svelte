<script lang="ts">
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';

  let name = $state(hb.me?.name ?? '');
  const changed = $derived(name.trim() !== hb.me?.name);

  let pin = $state('');

  async function savePin(e: SubmitEvent) {
    e.preventDefault();
    const ok = await attempt(() => rpc('core', 'setPin', { pin }), 'PIN changed');
    if (ok) pin = '';
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    await attempt(() => rpc('core', 'rename', { name }), 'Name updated');
  }
</script>

{#if hb.me}
  <div class="profile">
    <div class="card who">
      <Avatar name={hb.me.name} color={hb.me.color} size="4rem" />
      <div>
        <h2>{hb.me.name}</h2>
        {#if hb.core?.economyEnabled}
          <p class="dim stats">Earned <Money amount={hb.me.earned} /> &middot; Spent <Money amount={hb.me.spent} /></p>
        {/if}
      </div>
    </div>

    <form novalidate class="card box" onsubmit={save}>
      <label class="field">
        <span>Display name</span>
        <input class="input" bind:value={name} maxlength="20" />
      </label>
      <button class="btn primary" disabled={!changed}>Save</button>
    </form>

    <form novalidate class="card box" onsubmit={savePin}>
      <span class="eyebrow">Your PIN</span>
      <p class="dim small">
        Closing this page is fine: this phone remembers you. On another phone or browser, join with the name <strong>{hb.me.name}</strong>
        and your PIN.
      </p>
      <label class="field">
        <span>New PIN (4 digits)</span>
        <input
          class="input mono pin"
          type="password"
          bind:value={pin}
          oninput={() => (pin = pin.replace(/\D/g, '').slice(0, 4))}
          inputmode="numeric"
          maxlength="4"
          placeholder="0000"
          autocomplete="off"
        />
      </label>
      <p class="warn small">Do not use a PIN you use elsewhere (bank card, phone lock).</p>
      <button class="btn" disabled={pin.length !== 4}>Change PIN</button>
    </form>
  </div>
{/if}

<style>
  .profile {
    display: grid;
    gap: 1rem;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.2rem;
  }
  .who h2 {
    font-size: 1.5rem;
  }
  .stats {
    font-size: 0.88rem;
    margin-top: 0.2rem;
  }
  .box {
    padding: 1.2rem;
    display: grid;
    gap: 0.8rem;
  }
  .pin {
    font-size: 1.3rem;
    letter-spacing: 0.5em;
  }
  .warn {
    color: var(--warning);
  }
  .small {
    font-size: 0.86rem;
  }
</style>
