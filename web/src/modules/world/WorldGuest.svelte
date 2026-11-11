<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Loader2 } from '@lucide/svelte';
  import { attempt, hb, rpc, storageGet, storageSet } from '$lib/client.svelte.ts';
  import { BEARDS, DEFAULT_CHOICES, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, SKINS, type AvatarChoices, type SheetInfo } from '$shared/world.ts';
  import Picker from './Picker.svelte';

  /**
   * The avatar editor: pick a body, skin, hair and eyes, watch the character live, then move into
   * the town. The server composites a sheet for every look; the preview shows it walking.
   */

  let choices = $state<AvatarChoices>({ ...DEFAULT_CHOICES });
  let saved = $state<string | null>(null);
  let url = $state<string | null>(null);
  let sheet = $state<SheetInfo | null>(null);
  let buildingCount = $state(0);
  let firstLoad = $state(true);

  const dirty = $derived(saved !== JSON.stringify(choices));

  /** Swatch colors, roughly the LPC palettes */
  const SKIN_HEX: Record<string, string> = {
    light: '#f6cfa0', amber: '#dba26a', olive: '#c8a070', taupe: '#b58d68', bronze: '#a9703f', brown: '#8a5a34', black: '#5c3b24',
  };
  const HAIR_HEX: Record<string, string> = {
    black: '#1e1d22', raven: '#2c2b38', dark_brown: '#4b3321', chestnut: '#6d4529', light_brown: '#8d6239', blonde: '#d8ab51',
    platinum: '#e9e2d2', sandy: '#c7a05e', ginger: '#b65c20', redhead: '#953c1c', strawberry: '#c76a48', gray: '#9b9b9f',
    white: '#f1f1ee', pink: '#e481b5', purple: '#8c4bc9', blue: '#4b6cc9', green: '#4b9b5c', red: '#b02d2b',
  };
  const EYE_HEX: Record<string, string> = {
    brown: '#6d4529', blue: '#5686ae', green: '#53b351', gray: '#8b8b94', purple: '#b90da0', red: '#cb4a39', orange: '#d97d2c', yellow: '#d9c32e',
  };

  const colorName = (id: string) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const hairColorItems = HAIR_COLORS.map((c) => ({ id: c, name: colorName(c), color: HAIR_HEX[c] }));

  // ------------------------------------------------------------ preview

  let debounce: ReturnType<typeof setTimeout> | undefined;
  let wanted = '';

  async function build(c: AvatarChoices): Promise<void> {
    const key = JSON.stringify(c);
    wanted = key;
    buildingCount++;
    try {
      const r = await rpc<{ url: string; sheet: SheetInfo }>('world', 'preview', { choices: c });
      if (wanted === key) {
        url = r.url;
        sheet = r.sheet;
      }
    } catch {
      // A broken look stays on the last preview; saving would show the error
    } finally {
      buildingCount--;
    }
  }

  /** Editing the head zooms the preview onto it until then; a body or skin change zooms out */
  let headUntil = 0;
  let lastHead = '';
  let lastBody = '';

  /** Half-made looks survive leaving the panel (home, a game starting): kept on the phone */
  const DRAFT_KEY = 'hb.world.draft';

  $effect(() => {
    const snapshot = JSON.stringify(choices);
    const head = JSON.stringify([choices.hair, choices.hairColor, choices.beard, choices.eyes]);
    const body = JSON.stringify([choices.body, choices.skin]);
    if (firstLoad) return;
    if (lastHead && head !== lastHead) headUntil = Date.now() + 5500;
    if (lastBody && body !== lastBody) headUntil = 0;
    lastHead = head;
    lastBody = body;
    storageSet(DRAFT_KEY, snapshot === saved ? null : JSON.stringify({ id: hb.me?.id, choices: JSON.parse(snapshot) }));
    clearTimeout(debounce);
    debounce = setTimeout(() => void build(JSON.parse(snapshot)), 350);
    return () => clearTimeout(debounce);
  });

  onMount(() => {
    void (async () => {
      const mine = await rpc<AvatarChoices | null>('world', 'mine').catch(() => null);
      if (mine) {
        choices = mine;
        saved = JSON.stringify(mine);
      }
      // A half-made look from last time wins over the saved one, so nothing is lost
      try {
        const draft = JSON.parse(storageGet(DRAFT_KEY) ?? 'null');
        if (draft?.id === hb.me?.id && draft.choices) choices = { ...DEFAULT_CHOICES, ...draft.choices };
      } catch {
        // A broken draft is just dropped
      }
      firstLoad = false;
      void build($state.snapshot(choices) as AvatarChoices);
    })();
  });

  async function save() {
    const c = $state.snapshot(choices) as AvatarChoices;
    const done = await attempt(() => rpc('world', 'save', { choices: c }), 'Saved');
    if (done) {
      saved = JSON.stringify(c);
      storageSet(DRAFT_KEY, null);
    }
  }

  // ------------------------------------------------------------ the live preview

  let canvas = $state<HTMLCanvasElement>();
  const img = new Image();
  let imgReady = $state(false);
  $effect(() => {
    if (!url) return;
    imgReady = false;
    const me = url;
    img.onload = () => {
      if (me === url) imgReady = true;
    };
    img.src = url;
  });

  $effect(() => {
    if (!canvas) return;
    let raf = 0;
    let zoom = 0;
    let last = Date.now();
    const g = canvas.getContext('2d')!;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, canvas!.width, canvas!.height);
      if (!imgReady || !sheet) return;
      // Walking toward the camera, steady: turning around was found annoying
      const row = sheet.rows.walkDown ?? sheet.rows.walk;
      if (!row) return;
      const count = Math.max(1, row.frames - 1);
      const frame = row.frames > 1 ? 1 + (Math.floor(now / 110) % count) : 0;
      const px = sheet.frame;
      // Editing the head glides the view onto it, and out again after a few untouched seconds
      zoom += ((now < headUntil ? 1 : 0) - zoom) * Math.min(1, dt * 7);
      const headSize = 34;
      const headY = Math.max(0, (sheet.body.top ?? 8) - 3);
      const ease = zoom * zoom * (3 - 2 * zoom);
      const size = px + (headSize - px) * ease;
      const sx = ((px - headSize) / 2) * ease;
      const sy = headY * ease;
      g.drawImage(img, frame * px + sx, row.row * px + sy, size, size, 0, 0, canvas!.width, canvas!.height);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="editor">
  <div class="stage card">
    <canvas bind:this={canvas} width="192" height="192"></canvas>
    {#if buildingCount > 0}
      <span class="building"><Loader2 size={18} class="spin" /></span>
    {/if}
  </div>

  <div class="group">
    <span class="label">Body</span>
    <div class="row">
      {#each ['male', 'female'] as const as b}
        <button type="button" class="pick wide" class:on={choices.body === b} onclick={() => (choices.body = b)}>{b === 'male' ? 'Male' : 'Female'}</button>
      {/each}
    </div>
  </div>

  <div class="group">
    <span class="label">Skin</span>
    <div class="row">
      {#each SKINS as s}
        <button type="button" class="swatch" class:on={choices.skin === s} style:background={SKIN_HEX[s]} aria-label={s} onclick={() => (choices.skin = s)}></button>
      {/each}
    </div>
  </div>

  <Picker label="Hair" items={HAIR_STYLES} value={choices.hair} onchange={(id) => (choices.hair = id)} />
  <Picker label="Hair color" items={hairColorItems} value={choices.hairColor} per={6} onchange={(id) => (choices.hairColor = id)} />
  <Picker label="Facial hair" items={BEARDS} value={choices.beard} onchange={(id) => (choices.beard = id)} />

  <div class="group">
    <span class="label">Eyes</span>
    <div class="row">
      {#each EYE_COLORS as c}
        <button type="button" class="swatch" class:on={choices.eyes === c} style:background={EYE_HEX[c]} aria-label={c} onclick={() => (choices.eyes = c)}></button>
      {/each}
    </div>
  </div>

  <button type="button" class="btn primary save" disabled={!dirty || buildingCount > 0} onclick={save}>
    <Check size={18} />
    {saved ? 'Save my look' : 'Move into the town'}
  </button>
  <p class="faint hint">You start in your underwear. Clothes come to the town's shop soon.</p>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .stage {
    display: grid;
    place-items: center;
    padding: 0.8rem;
    position: relative;
    background:
      linear-gradient(rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.12)),
      var(--surface-2);
  }
  .stage canvas {
    width: 10rem;
    height: 10rem;
    image-rendering: pixelated;
  }
  .building {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    color: var(--text-dim);
    display: grid;
  }
  .building :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .row {
    display: flex;
    gap: 0.45rem;
  }
  .pick {
    padding: 0.42rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.9rem;
  }
  .pick.wide {
    flex: 1;
    padding: 0.6rem;
  }
  .pick.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .swatch {
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 50%;
    border: 2px solid var(--border);
    padding: 0;
  }
  .swatch.on {
    border-color: var(--accent);
    outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .save {
    justify-content: center;
  }
  .hint {
    margin: -0.4rem 0 0;
    text-align: center;
    font-size: 0.85rem;
  }
</style>
