<script lang="ts">
  import { LogOut, RefreshCw, Smartphone, TriangleAlert } from '@lucide/svelte';
  import { hb, rpc, attempt, adminLogout } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import Qr from '$lib/ui/Qr.svelte';

  const admin = $derived(hb.core!.admin!);
  let pair = $state<{ url: string; qrSvg: string } | null>(null);
  let password = $state<string | null>(null);
  let newPassword = $state('');

  // The password is only readable from the PC itself
  rpc<{ password: string }>('core', 'security')
    .then((r) => (password = r.password))
    .catch(() => (password = null));

  const set = (args: Record<string, unknown>) => attempt(() => rpc('core', 'setGeneral', args));

  function newSession() {
    if (confirm('Start a new session? All guests, balances and history are cleared.')) {
      attempt(() => rpc('core', 'newSession'), 'New session started');
    }
  }
</script>

<Section title="Control from your phone" hint="Scan this with your phone to open the host screen there. Anyone who scans it becomes a host, so keep it private.">
  {#if pair}
    <div class="pair">
      <Qr svg={pair.qrSvg} size="11rem" />
      <p class="faint mono url">{pair.url.replace(/#.*/, '')}</p>
    </div>
  {/if}
  <div>
    <button class="btn primary" onclick={async () => (pair = (await attempt(() => rpc('core', 'pair'))) ?? null)}>
      <Smartphone size={18} /> Show pairing code
    </button>
  </div>
</Section>

<Section title="Public link" hint="A free Cloudflare tunnel lets guests join from any network. The address changes when the server restarts.">
  <div class="line">
    <span class="dim">Status</span>
    <span class="pill" class:success={admin.tunnel === 'up'} class:danger={admin.tunnel === 'error'}>{admin.tunnel}</span>
  </div>
  <div class="line">
    <span class="dim">Public</span>
    <span class="mono small">{admin.publicUrl ?? 'Not available'}</span>
  </div>
  <div class="line">
    <span class="dim">Home Wi-Fi</span>
    <span class="mono small">{admin.lanUrl}</span>
  </div>
  <div>
    <button class="btn small" onclick={() => attempt(() => rpc('core', 'restartTunnel'), 'Restarting tunnel')}>
      <RefreshCw size={15} /> Restart tunnel
    </button>
  </div>
</Section>

<Section title="Joining">
  <div class="line">
    <div>
      <strong>Require session code</strong>
      <p class="faint small">Stops people who only have the link.</p>
    </div>
    <Toggle checked={admin.requireCode} label="Require code" onchange={(v) => set({ requireCode: v })} />
  </div>
  <div class="line">
    <div>
      <strong>Put the code in the QR</strong>
      <p class="faint small">Scanning the TV joins directly. Typing the link still asks for the code.</p>
    </div>
    <Toggle checked={admin.qrIncludesCode} label="Code in QR" onchange={(v) => set({ qrIncludesCode: v })} />
  </div>
</Section>

{#if password !== null}
  <Section title="Admin password" hint="Visible only on the PC.">
    <div class="line">
      <span class="dim">Current</span>
      <span class="mono">{password}</span>
    </div>
    <div class="row">
      <input class="input" bind:value={newPassword} placeholder="New password" />
      <button
        class="btn"
        onclick={async () => {
          const ok = await attempt(() => rpc('core', 'setPassword', { password: newPassword, logoutAll: true }), 'Password changed, other devices logged out');
          if (ok !== undefined) password = newPassword;
        }}>Change</button
      >
    </div>
  </Section>
{/if}

<Section title="Session">
  <div class="row wrap">
    <button class="btn danger" onclick={newSession}><TriangleAlert size={18} /> New session</button>
    <button class="btn ghost" onclick={adminLogout}><LogOut size={18} /> Log out this device</button>
  </div>
</Section>

<style>
  .pair {
    display: grid;
    justify-items: start;
    gap: 0.6rem;
  }
  .url {
    font-size: 0.75rem;
    word-break: break-all;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .small {
    font-size: 0.82rem;
    word-break: break-all;
  }
  .wrap {
    flex-wrap: wrap;
  }
</style>
