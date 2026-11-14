<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { Check, CircleAlert, Coins, Eraser, Hourglass, Lock, Undo2, ZoomIn, ZoomOut } from '@lucide/svelte';
  import { hb, onEvent, rpc } from '$lib/client.svelte.ts';
  import { SPRITE_SCALE } from '$shared/crowd.ts';
  import type { WorldState } from '$shared/world.ts';
  import {
    BLOCKS,
    BLOCK_UP,
    LOT,
    LOT_CW,
    LOT_RH,
    PROPS,
    PROP_CATS,
    applyJob,
    blockById,
    cellAt,
    jobProblem,
    jobTier,
    propAt,
    propById,
    type LotGrid,
    type LotJob,
    type LotMine,
    type PropCat,
  } from '$shared/worldBuild.ts';
  import { loadEnv, type Env } from '../games/crowd/scene.ts';
  import { blockSwatch, drawLotGround, loadLotArt, lotProps, propSwatch, type LotArt } from './lotArt.ts';

  /**
   * The build lot on the phone: the lot as the TV shows it, a palette of blocks and decorations, and
   * a tap on the lot to put the chosen piece there (or take one away). The guest's character then
   * walks over on the TV and puts it up: until then the piece shows faint here. Every piece shows
   * its price, paid from the town money when it is placed (taking one away is free).
   */

  const S = SPRITE_SCALE;
  const world = $derived(hb.modules.world as WorldState | undefined);
  const info = $derived(world?.lot);
  const money = $derived(world?.shop?.currencyName ?? 'money');

  let mine = $state<LotMine | null>(null);
  /** The category open in the picker (the blocks, a tier of decorations, or taking pieces away), and what a tap on the lot does then */
  type Cat = 'block' | 'fancy' | PropCat | 'remove';
  let cat = $state<Cat>('block');
  const tool = $derived(cat === 'remove' ? 'remove' : cat === 'block' || cat === 'fancy' ? 'block' : 'prop');
  /** What a category's pieces cost: one price, or from the cheapest to the dearest */
  function catPrice(c: Cat): string {
    if (!info || c === 'remove') return 'Free';
    if (c === 'block' || c === 'fancy') return String(info.prices[c]);
    const list = [...new Set(propsOf(c).map((p) => info!.prices[p.tier]))].sort((a, b) => a - b);
    return list.length > 1 ? `${list[0]}-${list.at(-1)}` : String(list[0] ?? 0);
  }
  let block = $state('stone');
  let prop = $state('flower');
  let variant = $state(0);
  let zoomed = $state(false);
  let busy = $state(false);
  let note = $state<{ text: string; bad: boolean } | null>(null);
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  /** A short message over the lot's picture, gone after a moment */
  function say(text: string, bad: boolean) {
    note = { text, bad };
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = null), bad ? 4000 : 2600);
  }
  /** Where the last tap landed: its cells light up for a moment (green: on its way, red: refused) */
  let flash = $state<{ c: number; r: number; w: number; d: number; ok: boolean } | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  function flashAt(c: number, r: number, w: number, d: number, ok: boolean) {
    flash = { c, r, w, d, ok };
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = null), 700);
  }

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
    // Where the last tap landed
    if (flash) {
      const x = LOT.x0 + flash.c * LOT_CW;
      const y = LOT.y0 + flash.r * LOT_RH;
      g.fillStyle = flash.ok ? 'rgba(120,230,140,0.28)' : 'rgba(240,90,80,0.3)';
      g.fillRect(x, y, flash.w * LOT_CW, flash.d * LOT_RH);
      g.strokeStyle = flash.ok ? 'rgba(140,240,160,0.95)' : 'rgba(250,110,100,0.95)';
      g.lineWidth = 2;
      g.strokeRect(x + 1, y + 1, flash.w * LOT_CW - 2, flash.d * LOT_RH - 2);
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
  /** What the chosen piece costs */
  const price = $derived.by(() => {
    if (!info || tool === 'remove') return 0;
    const job: LotJob = tool === 'block' ? { kind: 'block', c: 0, r: 0, what: block } : { kind: 'prop', c: 0, r: 0, what: prop, v: variant };
    const tier = jobTier(job);
    return tier ? info.prices[tier] : 0;
  });

  /** The decoration whose colors (or kinds) lie over its card to pick from, like the wardrobe's */
  let picking = $state<string | null>(null);

  /** A decoration's card tapped: in hand; one with colors opens them over its card (tapped again: closes) */
  function pickProp(id: string) {
    if (prop !== id) {
      prop = id;
      variant = 0;
    }
    picking = propById(id)?.variants && picking !== id ? id : null;
  }

  /** The picker's categories, each with a piece to show for it */
  const CATS: { id: Cat; name: string; example: () => string | null }[] = [
    { id: 'block', name: 'Blocks', example: () => blockPicture('brick') },
    { id: 'fancy', name: 'Fancy blocks', example: () => blockPicture('gold') },
    ...PROP_CATS.map((c) => ({ id: c.id as Cat, name: c.name, example: () => propPicture(c.example, 0) })),
    { id: 'remove', name: 'Take away', example: () => null },
  ];
  /** The pieces of a category */
  const blocksOf = (c: Cat) => BLOCKS.filter((b) => b.tier === c);
  const propsOf = (c: Cat) => PROPS.filter((p) => p.cat === c);

  /** Open a category: the piece in hand becomes its first one, unless the one in hand belongs to it */
  function openCat(c: Cat) {
    cat = c;
    picking = null;
    if (c === 'block' || c === 'fancy') {
      if (blockById(block)?.tier !== c) block = blocksOf(c)[0].id;
    } else if (c !== 'remove' && propById(prop)?.cat !== c) {
      prop = propsOf(c)[0].id;
      variant = 0;
    }
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
        const def = own.job.kind === 'prop' ? propById(own.job.what) : undefined;
        flashAt(own.job.c, own.job.r, def?.w ?? 1, def?.d ?? 1, true);
        await send(() => rpc<LotMine>('world', 'lotCancel', { id: own.id }), own.paid ? `Taken back: ${own.paid} ${money} paid back` : 'Taken back');
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
    const cells = job.kind === 'prop' ? { w: propById(job.what)?.w ?? 1, d: propById(job.what)?.d ?? 1 } : { w: 1, d: 1 };
    const why = !info?.on ? 'The lot is closed for now' : jobProblem(planned, job);
    flashAt(job.c, job.r, cells.w, cells.d, !why);
    if (why) {
      say(why, true);
      return;
    }
    await send(
      () => rpc<LotMine>('world', 'lotPlace', { job }),
      job.kind === 'remove' ? 'Your character will take it away' : price ? `${price} ${money}: your character is on the way` : 'Your character is on the way',
    );
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
      say(done, false);
    } catch (err) {
      say((err as Error).message, true);
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
    <!-- (the guest's money shows in the page's header, next to the party coins) -->
    {#if !info.on}
      <p class="closed"><Lock size={15} />The host has closed the lot for now: you can look, but not build.</p>
    {/if}

    <div class="frame">
      <div class="view" bind:clientWidth={width}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <canvas bind:this={canvas} class:off={!info.on} onclick={tap} aria-label="The build lot: tap where the piece goes"></canvas>
      </div>
      {#if waiting}
        <div class="queue" transition:fade={{ duration: 150 }}>
          <Hourglass size={14} />
          <span>{waiting} on the way</span>
          <button type="button" disabled={busy} onclick={() => send(() => rpc<LotMine>('world', 'lotCancel'), 'Everything taken back and paid back')} aria-label="Take back everything on the way">
            <Undo2 size={14} />
          </button>
        </div>
      {/if}
      <button type="button" class="zoom" onclick={() => (zoomed = !zoomed)} aria-label={zoomed ? 'Zoom out' : 'Zoom in'}>
        {#if zoomed}<ZoomOut size={18} />{:else}<ZoomIn size={18} />{/if}
      </button>
      {#key note}
        {#if note}
          <p class="note" class:bad={note.bad} in:fly={{ y: 8, duration: 160 }} out:fade={{ duration: 200 }}>
            {#if note.bad}<CircleAlert size={15} />{:else}<Check size={15} />{/if}{note.text}
          </p>
        {/if}
      {/key}
    </div>

    <!-- The piece in hand: what a tap on the lot does, and what it costs -->
    <div class="chosen">
      {#if tool === 'remove'}
        <span class="pic"><Eraser size={26} /></span>
        <span class="what">
          <strong>Take a piece away</strong>
          <span class="dim">Anyone's piece. Tapping one of yours still on its way takes it back and pays you back.</span>
        </span>
        <span class="cost free">Free</span>
      {:else}
        {@const pic = tool === 'block' ? blockPicture(block) : propPicture(prop, variant)}
        <span class="pic">{#if pic}<img src={pic} alt="" class:tall={tool === 'prop'} />{/if}</span>
        <span class="what">
          <strong>{tool === 'block' ? (blockById(block)?.name ?? '') : (chosenProp?.name ?? '')}{tool === 'prop' && chosenProp?.variants ? `, ${chosenProp.variants[variant]?.name.toLowerCase() ?? ''}` : ''}</strong>
          <span class="dim">{tool === 'block' ? 'Tap the ground, or a column to stack on it (5 high at most).' : 'Tap where its front goes.'}</span>
        </span>
        <span class="cost" class:dear={price > (mine?.balance ?? 0)}><Coins size={14} />{price}</span>
      {/if}
    </div>

    <!-- The picker: the categories on the left (each with a piece of it), the open one's pieces on the right -->
    <div class="picker">
      <div class="cats" role="tablist" aria-label="Categories">
        {#each CATS as c (c.id)}
          {@const pic = c.example()}
          <button type="button" role="tab" class="cat" class:on={cat === c.id} aria-selected={cat === c.id} onclick={() => openCat(c.id)}>
            <span class="cat-art">
              {#if c.id === 'remove'}<Eraser size={22} />{:else if pic}<img src={pic} alt="" class:tall={c.id !== 'block' && c.id !== 'fancy'} />{/if}
            </span>
            <span class="cat-name">{c.name}</span>
            <span class="cat-price">{catPrice(c.id)}{#if c.id !== 'remove'} <Coins size={11} />{/if}</span>
          </button>
        {/each}
      </div>

      <div class="pieces">
        {#if cat === 'remove'}
          <p class="empty">Tap any piece on the lot, yours or anyone's: your character goes and takes it away, for free. Tapping one of yours still on its way takes it back and pays you back.</p>
        {:else}
          <div class="grid">
            {#if cat === 'block' || cat === 'fancy'}
              {#each blocksOf(cat) as b (b.id)}
                {@const pic = blockPicture(b.id)}
                <button type="button" class="piece" class:on={block === b.id} class:dear={info.prices[b.tier] > (mine?.balance ?? 0)} onclick={() => (block = b.id)} title={b.name}>
                  <span class="name">{b.name}</span>
                  <span class="art">{#if pic}<img src={pic} alt="" />{/if}</span>
                  <span class="price">{info.prices[b.tier]} <Coins size={13} /></span>
                </button>
              {/each}
            {:else}
              {#each propsOf(cat) as p (p.id)}
                {@const v = prop === p.id ? variant : 0}
                {@const pic = propPicture(p.id, v)}
                <!-- While picking, the colors lie over the card, so its size never changes -->
                <div class="cell">
                  <button type="button" class="piece" class:on={prop === p.id} class:dear={info.prices[p.tier] > (mine?.balance ?? 0)} onclick={() => pickProp(p.id)} title={p.name}>
                    <span class="name">{p.name}</span>
                    <span class="art">{#if pic}<img src={pic} alt="" class="tall" />{/if}</span>
                    {#if p.variants?.some((x) => x.color)}
                      <span class="dots">
                        {#each p.variants as x, i (x.name)}<span class="dot" class:cur={i === v} style:background={x.color}></span>{/each}
                      </span>
                    {/if}
                    <span class="price">{info.prices[p.tier]} <Coins size={13} /></span>
                  </button>
                  {#if picking === p.id && p.variants}
                    <div class="vpick">
                      <span class="name">{p.name}</span>
                      <div class="squares" style:--cols={p.variants.length <= 4 ? 2 : 3}>
                        {#each p.variants as x, i (x.name)}
                          {@const vpic = x.color ? null : propPicture(p.id, i)}
                          <button
                            type="button"
                            class="square"
                            class:on={prop === p.id && variant === i}
                            style:background={x.color ?? null}
                            aria-label={x.name}
                            title={x.name}
                            onclick={() => ((variant = i), (picking = null))}
                          >{#if vpic}<img src={vpic} alt="" />{/if}</button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .lot {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .closed {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0;
    padding: 0.5rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border));
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.86rem;
  }
  .frame {
    position: relative;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--surface-2);
    box-shadow: var(--shadow);
  }
  .view {
    overflow: auto;
    max-height: 60vh;
    overscroll-behavior: contain;
  }
  canvas {
    display: block;
    image-rendering: pixelated;
    cursor: crosshair;
    touch-action: pan-x pan-y;
  }
  canvas.off {
    cursor: default;
    filter: saturate(0.6);
  }
  .queue {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.25rem 0.2rem 0.6rem;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 600;
    backdrop-filter: blur(4px);
  }
  .queue :global(svg:first-child) {
    color: var(--accent);
  }
  .queue button {
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border: 0;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text);
  }
  .zoom {
    position: absolute;
    right: 0.5rem;
    bottom: 0.5rem;
    display: grid;
    place-items: center;
    width: 2.3rem;
    height: 2.3rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    color: var(--text);
    backdrop-filter: blur(4px);
  }
  .note {
    position: absolute;
    left: 0.5rem;
    right: 3.3rem;
    bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    padding: 0.4rem 0.65rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 50%, var(--border));
    color: var(--text);
    font-size: 0.8rem;
    line-height: 1.25;
    pointer-events: none;
    backdrop-filter: blur(4px);
  }
  .note :global(svg) {
    flex: none;
    color: var(--success);
  }
  .note.bad {
    border-color: color-mix(in srgb, var(--danger) 55%, var(--border));
  }
  .note.bad :global(svg) {
    color: var(--danger);
  }



  .chosen {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .pic {
    flex: none;
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .pic img {
    width: 1.6rem;
    image-rendering: pixelated;
  }
  .pic img.tall {
    width: auto;
    max-width: 2.6rem;
    max-height: 2.7rem;
  }
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .what strong {
    font-size: 0.95rem;
  }
  .what .dim {
    font-size: 0.78rem;
    color: var(--text-dim);
    line-height: 1.3;
  }
  .cost {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .cost.free {
    background: color-mix(in srgb, var(--success) 18%, var(--surface-2));
    color: var(--success);
  }
  .cost.dear {
    background: color-mix(in srgb, var(--danger) 16%, var(--surface-2));
    color: var(--danger);
  }

  .picker {
    display: grid;
    grid-template-columns: 5.6rem 1fr;
    gap: 0.5rem;
    height: min(26rem, 62vh);
  }
  .cats,
  .pieces {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .cats {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-right: 0.15rem;
  }
  .cat {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.4rem 0.25rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .cat.on {
    border-color: var(--accent);
    color: var(--text);
    background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
    box-shadow: 0 0 0 1px var(--accent) inset;
  }
  .cat-art {
    display: grid;
    place-items: center;
    height: 2.4rem;
  }
  .cat-art img {
    width: 1.5rem;
    image-rendering: pixelated;
  }
  .cat-art img.tall {
    width: auto;
    max-width: 3rem;
    max-height: 2.4rem;
  }
  .cat-name {
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.1;
    text-align: center;
  }
  .cat-price {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .pieces {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4.6rem, 1fr));
    gap: 0.4rem;
  }
  .cell {
    position: relative;
    display: grid;
    min-width: 0;
  }
  /* A decoration's colors over its card, like the wardrobe's: its name on top, the squares filling the rest */
  .vpick {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.35rem 0.35rem 0.4rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    /* The theme's surface can be see-through: lay it on the page color so the card below hides */
    background:
      linear-gradient(var(--surface-2), var(--surface-2)),
      var(--bg);
    box-shadow: 0 0 0 1px var(--accent) inset;
  }
  .squares {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-auto-rows: 1fr;
    gap: 0.3rem;
    min-height: 0;
  }
  .square {
    display: grid;
    place-items: center;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    border: 2px solid color-mix(in srgb, #000 25%, transparent);
    border-radius: var(--radius-sm);
    background: var(--surface-3);
  }
  .square.on {
    border-color: var(--accent);
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .square img {
    max-width: 90%;
    max-height: 90%;
    image-rendering: pixelated;
  }
  .dots {
    display: flex;
    justify-content: center;
    gap: 0.2rem;
    height: 0.6rem;
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    border: 1px solid var(--border);
  }
  .dot.cur {
    outline: 1.5px solid var(--accent);
    outline-offset: 1px;
  }
  .empty {
    margin: 0;
    padding: 0.5rem;
    font-size: 0.84rem;
    line-height: 1.4;
    color: var(--text-dim);
  }







  /* A piece's card, like the shop's: its name on top, its picture, its price at the bottom */
  .piece {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.35rem 0.3rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    transition:
      border-color 0.15s,
      transform 0.1s;
  }
  .piece:active {
    transform: scale(0.96);
  }
  .piece.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
    box-shadow: 0 0 0 1px var(--accent) inset;
  }
  .piece.dear {
    opacity: 0.55;
  }
  .name {
    width: 100%;
    font-size: 0.74rem;
    font-weight: 700;
    line-height: 1.15;
    text-align: center;
    color: #fff;
    text-shadow:
      -1px -1px 0 #000,
      1px -1px 0 #000,
      -1px 1px 0 #000,
      1px 1px 0 #000,
      0 0 3px #000;
    min-height: 2.3em;
    display: grid;
    place-items: center;
  }
  .art {
    display: grid;
    place-items: center;
    height: 3rem;
  }
  .art img {
    width: 1.8rem;
    image-rendering: pixelated;
  }
  .art img.tall {
    width: auto;
    max-width: 3.6rem;
    max-height: 3rem;
  }
  .price {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .small {
    font-size: 0.82rem;
  }
</style>
