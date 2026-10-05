<script lang="ts">
  import { LockKeyhole } from '@lucide/svelte';
  import { adminLogin } from '$lib/client.svelte.ts';

  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await adminLogin(password);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="login">
  <form novalidate class="card" onsubmit={submit}>
    <span class="icon"><LockKeyhole size={24} /></span>
    <h1>Host access</h1>
    <p class="dim">
      Enter the admin password, or scan the pairing code from the admin screen on the PC. The password is printed in the server console.
    </p>
    <input class="input" type="password" bind:value={password} placeholder="Password" autocomplete="current-password" required />
    {#if error}<p class="error">{error}</p>{/if}
    <button class="btn primary block" disabled={busy}>Unlock</button>
  </form>
</div>

<style>
  .login {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 1.25rem;
  }
  form {
    width: min(24rem, 100%);
    padding: 1.6rem;
    display: grid;
    gap: 1rem;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }
  h1 {
    font-size: 1.6rem;
  }
  p {
    font-size: 0.9rem;
  }
  .error {
    color: var(--danger);
  }
</style>
