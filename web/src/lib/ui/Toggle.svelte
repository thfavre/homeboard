<script lang="ts">
  let { checked, onchange, disabled = false, label }: { checked: boolean; onchange: (v: boolean) => void; disabled?: boolean; label?: string } = $props();
</script>

<button
  type="button"
  class="toggle"
  class:on={checked}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={() => onchange(!checked)}
>
  <span class="knob"></span>
</button>

<style>
  .toggle {
    flex: none;
    position: relative;
    width: 3rem;
    height: 1.75rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-3);
    padding: 0;
    transition: background 0.2s ease;
  }
  .toggle.on {
    background: var(--accent);
    border-color: transparent;
  }
  .knob {
    position: absolute;
    top: 50%;
    left: 0.2rem;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transform: translateY(-50%);
    transition: left 0.2s ease;
  }
  .on .knob {
    left: calc(100% - 1.5rem);
  }
  .toggle:disabled {
    opacity: 0.4;
  }
</style>
