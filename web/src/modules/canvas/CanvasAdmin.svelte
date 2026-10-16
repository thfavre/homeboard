<script lang="ts">
  import { ask } from '$lib/dialog.svelte.ts';
  import { onDestroy } from 'svelte';
  import { Trash2 } from '@lucide/svelte';
  import { CANVAS_SIZES, type CanvasState } from '$shared/canvas.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import { PixelBoard } from './board.ts';

  const mod = $derived(hb.modules.canvas as (CanvasState & { clearOnNewSession: boolean }) | undefined);
  const board = new PixelBoard(hb.modules.canvas?.palette ?? []);
  let el = $state<HTMLCanvasElement>();

  $effect(() => {
    if (!mod) return;
    board.setPalette(mod.palette);
    board.sync(mod.version);
  });
  $effect(() => {
    if (el) board.attach(el);
  });
  onDestroy(() => board.destroy());

  async function clear() {
    // Nothing painted: nothing to lose
    if (!board.pixels.some((c) => c > 0)) return attempt(() => rpc('canvas', 'clear'), 'Canvas cleared');
    if (await ask({ title: 'Erase the whole canvas?', message: 'Everything guests painted is lost.', confirm: 'Erase', danger: true }))
      attempt(() => rpc('canvas', 'clear'), 'Canvas cleared');
  }

  async function resize(e: Event & { currentTarget: HTMLSelectElement }) {
    const select = e.currentTarget;
    const [width, height] = select.value.split('x').map(Number);
    // Growing adds space around the drawing; shrinking cuts its border off, so ask only if something is painted there
    await board.sync(mod?.version ?? -1);
    if (
      !board.paintedOutside(width, height) ||
      (await ask({
        title: 'Make the canvas smaller?',
        message: 'The drawing stays centered, but everything painted near the border is erased.',
        confirm: 'Make smaller',
        danger: true,
      }))
    ) {
      attempt(() => rpc('canvas', 'setSize', { width, height }));
    } else if (mod) select.value = `${mod.width}x${mod.height}`;
  }
</script>

{#if mod}
  <Section title="Preview">
    <div class="preview"><canvas bind:this={el}></canvas></div>
    <div><button class="btn danger" onclick={clear}><Trash2 size={18} /> Clear canvas</button></div>
  </Section>

  <Section title="Settings">
    <label class="field">
      <span>Size (pixels)</span>
      <select class="input" value="{mod.width}x{mod.height}" onchange={resize}>
        {#each CANVAS_SIZES as s}<option value="{s.width}x{s.height}">{s.label}</option>{/each}
      </select>
    </label>
    <div class="line">
      <div>
        <strong>Clear on new session</strong>
        <p class="faint small">Otherwise the drawing stays from one party to the next.</p>
      </div>
      <Toggle
        checked={mod.clearOnNewSession}
        label="Clear on new session"
        onchange={(v) => attempt(() => rpc('canvas', 'setOptions', { clearOnNewSession: v }))}
      />
    </div>
    <div class="line">
      <div>
        <strong>Show dots</strong>
        <p class="faint small">Faint guide dots behind the canvas on the TV.</p>
      </div>
      <Toggle checked={mod.dots} label="Show dots" onchange={(v) => attempt(() => rpc('canvas', 'setOptions', { dots: v }))} />
    </div>
  </Section>
{/if}

<style>
  .preview {
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    image-rendering: pixelated;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .small {
    font-size: 0.82rem;
  }
</style>
