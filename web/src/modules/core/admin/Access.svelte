<script lang="ts">
  import { ask } from '$lib/dialog.svelte.ts';
  import { LogOut, RefreshCw, Smartphone, TriangleAlert } from '@lucide/svelte';
  import { hb, rpc, attempt, adminLogout } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import Qr from '$lib/ui/Qr.svelte';
  import Secret from '$lib/ui/Secret.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';

  const admin = $derived(hb.core!.admin!);
  let pair = $state<{ url: string; qrSvg: string } | null>(null);
  let password = $state<string | null>(null);
  let newPassword = $state('');
  let domain = $state(hb.core!.admin!.tunnelDomain);
  let tunnelName = $state(hb.core!.admin!.tunnelName || 'homeboard');

  // The password is only readable from the PC itself
  rpc<{ password: string }>('core', 'security')
    .then((r) => (password = r.password))
    .catch(() => (password = null));

  const set = (args: Record<string, unknown>) => attempt(() => rpc('core', 'setGeneral', args));

  async function newSession() {
    if (await ask({ title: 'Start a new session?', message: 'All guests, balances and history are cleared.', confirm: 'Start new session', danger: true })) {
      attempt(() => rpc('core', 'newSession'), 'New session started');
    }
  }
</script>

<Section title="Control from your phone" hint="Scan this with your phone to open the host screen there. Anyone who scans it becomes a host, so keep it private.">
  <div>
    <button class="btn primary" onclick={async () => (pair = (await attempt(() => rpc('core', 'pair'))) ?? null)}>
      <Smartphone size={18} /> Show pairing code
    </button>
  </div>
</Section>

{#if pair}
  <Sheet title="Scan with your phone" onclose={() => (pair = null)}>
    <div class="pair">
      <Qr svg={pair.qrSvg} size="14rem" />
      <p class="faint mono url">{pair.url.replace(/#.*/, '')}</p>
      <p class="dim small">Anyone who scans this becomes a host, so keep it private.</p>
    </div>
  </Sheet>
{/if}

<Section
  title="Public link"
  hint={admin.tunnelDomain
    ? 'A Cloudflare tunnel on your own domain lets guests join from any network. The address never changes.'
    : 'A free Cloudflare tunnel lets guests join from any network. The address changes when the server restarts, unless you set your own domain below.'}
>
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

<Section
  title="Own domain"
  hint="Create the tunnel once on this PC with cloudflared (tunnel login, tunnel create, tunnel route dns), then enter its name and domain. Leave the domain empty to go back to a random address."
>
  <div class="row wrap">
    <input class="input" bind:value={domain} placeholder="homeboard.online" aria-label="Domain" />
    <input class="input" bind:value={tunnelName} placeholder="Tunnel name" aria-label="Tunnel name" />
    <button
      class="btn"
      onclick={() => attempt(() => rpc('core', 'setDomain', { domain, name: tunnelName }), domain.trim() ? 'Domain saved, tunnel restarting' : 'Back to a random address')}
      >Save</button
    >
  </div>
</Section>

<Section title="Joining">
  <div class="line">
    <div>
      <strong>Require session code</strong>
      <p class="faint small">Stops people who only have the link. A new code makes every guest enter it again (their account is kept).</p>
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
      <Secret value={password} label="password" />
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
    justify-items: center;
    gap: 0.8rem;
    text-align: center;
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
