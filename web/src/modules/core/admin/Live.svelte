<script lang="ts">
  import { CloudRain, RefreshCw } from '@lucide/svelte';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Qr from '$lib/ui/Qr.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import AmountInput from '$lib/ui/AmountInput.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { ago } from '$lib/time.ts';

  const core = $derived(hb.core!);
  const admin = $derived(core.admin!);
  let rain = $state(1000);

  const tunnelLabel = { off: 'Off', starting: 'Starting', up: 'Online', error: 'Error' } as const;
</script>

<div class="top">
  <div class="card join">
    {#if core.join}
      <Qr svg={core.join.qrSvg} size="7.5rem" />
      <div class="info">
        <span class="eyebrow">Session code</span>
        <div class="code mono">{core.join.code}</div>
        <a class="url mono" href={core.join.url} target="_blank" rel="noreferrer">{core.join.url}</a>
        <div class="row">
          <button class="btn small" onclick={() => attempt(() => rpc('core', 'newCode'), 'New code')}>
            <RefreshCw size={15} /> New code
          </button>
        </div>
      </div>
    {/if}
  </div>

  <div class="stats">
    <div class="card stat">
      <span class="eyebrow">Online</span>
      <strong class="mono">{core.guestsOnline}<span class="faint"> / {admin.guests.length}</span></strong>
    </div>
    <div class="card stat">
      <span class="eyebrow">Public link</span>
      <strong class:ok={admin.tunnel === 'up'} class:bad={admin.tunnel === 'error'}>{tunnelLabel[admin.tunnel]}</strong>
    </div>
    <div class="card stat">
      <span class="eyebrow">Economy</span>
      <strong>{core.economyEnabled ? 'On' : 'Free mode'}</strong>
    </div>
  </div>
</div>

{#if core.economyEnabled}
  <Section title="Money rain" hint="Give every connected guest the same bonus.">
    <div class="row">
      <AmountInput value={rain} oncommit={(v) => (rain = v)} />
      <button
        class="btn primary"
        onclick={() =>
          attempt(async () => {
            const n = await rpc<number>('core', 'moneyRain', { amount: rain });
            return n;
          }, 'It is raining')}
      >
        <CloudRain size={18} /> Make it rain
      </button>
    </div>
  </Section>
{/if}

<Section title="Features" hint="Turn things on and off live.">
  <div class="features">
    {#each core.features as f (f.id)}
      <div class="feature">
        <span class="truncate">{f.name}</span>
        <Toggle checked={f.enabled} label={f.name} onchange={(v) => attempt(() => rpc('core', 'setFeature', { id: f.id, enabled: v }))} />
      </div>
    {:else}
      <p class="faint">No optional features installed.</p>
    {/each}
  </div>
</Section>

<Section title="Activity">
  <div class="activity">
    {#each hb.activity.slice(0, 12) as a (a.id)}
      <div class="act">
        {#if a.guest}<span class="dot" style:background={a.guest.color}></span>{/if}
        <span class="truncate">{a.text}</span>
        <span class="spacer"></span>
        {#if a.amount}<Money amount={a.amount} />{/if}
        <span class="faint when">{ago(a.at)}</span>
      </div>
    {:else}
      <p class="faint">Nothing yet.</p>
    {/each}
  </div>
</Section>

<style>
  .top {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 1rem;
  }
  .join {
    display: flex;
    gap: 1.1rem;
    padding: 1.1rem;
    align-items: center;
  }
  .info {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .code {
    font-size: 2.6rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    line-height: 1;
  }
  .url {
    font-size: 0.75rem;
    word-break: break-all;
    color: var(--text-dim);
  }
  .stats {
    display: grid;
    gap: 0.6rem;
  }
  .stat {
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .stat strong {
    font-size: 1.15rem;
  }
  .ok {
    color: var(--success);
  }
  .bad {
    color: var(--danger);
  }
  .features {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.5rem 1.5rem;
  }
  .feature {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.3rem 0;
  }
  .activity {
    display: grid;
  }
  .act {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
  }
  .act:last-child {
    border-bottom: 0;
  }
  .dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  .when {
    font-size: 0.78rem;
    white-space: nowrap;
  }
  @media (max-width: 700px) {
    .top {
      grid-template-columns: 1fr;
    }
  }
</style>
