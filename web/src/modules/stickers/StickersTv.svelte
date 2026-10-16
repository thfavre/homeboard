<script lang="ts">
  import { scale } from 'svelte/transition';
  import type { StickersState } from '$shared/stickers.ts';
  import { hb, showNames } from '$lib/client.svelte.ts';
  import StickerView from './StickerView.svelte';

  const active = $derived((hb.modules.stickers as StickersState | undefined)?.active ?? []);

  interface Body {
    x: number;
    y: number;
    vx: number;
    vy: number;
  }
  const bodies = new Map<string, Body>();
  let layer = $state<HTMLDivElement>();

  // Physics runs outside Svelte: positions are written straight to the DOM every frame
  $effect(() => {
    if (!layer) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const W = layer!.clientWidth;
      const H = layer!.clientHeight;
      const speed = H * 0.16;
      const seen = new Set<string>();
      for (const el of layer!.querySelectorAll<HTMLElement>('[data-sticker]')) {
        const id = el.dataset.sticker!;
        seen.add(id);
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let b = bodies.get(id);
        if (!b) {
          const angle = Math.random() * Math.PI * 2;
          b = {
            x: Math.random() * Math.max(1, W - w),
            y: Math.random() * Math.max(1, H - h),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          };
          if (Math.abs(b.vx) < speed * 0.3) b.vx = Math.sign(b.vx || 1) * speed * 0.3;
          if (Math.abs(b.vy) < speed * 0.3) b.vy = Math.sign(b.vy || 1) * speed * 0.3;
          bodies.set(id, b);
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < 0) (b.x = 0), (b.vx = Math.abs(b.vx));
        if (b.y < 0) (b.y = 0), (b.vy = Math.abs(b.vy));
        if (b.x > W - w) (b.x = Math.max(0, W - w)), (b.vx = -Math.abs(b.vx));
        if (b.y > H - h) (b.y = Math.max(0, H - h)), (b.vy = -Math.abs(b.vy));
        el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      }
      // A sticker that left keeps its body until its exit animation is over and it leaves the page,
      // so it shrinks where it was instead of jumping somewhere else
      for (const id of bodies.keys()) if (!seen.has(id)) bodies.delete(id);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="layer" bind:this={layer}>
  {#each active as a (a.id)}
    <div class="body" data-sticker={a.id}>
      <div class="inner" transition:scale={{ duration: 400, start: 0.3 }}>
        <!-- A face sticker follows the guest's current picture (it may have been retaken) -->
        <div class:art={!!a.sticker}>
          <StickerView
            sticker={a.sticker?.kind === 'face' ? { ...a.sticker, src: (a.guest.id && hb.core?.avatars?.[a.guest.id]) || a.sticker.src } : a.sticker}
            text={a.text}
            textStyle={a.textStyle}
          />
        </div>
        {#if showNames('stickerNames')}<span class="by" style:--c={a.guest.color}>{a.guest.name}</span>{/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .layer {
    position: fixed;
    inset: 0;
    z-index: 40;
    pointer-events: none;
    overflow: hidden;
  }
  .body {
    position: absolute;
    left: 0;
    top: 0;
    will-change: transform;
  }
  .inner {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
  }
  .art {
    width: 9rem;
    height: 9rem;
  }
  .by {
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
    color: var(--c);
    font-size: 0.85rem;
    font-weight: 600;
    backdrop-filter: blur(6px);
  }
</style>
