<script lang="ts">
  /**
   * A thumb stick: put a finger anywhere on it and drag. It reports where the knob is (x and y from -1 to 1,
   * y down) while it moves, and 0, 0 when let go. Several fingers on the screen are fine: it follows its own.
   */
  let { onmove, label, color = 'var(--accent)', disabled = false }: { onmove: (x: number, y: number) => void; label: string; color?: string; disabled?: boolean } = $props();

  let pad: HTMLDivElement;
  let finger = $state<number | null>(null);
  let knob = $state({ x: 0, y: 0 });

  function at(e: PointerEvent) {
    const r = pad.getBoundingClientRect();
    const rad = r.width / 2;
    let x = (e.clientX - (r.left + rad)) / (rad * 0.8);
    let y = (e.clientY - (r.top + rad)) / (rad * 0.8);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    knob = { x, y };
    onmove(x, y);
  }

  function down(e: PointerEvent) {
    if (disabled || finger !== null) return;
    finger = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    at(e);
  }
  function move(e: PointerEvent) {
    if (e.pointerId === finger) at(e);
  }
  function up(e: PointerEvent) {
    if (e.pointerId !== finger) return;
    finger = null;
    knob = { x: 0, y: 0 };
    onmove(0, 0);
  }
  // Disabled while held: let go
  $effect(() => {
    if (disabled && finger !== null) {
      finger = null;
      knob = { x: 0, y: 0 };
      onmove(0, 0);
    }
  });
</script>

<div
  class="stick"
  class:disabled
  class:held={finger !== null}
  style:--c={color}
  bind:this={pad}
  role="slider"
  aria-label={label}
  aria-valuenow={0}
  tabindex="-1"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  oncontextmenu={(e) => e.preventDefault()}
>
  <span class="ring"></span>
  <span class="knob" style:transform={`translate(${knob.x * 40}%, ${knob.y * 40}%)`}></span>
  <span class="label">{label}</span>
</div>

<style>
  .stick {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--c) 10%, var(--surface)) 0%, var(--surface) 70%);
    border: 2px solid color-mix(in srgb, var(--c) 40%, var(--border));
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .stick.disabled {
    opacity: 0.35;
  }
  .ring {
    position: absolute;
    inset: 22%;
    border-radius: 50%;
    border: 2px dashed color-mix(in srgb, var(--c) 30%, transparent);
  }
  .knob {
    position: absolute;
    width: 46%;
    height: 46%;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 50%, #fff), var(--c) 65%, color-mix(in srgb, var(--c) 60%, #000));
    box-shadow: 0 0.6rem 1.4rem -0.4rem rgb(0 0 0 / 0.6);
    transition: transform 0.12s ease-out;
  }
  .held .knob {
    transition: none;
  }
  .label {
    position: absolute;
    bottom: -1.6rem;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
</style>
