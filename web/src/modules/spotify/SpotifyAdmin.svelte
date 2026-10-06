<script lang="ts">
  import { ask } from '$lib/dialog.svelte.ts';
  import { ArrowDown, ArrowUp, Copy, ExternalLink, ListMusic, Lock, Pause, Play, SkipBack, SkipForward, Trash2, Unplug } from '@lucide/svelte';
  import type { SpotifyState, Track } from '$shared/spotify.ts';
  import { hb, rpc, attempt, toast } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import Cover from './Cover.svelte';
  import Ducking from './Ducking.svelte';
  import { Synced } from '$lib/synced.svelte.ts';

  const mod = $derived(hb.modules.spotify as SpotifyState | undefined);
  const a = $derived(mod?.admin);
  const clientId = new Synced(() => hb.modules.spotify?.admin?.clientId, '');
  const volume = new Synced(() => hb.modules.spotify?.admin?.volume, 50);

  async function connect() {
    const url = await attempt(() => rpc<string>('spotify', 'authUrl'));
    if (url) location.href = url;
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => toast({ text: 'Copied', kind: 'success' }));
  }

  const set = (args: Record<string, unknown>) => attempt(() => rpc('spotify', 'setOptions', args));
  const control = (method: string, args?: unknown) => attempt(() => rpc('spotify', method, args));

  const queue = $derived(a?.queue ?? []);
  /** Guest songs still waiting in Homeboard: only these can be moved or removed */
  const held = $derived(queue.filter((t) => t.qid));
  let showQueue = $state(false);

  const move = (qid: string, to: number) => control('queueMove', { qid, to });
  async function remove(qid: string) {
    const text = await attempt(() => rpc<string>('spotify', 'queueRemove', { qid }));
    if (text) toast({ text, kind: 'success' });
  }
</script>

{#snippet song(t: Track)}
  <Cover src={t.image} size="2.6rem" radius="0.45rem" />
  <div class="grow">
    <strong class="truncate block">{t.title}</strong>
    <p class="dim small truncate">
      {t.artists}{#if t.requestedBy}<span class="by">{' · '}<span class="dot" style:background={t.requestedBy.color}></span>{t.requestedBy.name}</span>{/if}
    </p>
  </div>
{/snippet}

{#if mod && a}
  {#if mod.connected}
    <Section title="Playback" hint={a.device ? `Playing on ${a.device}` : 'Start playing on a device (PC, phone or speaker) so guests can add songs.'}>
      {#snippet actions()}
        <span class="pill success">{a.account}</span>
      {/snippet}
      <div class="np">
        <Cover src={mod.now?.image ?? null} size="4rem" />
        <div class="grow">
          <strong class="truncate block">{mod.now ? mod.now.title : 'Nothing playing'}</strong>
          <p class="dim small truncate">{mod.now ? mod.now.artists : 'Start music on a device'}</p>
          <p class="small truncate status" class:bad={!!a.error}>{a.error ?? 'Connected'}</p>
        </div>
      </div>
      <div class="row">
        <button class="btn" aria-label="Previous" onclick={() => control('previous')}><SkipBack size={18} /></button>
        {#if mod.now?.isPlaying}
          <button class="btn primary" aria-label="Pause" onclick={() => control('pause')}><Pause size={18} /></button>
        {:else}
          <button class="btn primary" aria-label="Play" onclick={() => control('play')}><Play size={18} /></button>
        {/if}
        <button class="btn" aria-label="Next" onclick={() => control('next')}><SkipForward size={18} /></button>
      </div>
      <label class="field">
          <span>Volume {a.volume === null ? '(not available on this device)' : `${volume.value}%`}</span>
          <input
            type="range"
            min="0"
            max="100"
            bind:value={volume.value}
            disabled={a.volume === null}
            onpointerdown={volume.start}
            onchange={() => {
              control('volume', { volume: volume.value });
              volume.end(4000);
            }}
          />
        </label>
      {#if queue.length}
        <div class="upnext">
          <span class="eyebrow">Up next</span>
          <div class="item">
            {@render song(queue[0])}
            <button class="btn small" onclick={() => (showQueue = true)}><ListMusic size={16} /> Queue{held.length ? ` (${held.length})` : ''}</button>
          </div>
        </div>
      {/if}
    </Section>

    {#if showQueue}
      <Sheet title="Queue" onclose={() => (showQueue = false)}>
        <p class="faint small">Guest songs wait here until about 20 seconds before they play, so you can move or remove them. Removing one refunds the guest. Songs marked with a lock are already in Spotify and cannot be changed.</p>
        {#if queue.length}
          <ol class="queue">
            {#each queue as t, i (t.qid ?? `${t.uri}-${i}`)}
              {@const h = held.findIndex((x) => x.qid === t.qid)}
              <li class="item" class:locked={!t.qid}>
                {@render song(t)}
                {#if t.qid}
                  <div class="tools">
                    <button class="btn ghost small" aria-label="Move up" disabled={h === 0} onclick={() => move(t.qid!, h - 1)}><ArrowUp size={15} /></button>
                    <button class="btn ghost small" aria-label="Move down" disabled={h === held.length - 1} onclick={() => move(t.qid!, h + 1)}><ArrowDown size={15} /></button>
                    <TwoStepButton class="ghost small del" onconfirm={() => remove(t.qid!)}>
                      <Trash2 size={15} />
                      {#snippet armed()}Remove{/snippet}
                    </TwoStepButton>
                  </div>
                {:else}
                  <span class="lock" title="Already in Spotify"><Lock size={14} /></span>
                {/if}
              </li>
            {/each}
          </ol>
        {:else}
          <p class="dim">The queue is empty.</p>
        {/if}
      </Sheet>
    {/if}

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
          <p class="faint small">Skipping costs money (price at the top of this page).</p>
        </div>
        <Toggle checked={mod.allowSkip} label="Guests can skip" onchange={(v) => set({ allowSkip: v })} />
      </div>
      <Ducking source="soundboard" title="Lower music during sounds" hint="While a soundboard sound plays." />
      <Ducking source="tts" title="Lower music during shoutouts" hint="While the TV reads a shoutout out loud." />
    </Section>

    <Section title="Account">
      <div>
        <button class="btn danger small" onclick={async () => (await ask({ title: 'Disconnect Spotify?', message: 'Guests cannot add songs until you connect again.', confirm: 'Disconnect', danger: true })) && control('disconnect')}><Unplug size={16} /> Disconnect</button>
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
            <input class="input mono" bind:value={clientId.value} onfocus={clientId.start} onblur={() => clientId.end()} placeholder="32 characters" />
            <button class="btn" onclick={() => attempt(() => rpc('spotify', 'setClientId', { clientId: clientId.value }), 'Saved')}>Save</button>
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
  .block {
    display: block;
  }
  .status {
    color: var(--success);
  }
  .status.bad {
    color: var(--danger);
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
  .upnext {
    display: grid;
    gap: 0.45rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--border);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  .by {
    white-space: nowrap;
  }
  .dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    margin-right: 0.25rem;
    vertical-align: 0.05em;
  }
  .queue {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }
  .queue .locked {
    opacity: 0.6;
  }
  .tools {
    flex: none;
    display: flex;
    gap: 0.15rem;
  }
  .tools :global(.btn) {
    padding-inline: 0.5rem;
  }
  .lock {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    color: var(--text-faint);
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
</style>
