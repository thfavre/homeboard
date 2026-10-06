<script lang="ts">
  import { Headphones, LoaderCircle, Square } from '@lucide/svelte';
  import type { MiSound } from '$shared/soundboard.ts';
  import { preview, togglePreview } from './preview.svelte.ts';

  /** Plays a search result on this device only (not the TV) */
  let { sound }: { sound: MiSound } = $props();
  const playing = $derived(preview.playing === sound.mp3);
</script>

<button class:on={playing} aria-label={playing ? 'Stop' : 'Listen on this device'} onclick={() => togglePreview(sound)}>
  {#if preview.fetching === sound.mp3}<LoaderCircle size={16} class="spin" />{:else if playing}<Square size={14} />{:else}<Headphones size={16} />{/if}
</button>
