<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  /** A number that counts up (or down) smoothly to its new value */
  let { value, decimals = 0 }: { value: number; decimals?: number } = $props();
  const shown = new Tween(0, { duration: 700, easing: cubicOut });
  $effect(() => {
    shown.target = value;
  });
</script>

{shown.current.toFixed(decimals)}
