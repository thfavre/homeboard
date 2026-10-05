<script lang="ts">
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';

  let name = $state(hb.me?.name ?? '');
  const changed = $derived(name.trim() !== hb.me?.name);

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

    <form class="card box" onsubmit={save}>
      <label class="field">
        <span>Display name</span>
        <input class="input" bind:value={name} maxlength="20" />
      </label>
      <button class="btn primary" disabled={!changed}>Save</button>
    </form>

    <div class="card box">
      <span class="eyebrow">Rejoin key</span>
      <div class="key mono">{hb.me.rejoinKey}</div>
      <p class="dim small">
        Closing this page is fine: this phone remembers you. If you switch phone or browser, join with the same name and this key to get
        your account back.
      </p>
    </div>
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
  .key {
    font-size: 2.2rem;
    font-weight: 700;
    letter-spacing: 0.3em;
  }
  .small {
    font-size: 0.86rem;
  }
</style>
