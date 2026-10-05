<script lang="ts">
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

  function clear() {
    if (confirm('Erase the whole canvas?')) attempt(() => rpc('canvas', 'clear'), 'Canvas cleared');
  }

  function resize(value: string) {
    const [width, height] = value.split('x').map(Number);
    if (confirm('Changing the size erases the canvas. Continue?')) attempt(() => rpc('canvas', 'setSize', { width, height }));
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
      <select class="input" value="{mod.width}x{mod.height}" onchange={(e) => resize(e.currentTarget.value)}>
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
    <p class="faint small">The price per pixel is in Economy.</p>
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
