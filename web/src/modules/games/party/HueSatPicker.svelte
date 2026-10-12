<script lang="ts">
  import { hueSatCss, type HueSat } from '$shared/party.ts';

  /**
   * A color wheel: around for the hue, from the middle (white) to the edge (full color) for the
   * saturation. Drag anywhere on it.
   */
  let { value, onchange, disabled = false }: { value: HueSat; onchange: (v: HueSat) => void; disabled?: boolean } = $props();
  let wheel: HTMLDivElement;
  let dragging = false;

  function pick(e: PointerEvent) {
    const r = wheel.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    const h = ((Math.atan2(y, x) * 180) / Math.PI + 450) % 360;
    const s = Math.min(1, Math.hypot(x, y) / (r.width / 2));
    onchange({ h: Math.round(h * 10) / 10, s: Math.round(s * 1000) / 1000 });
  }
  // The knob: hue 0 at the top, clockwise (same as the CSS conic gradient)
  const knob = $derived({
    x: 50 + 50 * value.s * Math.sin((value.h * Math.PI) / 180),
    y: 50 - 50 * value.s * Math.cos((value.h * Math.PI) / 180),
  });
</script>

<div
  class="wheel"
  class:disabled
  bind:this={wheel}
  role="slider"
  aria-label="Color"
  aria-valuenow={Math.round(value.h)}
  tabindex="0"
  onpointerdown={(e) => {
    if (disabled) return;
    e.preventDefault();
    dragging = true;
    wheel.setPointerCapture?.(e.pointerId);
    pick(e);
  }}
  onpointermove={(e) => dragging && !disabled && pick(e)}
  onpointerup={() => (dragging = false)}
  onpointercancel={() => (dragging = false)}
>
  <span class="knob" style:left="{knob.x}%" style:top="{knob.y}%" style:background={hueSatCss(value)}></span>
</div>

<style>
  .wheel {
    position: relative;
    width: min(78vw, 20rem);
    aspect-ratio: 1;
    border-radius: 50%;
    background:
      radial-gradient(closest-side, #fff, rgba(255, 255, 255, 0) 100%),
      conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
    box-shadow:
      0 0 0 3px var(--surface-3),
      0 24px 60px -30px #000;
    touch-action: none;
    cursor: crosshair;
  }
  .disabled {
    filter: saturate(0.4) brightness(0.7);
  }
  .knob {
    position: absolute;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    border: 3px solid #fff;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  }
</style>
