<script lang="ts">
  import type { StickerDef } from '$shared/stickers.ts';
  import BuiltinSticker from './BuiltinSticker.svelte';

  let { sticker, text }: { sticker: StickerDef | null; text?: string } = $props();
</script>

{#if sticker?.kind === 'builtin'}
  <BuiltinSticker id={sticker.id} />
{:else if sticker?.kind === 'image'}
  <img src={sticker.src} alt={sticker.name} draggable="false" />
{:else if text}
  <span class="text">{text}</span>
{/if}

<style>
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.35));
  }
  .text {
    display: inline-block;
    max-width: 22em;
    padding: 0.35em 0.8em 0.45em;
    border-radius: 0.7em;
    background: var(--gradient);
    color: #fff;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 2.1rem;
    letter-spacing: -0.02em;
    line-height: 1.1;
    white-space: nowrap;
    box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.6);
    border: 3px solid #fff;
  }
</style>
