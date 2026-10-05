<script lang="ts">
  import { tick } from 'svelte';
  import { Camera, Eye, EyeOff, Sparkles, Trash2 } from '@lucide/svelte';
  import { ask } from '$lib/dialog.svelte.ts';
  import { avatarFlow } from './avatar.svelte.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';

  let name = $state(hb.me?.name ?? '');
  const changed = $derived(name.trim() !== hb.me?.name);

  async function removePicture() {
    if (await ask({ title: 'Remove your picture?', message: 'Your initials are shown instead.', confirm: 'Remove', danger: true })) {
      attempt(() => rpc('core', 'removeAvatar'), 'Picture removed');
    }
  }

  let pin = $state('');
  let showPin = $state(false);
  let editing = $state(false);
  let pinInput = $state<HTMLInputElement>();

  async function startEdit() {
    pin = '';
    editing = true;
    await tick();
    pinInput?.focus();
  }

  async function savePin(e: SubmitEvent) {
    e.preventDefault();
    const ok = await attempt(() => rpc('core', 'setPin', { pin }), 'PIN changed');
    if (ok) {
      editing = false;
      showPin = true;
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    await attempt(() => rpc('core', 'rename', { name }), 'Name updated');
  }
</script>

{#if hb.me}
  <div class="profile">
    <div class="card who">
      <div class="who-top">
        <Avatar name={hb.me.name} color={hb.me.color} src={hb.me.avatar} size="5rem" />
        <div>
          <h2>{hb.me.name}</h2>
          {#if hb.core?.economyEnabled}
            <p class="dim stats">Earned <Money amount={hb.me.earned} /> &middot; Spent <Money amount={hb.me.spent} /></p>
          {/if}
        </div>
      </div>
      <!-- Same buttons row with or without a picture, so nothing moves -->
      <div class="pic-actions">
        {#if hb.me.avatar}
          <button class="btn small" onclick={() => (avatarFlow.mode = 'edit')}><Sparkles size={16} /> Effects</button>
          <button class="btn small" onclick={() => (avatarFlow.mode = 'new')}><Camera size={16} /> Retake</button>
          <button class="btn small danger" onclick={removePicture}><Trash2 size={16} /> Remove</button>
        {:else}
          <button class="btn small primary" onclick={() => (avatarFlow.mode = 'new')}><Camera size={16} /> Take a selfie</button>
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

    <div class="card box">
      <span class="eyebrow">Your PIN</span>
      <p class="dim small">
        Closing this page is fine: this phone remembers you. On another phone or browser, join with the name <strong>{hb.me.name}</strong>
        and this PIN.
      </p>

      {#if editing}
        <form novalidate class="edit" onsubmit={savePin}>
          <input
            class="input mono pin"
            type="text"
            bind:value={pin}
            bind:this={pinInput}
            oninput={() => (pin = pin.replace(/\D/g, '').slice(0, 4))}
            inputmode="numeric"
            maxlength="4"
            placeholder="0000"
            autocomplete="off"
          />
          <p class="warn small">Make up a new one. Do not use a PIN you use elsewhere (bank card, phone lock).</p>
          <div class="row">
            <button class="btn primary" disabled={pin.length !== 4}>Save PIN</button>
            <button type="button" class="btn ghost" onclick={() => (editing = false)}>Cancel</button>
          </div>
        </form>
      {:else}
        <div class="current">
          {#if hb.me.pin}
            <span class="digits mono" class:hidden={!showPin} aria-label={showPin ? `PIN ${hb.me.pin}` : 'PIN hidden'}>{hb.me.pin}</span>
            <button class="btn ghost icon" onclick={() => (showPin = !showPin)} aria-label={showPin ? 'Hide PIN' : 'Show PIN'}>
              {#if showPin}<EyeOff size={20} />{:else}<Eye size={20} />{/if}
            </button>
          {:else}
            <span class="dim small">Your PIN was chosen before it could be shown here. Change it once and it will appear, with the eye to reveal it.</span>
          {/if}
          <span class="spacer"></span>
          <button class="btn" onclick={startEdit}>Change</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .profile {
    display: grid;
    gap: 1rem;
  }
  .who {
    display: grid;
    gap: 1rem;
    padding: 1.2rem;
  }
  .who-top {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .pic-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
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
  .current {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .digits {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    transition: filter 0.2s ease;
    user-select: none;
  }
  .digits.hidden {
    filter: blur(9px);
  }
  .icon {
    padding: 0;
    width: 2.6rem;
  }
  .edit {
    display: grid;
    gap: 0.7rem;
  }
  .small {
    font-size: 0.86rem;
  }
</style>
