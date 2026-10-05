<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import { Pencil, Play, Plus, RotateCcw, SkipForward, Square, Trash2 } from '@lucide/svelte';
  import type { WledEffect, WledState } from '$shared/wled.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
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
  <Section title="Now">
    {#if mod.current}
      <div class="line">
        <span class="swatch" style:background={effectSwatch(mod.current.effect)}></span>
        <div class="grow">
          <strong>{mod.current.effect.name}</strong>
          <p class="faint small">by {mod.current.guest.name} on {mod.current.devices.map(deviceName).join(', ')}</p>
        </div>
        <Countdown until={mod.current.until} />
      </div>
      {#if mod.queue.length}<p class="dim small">{mod.queue.length} waiting</p>{/if}
      <div class="row">
        <button class="btn small" onclick={() => attempt(() => rpc('wled', 'skip'))}><SkipForward size={16} /> Next</button>
        <button class="btn small danger" onclick={() => attempt(() => rpc('wled', 'stop', { refund: true }), 'Stopped, queue refunded')}>
          <Square size={16} /> Stop all
        </button>
      </div>
    {:else}
      <p class="faint">No effect running. Lights are doing their usual thing.</p>
    {/if}
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
    {#if devForm}
      <form
        class="form"
        onsubmit={(e) => {
          e.preventDefault();
          saveDevice();
        }}
      >
        <input class="input" bind:value={devForm.host} placeholder="IP address, e.g. 192.168.1.50" required />
        <input class="input" bind:value={devForm.name} placeholder="Name (read from WLED if empty)" />
        <div class="row">
          <button class="btn primary small">Save</button>
          <button type="button" class="btn ghost small" onclick={() => (devForm = null)}>Cancel</button>
        </div>
      </form>
    {/if}
  </Section>

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

    {#if editing && catalog}
      <form
        class="form editor"
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
            {#if editing.colors.length < 3}
              <button type="button" class="btn ghost small" onclick={() => editing && (editing.colors = [...editing.colors, '#ff3366'])}>Add color</button>
            {/if}
            {#if editing.colors.length}
              <button type="button" class="btn ghost small" onclick={() => editing && (editing.colors = editing.colors.slice(0, -1))}>Remove</button>
            {/if}
          </div>
        </div>
        <div class="row">
          <button class="btn primary small">Save effect</button>
          <button type="button" class="btn ghost small" onclick={() => (editing = null)}>Cancel</button>
        </div>
      </form>
    {/if}
  </Section>

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
    gap: 0.7rem;
    padding: 1rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
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
