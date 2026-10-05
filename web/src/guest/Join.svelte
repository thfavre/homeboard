<script lang="ts">
  import { tick } from 'svelte';
  import { Eye, EyeOff, TriangleAlert } from '@lucide/svelte';
  import { hb, join, lastName, toast } from '$lib/client.svelte.ts';

  const params = new URLSearchParams(location.search);
  const codeFromLink = !!params.get('c');
  let code = $state(params.get('c') ?? '');
  let name = $state(lastName());
  let pin = $state('');
  let showPin = $state(false);
  let busy = $state(false);
  let error = $state('');
  // A code from the QR link is shown read-only until it turns out to be wrong
  let editCode = $state(!codeFromLink);
  let codeInput = $state<HTMLInputElement>();

  async function changeCode(clear = true) {
    editCode = true;
    if (clear) code = '';
    await tick();
    codeInput?.focus();
  }

  // After a new session the code in the link is outdated
  $effect(() => {
    if (hb.kickedReason && codeFromLink && !editCode) changeCode();
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (hb.codeRequired && !/^\d{4}$/.test(code.trim())) {
      error = 'Enter the 4-digit session code shown on the TV.';
      if (!editCode) changeCode();
      return;
    }
    if (name.trim().length < 2) {
      error = 'Enter your name (at least 2 characters).';
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      error = 'Choose a PIN of exactly 4 digits.';
      return;
    }
    busy = true;
    try {
      const r = await join({ code: code.trim(), name, pin });
      if (r.returning) toast({ text: `Welcome back, ${r.me.name}`, kind: 'success' });
      // Do not keep an old code in the address bar for the next visit
      if (codeFromLink) history.replaceState(null, '', location.pathname);
    } catch (err) {
      error = (err as Error).message;
      if (/session code/i.test(error)) changeCode();
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

  <form novalidate class="card form" onsubmit={submit}>
    {#if hb.codeRequired}
      {#if editCode}
        <label class="field">
          <span>Session code (shown on the TV)</span>
          <input
            class="input code mono"
            bind:this={codeInput}
            bind:value={code}
            oninput={() => (error = '')}
            inputmode="numeric"
            maxlength="4"
            placeholder="0000"
            autocomplete="off"
            required
          />
        </label>
      {:else}
        <div class="code-line">
          <span class="dim">Session code</span>
          <span class="mono value">{code}</span>
          <span class="spacer"></span>
          <button type="button" class="btn ghost small" onclick={() => changeCode(false)}>Change</button>
        </div>
      {/if}
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
        oninput={() => (error = '')}
      />
    </label>

    <label class="field">
      <span>Choose a 4-digit PIN</span>
      <div class="pin-row">
        <input
          class="input mono pin"
          type={showPin ? 'text' : 'password'}
          bind:value={pin}
          oninput={() => (pin = pin.replace(/\D/g, '').slice(0, 4))}
          inputmode="numeric"
          maxlength="4"
          placeholder="0000"
          autocomplete="off"
          required
        />
        <button type="button" class="btn ghost eye" onclick={() => (showPin = !showPin)} aria-label={showPin ? 'Hide PIN' : 'Show PIN'}>
          {#if showPin}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
        </button>
      </div>
    </label>

    <div class="help">
      <p>To come back from another phone or browser, enter the <strong>same name</strong> and this <strong>PIN</strong>.</p>
      <p class="warn">
        <TriangleAlert size={16} />
        <span>Make up a new one. Do not use a PIN you use elsewhere (bank card, phone lock).</span>
      </p>
    </div>

    {#if error}<p class="error">{error}</p>{/if}

    <button class="btn primary block" disabled={busy || !hb.connected}>
      {#if !hb.connected}Connecting...{:else}Join{/if}
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
  .code-line {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.4rem 0.35rem 0.95rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.9rem;
  }
  .code-line .value {
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: 0.25em;
  }
  .pin-row {
    position: relative;
  }
  .pin {
    font-size: 1.3rem;
    letter-spacing: 0.5em;
    padding-right: 3rem;
  }
  .eye {
    position: absolute;
    right: 0.2rem;
    top: 50%;
    translate: 0 -50%;
    padding: 0;
    width: 2.6rem;
    min-height: 2.4rem;
    color: var(--text-dim);
  }
  .help {
    display: grid;
    gap: 0.5rem;
    padding: 0.8rem 0.9rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .help strong {
    color: var(--text);
  }
  .warn {
    display: flex;
    gap: 0.5rem;
    color: var(--warning);
  }
  .warn :global(svg) {
    flex: none;
    margin-top: 0.1rem;
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
