<script lang="ts">
  import { Download, Minus, Plus, Trash2 } from '@lucide/svelte';
  import type { GamesSettings } from '$shared/games.ts';
  import { WALLRUSH_LEVELS, WALLRUSH_MEDIAPIPE, WALLRUSH_MODELS, WALLRUSH_SPEEDS, wallRushBytes, type AddonStatus, type WallRushModel } from '$shared/wallrush.ts';
  import { attempt, rpc } from '$lib/client.svelte.ts';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';

  /**
   * Wall Rush options, and its add-on: the body tracking is downloaded here, only on the computers
   * that run it (it needs a graphics card on the computer showing the TV).
   */
  let { settings, addon }: { settings: GamesSettings; addon: AddonStatus | undefined } = $props();

  const setSettings = (patch: Partial<GamesSettings>) => attempt(() => rpc('games', 'setSettings', patch));
  const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
  let pick = $state<WallRushModel>('full');
  const installed = $derived(addon?.models ?? []);
  const busy = $derived(addon?.progress !== null && addon?.progress !== undefined);
  /** Size still to download for a model (the engine once, then each model) */
  const toFetch = (id: WallRushModel) => (installed.length ? WALLRUSH_MODELS.find((m) => m.id === id)!.file.bytes : wallRushBytes(id));
</script>

<div class="addon">
  <span class="label">Body tracking</span>
  {#if installed.length}
    <p class="faint small">Downloaded ({mb(addon?.bytes ?? 0)}, MediaPipe {WALLRUSH_MEDIAPIPE}). The TV computer runs it on its graphics card.</p>
  {:else}
    <p class="faint small">
      Wall Rush needs its body tracking, downloaded once to this computer (it is not part of Homeboard). It runs on the graphics card of the computer
      showing the TV: a PC with a graphics card, not a Raspberry Pi.
    </p>
  {/if}

  <div class="models">
    {#each WALLRUSH_MODELS as model (model.id)}
      {@const has = installed.includes(model.id)}
      <label class="model" class:active={has ? settings.wallrushModel === model.id : pick === model.id}>
        <input
          type="radio"
          name="wallrush-model"
          checked={has ? settings.wallrushModel === model.id : pick === model.id}
          onchange={() => (has ? setSettings({ wallrushModel: model.id }) : (pick = model.id))}
        />
        <span class="text">
          <strong>{model.name}</strong>
          <span class="faint small">{model.help}</span>
        </span>
        <span class="faint small mono">{has ? (settings.wallrushModel === model.id ? 'In use' : 'Downloaded') : mb(toFetch(model.id))}</span>
        {#if has && installed.length > 1}
          <button class="btn small ghost" aria-label={`Delete ${model.name}`} onclick={() => attempt(() => rpc('games', 'wallrushRemove', { model: model.id }))}><Trash2 size={15} /></button>
        {/if}
      </label>
    {/each}
  </div>

  {#if busy}
    <div class="bar"><span style:width={`${Math.round((addon?.progress ?? 0) * 100)}%`}></span></div>
    <span class="faint small">Downloading... {Math.round((addon?.progress ?? 0) * 100)}%</span>
  {:else}
    <div class="row">
      {#if !installed.includes(pick) && !(installed.length && WALLRUSH_MODELS.every((m) => installed.includes(m.id)))}
        <button class="btn primary small" onclick={() => attempt(() => rpc('games', 'wallrushInstall', { model: pick }))}>
          <Download size={16} /> Download {WALLRUSH_MODELS.find((m) => m.id === pick)?.name} ({mb(toFetch(pick))})
        </button>
      {/if}
      {#if installed.length}
        <TwoStepButton class="danger small" onconfirm={() => attempt(() => rpc('games', 'wallrushRemove', {}))}>
          <Trash2 size={15} /> Delete the body tracking
          {#snippet armed()}Delete {mb(addon?.bytes ?? 0)}?{/snippet}
        </TwoStepButton>
      {/if}
    </div>
  {/if}
  {#if addon?.error}<p class="error small">{addon.error}</p>{/if}
</div>

{#snippet stepper(label: string, hint: string, n: number, min: number, max: number, set: (n: number) => void)}
  <div class="line">
    <span class="label">{label} <span class="faint small">{hint}</span></span>
    <span class="stepper">
      <button class="btn small" aria-label="Less" disabled={n <= min} onclick={() => set(n - 1)}><Minus size={16} /></button>
      <strong class="mono">{n}</strong>
      <button class="btn small" aria-label="More" disabled={n >= max} onclick={() => set(n + 1)}><Plus size={16} /></button>
    </span>
  </div>
{/snippet}

{@render stepper('Walls', '3 to 30 a game', settings.wallrushWalls, 3, 30, (n) => setSettings({ wallrushWalls: n }))}
{@render stepper('Lives', 'Walls you can hit, 0 = unlimited', settings.wallrushLives, 0, 10, (n) => setSettings({ wallrushLives: n }))}
<div class="line">
  <span class="label">Holes <span class="faint small">{WALLRUSH_LEVELS.find((l) => l.id === settings.wallrushLevel)?.help}</span></span>
  <select class="input" value={settings.wallrushLevel} onchange={(e) => setSettings({ wallrushLevel: e.currentTarget.value as GamesSettings['wallrushLevel'] })}>
    {#each WALLRUSH_LEVELS as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
  </select>
</div>
<div class="line">
  <span class="label">Wall speed <span class="faint small">They speed up during the game</span></span>
  <select class="input" value={settings.wallrushSpeed} onchange={(e) => setSettings({ wallrushSpeed: e.currentTarget.value as GamesSettings['wallrushSpeed'] })}>
    {#each WALLRUSH_SPEEDS as sp (sp.id)}<option value={sp.id}>{sp.name}</option>{/each}
  </select>
</div>

<style>
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .label {
    display: grid;
    min-width: 0;
  }
  .line > .label {
    flex: 1 1 12rem;
  }
  .small {
    font-size: 0.78rem;
  }
  .stepper {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .stepper strong {
    min-width: 2.6rem;
    text-align: center;
    font-size: 1.05rem;
  }
  .addon {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--border);
  }
  .addon p {
    margin: 0;
  }
  .models {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .model {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    cursor: pointer;
  }
  .model.active {
    border-color: var(--accent);
  }
  .model .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .bar {
    height: 0.5rem;
    border-radius: 999px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.3s;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .error {
    color: var(--danger);
    margin: 0;
  }
</style>
