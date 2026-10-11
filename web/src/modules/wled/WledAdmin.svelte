<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import { Pencil, Play, Plus, Power, RotateCcw, SkipForward, Square, Trash2 } from '@lucide/svelte';
  import { WLED_LIVE, type WledDevice, type WledEffect, type WledLook, type WledState } from '$shared/wled.ts';
  import { hb, rpc, attempt, toast } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Countdown from './Countdown.svelte';
  import { effectSwatch } from './swatch.ts';

  const mod = $derived(hb.modules.wled as WledState | undefined);
  const duration = new Synced(() => hb.modules.wled?.durationSec, 30);
  const brightness = new Synced(() => hb.modules.wled?.brightness, 255);
  const sceneBrightness = new Synced(() => hb.modules.wled?.sceneBrightness, 140);

  // Device form
  let devForm = $state<{ id?: string; host: string; name: string; segments: number[]; group: number } | null>(null);
  /** Segments of the light being edited (null: loading or not reachable) */
  let segList = $state<{ id: number; name: string; leds: number }[] | null>(null);

  async function editDevice(d?: WledDevice) {
    devForm = d ? { id: d.id, host: d.host, name: d.name, segments: [...(d.segments ?? [])], group: d.group ?? 1 } : { host: '', name: '', segments: [], group: 1 };
    segList = null;
    if (d) segList = (await attempt(() => rpc<{ id: number; name: string; leds: number }[]>('wled', 'segments', { id: d.id }))) ?? null;
  }

  function toggleSegment(id: number, on: boolean) {
    if (!devForm) return;
    devForm.segments = on ? [...devForm.segments, id] : devForm.segments.filter((s) => s !== id);
  }

  // Effect and scene editor: one look, or several dealt out to the lights in turn
  type Kind = 'effect' | 'scene';
  let catalog = $state<{ effects: string[]; palettes: string[] } | null>(null);
  let editing = $state<{ kind: Kind; id: string; name: string; live: string; looks: WledLook[] } | null>(null);
  let lookIdx = $state(0);
  const look = $derived(editing?.looks[Math.min(lookIdx, editing.looks.length - 1)]);

  const lookOf = (e: WledEffect, v: Partial<WledLook> = {}): WledLook => ({
    fx: v.fx ?? e.fx,
    pal: v.pal ?? e.pal,
    sx: v.sx ?? e.sx,
    ix: v.ix ?? e.ix,
    colors: [...(v.colors ?? e.colors)],
  });

  async function edit(kind: Kind, e?: WledEffect) {
    catalog ??= (await attempt(() => rpc<{ effects: string[]; palettes: string[] }>('wled', 'catalog'))) ?? null;
    lookIdx = 0;
    editing = e
      ? { kind, id: e.id, name: e.name, live: e.live ?? '', looks: e.variants?.length ? e.variants.map((v) => lookOf(e, v)) : [lookOf(e)] }
      : { kind, id: '', name: '', live: '', looks: [{ fx: kind === 'scene' ? 67 : 9, pal: 0, sx: kind === 'scene' ? 20 : 128, ix: 128, colors: [] }] };
  }

  function addLook() {
    if (!editing || !look) return;
    editing.looks = [...editing.looks, { ...look, colors: [...look.colors] }];
    lookIdx = editing.looks.length - 1;
  }

  function removeLook() {
    if (!editing || editing.looks.length < 2) return;
    editing.looks = editing.looks.filter((_, i) => i !== lookIdx);
    lookIdx = Math.max(0, lookIdx - 1);
  }

  /** The effect as the editor has it now */
  function draft() {
    const { id, name, live, looks } = editing!;
    return { id, name, ...looks[0], variants: looks.length > 1 ? looks : undefined, live: live || undefined };
  }

  let previewing = $state(false);

  /** Play the unsaved effect on every light for a few seconds */
  async function preview() {
    if (!editing) return;
    const r = await attempt(() => rpc<{ waiting: boolean; held: boolean }>('wled', 'preview', { effect: { ...draft(), name: editing!.name || 'Effect' }, kind: editing!.kind }));
    if (!r) return;
    previewing = true;
    if (r.held) toast({ text: 'A game is using the lights: the preview plays after it' });
    else if (r.waiting) toast({ text: 'The preview plays after the current effect' });
  }

  function closeEditor() {
    editing = null;
    if (previewing) void rpc('wled', 'stopPreview').catch(() => {});
    previewing = false;
  }

  async function saveEffect() {
    if (!editing) return;
    const { kind } = editing;
    const saved = await attempt(() => rpc<WledEffect>('wled', 'saveEffect', { effect: draft(), kind }), kind === 'scene' ? 'Scene saved' : 'Effect saved');
    if (saved) closeEditor();
  }

  const remove = async (kind: Kind, e: WledEffect) =>
    (await ask({ title: `Delete ${e.name}?`, confirm: 'Delete', danger: true })) && attempt(() => rpc('wled', 'removeEffect', { id: e.id, kind }));

  async function saveDevice() {
    if (!devForm) return;
    // Names saved with the pick, so the list shows them without asking the light
    const segmentNames = devForm.segments.map((id) => segList?.find((s) => s.id === id)?.name ?? `Segment ${id}`);
    const ok = await attempt(() => rpc('wled', 'saveDevice', { ...devForm, segmentNames }).then(() => true), 'Saved');
    if (ok) devForm = null;
  }

  /** Restart one light, or every reachable one (no id) */
  async function reboot(d?: WledDevice) {
    const sure = await ask({
      title: d ? `Restart ${d.name}?` : 'Restart every light?',
      message: 'It goes dark for a few seconds, then comes back on its own start-up preset (or the scene, when one is on).',
      confirm: 'Restart',
    });
    if (!sure) return;
    const r = await attempt(() => rpc<{ rebooted: number; failed: string[] }>('wled', 'reboot', d ? { id: d.id } : {}));
    if (r?.failed.length) toast({ text: `${r.failed.join(', ')} did not answer`, kind: 'error' });
    else if (r) toast({ text: d ? `${d.name} is restarting` : `${r.rebooted} lights are restarting`, kind: 'success' });
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
    <div class="line">
      <span class="swatch" style:background={mod.scene ? effectSwatch({ id: mod.scene.id, colors: mod.scenes.find((s) => s.id === mod.scene?.id)?.colors ?? [] }) : 'var(--surface-3)'}></span>
      <div class="grow">
        <strong class="truncate block">{mod.scene ? `Scene: ${mod.scene.name}` : 'No scene'}</strong>
        <p class="faint small truncate">{mod.scene ? `Picked by ${mod.scene.by}, stays until another one is picked` : 'Between effects the lights do their usual thing'}</p>
      </div>
      <button class="btn small" disabled={!mod.scene} onclick={() => attempt(() => rpc('wled', 'setScene', { sceneId: null }), 'Scene off')}><Square size={16} /> Off</button>
    </div>
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
      <label class="field">
        <span>Brightness of scenes (0 = keep current)</span>
        <input class="input" type="number" min="0" max="255" bind:value={sceneBrightness.value} onfocus={sceneBrightness.start} onblur={() => { set({ sceneBrightness: Number(sceneBrightness.value) }); sceneBrightness.end(); }} />
      </label>
      <label class="field">
        <span>When Homeboard starts</span>
        <select class="input" value={mod.sceneOnStart === false ? 'none' : 'scene'} onchange={(e) => set({ sceneOnStart: e.currentTarget.value === 'scene' })}>
          <option value="scene">Put the scene back on</option>
          <option value="none">No scene, leave the lights as they are</option>
        </select>
      </label>
      <label class="check">
        <input type="checkbox" checked={mod.guestScenes} onchange={(e) => set({ guestScenes: e.currentTarget.checked })} />
        Guests can change the scene
      </label>
    </div>
  </Section>

  <Section title="Lights">
    {#snippet actions()}
      <button class="btn small" disabled={!mod.devices.some((d) => d.online)} onclick={() => reboot()}><Power size={16} /> Reboot all</button>
      <button class="btn small" onclick={() => editDevice()}><Plus size={16} /> Add</button>
    {/snippet}
    {#each mod.devices as d (d.id)}
      <div class="line">
        <span class="status" class:on={d.online}></span>
        <div class="grow">
          <strong>{d.name}</strong>
          <p class="faint small mono">{d.host}{d.leds ? ` · ${d.leds} LEDs` : ''}{d.online ? '' : ' · offline'}</p>
          {#if d.segments?.length}
            <p class="small accent">Effects only on {(d.segmentNames ?? d.segments.map((id) => `segment ${id}`)).join(', ')}</p>
          {/if}
          {#if d.group}<p class="small accent">{d.group} LEDs lit together</p>{/if}
        </div>
        <button class="btn ghost small" aria-label={`Restart ${d.name}`} title="Restart" disabled={!d.online} onclick={() => reboot(d)}><Power size={15} /></button>
        <button class="btn ghost small" aria-label="Edit" onclick={() => editDevice(d)}><Pencil size={15} /></button>
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
        <label class="field">
          <span>LEDs lit together: {devForm.group === 1 ? 'each LED on its own' : devForm.group}</span>
          <input type="range" min="1" max="10" bind:value={devForm.group} />
          <span class="faint small">For a dense strip close to its diffuser, where single LEDs show as dots: effects and scenes are stretched to match.</span>
        </label>
        {#if segList && segList.length > 1}
          <div class="field">
            <span>Effects play on</span>
            {#each segList as s (s.id)}
              <label class="check">
                <input type="checkbox" checked={devForm.segments.includes(s.id)} onchange={(e) => toggleSegment(s.id, e.currentTarget.checked)} />
                {s.name}<span class="faint small">{s.leds} LEDs</span>
              </label>
            {/each}
            <p class="faint small">{devForm.segments.length ? 'The other segments keep what they show.' : 'None ticked: the whole light.'}</p>
          </div>
        {/if}
        <div class="row">
          <button class="btn primary">Save</button>
          <button type="button" class="btn ghost" onclick={() => (devForm = null)}>Cancel</button>
        </div>
      </form>
    </Sheet>
  {/if}

  <Section title="Effects guests can pick">
    {#snippet actions()}
      <button class="btn small" onclick={() => edit('effect')}><Plus size={16} /> New</button>
    {/snippet}
    <div class="effects">
      {#each mod.effects as e (e.id)}
        <div class="effect">
          <span class="swatch" style:background={effectSwatch(e)}></span>
          <span class="grow truncate">{e.name}{#if e.live}<span class="faint small"> · live</span>{:else if e.variants?.length}<span class="faint small"> · {e.variants.length} looks</span>{/if}</span>
          <button class="btn ghost small" aria-label="Test" onclick={() => attempt(() => rpc('wled', 'test', { effectId: e.id }))}><Play size={15} /></button>
          <button class="btn ghost small" aria-label="Edit" onclick={() => edit('effect', e)}><Pencil size={15} /></button>
          <button class="btn ghost small" aria-label="Delete" onclick={() => remove('effect', e)}><Trash2 size={15} /></button>
        </div>
      {/each}
    </div>
    <div>
      <button class="btn ghost small" onclick={async () => (await ask({ title: 'Restore the default effects?', message: 'Your own effects are removed.', confirm: 'Restore' })) && attempt(() => rpc('wled', 'resetEffects'))}>
        <RotateCcw size={15} /> Restore defaults
      </button>
    </div>
  </Section>

  <Section title="Scenes">
    {#snippet actions()}
      <button class="btn small" onclick={() => edit('scene')}><Plus size={16} /> New</button>
    {/snippet}
    <p class="faint small">Calm looks that stay on until another scene is picked. Effects and games play over them, then the lights go back to the scene.</p>
    <div class="effects">
      {#each mod.scenes as e (e.id)}
        <div class="effect">
          <span class="swatch" class:on={mod.scene?.id === e.id} style:background={effectSwatch(e)}></span>
          <span class="grow truncate">{e.name}{#if e.variants?.length}<span class="faint small"> · {e.variants.length} looks</span>{/if}</span>
          <button class="btn ghost small" aria-label="Turn on" disabled={mod.scene?.id === e.id} onclick={() => attempt(() => rpc('wled', 'setScene', { sceneId: e.id }))}><Play size={15} /></button>
          <button class="btn ghost small" aria-label="Edit" onclick={() => edit('scene', e)}><Pencil size={15} /></button>
          <button class="btn ghost small" aria-label="Delete" onclick={() => remove('scene', e)}><Trash2 size={15} /></button>
        </div>
      {/each}
    </div>
    <div>
      <button class="btn ghost small" onclick={async () => (await ask({ title: 'Restore the default scenes?', message: 'Your own scenes are removed.', confirm: 'Restore' })) && attempt(() => rpc('wled', 'resetEffects', { kind: 'scene' }))}>
        <RotateCcw size={15} /> Restore defaults
      </button>
    </div>
  </Section>

  {#if editing && catalog && look}
    <Sheet title={editing.id ? `Edit ${editing.name}` : editing.kind === 'scene' ? 'New scene' : 'New effect'} onclose={closeEditor}>
      <form
        novalidate
        class="form"
        onsubmit={(e) => {
          e.preventDefault();
          saveEffect();
        }}
      >
        <label class="field"><span>Name</span><input class="input" bind:value={editing.name} maxlength="30" required /></label>
        {#if editing.kind === 'effect'}
          <label class="field">
            <span>Drawn by</span>
            <select class="input" bind:value={editing.live}>
              <option value="">WLED, with the looks below</option>
              {#each Object.entries(WLED_LIVE) as [id, name] (id)}<option value={id}>Homeboard: {name}, a different show on each light</option>{/each}
            </select>
            {#if editing.live}<span class="faint small">Lights where effects stay on some segments use the WLED look below.</span>{/if}
          </label>
        {/if}
        <div class="field">
          <span class="dim small">Looks: with several, each light (and each segment) gets the next one, so they do not all look the same</span>
          <div class="row">
            {#each editing.looks as _, i}
              <button type="button" class="chip" class:active={i === lookIdx} onclick={() => (lookIdx = i)}>{i + 1}</button>
            {/each}
            <button type="button" class="btn ghost small" disabled={editing.looks.length >= 8} onclick={addLook}><Plus size={15} /> Add a look</button>
            <button type="button" class="btn ghost small" disabled={editing.looks.length < 2} onclick={removeLook}>Remove this one</button>
          </div>
        </div>
        <div class="grid2">
          <label class="field">
            <span>WLED effect</span>
            <select class="input" bind:value={look.fx}>
              {#each catalog.effects as name, i}{#if name !== 'RSVD'}<option value={i}>{name}</option>{/if}{/each}
            </select>
          </label>
          <label class="field">
            <span>Palette</span>
            <select class="input" bind:value={look.pal}>
              {#each catalog.palettes as name, i}<option value={i}>{name}</option>{/each}
            </select>
          </label>
        </div>
        <div class="grid2">
          <label class="field"><span>Speed {look.sx}</span><input type="range" min="0" max="255" bind:value={look.sx} /></label>
          <label class="field"><span>Intensity {look.ix}</span><input type="range" min="0" max="255" bind:value={look.ix} /></label>
        </div>
        <div class="field">
          <span class="dim small">Colors (used by effects that follow the segment colors)</span>
          <div class="row">
            {#each look.colors as _, i}
              <input type="color" bind:value={look.colors[i]} />
            {/each}
            <button type="button" class="btn ghost small" disabled={look.colors.length >= 3} onclick={() => look && (look.colors = [...look.colors, '#ff3366'])}>Add color</button>
            <button type="button" class="btn ghost small" disabled={!look.colors.length} onclick={() => look && (look.colors = look.colors.slice(0, -1))}>Remove</button>
          </div>
        </div>
        <div class="row">
          <button class="btn primary">{editing.kind === 'scene' ? 'Save scene' : 'Save effect'}</button>
          <button type="button" class="btn" onclick={preview}><Play size={16} /> Preview</button>
          <button type="button" class="btn ghost" onclick={closeEditor}>Cancel</button>
        </div>
      </form>
    </Sheet>
  {/if}
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
  .swatch.on {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .chip {
    min-width: 2.2rem;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-weight: 600;
  }
  .chip.active {
    background: var(--accent);
    border-color: transparent;
    color: var(--accent-contrast);
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
  .accent {
    color: var(--accent);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .check input {
    accent-color: var(--accent);
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
