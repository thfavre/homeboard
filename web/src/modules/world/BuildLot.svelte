<script lang="ts">
  import { onMount } from 'svelte';
  import { Box, Coins, Eraser, Flower2, Gift, Hourglass, Undo2, ZoomIn, ZoomOut } from '@lucide/svelte';
  import { attempt, hb, onEvent, rpc } from '$lib/client.svelte.ts';
  import { SPRITE_SCALE } from '$shared/crowd.ts';
  import type { WorldState } from '$shared/world.ts';
  import {
    BLOCKS,
    BLOCK_UP,
    LOT,
    LOT_CW,
    LOT_RH,
    PROPS,
    applyJob,
    cellAt,
    jobProblem,
    jobTier,
    propAt,
    propById,
    type LotGrid,
    type LotJob,
    type LotMine,
  } from '$shared/worldBuild.ts';
  import { loadEnv, type Env } from '../games/crowd/scene.ts';
  import { blockSwatch, drawLotGround, loadLotArt, lotProps, propSwatch, type LotArt } from './lotArt.ts';

  /**
   * The build lot on the phone: the lot as the TV shows it, a palette of blocks and decorations, and
   * a tap on the lot to put the chosen piece there (or take one away). The guest's character then
   * walks over on the TV and puts it up: until then the piece shows faint here. What it costs comes
   * from the day's free share first, then from the town money.
   */

  const S = SPRITE_SCALE;
  const world = $derived(hb.modules.world as WorldState | undefined);
  const info = $derived(world?.lot);
  const money = $derived(world?.shop?.currencyName ?? 'money');

  let mine = $state<LotMine | null>(null);
  let tool = $state<'block' | 'prop' | 'remove'>('block');
  let block = $state('stone');
  let prop = $state('flower');
  let variant = $state(0);
  let zoomed = $state(false);
  let busy = $state(false);
  let note = $state<{ text: string; bad: boolean } | null>(null);

  let env = $state<Env | null>(null);
  let art = $state<LotArt | null>(null);
  let canvas = $state<HTMLCanvasElement>();
  let width = $state(0);

  /** What the canvas shows of the world: the lot, its fence, and room above it for tall pieces on its back row */
  const VIEW = { x0: LOT.x0 - 14, x1: LOT.x1 + 14, y0: LOT.y0 - 120, y1: LOT.y1 + 16 };
  const VW = VIEW.x1 - VIEW.x0;
  const VH = VIEW.y1 - VIEW.y0;

  onMount(() => {
    void loadEnv().then((e) => (env = e));
    void loadLotArt().then((a) => (art = a));
    return onEvent<LotMine>('world', 'lotMine', (m) => (mine = m));
  });

  // Fetched on every connection (changes while away were missed)
  $effect(() => {
    if (!hb.connected) return;
    rpc<LotMine>('world', 'lotMine')
      .then((m) => (mine = m))
      .catch(() => {});
  });

  /** The lot as it will stand once the guest's own pieces are up (the others' are not known here) */
  const planned = $derived.by((): LotGrid | null => {
    if (!info) return null;
    const grid: LotGrid = { blocks: Object.fromEntries(Object.entries(info.grid.blocks).map(([k, v]) => [k, [...v]])), props: [...info.grid.props] };
    let id = -1;
    for (const p of mine?.pending ?? []) if (!jobProblem(grid, p.job)) applyJob(grid, p.job, () => id--);
    return grid;
  });

  // ------------------------------------------------------------ drawing

  $effect(() => {
    const c = canvas;
    const grid = planned;
    const built = info?.grid;
    const w = width * (zoomed ? 2 : 1);
    if (!c || !grid || !built || !env || !w) return;
    const dpr = window.devicePixelRatio || 1;
    const k = w / VW;
    c.style.width = `${w}px`;
    c.style.height = `${VH * k}px`;
    c.width = Math.round(w * dpr);
    c.height = Math.round(VH * k * dpr);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.setTransform(k * dpr, 0, 0, k * dpr, -VIEW.x0 * k * dpr, -VIEW.y0 * k * dpr);
    // The square's paving around the lot
    g.fillStyle = '#8b8f9c';
    g.fillRect(VIEW.x0, VIEW.y0, VW, VH);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = VIEW.y0; y < VIEW.y1; y += 43) for (let x = VIEW.x0 + ((y / 43) % 2) * 21; x < VIEW.x1; x += 43) g.fillRect(x, y, 41, 41);
    drawLotGround(g);
    const things = lotProps(env, art, grid, built).sort((a, b) => a.y - b.y);
    for (const p of things) p.ground?.(g, 0);
    for (const p of things) p.draw(g, 0);
    // The guest's own pieces to take away: a red cross over each
    for (const p of mine?.pending ?? []) {
      if (p.job.kind !== 'remove') continue;
      const x = LOT.x0 + (p.job.c + 0.5) * LOT_CW;
      const y = LOT.y0 + (p.job.r + 0.5) * LOT_RH;
      g.strokeStyle = 'rgba(220,60,50,0.9)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x - 7, y - 7);
      g.lineTo(x + 7, y + 7);
      g.moveTo(x + 7, y - 7);
      g.lineTo(x - 7, y + 7);
      g.stroke();
    }
  });

  // ------------------------------------------------------------ the palette

  /** Each piece's picture, made once */
  const pictures = new Map<string, string>();
  function picture(key: string, make: () => HTMLCanvasElement | null): string | null {
    if (!pictures.has(key)) {
      const c = make();
      if (!c) return null;
      pictures.set(key, c.toDataURL());
    }
    return pictures.get(key)!;
  }
  const blockPicture = (id: string) => picture(`b:${id}`, () => blockSwatch(id));
  const propPicture = (id: string, v: number) => (env ? picture(`p:${id}:${v}:${!!art}`, () => propSwatch(env!, art, id, v)) : null);

  const chosenProp = $derived(propById(prop));
  /** What the chosen piece costs, and what the guest pays of it now (the free share first) */
  const price = $derived.by(() => {
    if (!info || tool === 'remove') return 0;
    const job: LotJob = tool === 'block' ? { kind: 'block', c: 0, r: 0, what: block } : { kind: 'prop', c: 0, r: 0, what: prop, v: variant };
    const tier = jobTier(job);
    return tier ? info.prices[tier] : 0;
  });
  const freeNow = $derived(Math.min(price, mine?.freeLeft ?? 0));

  function pickProp(id: string) {
    prop = id;
    variant = 0;
  }

  // ------------------------------------------------------------ tapping the lot

  /** What a tap at a point of the world lands on: the column or decoration drawn there (front first), else the cell on the ground */
  function hit(x: number, y: number): { c: number; r: number; on: 'column' | 'prop' | 'ground' } | null {
    const grid = planned;
    if (!grid) return null;
    const things: { c: number; r: number; y: number; x0: number; x1: number; top: number; on: 'column' | 'prop' }[] = [];
    for (const [key, list] of Object.entries(grid.blocks)) {
      const i = Number(key);
      const c = i % LOT.cols;
      const r = Math.floor(i / LOT.cols);
      const bottom = LOT.y0 + (r + 1) * LOT_RH;
      things.push({ c, r, y: bottom, x0: LOT.x0 + c * LOT_CW, x1: LOT.x0 + (c + 1) * LOT_CW, top: bottom - list.length * BLOCK_UP * S - LOT_RH, on: 'column' });
    }
    for (const p of grid.props) {
      const def = propById(p.kind);
      if (!def) continue;
      const bottom = LOT.y0 + (p.r + def.d) * LOT_RH;
      things.push({ c: p.c, r: p.r, y: bottom, x0: LOT.x0 + p.c * LOT_CW, x1: LOT.x0 + (p.c + def.w) * LOT_CW, top: bottom - Math.max(def.d * LOT_RH, 40), on: 'prop' });
    }
    things.sort((a, b) => b.y - a.y);
    const t = things.find((t) => x >= t.x0 && x < t.x1 && y >= t.top && y < t.y);
    if (t) return { c: t.c, r: t.r, on: t.on };
    const cell = cellAt(x, y);
    return cell ? { ...cell, on: 'ground' } : null;
  }

  async function tap(e: MouseEvent) {
    if (!canvas || !planned || busy) return;
    const rect = canvas.getBoundingClientRect();
    const k = rect.width / VW;
    const x = VIEW.x0 + (e.clientX - rect.left) / k;
    const y = VIEW.y0 + (e.clientY - rect.top) / k;
    const at = hit(x, y);
    if (!at) return;
    let job: LotJob;
    if (tool === 'remove') {
      // One of the guest's own pieces still on its way there: taken back instead (and paid back)
      const own = [...(mine?.pending ?? [])].reverse().find((p) => p.job.kind !== 'remove' && covers(p.job, at.c, at.r));
      if (own) {
        await send(() => rpc<LotMine>('world', 'lotCancel', { id: own.id }), 'Taken back, and paid back');
        return;
      }
      const p = propAt(planned, at.c, at.r);
      job = { kind: 'remove', c: p?.c ?? at.c, r: p?.r ?? at.r };
    } else if (tool === 'block') {
      job = { kind: 'block', c: at.c, r: at.r, what: block };
    } else {
      // The tapped cell is the middle of the decoration's front row
      const def = chosenProp;
      if (!def) return;
      const c = Math.max(0, Math.min(LOT.cols - def.w, at.c - Math.floor((def.w - 1) / 2)));
      const r = Math.max(0, Math.min(LOT.rows - def.d, at.r - (def.d - 1)));
      job = { kind: 'prop', c, r, what: prop, v: variant };
    }
    const why = jobProblem(planned, job);
    if (why) {
      note = { text: why, bad: true };
      return;
    }
    await send(() => rpc<LotMine>('world', 'lotPlace', { job }), job.kind === 'remove' ? 'Your character will take it away' : 'Your character is on the way to put it up');
  }

  /** A job works on this cell */
  function covers(job: LotJob, c: number, r: number): boolean {
    const def = job.kind === 'prop' ? propById(job.what) : undefined;
    return c >= job.c && c < job.c + (def?.w ?? 1) && r >= job.r && r < job.r + (def?.d ?? 1);
  }

  async function send(call: () => Promise<LotMine>, done: string) {
    busy = true;
    try {
      mine = await call();
      note = { text: done, bad: false };
    } catch (err) {
      note = { text: (err as Error).message, bad: true };
    } finally {
      busy = false;
    }
  }

  const waiting = $derived(mine?.pending.length ?? 0);
</script>

{#if !info}
  <p class="faint small">Loading the lot...</p>
{:else}
  <div class="lot">
    <div class="stats">
      <span class="stat" title="What you can still build for free today, on the town's clock"><Gift size={15} />{mine?.freeLeft ?? info.freePerDay} free today</span>
      <span class="stat"><Coins size={15} />{mine?.balance ?? 0} {money}</span>
      {#if waiting}
        <span class="stat accent"><Hourglass size={15} />{waiting} on the way</span>
        <button type="button" class="btn small" disabled={busy} onclick={() => send(() => rpc<LotMine>('world', 'lotCancel'), 'Everything taken back, and paid back')}>
          <Undo2 size={14} />Take back
        </button>
      {/if}
    </div>

    {#if !info.on}
      <p class="closed">The host has closed the lot for now: you can look, but not build.</p>
    {/if}

    <div class="frame">
      <div class="view" bind:clientWidth={width}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <canvas bind:this={canvas} class:off={!info.on} onclick={tap} aria-label="The build lot: tap where the piece goes"></canvas>
      </div>
      <button type="button" class="zoom" onclick={() => (zoomed = !zoomed)} aria-label={zoomed ? 'Zoom out' : 'Zoom in'}>
        {#if zoomed}<ZoomOut size={18} />{:else}<ZoomIn size={18} />{/if}
      </button>
    </div>

    <div class="tools" role="tablist">
      <button type="button" role="tab" class="tool" class:on={tool === 'block'} aria-selected={tool === 'block'} onclick={() => (tool = 'block')}><Box size={16} />Blocks</button>
      <button type="button" role="tab" class="tool" class:on={tool === 'prop'} aria-selected={tool === 'prop'} onclick={() => (tool = 'prop')}><Flower2 size={16} />Decorations</button>
      <button type="button" role="tab" class="tool" class:on={tool === 'remove'} aria-selected={tool === 'remove'} onclick={() => (tool = 'remove')}><Eraser size={16} />Take away</button>
    </div>

    {#if tool === 'block'}
      <div class="palette">
        {#each BLOCKS as b (b.id)}
          {@const pic = blockPicture(b.id)}
          <button type="button" class="piece" class:on={block === b.id} onclick={() => (block = b.id)} title={b.name}>
            {#if pic}<img src={pic} alt="" />{/if}
            <span class="name">{b.name}</span>
            {#if b.tier === 'fancy'}<span class="fancy">Fancy</span>{/if}
          </button>
        {/each}
      </div>
    {:else if tool === 'prop'}
      <div class="palette">
        {#each PROPS as p (p.id)}
          {@const pic = propPicture(p.id, 0)}
          <button type="button" class="piece" class:on={prop === p.id} onclick={() => pickProp(p.id)} title={p.name}>
            {#if pic}<img src={pic} alt="" class="tall" />{/if}
            <span class="name">{p.name}</span>
          </button>
        {/each}
      </div>
      {#if chosenProp?.variants}
        <div class="variants">
          {#each chosenProp.variants as name, i (name)}
            {@const pic = propPicture(chosenProp.id, i)}
            <button type="button" class="variant" class:on={variant === i} onclick={() => (variant = i)} title={name} aria-label={name}>
              {#if pic}<img src={pic} alt="" />{/if}
            </button>
          {/each}
        </div>
      {/if}
    {/if}

    <p class="hint small">
      {#if tool === 'remove'}
        Tap a piece to take it away (anyone's): your character goes and does it, for free. Tapping one of yours still on its way takes it back and pays it back.
      {:else if price === 0}
        Tap the lot to put it there: it is free.
      {:else if freeNow >= price}
        Tap the lot to put it there: free today (it costs {price} {money}).
      {:else}
        Tap the lot to put it there: {price - freeNow} {money}{freeNow ? ` (and ${freeNow} from today's free share)` : ''}.
      {/if}
      {#if tool === 'block'}Tap a column to stack on it.{/if}
    </p>
    {#if note}
      <p class="note small" class:bad={note.bad}>{note.text}</p>
    {/if}
  </div>
{/if}

<style>
  .lot {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  .stat.accent {
    border-color: var(--accent);
    color: var(--accent);
  }
  .stats .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-left: auto;
  }
  .closed {
    margin: 0;
    padding: 0.5rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border));
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.88rem;
  }
  .frame {
    position: relative;
  }
  .view {
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    max-height: 62vh;
  }
  canvas {
    display: block;
    image-rendering: pixelated;
    cursor: crosshair;
    touch-action: pan-x pan-y;
  }
  canvas.off {
    cursor: default;
    opacity: 0.85;
  }
  .zoom {
    position: absolute;
    right: 0.5rem;
    bottom: 0.5rem;
    display: grid;
    place-items: center;
    width: 2.2rem;
    height: 2.2rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    color: var(--text);
  }
  .tools {
    display: flex;
    gap: 0.35rem;
  }
  .tool {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.5rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: 0.86rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .tool.on {
    border-color: var(--accent);
    color: var(--text);
    background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  }
  .palette {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding-bottom: 0.3rem;
    scroll-snap-type: x proximity;
  }
  .piece {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 0.25rem;
    width: 4.6rem;
    height: 5.4rem;
    padding: 0.35rem 0.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
    scroll-snap-align: start;
  }
  .piece.on {
    border-color: var(--accent);
    color: var(--text);
    box-shadow: 0 0 0 1px var(--accent) inset;
  }
  .piece img {
    width: 2rem;
    image-rendering: pixelated;
  }
  .piece img.tall {
    width: auto;
    max-width: 3.4rem;
    max-height: 3.2rem;
  }
  .name {
    font-size: 0.72rem;
    line-height: 1.1;
    text-align: center;
  }
  .fancy {
    position: absolute;
    top: 0.2rem;
    right: 0.2rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--warning) 25%, transparent);
    color: var(--warning);
    font-size: 0.6rem;
    font-weight: 700;
  }
  .variants {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .variant {
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .variant.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent) inset;
  }
  .variant img {
    max-width: 2.1rem;
    max-height: 2.1rem;
    image-rendering: pixelated;
  }
  .small {
    font-size: 0.82rem;
  }
  .hint,
  .note {
    margin: 0;
    color: var(--text-dim);
  }
  .note {
    color: var(--success);
  }
  .note.bad {
    color: var(--danger);
  }
</style>
