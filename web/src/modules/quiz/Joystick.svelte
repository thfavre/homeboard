<script lang="ts">
  /**
   * Touch joystick. Calls onmove with x/y in -1..1 (about 15 times per second while held),
   * and once with 0/0 when released.
   */
  let { onmove }: { onmove: (x: number, y: number) => void } = $props();

  let pad = $state<HTMLDivElement>();
  let knob = $state({ x: 0, y: 0 });
  let active = false;
  let lastSent = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const INTERVAL = 66;

  function send(force = false) {
    const now = Date.now();
    if (!force && now - lastSent < INTERVAL) {
      pending ??= setTimeout(() => {
        pending = null;
        send(true);
      }, INTERVAL - (now - lastSent));
      return;
    }
    lastSent = now;
    onmove(Math.round(knob.x * 100) / 100, Math.round(knob.y * 100) / 100);
  }

  function update(e: PointerEvent) {
    const r = pad!.getBoundingClientRect();
    const radius = r.width / 2;
    let x = (e.clientX - (r.left + radius)) / radius;
    let y = (e.clientY - (r.top + radius)) / radius;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    knob = { x, y };
    send();
  }

  function down(e: PointerEvent) {
    active = true;
    pad!.setPointerCapture(e.pointerId);
    update(e);
  }

  function up() {
    if (!active) return;
    active = false;
    knob = { x: 0, y: 0 };
    if (pending) clearTimeout(pending);
    pending = null;
    send(true);
  }
</script>

<div class="pad" bind:this={pad} onpointerdown={down} onpointermove={(e) => active && update(e)} onpointerup={up} onpointercancel={up} role="presentation">
  <div class="ring"></div>
  <div class="knob" style:transform="translate({knob.x * 100}%, {knob.y * 100}%)"></div>
</div>

<style>
  .pad {
    position: relative;
    width: min(13rem, 62vw);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle, var(--surface-3), var(--surface-2));
    border: 2px solid var(--border-strong);
    touch-action: none;
    display: grid;
    place-items: center;
  }
  .ring {
    position: absolute;
    inset: 22%;
    border-radius: 50%;
    border: 1px dashed var(--border-strong);
  }
  .knob {
    width: 42%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--gradient);
    box-shadow: 0 8px 24px -6px var(--accent);
    transition: transform 0.05s linear;
  }
</style>
