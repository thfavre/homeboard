<script lang="ts">
  import type { WledState } from '$shared/wled.ts';
  import { hb, rpc, attempt, price, toast } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import Countdown from './Countdown.svelte';
  import { effectSwatch } from './swatch.ts';

  const mod = $derived(hb.modules.wled as WledState | undefined);
  const online = $derived(mod?.devices.filter((d) => d.online) ?? []);
  let target = $state('all');
  let busy = $state(false);

  const cost = $derived(price(target === 'all' ? 'wled.all' : 'wled.one'));
  const deviceName = (id: string) => mod?.devices.find((d) => d.id === id)?.name ?? id;

  // Fall back to all lights when the selected one goes offline
  $effect(() => {
    if (target !== 'all' && !online.some((d) => d.id === target)) target = 'all';
  });

  async function trigger(effectId: string, name: string) {
    busy = true;
    const r = await attempt(() => rpc<{ position: number }>('wled', 'trigger', { effectId, target }));
    busy = false;
    if (r) {
      toast({ text: r.position ? `${name} is #${r.position} in line` : `${name} is on`, kind: 'success' });
    }
  }
</script>

{#if mod}
  <div class="lights">
    <p class="dim intro">Light up the room for {mod.durationSec} seconds. Effects play one after the other.</p>

    {#if mod.current}
      <div class="card now">
        <span class="swatch" style:background={effectSwatch(mod.current.effect)}></span>
        <div class="text">
          <strong>{mod.current.effect.name}</strong>
          <span class="faint">by {mod.current.guest.name} on {mod.current.devices.map(deviceName).join(', ')}</span>
        </div>
        <Countdown until={mod.current.until} />
      </div>
      {#if mod.queue.length}<p class="faint waiting">{mod.queue.length} waiting after this one</p>{/if}
    {/if}

    {#if online.length === 0}
      <div class="card empty">The lights are offline right now.</div>
    {:else}
      <div class="targets">
        <button class="chip" class:active={target === 'all'} onclick={() => (target = 'all')}>All lights</button>
        {#each online as d (d.id)}
          <button class="chip" class:active={target === d.id} onclick={() => (target = d.id)}>{d.name}</button>
        {/each}
      </div>

      {#if hb.core?.economyEnabled && cost}
        <p class="faint price">Costs <Money amount={cost} /> {target === 'all' ? 'for every light' : 'for this light'}</p>
      {/if}

      <div class="grid">
        {#each mod.effects as e (e.id)}
          <button class="effect card" disabled={busy} onclick={() => trigger(e.id, e.name)}>
            <span class="swatch big" style:background={effectSwatch(e)}></span>
            <span class="name">{e.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .lights {
    display: grid;
    gap: 0.9rem;
  }
  .intro {
    font-size: 0.9rem;
  }
  .now {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.8rem 1rem;
  }
  .now .text {
    flex: 1;
    min-width: 0;
    display: grid;
    font-size: 0.9rem;
  }
  .waiting {
    font-size: 0.82rem;
    margin-top: -0.4rem;
  }
  .swatch {
    flex: none;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 0.8rem;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
  }
  .swatch.big {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 10;
    border-radius: calc(var(--radius-sm) - 2px);
  }
  .targets {
    display: flex;
    gap: 0.45rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scrollbar-width: none;
  }
  .chip {
    flex: none;
    padding: 0.5rem 0.95rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-weight: 600;
    font-size: 0.88rem;
  }
  .chip.active {
    background: var(--accent);
    border-color: transparent;
    color: var(--accent-contrast);
  }
  .price {
    font-size: 0.85rem;
    margin-top: -0.3rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.6rem;
  }
  .effect {
    display: grid;
    gap: 0.55rem;
    padding: 0.5rem 0.5rem 0.7rem;
    text-align: left;
    transition: transform 0.12s ease;
  }
  .effect:active:not(:disabled) {
    transform: scale(0.97);
  }
  .name {
    font-weight: 600;
    font-size: 0.92rem;
    padding: 0 0.3rem;
  }
</style>
