<script lang="ts">
  import { ArrowLeft, ArrowRight, ChevronDown, Coins, Copy, Plus, Rocket, Save, Trash2, Undo2, X } from '@lucide/svelte';
  import { hb } from '$lib/client.svelte.ts';
  import { FW_COLORS, FW_MAX_COUNT, FW_MAX_DELAY, FW_NAME_MAX, FW_PARTICLES, FW_TEMPLATES, fireworkCost, newShell, shellPoints, type FwDesign, type FwParticle, type FwShell } from '$shared/worldActions.ts';
  import type { WorldState } from '$shared/world.ts';
  import DrawPad from './DrawPad.svelte';
  import ShellThumb from './ShellThumb.svelte';

  /**
   * Make a firework show, shell by shell: draw each one's shape with a finger (or start from a
   * ready-made one), pick its colors and particles, and how big. Where and when it goes up is set
   * for you and can be changed below. The show itself is only seen on the TV; the crazier it gets,
   * the more it costs.
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
  let placing = $state(false);
  const shell = $derived(design.shells[Math.min(sel, design.shells.length - 1)]);
  const cost = $derived(fw ? fireworkCost(design, fw) : 0);
  const points = $derived(design.shells.reduce((n, s) => n + shellPoints(s), 0));
  /** How crazy the show is, for the meter: a name and how full the bar is */
  const crazy = $derived(
    points < 6 ? { name: 'Gentle', fill: points / 6 / 4 } : points < 16 ? { name: 'Lively', fill: 0.25 + ((points - 6) / 10) * 0.25 } : points < 36 ? { name: 'Wild', fill: 0.5 + ((points - 16) / 20) * 0.25 } : { name: 'Insane', fill: Math.min(1, 0.75 + ((points - 36) / 60) * 0.25) },
  );

  function add() {
    if (design.shells.length >= maxShells) return;
    design.shells.splice(sel + 1, 0, newShell(shell));
    sel++;
  }
  function copy() {
    if (design.shells.length >= maxShells) return;
    const c = structuredClone($state.snapshot(shell)) as FwShell;
    design.shells.splice(sel + 1, 0, { ...c, x: c.x < 50 ? Math.min(90, c.x + 25) : Math.max(10, c.x - 25), delay: 600 });
    sel++;
  }
  function remove() {
    if (design.shells.length <= 1) return;
    design.shells.splice(sel, 1);
    sel = Math.max(0, sel - 1);
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

  const SIZES = [
    { v: 1, name: 'Small' },
    { v: 2, name: 'Medium' },
    { v: 3, name: 'Large' },
  ] as const;

  /** A little drawing of each kind of particle (in a 24 box) */
  const PARTICLE_ICON: Record<FwParticle, string> = {
    sparks: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
    glitter: 'M5 19l3-3M9 15l2-2M13 11l2-2M17 7l2-2M7 9h.01M11 5h.01M15 17h.01M19 13h.01',
    comets: 'M4 20L14 10M7 20l9-9M4 17l9-9M14 10l4-4',
    crackle: 'M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5zM5 18h.01M19 18h.01M18 4h.01',
    strobe: 'M12 3v3M12 10v4M12 18v3M3 12h3M10 12h4M18 12h3',
    willow: 'M12 6c-3 0-6 3-7 9M12 6c3 0 6 3 7 9M12 6c-1 2-2 6-2 12M12 6c1 2 2 6 2 12',
    split: 'M12 12l-5-5M7 7l-2 0M7 7l0-2M12 12l5-5M17 7h2M17 7V5M12 12v7M12 19l-2 2M12 19l2 2',
    twirl: 'M12 12c0-4 3-6 6-5M12 12c4 0 6 3 5 6M12 12c0 4-3 6-6 5M12 12c-4 0-6-3-5-6',
  };

  const where = $derived(`${shell.x < 34 ? 'Left' : shell.x > 66 ? 'Right' : 'Middle'}, ${shell.height < 34 ? 'low' : shell.height > 66 ? 'high' : 'halfway up'}, ${(shell.delay / 1000).toFixed(1)} s ${sel === 0 ? 'after launch' : 'after the one before'}`);
</script>

<div class="designer">
  <label class="name">
    <input class="input" type="text" maxlength={FW_NAME_MAX} bind:value={design.name} aria-label="Name of the show" placeholder="Name your show" />
  </label>

  <!-- The shells in order, as they go up: pick one to make it -->
  <div class="shells">
    {#each design.shells as s, i (i)}
      <button type="button" class="shell-chip" class:on={i === sel} onclick={() => (sel = i)} aria-label="Shell {i + 1}">
        <ShellThumb shell={s} size={34} />
        <span>{i + 1}{s.count > 1 ? ` x${s.count}` : ''}</span>
      </button>
    {/each}
    <button type="button" class="shell-chip add" disabled={design.shells.length >= maxShells} onclick={add} aria-label="Add a shell"><Plus size={20} /><span>Add</span></button>
  </div>

  {#if shell}
    <section class="card maker">
      <div class="maker-head">
        <strong>Shell {sel + 1}</strong>
        <div class="tools">
          <button type="button" class="icon-btn" disabled={sel === 0} onclick={() => move(-1)} aria-label="Go up earlier"><ArrowLeft size={16} /></button>
          <button type="button" class="icon-btn" disabled={sel >= design.shells.length - 1} onclick={() => move(1)} aria-label="Go up later"><ArrowRight size={16} /></button>
          <button type="button" class="icon-btn" disabled={design.shells.length >= maxShells} onclick={copy} aria-label="Copy this shell"><Copy size={16} /></button>
          <button type="button" class="icon-btn" disabled={design.shells.length <= 1} onclick={remove} aria-label="Remove this shell"><Trash2 size={16} /></button>
        </div>
      </div>

      <DrawPad {shell} />
      <div class="pad-bar">
        <button type="button" class="chip" disabled={!shell.strokes.length} onclick={() => shell.strokes.pop()}><Undo2 size={14} />Undo</button>
        <button type="button" class="chip" disabled={!shell.strokes.length} onclick={() => (shell.strokes = [])}><X size={14} />Clear</button>
        <span class="bar-sep"></span>
        <div class="templates">
          {#each FW_TEMPLATES as t (t.id)}
            <button type="button" class="template" onclick={() => (shell.strokes = structuredClone(t.strokes))} aria-label={t.name}>
              <ShellThumb shell={{ strokes: t.strokes, colors: shell.colors, size: 1 }} size={24} />
            </button>
          {/each}
        </div>
      </div>

      <div class="group">
        <span class="label">Colors <span class="faint">up to 3</span></span>
        <div class="colors">
          {#each FW_COLORS as c (c.id)}
            {@const n = shell.colors.indexOf(c.id)}
            <button type="button" class="color" class:on={n >= 0} style:--c={c.hex} aria-label={c.id} onclick={() => toggleColor(c.id)}></button>
          {/each}
        </div>
      </div>

      <div class="group">
        <span class="label">Particles</span>
        <div class="particles">
          {#each FW_PARTICLES as p (p.id)}
            <button type="button" class="particle" class:on={shell.particles === p.id} onclick={() => (shell.particles = p.id)} title={p.about}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={PARTICLE_ICON[p.id]} /></svg>
              <span>{p.name}</span>
            </button>
          {/each}
        </div>
        <p class="faint small about">{FW_PARTICLES.find((p) => p.id === shell.particles)?.about}</p>
      </div>

      <div class="two">
        <div class="group">
          <span class="label">Size</span>
          <div class="seg">
            {#each SIZES as z (z.v)}
              <button type="button" class:on={shell.size === z.v} onclick={() => (shell.size = z.v)}>{z.name[0]}</button>
            {/each}
          </div>
        </div>
        <div class="group">
          <span class="label">At once</span>
          <div class="seg">
            {#each Array.from({ length: FW_MAX_COUNT }, (_, i) => i + 1) as n (n)}
              <button type="button" class:on={shell.count === n} onclick={() => (shell.count = n)}>{n}</button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Where and when: set for you, changed only if wanted -->
      <button type="button" class="placing" class:open={placing} onclick={() => (placing = !placing)}>
        <span><span class="label">Where and when</span><span class="faint small">{where}</span></span>
        <ChevronDown size={18} />
      </button>
      {#if placing}
        <div class="sliders">
          <label class="slider"><span class="faint small">Across the sky</span><input type="range" min="0" max="100" bind:value={shell.x} /></label>
          <label class="slider"><span class="faint small">How high</span><input type="range" min="0" max="100" bind:value={shell.height} /></label>
          <label class="slider">
            <span class="faint small">{sel === 0 ? 'After the launch' : 'After the one before'}: {(shell.delay / 1000).toFixed(1)} s</span>
            <input type="range" min="0" max={sel === 0 ? 1000 : FW_MAX_DELAY} step="100" bind:value={shell.delay} />
          </label>
        </div>
      {/if}
    </section>
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
  <p class="faint small center">{launchNote || 'It is only seen on the TV: look up when you launch it.'}</p>
</div>

<style>
  .designer {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .label {
    font-size: 0.8rem;
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
  .name .input {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 600;
  }
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
    padding: 0.15rem 0.1rem 0.3rem;
    scrollbar-width: none;
  }
  .shell-chip {
    flex: none;
    display: grid;
    justify-items: center;
    gap: 0.1rem;
    min-width: 3.3rem;
    padding: 0.35rem 0.4rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: radial-gradient(circle at 50% 40%, #1b2150, #070a20);
    color: #e6e8ff;
    font-size: 0.72rem;
    font-weight: 600;
  }
  .shell-chip.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .shell-chip.add {
    place-content: center;
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .maker {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 0.9rem;
  }
  .maker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tools {
    display: flex;
    gap: 0.25rem;
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .icon-btn:disabled {
    opacity: 0.35;
  }
  .pad-bar {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: -0.3rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.82rem;
  }
  .chip:disabled {
    opacity: 0.4;
  }
  .bar-sep {
    width: 1px;
    height: 1.4rem;
    background: var(--border-strong);
  }
  /* The ready-made shapes: a tap draws one on the pad */
  .templates {
    flex: 1;
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .template {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: #0b0e24;
  }
  .colors {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 0.3rem;
  }
  .color {
    aspect-ratio: 1;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff 0 8%, var(--c) 45%);
  }
  .color.on {
    border-color: #fff;
    box-shadow: 0 0 10px 1px var(--c);
  }
  .particles {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.35rem;
  }
  .particle {
    display: grid;
    justify-items: center;
    gap: 0.15rem;
    padding: 0.5rem 0.2rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .particle.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
    color: var(--text);
  }
  .about {
    min-height: 1.2em;
  }
  .two {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.8rem;
  }
  .seg {
    display: flex;
    gap: 0.25rem;
  }
  .seg button {
    flex: 1;
    min-width: 2.1rem;
    padding: 0.45rem 0.2rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.88rem;
  }
  .seg button.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .placing {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    text-align: left;
  }
  .placing > span {
    display: grid;
  }
  .placing :global(svg) {
    flex: none;
    transition: transform 0.2s;
  }
  .placing.open :global(svg) {
    transform: rotate(180deg);
  }
  .sliders {
    display: grid;
    gap: 0.7rem;
    margin-top: -0.3rem;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
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
