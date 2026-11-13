<script lang="ts">
  import { ArrowLeft, ArrowRight, Coins, Copy, Play, Plus, Rocket, Save, Trash2 } from '@lucide/svelte';
  import { hb } from '$lib/client.svelte.ts';
  import { FW_COLORS, FW_EFFECTS, FW_MAX_COUNT, FW_MAX_DELAY, FW_NAME_MAX, FW_SHAPES, fireworkCost, fwHex, newShell, shellPoints, showMs, type FwDesign, type FwShell } from '$shared/worldActions.ts';
  import type { WorldState } from '$shared/world.ts';
  import FireworkPreview from './FireworkPreview.svelte';
  import { shapeIcon } from './fireworks.ts';

  /**
   * Make a firework show: a row of shells, one after the other. Each shell has its shape, colors,
   * size, where and how high it bursts, how many go up at once, how long after the one before, and
   * effects. The preview plays it over a little town (a tap on its sky moves the shell there). The
   * crazier it gets, the more it costs.
   */
  let {
    design = $bindable(),
    busy = false,
    onsave,
    onlaunch,
    oncancel,
    canLaunch,
    launchNote,
  }: {
    design: FwDesign;
    busy?: boolean;
    onsave: () => void;
    onlaunch: () => void;
    oncancel: () => void;
    canLaunch: boolean;
    launchNote: string;
  } = $props();

  const world = $derived(hb.modules.world as WorldState | undefined);
  const fw = $derived(world?.actions?.fireworks);
  const currency = $derived(world?.shop?.currencyName ?? '');
  const maxShells = $derived(fw?.maxShells ?? 12);

  let sel = $state(0);
  let restart = $state(0);
  const shell = $derived(design.shells[Math.min(sel, design.shells.length - 1)]);
  const cost = $derived(fw ? fireworkCost(design, fw) : 0);
  const points = $derived(design.shells.reduce((n, s) => n + shellPoints(s), 0));
  /** How crazy the show is, for the meter: a name and how full the bar is */
  const crazy = $derived(
    points < 6 ? { name: 'Gentle', fill: points / 6 / 4 } : points < 16 ? { name: 'Lively', fill: 0.25 + ((points - 6) / 10) * 0.25 } : points < 36 ? { name: 'Wild', fill: 0.5 + ((points - 16) / 20) * 0.25 } : { name: 'Insane', fill: Math.min(1, 0.75 + ((points - 36) / 60) * 0.25) },
  );
  const seconds = $derived(Math.round(showMs(design) / 100) / 10);

  function add() {
    if (design.shells.length >= maxShells) return;
    design.shells.splice(sel + 1, 0, newShell(shell));
    sel++;
    restart++;
  }
  function copy() {
    if (design.shells.length >= maxShells) return;
    design.shells.splice(sel + 1, 0, structuredClone($state.snapshot(shell)) as FwShell);
    sel++;
  }
  function remove() {
    if (design.shells.length <= 1) return;
    design.shells.splice(sel, 1);
    sel = Math.max(0, sel - 1);
    restart++;
  }
  function move(by: -1 | 1) {
    const to = sel + by;
    if (to < 0 || to >= design.shells.length) return;
    const [s] = design.shells.splice(sel, 1);
    design.shells.splice(to, 0, s);
    sel = to;
  }
  function toggleColor(id: FwShell['colors'][number]) {
    const has = shell.colors.indexOf(id);
    if (has >= 0) {
      if (shell.colors.length > 1) shell.colors.splice(has, 1);
    } else if (shell.colors.length < 3) shell.colors.push(id);
    else shell.colors[2] = id;
  }
  function toggleEffect(id: FwShell['effects'][number]) {
    const has = shell.effects.indexOf(id);
    if (has >= 0) shell.effects.splice(has, 1);
    else shell.effects.push(id);
  }

  const SIZES = [
    { v: 1, name: 'Small' },
    { v: 2, name: 'Medium' },
    { v: 3, name: 'Large' },
  ] as const;
  const shapeName = (id: string) => FW_SHAPES.find((s) => s.id === id)?.name ?? id;
</script>

<div class="designer">
  <div class="stage">
    <FireworkPreview
      {design}
      {restart}
      ontap={(x, h) => {
        shell.x = x;
        shell.height = h;
      }}
    />
    <div class="stage-bar">
      <button type="button" class="btn small" onclick={() => restart++}><Play size={15} />From the start</button>
      <span class="faint small">{seconds} s. Tap the sky to place shell {sel + 1}.</span>
    </div>
  </div>

  <label class="name">
    <span class="label">Name</span>
    <input class="input" type="text" maxlength={FW_NAME_MAX} bind:value={design.name} />
  </label>

  <!-- The shells in order: pick one to change it -->
  <section class="group">
    <span class="label">Shells ({design.shells.length}/{maxShells})</span>
    <div class="shells">
      {#each design.shells as s, i (i)}
        <button type="button" class="shell-chip" class:on={i === sel} onclick={() => (sel = i)}>
          <svg viewBox="-1.1 -1.1 2.2 2.2" width="30" height="30" aria-hidden="true">
            {#each shapeIcon(s.shape) as [x, y], j (j)}
              <circle cx={x} cy={y} r="0.11" fill={fwHex(s.colors[j % s.colors.length])} />
            {/each}
          </svg>
          <span>{i + 1}{s.count > 1 ? ` x${s.count}` : ''}</span>
        </button>
      {/each}
      <button type="button" class="shell-chip add" disabled={design.shells.length >= maxShells} onclick={add} aria-label="Add a shell"><Plus size={20} /></button>
    </div>
    <div class="shell-tools">
      <button type="button" class="btn small ghost" disabled={sel === 0} onclick={() => move(-1)} aria-label="Earlier"><ArrowLeft size={16} /></button>
      <button type="button" class="btn small ghost" disabled={sel >= design.shells.length - 1} onclick={() => move(1)} aria-label="Later"><ArrowRight size={16} /></button>
      <button type="button" class="btn small ghost" disabled={design.shells.length >= maxShells} onclick={copy}><Copy size={15} />Copy</button>
      <button type="button" class="btn small ghost" disabled={design.shells.length <= 1} onclick={remove}><Trash2 size={15} />Remove</button>
    </div>
  </section>

  {#if shell}
    <section class="group">
      <span class="label">Shape</span>
      <div class="shapes">
        {#each FW_SHAPES as sh (sh.id)}
          <button type="button" class="shape" class:on={shell.shape === sh.id} onclick={() => (shell.shape = sh.id)}>
            <svg viewBox="-1.1 -1.1 2.2 2.2" width="40" height="40" aria-hidden="true">
              {#each shapeIcon(sh.id) as [x, y], j (j)}
                <circle cx={x} cy={y} r="0.1" fill={fwHex(shell.colors[j % shell.colors.length])} />
              {/each}
            </svg>
            <span>{sh.name}</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="group">
      <span class="label">Colors <span class="faint">(up to 3)</span></span>
      <div class="colors">
        {#each FW_COLORS as c (c.id)}
          {@const n = shell.colors.indexOf(c.id)}
          <button type="button" class="color" class:on={n >= 0} style:--c={c.hex} aria-label={c.id} onclick={() => toggleColor(c.id)}>
            {#if n >= 0}<span>{n + 1}</span>{/if}
          </button>
        {/each}
      </div>
    </section>

    <section class="group">
      <span class="label">Size</span>
      <div class="seg">
        {#each SIZES as z (z.v)}
          <button type="button" class:on={shell.size === z.v} onclick={() => (shell.size = z.v)}>{z.name}</button>
        {/each}
      </div>
    </section>

    <section class="group">
      <span class="label">How many at once</span>
      <div class="seg">
        {#each Array.from({ length: FW_MAX_COUNT }, (_, i) => i + 1) as n (n)}
          <button type="button" class:on={shell.count === n} onclick={() => (shell.count = n)}>{n}</button>
        {/each}
      </div>
    </section>

    <div class="sliders">
      <label class="slider">
        <span class="label">Across <span class="faint">{shell.x < 34 ? 'left' : shell.x > 66 ? 'right' : 'middle'}</span></span>
        <input type="range" min="0" max="100" bind:value={shell.x} />
      </label>
      <label class="slider">
        <span class="label">Height <span class="faint">{shell.height < 34 ? 'low' : shell.height > 66 ? 'high' : 'middle'}</span></span>
        <input type="range" min="0" max="100" bind:value={shell.height} />
      </label>
      <label class="slider">
        <span class="label">{sel === 0 ? 'Goes up after' : 'After the one before'} <span class="faint">{(shell.delay / 1000).toFixed(1)} s</span></span>
        <input type="range" min="0" max={sel === 0 ? 1000 : FW_MAX_DELAY} step="100" bind:value={shell.delay} />
      </label>
    </div>

    <section class="group">
      <span class="label">Effects</span>
      <div class="effects">
        {#each FW_EFFECTS as ef (ef.id)}
          <button type="button" class="effect" class:on={shell.effects.includes(ef.id)} onclick={() => toggleEffect(ef.id)}>
            <strong>{ef.name}</strong>
            <span class="faint">{ef.about}</span>
          </button>
        {/each}
      </div>
    </section>
    <p class="faint small">Shell {sel + 1}: {shapeName(shell.shape)}, worth {shellPoints(shell)} craziness points.</p>
  {/if}

  <!-- The bill: how crazy it got, and what that costs -->
  <div class="bill card">
    <div class="meter">
      <div class="meter-head">
        <span class="label">Craziness</span>
        <strong class="crazy">{crazy.name}</strong>
      </div>
      <div class="bar"><span style:width="{crazy.fill * 100}%"></span></div>
    </div>
    <div class="cost"><Coins size={18} /><strong>{cost}</strong><span class="faint">{currency}</span></div>
  </div>

  <div class="actions">
    <button type="button" class="btn" onclick={oncancel} disabled={busy}>Back</button>
    <button type="button" class="btn" onclick={onsave} disabled={busy}><Save size={17} />Save</button>
    <button type="button" class="btn primary" onclick={onlaunch} disabled={busy || !canLaunch}><Rocket size={17} />Launch</button>
  </div>
  {#if launchNote}<p class="faint small center">{launchNote}</p>{/if}
</div>

<style>
  .designer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  /* The preview stays in sight while the shell below is changed */
  .stage {
    position: sticky;
    top: calc(var(--header-h, 4rem) + 0.25rem);
    z-index: 2;
    display: grid;
    gap: 0.4rem;
    padding: 0.4rem;
    margin: -0.4rem;
    border-radius: var(--radius-sm);
    background: var(--bg);
  }
  .stage-bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .label .faint {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
  }
  .name,
  .group,
  .slider {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .shells {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scrollbar-width: none;
  }
  .shell-chip {
    flex: none;
    display: grid;
    justify-items: center;
    gap: 0.1rem;
    min-width: 3.2rem;
    padding: 0.35rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: #0b0e24;
    color: #e6e8ff;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .shell-chip.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .shell-chip.add {
    place-items: center;
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .shell-tools {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
  .shapes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
  }
  .shape {
    display: grid;
    justify-items: center;
    gap: 0.15rem;
    padding: 0.45rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: #0b0e24;
    color: #d9dcf5;
    font-size: 0.8rem;
  }
  .shape.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  .color {
    display: grid;
    place-items: center;
    width: 2.3rem;
    height: 2.3rem;
    padding: 0;
    border: 2px solid var(--border);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff 0 8%, var(--c) 45%);
    box-shadow: 0 0 0 0 var(--c);
    color: #000;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .color.on {
    border-color: #fff;
    box-shadow: 0 0 12px 1px var(--c);
  }
  .color span {
    display: grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.85);
  }
  .seg {
    display: flex;
    gap: 0.3rem;
  }
  .seg button {
    flex: 1;
    padding: 0.5rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.9rem;
  }
  .seg button.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .sliders {
    display: grid;
    gap: 0.8rem;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  .effects {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }
  .effect {
    display: grid;
    gap: 0.1rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    text-align: left;
    font-size: 0.78rem;
  }
  .effect strong {
    font-size: 0.92rem;
  }
  .effect.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .bill {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.8rem 1rem;
  }
  .meter {
    flex: 1;
    display: grid;
    gap: 0.35rem;
  }
  .meter-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .crazy {
    font-family: var(--font-display);
  }
  .bar {
    height: 0.55rem;
    border-radius: 999px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #ffcf5a, #ff6fc8 55%, #a46bff 80%, #45e3ff);
    background-size: 18rem 100%;
    transition: width 0.3s ease;
  }
  .cost {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--coin);
    font-size: 1.25rem;
  }
  .cost .faint {
    font-size: 0.85rem;
  }
  .actions {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 0.5rem;
  }
  .actions .btn {
    justify-content: center;
  }
  .center {
    text-align: center;
  }
</style>
