<script lang="ts">
  /**
   * A short numeric code shown as separate boxes (session code, PIN).
   * One real input sits on top of the boxes, so the phone keyboard, paste and autofill all work.
   * Bump `shake` to shake the boxes after a wrong entry.
   */
  let {
    value = $bindable(''),
    length = 4,
    masked = false,
    disabled = false,
    autofocus = false,
    shake = 0,
    label,
    oncomplete,
  }: {
    value?: string;
    length?: number;
    masked?: boolean;
    disabled?: boolean;
    autofocus?: boolean;
    shake?: number;
    label: string;
    oncomplete?: (value: string) => void;
  } = $props();

  let input = $state<HTMLInputElement>();
  let row = $state<HTMLElement>();
  let focused = $state(false);

  export function focus() {
    input?.focus();
  }

  function onInput() {
    if (!input) return;
    value = input.value.replace(/\D/g, '').slice(0, length);
    input.value = value;
    if (value.length === length) oncomplete?.(value);
  }

  // Also once it is enabled again (after a check, or a wrong entry)
  $effect(() => {
    if (autofocus && !disabled) input?.focus();
  });

  $effect(() => {
    if (!shake || !row) return;
    row.animate(
      [{ translate: '0' }, { translate: '-0.5rem' }, { translate: '0.45rem' }, { translate: '-0.3rem' }, { translate: '0.15rem' }, { translate: '0' }],
      { duration: 380, easing: 'ease-out' },
    );
  });
</script>

<div class="digits" class:disabled bind:this={row} style:--n={length}>
  <input
    bind:this={input}
    {value}
    oninput={onInput}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    type="text"
    inputmode="numeric"
    pattern="[0-9]*"
    autocomplete="off"
    maxlength={length}
    aria-label={label}
    {disabled}
  />
  {#each { length } as _, i}
    <span class="cell" class:filled={i < value.length} class:active={focused && i === Math.min(value.length, length - 1)} aria-hidden="true">
      {#if i < value.length}{#if masked}<i class="dot"></i>{:else}{value[i]}{/if}{/if}
    </span>
  {/each}
</div>

<style>
  .digits {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    gap: 0.6rem;
  }
  input {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    /* 16px or more: iOS does not zoom on focus */
    font-size: 16px;
    color: transparent;
    caret-color: transparent;
    border: 0;
    background: none;
    cursor: text;
  }
  .cell {
    display: grid;
    place-items: center;
    aspect-ratio: 1 / 1.15;
    max-height: 4.6rem;
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--border-strong);
    background: var(--input-bg, var(--surface-2));
    font-family: var(--font-display);
    font-variant-numeric: tabular-nums;
    font-size: 1.9rem;
    font-weight: 700;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
  }
  .cell.filled {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border-strong));
  }
  .cell.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .cell.active:not(.filled)::after {
    content: '';
    width: 2px;
    height: 1.6rem;
    border-radius: 1px;
    background: var(--accent);
    animation: blink 1s steps(1) infinite;
  }
  .dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: var(--text);
  }
  .disabled {
    opacity: 0.6;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
</style>
