<script lang="ts">
  import { hb } from '$lib/client.svelte.ts';
</script>

<!-- A glow around the screen edge: green breath when an action worked, two red pulses when it failed -->
{#if hb.flash}
  {#key hb.flash.id}
    <div class="edge {hb.flash.kind}" aria-hidden="true"></div>
  {/key}
{/if}

<style>
  .edge {
    --c: var(--success);
    position: fixed;
    inset: 0;
    z-index: 5001;
    pointer-events: none;
    opacity: 0;
    box-shadow:
      inset 0 0 0 3px var(--c),
      inset 0 0 1.4rem color-mix(in srgb, var(--c) 70%, transparent),
      inset 0 0 4.5rem color-mix(in srgb, var(--c) 30%, transparent);
    animation: hb-edge-ok 1.1s ease-out forwards;
  }
  .error {
    --c: var(--danger);
    animation: hb-edge-error 1.3s ease-out forwards;
  }
  @keyframes hb-edge-ok {
    0% {
      opacity: 0;
    }
    18% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes hb-edge-error {
    0% {
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    30% {
      opacity: 0.35;
    }
    45% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
</style>
