<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import { Pencil, Play, Plus, RotateCcw, SkipForward, Square, Trash2 } from '@lucide/svelte';
  import type { WledEffect, WledState } from '$shared/wled.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Countdown from './Countdown.svelte';
  import { effectSwatch } from './swatch.ts';

  const mod = $derived(hb.modules.wled as WledState | undefined);
  const duration = new Synced(() => hb.modules.wled?.durationSec, 30);
  const brightness = new Synced(() => hb.modules.wled?.brightness, 255);

  // Device form
  let devForm = $state<{ id?: string; host: string; name: string } | null>(null);

  // Effect editor
  let catalog = $state<{ effects: string[]; palettes: string[] } | null>(null);
  let editing = $state<WledEffect | null>(null);

  async function edit(e?: WledEffect) {
    catalog ??= (await attempt(() => rpc<{ effects: string[]; palettes: string[] }>('wled', 'catalog'))) ?? null;
    editing = e ? { ...e, colors: [...e.colors] } : { id: '', name: '', fx: 9, pal: 0, sx: 128, ix: 128, colors: [] };
  }

  async function saveEffect() {
    if (!editing) return;
    const saved = await attempt(() => rpc<WledEffect>('wled', 'saveEffect', { effect: editing }), 'Effect saved');
    if (saved) editing = null;
  }

  async function saveDevice() {
    if (!devForm) return;
    const ok = await attempt(() => rpc('wled', 'saveDevice', devForm).then(() => true), 'Saved');
    if (ok) devForm = null;
  }

  const set = (args: Record<string, unknown>) => attempt(() => rpc('wled', 'setOptions', args));
  const deviceName = (id: string) => mod?.devices.find((d) => d.id === id)?.name ?? id;
</script>

{#if mod}
  <!-- Always the same size, so the page does not move when effects start and stop -->
  <Section title="Now">
    <div class="line">
      <span class="swatch" style:background={mod.current ? effectSwatch(mod.current.effect) : 'var(--surface-3)'}></span>
      <div class="grow">
        <strong class="truncate block">{mod.current ? mod.current.effect.name : 'No effect running'}</strong>
        <p class="faint small truncate">
          {mod.current ? `by ${mod.current.guest.name} on ${mod.current.devices.map(deviceName).join(', ')}` : 'Lights are doing their usual thing'}
        </p>
      </div>
      {#if mod.current}<Countdown until={mod.current.until} />{/if}
    </div>
    <div class="row">
      <button class="btn small" disabled={!mod.current} onclick={() => attempt(() => rpc('wled', 'skip'))}><SkipForward size={16} /> Next</button>
      <button class="btn small danger" disabled={!mod.current} onclick={() => attempt(() => rpc('wled', 'stop', { refund: true }), 'Stopped, queue refunded')}>
        <Square size={16} /> Stop all
      </button>
      <span class="spacer"></span>
      <span class="faint small">{mod.queue.length ? `${mod.queue.length} waiting` : 'Nothing waiting'}</span>
    </div>
  </Section>

  <Section title="Lights">
    {#snippet actions()}
      <button class="btn small" onclick={() => (devForm = { host: '', name: '' })}><Plus size={16} /> Add</button>
    {/snippet}
    {#each mod.devices as d (d.id)}
      <div class="line">
        <span class="status" class:on={d.online}></span>
        <div class="grow">
          <strong>{d.name}</strong>
          <p class="faint small mono">{d.host}{d.leds ? ` · ${d.leds} LEDs` : ''}{d.online ? '' : ' · offline'}</p>
        </div>
        <button class="btn ghost small" aria-label="Edit" onclick={() => (devForm = { id: d.id, host: d.host, name: d.name })}><Pencil size={15} /></button>
        <button class="btn ghost small" aria-label="Remove" onclick={async () => (await ask({ title: `Remove ${d.name}?`, confirm: 'Remove', danger: true })) && attempt(() => rpc('wled', 'removeDevice', { id: d.id }))}>
          <Trash2 size={15} />
        </button>
      </div>
    {/each}
  </Section>

  {#if devForm}
    <Sheet title={devForm.id ? 'Edit light' : 'Add a light'} onclose={() => (devForm = null)}>
      <form
        novalidate
        class="form"
        onsubmit={(e) => {
          e.preventDefault();
          saveDevice();
        }}
      >
        <label class="field"><span>IP address</span><input class="input" bind:value={devForm.host} placeholder="192.168.1.50" /></label>
        <label class="field"><span>Name</span><input class="input" bind:value={devForm.name} placeholder="Read from WLED if empty" /></label>
        <div class="row">
          <button class="btn primary">Save</button>
          <button type="button" class="btn ghost" onclick={() => (devForm = null)}>Cancel</button>
        </div>
      </form>
    </Sheet>
  {/if}

  <Section title="Effects guests can pick">
    {#snippet actions()}
      <button class="btn small" onclick={() => edit()}><Plus size={16} /> New</button>
    {/snippet}
    <div class="effects">
      {#each mod.effects as e (e.id)}
        <div class="effect">
          <span class="swatch" style:background={effectSwatch(e)}></span>
          <span class="grow truncate">{e.name}</span>
          <button class="btn ghost small" aria-label="Test" onclick={() => attempt(() => rpc('wled', 'test', { effectId: e.id }))}><Play size={15} /></button>
          <button class="btn ghost small" aria-label="Edit" onclick={() => edit(e)}><Pencil size={15} /></button>
          <button class="btn ghost small" aria-label="Delete" onclick={async () => (await ask({ title: `Delete ${e.name}?`, confirm: 'Delete', danger: true })) && attempt(() => rpc('wled', 'removeEffect', { id: e.id }))}>
            <Trash2 size={15} />
          </button>
        </div>
      {/each}
    </div>
    <div>
      <button class="btn ghost small" onclick={async () => (await ask({ title: 'Restore the default effects?', message: 'Your own effects are removed.', confirm: 'Restore' })) && attempt(() => rpc('wled', 'resetEffects'))}>
        <RotateCcw size={15} /> Restore defaults
      </button>
    </div>

  </Section>

  {#if editing && catalog}
    <Sheet title={editing.id ? `Edit ${editing.name}` : 'New effect'} onclose={() => (editing = null)}>
      <form
        novalidate
        class="form"
        onsubmit={(e) => {
          e.preventDefault();
          saveEffect();
        }}
      >
        <label class="field"><span>Name</span><input class="input" bind:value={editing.name} maxlength="30" required /></label>
        <div class="grid2">
          <label class="field">
            <span>WLED effect</span>
            <select class="input" bind:value={editing.fx}>
              {#each catalog.effects as name, i}{#if name !== 'RSVD'}<option value={i}>{name}</option>{/if}{/each}
            </select>
          </label>
          <label class="field">
            <span>Palette</span>
            <select class="input" bind:value={editing.pal}>
              {#each catalog.palettes as name, i}<option value={i}>{name}</option>{/each}
            </select>
          </label>
        </div>
        <div class="grid2">
          <label class="field"><span>Speed {editing.sx}</span><input type="range" min="0" max="255" bind:value={editing.sx} /></label>
          <label class="field"><span>Intensity {editing.ix}</span><input type="range" min="0" max="255" bind:value={editing.ix} /></label>
        </div>
        <div class="field">
          <span class="dim small">Colors (used by effects that follow the segment colors)</span>
          <div class="row">
            {#each editing.colors as _, i}
              <input type="color" bind:value={editing.colors[i]} />
            {/each}
            <button type="button" class="btn ghost small" disabled={editing.colors.length >= 3} onclick={() => editing && (editing.colors = [...editing.colors, '#ff3366'])}>Add color</button>
            <button type="button" class="btn ghost small" disabled={!editing.colors.length} onclick={() => editing && (editing.colors = editing.colors.slice(0, -1))}>Remove</button>
          </div>
        </div>
        <div class="row">
          <button class="btn primary">Save effect</button>
          <button type="button" class="btn ghost" onclick={() => (editing = null)}>Cancel</button>
        </div>
      </form>
    </Sheet>
  {/if}

  <Section title="Settings">
    <div class="grid2">
      <label class="field">
        <span>Effect length (seconds)</span>
        <input class="input" type="number" min="5" max="600" bind:value={duration.value} onfocus={duration.start} onblur={() => { set({ durationSec: Number(duration.value) }); duration.end(); }} />
      </label>
      <label class="field">
        <span>Brightness during effects (0 = keep current)</span>
        <input class="input" type="number" min="0" max="255" bind:value={brightness.value} onfocus={brightness.start} onblur={() => { set({ brightness: Number(brightness.value) }); brightness.end(); }} />
      </label>
    </div>
  </Section>
{/if}

<style>
  .line,
  .effect {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .small {
    font-size: 0.82rem;
  }
  .swatch {
    flex: none;
    width: 2rem;
    height: 2rem;
    border-radius: 0.6rem;
  }
  .status {
    flex: none;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--danger);
  }
  .status.on {
    background: var(--success);
  }
  .effects {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.3rem 1.2rem;
  }
  .form {
    display: grid;
    gap: 0.8rem;
  }
  .block {
    display: block;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  input[type='color'] {
    width: 2.6rem;
    height: 2.2rem;
    border: 0;
    background: none;
    padding: 0;
  }
  @media (max-width: 600px) {
    .grid2 {
      grid-template-columns: 1fr;
    }
  }
</style>
