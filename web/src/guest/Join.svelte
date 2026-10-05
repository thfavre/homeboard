<script lang="ts">
  import { hb, join, lastName } from '$lib/client.svelte.ts';

  const params = new URLSearchParams(location.search);
  const codeFromLink = !!params.get('c');
  let code = $state(params.get('c') ?? '');
  let name = $state(lastName());
  let key = $state('');
  let nameTaken = $state(false);
  let busy = $state(false);
  let error = $state('');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await join({ code, name, key: nameTaken && key ? key : undefined });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NAME_TAKEN') nameTaken = true;
      else error = msg;
    } finally {
      busy = false;
    }
  }
</script>

<div class="join">
  <div class="hero">
    <span class="eyebrow">You are invited to</span>
    <h1>{hb.visitor?.appName ?? 'Homeboard'}</h1>
    <p class="dim">Play music, draw on the TV, light up the room. Everything happens on the big screen.</p>
  </div>

  {#if hb.kickedReason}<p class="notice card">{hb.kickedReason}</p>{/if}

  <form class="card form" onsubmit={submit}>
    {#if hb.codeRequired && !codeFromLink}
      <label class="field">
        <span>Session code (shown on the TV)</span>
        <input class="input code mono" bind:value={code} inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="off" required />
      </label>
    {/if}
    <label class="field">
      <span>Your name</span>
      <input
        class="input"
        bind:value={name}
        maxlength="20"
        placeholder="How should we call you?"
        autocomplete="nickname"
        required
        oninput={() => (nameTaken = false)}
      />
    </label>

    {#if nameTaken}
      <div class="taken">
        <p><strong>{name}</strong> is already at the party.</p>
        <p class="dim">
          If that is you on another phone, enter your rejoin key (in your profile on the other phone, or ask the host). Otherwise pick
          another name.
        </p>
        <label class="field">
          <span>Rejoin key</span>
          <input class="input mono key" bind:value={key} maxlength="4" placeholder="ABCD" autocomplete="off" />
        </label>
      </div>
    {/if}

    {#if error}<p class="error">{error}</p>{/if}

    <button class="btn primary block" disabled={busy || !hb.connected}>
      {#if !hb.connected}Connecting...{:else if nameTaken && key}Rejoin{:else}Join{/if}
    </button>
  </form>
</div>

<style>
  .join {
    min-height: 100dvh;
    display: grid;
    align-content: center;
    gap: 1.5rem;
    padding: 2rem 1.25rem calc(2rem + env(safe-area-inset-bottom));
    max-width: 26rem;
    margin: 0 auto;
  }
  .hero {
    display: grid;
    gap: 0.6rem;
  }
  h1 {
    font-size: 2.8rem;
    letter-spacing: -0.04em;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding-bottom: 0.05em;
  }
  .form {
    padding: 1.25rem;
    display: grid;
    gap: 1rem;
  }
  .code {
    font-size: 1.6rem;
    letter-spacing: 0.5em;
    text-align: center;
    padding-left: 0.5em;
  }
  .key {
    letter-spacing: 0.3em;
    text-transform: uppercase;
  }
  .taken {
    display: grid;
    gap: 0.6rem;
    font-size: 0.9rem;
    padding: 0.9rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
  }
  .notice {
    padding: 0.8rem 1rem;
    font-size: 0.9rem;
  }
</style>
