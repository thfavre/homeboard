<script lang="ts">
  import { ArrowLeft, ArrowRight, Check, Coins, Copy, Plus, Save, Trash2, Undo2, X } from '@lucide/svelte';
  import { hb } from '$lib/client.svelte.ts';
  import { FW_COLORS, FW_NAME_MAX, FW_PARTICLES, FW_TEMPLATES, fireworkCost, newShell, type FwDesign, type FwParticle, type FwPoint, type FwShell } from '$shared/worldActions.ts';
  import type { WorldState } from '$shared/world.ts';
  import DrawPad from './DrawPad.svelte';
  import ShellThumb from './ShellThumb.svelte';

  /**
   * Make a firework show, shell by shell: draw each one's shape with a finger (or start from a
   * ready-made one), pick its colors and particles, and how big. Where and when it goes up is set
   * for you and can be changed below. Saved here, launched from the list; the show itself is only
   * seen on the TV, and the crazier it gets, the more it costs.
   */
  let {
    design = $bindable(),
    busy = false,
    onsave,
    oncancel,
  }: {
    design: FwDesign;
    busy?: boolean;
    onsave: () => void;
    oncancel: () => void;
  } = $props();

  const world = $derived(hb.modules.world as WorldState | undefined);
  const fw = $derived(world?.actions?.fireworks);
  const currency = $derived(world?.shop?.currencyName ?? '');
  const maxShells = $derived(fw?.maxShells ?? 12);

  let sel = $state(0);
  const shell = $derived(design.shells[Math.min(sel, design.shells.length - 1)]);
  const cost = $derived(fw ? fireworkCost(design, fw) : 0);

  /**
   * Each shell's drawings before each change (a line drawn, a ready-made shape, clearing it):
   * Undo goes back one change, whatever it was
   */
  const history = new Map<FwShell, FwPoint[][][]>();
  const remember = () => {
    const past = history.get(shell) ?? [];
    past.push(structuredClone($state.snapshot(shell.strokes)) as FwPoint[][]);
    history.set(shell, past.slice(-40));
    changes++;
  };
  /** Counts the changes, so Undo knows when it has something to go back to */
  let changes = $state(0);
  const canUndo = $derived((void changes, (history.get(shell)?.length ?? 0) > 0));
  function undo() {
    const before = history.get(shell)?.pop();
    if (before) shell.strokes = before;
    changes++;
  }
  function setStrokes(strokes: FwPoint[][]) {
    remember();
    shell.strokes = structuredClone(strokes);
  }

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

</script>

<div class="designer">
  <label class="name">
    <input class="input" type="text" maxlength={FW_NAME_MAX} bind:value={design.name} aria-label="Name of the show" placeholder="Name your show" />
  </label>

  <!-- The rockets of the show, in the order they go up: pick one to make it -->
  <div class="group">
    <span class="label">Rockets <span class="faint">go up one after the other</span></span>
    <div class="shells">
      {#each design.shells as s, i (i)}
        <button type="button" class="shell-chip" class:on={i === sel} onclick={() => (sel = i)} aria-label="Rocket {i + 1}">
          <ShellThumb shell={s} size={34} />
          <span>{i + 1}</span>
        </button>
      {/each}
      <button type="button" class="shell-chip add" disabled={design.shells.length >= maxShells} onclick={add} aria-label="Add a rocket"><Plus size={20} /><span>Add</span></button>
    </div>
  </div>

  {#if shell}
    <section class="card maker">
      <div class="maker-head">
        <strong>Rocket {sel + 1}</strong>
        <div class="tools">
          <button type="button" class="icon-btn" disabled={sel === 0} onclick={() => move(-1)} aria-label="Go up earlier"><ArrowLeft size={16} /></button>
          <button type="button" class="icon-btn" disabled={sel >= design.shells.length - 1} onclick={() => move(1)} aria-label="Go up later"><ArrowRight size={16} /></button>
          <button type="button" class="icon-btn" disabled={design.shells.length >= maxShells} onclick={copy} aria-label="Copy this rocket"><Copy size={16} /></button>
          <button type="button" class="icon-btn" disabled={design.shells.length <= 1} onclick={remove} aria-label="Remove this rocket"><Trash2 size={16} /></button>
        </div>
      </div>

      <DrawPad {shell} {remember} />
      <div class="pad-bar">
        <button type="button" class="chip" disabled={!canUndo} onclick={undo} aria-label="Undo"><Undo2 size={14} /></button>
        <button type="button" class="chip" disabled={!shell.strokes.length} onclick={() => setStrokes([])} aria-label="Clear"><X size={14} /></button>
        <span class="bar-sep"></span>
        <div class="templates">
          {#each FW_TEMPLATES as t (t.id)}
            <button type="button" class="template" onclick={() => setStrokes(t.strokes)} aria-label={t.name}>
              <ShellThumb shell={{ strokes: t.strokes, colors: shell.colors, size: 1 }} size={24} />
            </button>
          {/each}
        </div>
      </div>

      <div class="group">
        <span class="label">Colors <span class="faint">up to 3</span></span>
        <div class="colors">
          {#each FW_COLORS as c (c.id)}
            {@const on = shell.colors.includes(c.id)}
            <button type="button" class="color" class:on style:--c={c.hex} aria-label={c.id} aria-pressed={on} onclick={() => toggleColor(c.id)}>
              {#if on}<Check size={14} strokeWidth={3.5} />{/if}
            </button>
          {/each}
        </div>
      </div>

      <div class="group">
        <span class="label">Particles</span>
        <div class="particles">
          {#each FW_PARTICLES as p (p.id)}
            <button type="button" class="particle" class:on={shell.particles === p.id} onclick={() => (shell.particles = p.id)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={PARTICLE_ICON[p.id]} /></svg>
              <span>{p.name}</span>
            </button>
          {/each}
        </div>
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
        <label class="group">
          <span class="label">Height</span>
          <input type="range" min="0" max="100" bind:value={shell.height} />
        </label>
      </div>
    </section>
  {/if}

  <!-- Saved, it goes back to the list, where it is launched; what a launch costs on the button -->
  <div class="actions">
    <button type="button" class="btn" onclick={oncancel} disabled={busy}>Back</button>
    <button type="button" class="btn primary" onclick={onsave} disabled={busy}>
      <Save size={17} />Save
      <span class="price" title="What a launch costs"><Coins size={14} />{cost} {currency}</span>
    </button>
  </div>
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
  .group {
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
  /* The colors not picked stay dim and small; a picked one is lit, ringed in white and ticked */
  .color {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff 0 8%, var(--c) 45%);
    color: #111;
    opacity: 0.45;
    transform: scale(0.82);
    transition:
      transform 0.15s,
      opacity 0.15s;
  }
  .color.on {
    opacity: 1;
    transform: none;
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 4px #fff,
      0 0 14px 3px var(--c);
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
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  .actions {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.5rem;
  }
  .actions .btn {
    justify-content: center;
  }
  .price {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.4rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.18);
    font-size: 0.85rem;
  }
</style>
