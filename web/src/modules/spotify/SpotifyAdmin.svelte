<script lang="ts">
  import { Copy, ExternalLink, Pause, Play, SkipBack, SkipForward, Unplug } from '@lucide/svelte';
  import type { SpotifyState } from '$shared/spotify.ts';
  import { hb, rpc, attempt, toast } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import Cover from './Cover.svelte';

  const mod = $derived(hb.modules.spotify as SpotifyState | undefined);
  const a = $derived(mod?.admin);
  let clientId = $state(hb.modules.spotify?.admin?.clientId ?? '');
  let volume = $state(hb.modules.spotify?.admin?.volume ?? 50);

  async function connect() {
    const url = await attempt(() => rpc<string>('spotify', 'authUrl'));
    if (url) location.href = url;
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => toast({ text: 'Copied', kind: 'success' }));
  }

  const set = (args: Record<string, unknown>) => attempt(() => rpc('spotify', 'setOptions', args));
  const control = (method: string, args?: unknown) => attempt(() => rpc('spotify', method, args));
</script>

{#if mod && a}
  {#if a.error}<p class="card error">{a.error}</p>{/if}

  {#if mod.connected}
    <Section title="Playback" hint={a.device ? `Playing on ${a.device}` : 'Start playing on a device (PC, phone or speaker) so guests can add songs.'}>
      {#snippet actions()}
        <span class="pill success">{a.account}{a.premium ? '' : ' (not Premium)'}</span>
      {/snippet}
      {#if mod.now}
        <div class="np">
          <Cover src={mod.now.image} size="4rem" />
          <div class="grow">
            <strong>{mod.now.title}</strong>
            <p class="dim small">{mod.now.artists}</p>
          </div>
        </div>
      {/if}
      <div class="row">
        <button class="btn" aria-label="Previous" onclick={() => control('previous')}><SkipBack size={18} /></button>
        {#if mod.now?.isPlaying}
          <button class="btn primary" aria-label="Pause" onclick={() => control('pause')}><Pause size={18} /></button>
        {:else}
          <button class="btn primary" aria-label="Play" onclick={() => control('play')}><Play size={18} /></button>
        {/if}
        <button class="btn" aria-label="Next" onclick={() => control('next')}><SkipForward size={18} /></button>
      </div>
      {#if a.volume !== null}
        <label class="field">
          <span>Volume {volume}%</span>
          <input type="range" min="0" max="100" bind:value={volume} onchange={() => control('volume', { volume })} />
        </label>
      {/if}
    </Section>

    <Section title="Rules">
      <div class="line">
        <div>
          <strong>Explicit songs</strong>
          <p class="faint small">Hide songs marked explicit from search.</p>
        </div>
        <Toggle checked={a.allowExplicit} label="Explicit songs" onchange={(v) => set({ allowExplicit: v })} />
      </div>
      <div class="line">
        <div>
          <strong>Guests can skip</strong>
          <p class="faint small">Skipping costs money (price in Economy).</p>
        </div>
        <Toggle checked={mod.allowSkip} label="Guests can skip" onchange={(v) => set({ allowSkip: v })} />
      </div>
      <div class="line">
        <div>
          <strong>Lower music during sounds</strong>
          <p class="faint small">When a soundboard sound plays, Spotify volume drops for a few seconds.</p>
        </div>
        <Toggle checked={a.duck} label="Lower music" onchange={(v) => set({ duck: v })} />
      </div>
    </Section>

    <Section title="Account">
      <div>
        <button class="btn danger small" onclick={() => confirm('Disconnect Spotify?') && control('disconnect')}><Unplug size={16} /> Disconnect</button>
      </div>
    </Section>
  {:else}
    <Section title="Connect Spotify" hint="One-time setup, about two minutes. Needs Spotify Premium.">
      <ol class="steps">
        <li>
          Open the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify developer dashboard <ExternalLink size={13} /></a> and
          create an app (any name). Select <strong>Web API</strong>.
        </li>
        <li>
          Add this Redirect URI:
          <button class="uri mono" onclick={() => copy(a.redirectUri)}>{a.redirectUri} <Copy size={13} /></button>
        </li>
        <li>
          Paste the app <strong>Client ID</strong> here:
          <div class="row">
            <input class="input mono" bind:value={clientId} placeholder="32 characters" />
            <button class="btn" onclick={() => attempt(() => rpc('spotify', 'setClientId', { clientId }), 'Saved')}>Save</button>
          </div>
        </li>
        <li>
          Click Connect <strong>on the PC</strong> and log in with your Spotify account.
          <div><button class="btn primary" disabled={!a.clientId} onclick={connect}>Connect Spotify</button></div>
        </li>
      </ol>
    </Section>
  {/if}
{/if}

<style>
  .error {
    padding: 0.8rem 1rem;
    color: var(--danger);
    font-size: 0.9rem;
  }
  .np {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .small {
    font-size: 0.82rem;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .steps {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 1rem;
  }
  .steps li {
    padding-left: 0.3rem;
    display: grid;
    gap: 0.5rem;
  }
  .uri {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-size: 0.82rem;
    word-break: break-all;
    text-align: left;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
</style>
