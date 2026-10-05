<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A button that needs two taps: the first one arms it (label and color change),
   * the second one runs the action. Goes back to normal after `timeoutMs`.
   */
  let {
    onconfirm,
    children,
    armed: armedContent,
    timeoutMs = 3500,
    class: cls = '',
    disabled = false,
  }: {
    onconfirm: () => void | Promise<unknown>;
    children: Snippet;
    armed: Snippet;
    timeoutMs?: number;
    class?: string;
    disabled?: boolean;
  } = $props();

  let armed = $state(false);
  let busy = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function click() {
    if (!armed) {
      armed = true;
      timer = setTimeout(() => (armed = false), timeoutMs);
      return;
    }
    if (timer) clearTimeout(timer);
    armed = false;
    busy = true;
    try {
      await onconfirm();
    } finally {
      busy = false;
    }
  }
</script>

<button class="btn two-step {cls}" class:armed disabled={disabled || busy} onclick={click} style:--t="{timeoutMs}ms">
  {#if armed}{@render armedContent()}<span class="fuse"></span>{:else}{@render children()}{/if}
</button>

<style>
  .two-step {
    position: relative;
    overflow: hidden;
    transition:
      background 0.2s ease,
      color 0.2s ease,
      border-color 0.2s ease;
  }
  .armed {
    background: var(--danger);
    border-color: transparent;
    color: #fff;
  }
  .fuse {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: 100%;
    background: rgba(255, 255, 255, 0.7);
    transform-origin: left;
    animation: burn var(--t) linear forwards;
  }
  @keyframes burn {
    to {
      transform: scaleX(0);
    }
  }
</style>
