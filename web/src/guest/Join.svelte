<script lang="ts">
  import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, Tv } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import type { NameCheck } from '$shared/protocol.ts';
  import { enterCode, hb, join, lastName, logout, rpc, toast } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import DigitInput from '$lib/ui/DigitInput.svelte';

  /**
   * One question per screen: the code on the TV, your name, then your PIN.
   * Knowing the name first lets the last step say "welcome back" or "choose a PIN".
   * After the host changes the code, a phone already in only asks for the new code.
   */
  type Step = 'code' | 'name' | 'pin';

  const params = new URLSearchParams(location.search);
  const codeFromLink = /^\d{4}$/.test(params.get('c') ?? '');
  let code = $state(codeFromLink ? params.get('c')! : '');
  let name = $state(lastName());
  let pin = $state('');
  let check = $state<NameCheck | null>(null);
  let showPin = $state(false);
  let step = $state<Step>(hb.codeFor || (hb.codeRequired && !codeFromLink) ? 'code' : 'name');
  let busy = $state(false);
  let error = $state('');
  let shake = $state(0);
  let back = $state(false);

  const steps = $derived<Step[]>(hb.codeFor ? ['code'] : hb.codeRequired ? ['code', 'name', 'pin'] : ['name', 'pin']);
  const canGoBack = $derived(!hb.codeFor && (step === 'pin' || (step === 'name' && hb.codeRequired)));

  function go(to: Step) {
    back = steps.indexOf(to) < steps.indexOf(step);
    error = '';
    step = to;
  }

  function fail(message: string) {
    error = message;
    shake++;
  }

  /** The code was wrong or outdated: ask for it again */
  function askCode(message = '') {
    code = '';
    go('code');
    if (message) fail(message);
  }

  // After a new session the code in the link is outdated: ask for it once per kick
  let kickHandled = '';
  $effect(() => {
    const reason = hb.kickedReason;
    if (!reason || reason === kickHandled) return;
    kickHandled = reason;
    if (untrack(() => hb.codeRequired && step !== 'code')) untrack(() => askCode());
  });

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
    } catch (err) {
      const message = (err as Error).message;
      if (/session code|wrong codes/i.test(message) && step !== 'code') askCode(message);
      else fail(message);
    } finally {
      busy = false;
    }
  }

  const submitCode = () =>
    run(async () => {
      if (!/^\d{4}$/.test(code)) return fail('Enter the 4 digits shown on the TV.');
      try {
        if (hb.codeFor) {
          await enterCode(code);
          if (codeFromLink) history.replaceState(null, '', location.pathname);
          return;
        }
        await rpc('core', 'checkCode', { code });
      } catch (err) {
        code = '';
        throw err;
      }
      go('name');
    });

  // Scanned the QR with the code in it: back in without typing
  if (hb.codeFor && codeFromLink) submitCode();

  const submitName = () =>
    run(async () => {
      if (name.trim().length < 2) return fail('Enter your name (at least 2 letters).');
      check = await rpc<NameCheck>('core', 'checkName', { code, name: name.trim() });
      name = check.name;
      pin = '';
      // Choosing a PIN: show it so it is easy to remember. Typing it again: hide it.
      showPin = !check.returning;
      go('pin');
    });

  const submitPin = () =>
    run(async () => {
      if (!/^\d{4}$/.test(pin)) return fail('The PIN has 4 digits.');
      try {
        const r = await join({ code, name, pin });
        if (r.returning) toast({ text: `Welcome back, ${r.me.name}`, kind: 'success' });
        else hb.offerAvatar = true;
        // Do not keep an old code in the address bar for the next visit
        if (codeFromLink) history.replaceState(null, '', location.pathname);
      } catch (err) {
        pin = '';
        const message = (err as Error).message;
        throw new Error(check?.returning && /check your PIN/i.test(message) ? 'Wrong PIN, try again.' : message);
      }
    });
</script>

<div class="join">
  <header class="hero">
    <span class="eyebrow">You are invited to</span>
    <h1>{hb.visitor?.appName ?? 'Homeboard'}</h1>
  </header>

  {#if hb.kickedReason}<p class="notice card">{hb.kickedReason}</p>{/if}

  <div class="card panel">
    <div class="top">
      {#if canGoBack}
        <button type="button" class="btn ghost small iconbtn" aria-label="Back" onclick={() => (step === 'pin' ? go('name') : askCode())}>
          <ArrowLeft size={18} />
        </button>
      {:else}
        <span class="iconbtn"></span>
      {/if}
      <div class="dots" aria-label={`Step ${steps.indexOf(step) + 1} of ${steps.length}`}>
        {#each steps as s (s)}<i class:on={steps.indexOf(s) <= steps.indexOf(step)}></i>{/each}
      </div>
      <span class="iconbtn"></span>
    </div>

    {#key step}
      <form novalidate class="step" in:fly={{ x: back ? -24 : 24, duration: 220 }} onsubmit={(e) => (e.preventDefault(), step === 'code' ? submitCode() : step === 'name' ? submitName() : submitPin())}>
        {#if step === 'code' && hb.codeFor}
          <div class="ask">
            <Avatar name={hb.codeFor.name} color={hb.codeFor.color} src={hb.codeFor.avatar} size="4.2rem" />
            <h2>New code, {hb.codeFor.name}</h2>
            <p class="dim">The host changed the code. Enter the one on the TV to get back in.</p>
          </div>
          <DigitInput bind:value={code} label="Session code" autofocus {shake} disabled={busy} oncomplete={submitCode} />
          <p class="faint small center">
            Not {hb.codeFor.name}? <button type="button" class="link" onclick={logout}>Use another name</button>
          </p>
        {:else if step === 'code'}
          <div class="ask">
            <span class="badge"><Tv size={22} /></span>
            <h2>Enter the code on the TV</h2>
            <p class="dim">The 4 digits under the QR code.</p>
          </div>
          <DigitInput bind:value={code} label="Session code" autofocus {shake} disabled={busy} oncomplete={submitCode} />
        {:else if step === 'name'}
          <div class="ask">
            <h2>What's your name?</h2>
            <p class="dim">This is how you appear on the TV.</p>
          </div>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="input big"
            bind:value={name}
            maxlength="20"
            placeholder="Your name"
            autocomplete="nickname"
            autocapitalize="words"
            enterkeyhint="next"
            autofocus
            oninput={() => (error = '')}
          />
        {:else if check?.returning}
          <div class="ask">
            <Avatar name={check.name} color={check.color ?? 'var(--accent)'} src={check.avatar} size="4.2rem" />
            <h2>Welcome back, {check.name}</h2>
            <p class="dim">Enter your PIN to continue.</p>
          </div>
          <DigitInput bind:value={pin} label="PIN" masked={!showPin} autofocus {shake} disabled={busy} oncomplete={submitPin} />
          <button type="button" class="link toggle" onclick={() => (showPin = !showPin)}>
            {#if showPin}<EyeOff size={16} /> Hide PIN{:else}<Eye size={16} /> Show PIN{/if}
          </button>
          <p class="faint small center">
            Not {check.name}? <button type="button" class="link" onclick={() => go('name')}>Use another name</button><br />
            Forgot your PIN? The host can set a new one.
          </p>
        {:else}
          <div class="ask">
            <h2>Choose a PIN, {name}</h2>
            <p class="dim">4 digits to log back in from another phone.</p>
          </div>
          <DigitInput bind:value={pin} label="New PIN" masked={!showPin} autofocus {shake} disabled={busy} />
          <button type="button" class="link toggle" onclick={() => (showPin = !showPin)}>
            {#if showPin}<EyeOff size={16} /> Hide PIN{:else}<Eye size={16} /> Show PIN{/if}
          </button>
          <p class="faint small center">Make up a new one, not the PIN of your bank card or phone.</p>
        {/if}

        <p class="error" role="alert">{error}</p>

        {#if step !== 'pin' || !check?.returning}
          <button class="btn primary block" disabled={busy || !hb.connected}>
            {#if !hb.connected}
              Connecting...
            {:else if busy}
              <LoaderCircle size={18} class="spin" />
            {:else if step === 'pin'}
              Join the party
            {:else}
              Continue <ArrowRight size={18} />
            {/if}
          </button>
        {:else if busy}
          <p class="faint center"><LoaderCircle size={18} class="spin" /></p>
        {/if}
      </form>
    {/key}
  </div>

  {#if step === 'name' && hb.codeRequired && codeFromLink}
    <p class="faint small center">Session code {code} · <button type="button" class="link" onclick={() => askCode()}>Change</button></p>
  {/if}
</div>

<style>
  .join {
    min-height: 100dvh;
    display: grid;
    align-content: center;
    gap: 1.4rem;
    padding: 2rem 1.25rem calc(2rem + env(safe-area-inset-bottom));
    max-width: 26rem;
    margin: 0 auto;
  }
  .hero {
    display: grid;
    gap: 0.35rem;
    text-align: center;
  }
  h1 {
    font-size: 2.6rem;
    letter-spacing: -0.04em;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding-bottom: 0.05em;
  }
  .panel {
    padding: 1rem 1.25rem 1.4rem;
    display: grid;
    gap: 0.6rem;
    overflow: hidden;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .iconbtn {
    width: 2.4rem;
    min-height: 2.4rem;
    padding: 0;
    color: var(--text-dim);
  }
  .dots {
    display: flex;
    gap: 0.4rem;
  }
  .dots i {
    width: 1.6rem;
    height: 0.3rem;
    border-radius: 999px;
    background: var(--border-strong);
    transition: background 0.25s ease;
  }
  .dots i.on {
    background: var(--accent);
  }
  .step {
    display: grid;
    gap: 1.1rem;
  }
  .ask {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
    text-align: center;
  }
  h2 {
    font-size: 1.45rem;
  }
  .ask p {
    font-size: 0.92rem;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    margin-bottom: 0.2rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }
  .big {
    font-size: 1.25rem;
    text-align: center;
    padding-block: 0.85rem;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    justify-self: center;
    gap: 0.4rem;
    margin-top: -0.4rem;
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .small {
    font-size: 0.82rem;
  }
  .center {
    text-align: center;
    line-height: 1.6;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .error {
    min-height: 1.3em;
    margin: -0.4rem 0 -0.5rem;
    text-align: center;
    color: var(--danger);
    font-size: 0.9rem;
  }
  .notice {
    padding: 0.8rem 1rem;
    font-size: 0.9rem;
  }
  .join :global(.spin) {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
