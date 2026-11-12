<script lang="ts">
  import { Loader2 } from '@lucide/svelte';
  import type { SheetInfo } from '$shared/world.ts';
  import type { Focus } from './preview.ts';

  /**
   * The live avatar preview of the avatar panel: the composited sheet walking toward the
   * camera. `focus` glides the view onto a body part (the head while editing hair or browsing
   * hats, the legs for bottoms, the feet for shoes).
   */

  let {
    url,
    sheet,
    building = false,
    focus = null,
    facing = 'down',
  }: {
    url: string | null;
    sheet: SheetInfo | null;
    building?: boolean;
    focus?: Focus;
    /** 'up' shows the back (capes, wings): the character keeps turning, lingering on the back */
    facing?: 'down' | 'up';
  } = $props();

  /** The square of the frame to show for a focus (full frame when null) */
  function viewOf(which: Focus, s: SheetInfo): { x: number; y: number; size: number } {
    const px = s.frame;
    const top = Math.max(0, (s.body.top ?? 8) - 3);
    const feet = s.feet ?? px - 4;
    const height = Math.max(1, feet - top);
    let size = px;
    let y = 0;
    switch (which) {
      case 'head':
        // Roomy enough that a tall wizard hat and the face both fit
        size = 40;
        y = top;
        break;
      case 'torso':
        size = 40;
        y = top + height * 0.18;
        break;
      case 'legs':
        size = 40;
        y = top + height * 0.45;
        break;
      case 'feet':
        size = 36;
        y = feet - 28;
        break;
      default:
        return { x: 0, y: 0, size: px };
    }
    return { x: (px - size) / 2, y: Math.max(0, Math.min(px - size, y)), size };
  }

  /** The spinner only shows for a build that takes a while: quick ones would just flicker it */
  let slow = $state(false);
  $effect(() => {
    if (!building) {
      slow = false;
      return;
    }
    const t = setTimeout(() => (slow = true), 500);
    return () => clearTimeout(t);
  });

  let canvas = $state<HTMLCanvasElement>();
  /** The drawn sheet: the old one stays on screen until the new one has loaded, so it never blinks */
  let drawn = $state<{ img: HTMLImageElement; sheet: SheetInfo } | null>(null);
  $effect(() => {
    if (!url || !sheet) return;
    const me = url;
    const info = sheet;
    const next = new Image();
    next.onload = () => {
      if (me === url) drawn = { img: next, sheet: info };
    };
    next.src = url;
  });

  $effect(() => {
    if (!canvas) return;
    let raf = 0;
    let view: { x: number; y: number; size: number } | null = null;
    // Turning happens pose by pose (front, side, back), like the character really turning
    let pose = 0;
    let turnedAt = 0;
    let last = Date.now();
    const g = canvas.getContext('2d')!;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, canvas!.width, canvas!.height);
      if (!drawn) return;
      const { img, sheet } = drawn;
      // Walking steadily toward the camera. For back pieces the character keeps turning on the
      // spot instead, pausing on each side and resting longest with the back to the camera.
      const poses = [sheet.rows.walkDown ?? sheet.rows.walk, sheet.rows.walkLeft, sheet.rows.walkUp, sheet.rows.walk];
      if (facing === 'up' && poses[1] && poses[2] && poses[3]) {
        const dwell = pose === 2 ? 2400 : 550;
        if (now - turnedAt > dwell) {
          pose = (pose + 1) % 4;
          turnedAt = now;
        }
      } else if (pose !== 0 && now - turnedAt > 170) {
        // Back to facing the camera the short way around
        pose = pose === 3 ? 0 : pose - 1;
        turnedAt = now;
      }
      const row = poses[pose] ?? poses[0];
      if (!row) return;
      const count = Math.max(1, row.frames - 1);
      const frame = row.frames > 1 ? 1 + (Math.floor(now / 110) % count) : 0;
      const px = sheet.frame;
      // The view glides toward the focused body part (or back out to the whole character)
      const target = viewOf(focus, sheet);
      if (!view) view = { x: 0, y: 0, size: px };
      const k = Math.min(1, dt * 7);
      view.x += (target.x - view.x) * k;
      view.y += (target.y - view.y) * k;
      view.size += (target.size - view.size) * k;
      g.drawImage(img, frame * px + view.x, row.row * px + view.y, view.size, view.size, 0, 0, canvas!.width, canvas!.height);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="stage card">
  <canvas bind:this={canvas} width="192" height="192"></canvas>
  {#if building && slow}
    <span class="building"><Loader2 size={18} class="spin" /></span>
  {/if}
</div>

<style>
  /* The character fills the box from top to bottom: zoomed in, it runs off the edges of the box
     (not of a smaller square inside it), under a soft inner shadow all around */
  .stage {
    display: grid;
    place-items: center;
    padding: 0;
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.12)),
      var(--surface-2);
  }
  .stage::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow:
      inset 0 0 14px rgba(0, 0, 0, 0.35),
      inset 0 0 2px rgba(0, 0, 0, 0.3);
    pointer-events: none;
  }
  .stage canvas {
    width: 11.6rem;
    height: 11.6rem;
    image-rendering: pixelated;
  }
  .building {
    position: absolute;
    z-index: 1;
    top: 0.6rem;
    right: 0.6rem;
    color: var(--text-dim);
    display: grid;
  }
  .building :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
