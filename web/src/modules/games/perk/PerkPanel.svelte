<script lang="ts">
  import { X } from '@lucide/svelte';
  import { scale } from 'svelte/transition';
  import type { GameColor, Perk } from '$shared/games.ts';
  import { rpc, attempt } from '$lib/client.svelte.ts';
  import ColorPad from '../ColorPad.svelte';
  import Fuse from '../ui/Fuse.svelte';
  import Vinyl from './Vinyl.svelte';
  import { NORMAL_SPEED } from './scratch.ts';

  /** The winner's prize on their phone: the light colors (Color Reflex) or the record to scratch (Perfect Circle) */
  let { perk }: { perk: Perk } = $props();
  let busy = $state(false);

  async function close() {
    busy = true;
    await attempt(() => rpc('games', 'perkEnd'));
    busy = false;
  }

  const pickColor = (c: GameColor) => void attempt(() => rpc('games', 'perkColor', { color: c }));

  // Scratch: the record follows the finger around its center, the angle goes to the TV 25 times a second
  let angle = $state(0);
  let holding = $state(false);
  let disc = $state<HTMLElement | null>(null);
  let grab = 0;
  let sentAt = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const fingerAngle = (e: PointerEvent) => {
    const r = disc!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  const send = () => {
    sentAt = performance.now();
    pending = null;
    void rpc('games', 'scratch', { angle, touching: holding }).catch(() => {});
  };
  const sendSoon = () => {
    const wait = 40 - (performance.now() - sentAt);
    if (wait <= 0) send();
    else pending ??= setTimeout(send, wait);
  };

  function down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    holding = true;
    grab = fingerAngle(e);
    if (pending) clearTimeout(pending);
    send();
  }
  function move(e: PointerEvent) {
    if (!holding) return;
    const a = fingerAngle(e);
    // Shortest way round, so crossing the left side does not jump a full turn
    let d = a - grab;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    grab = a;
    angle += d;
    sendSoon();
  }
  function up() {
    if (!holding) return;
    holding = false;
    if (pending) clearTimeout(pending);
    send();
  }

  // Let go, the record turns on its own (here only: the TV does the same)
  $effect(() => {
    if (perk.kind !== 'scratch') return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(t) {
      if (!holding) angle += NORMAL_SPEED * Math.min(0.1, (t - last) / 1000);
      last = t;
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (pending) clearTimeout(pending);
    };
  });
</script>

<div class="perk" in:scale={{ start: 0.9, duration: 300 }}>
  <span class="eyebrow">You won {perk.kind === 'lights' ? 'Color Reflex' : 'Perfect Circle'}! Your prize</span>
  {#if perk.kind === 'lights'}
    <h1>The lights are yours</h1>
    <p class="dim">Pick a color for every light in the room.</p>
    <ColorPad onpick={pickColor} lit={perk.color} />
  {:else}
    <h1>Scratch it!</h1>
    <p class="dim">Turn the record back and forth. It plays live on the TV.</p>
    <div
      class="disc"
      class:holding
      bind:this={disc}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      role="slider"
      aria-label="Record"
      aria-valuenow={Math.round(angle * 10) / 10}
      tabindex="-1"
    >
      <Vinyl points={perk.drawing.points} color={perk.guest.color} name={perk.guest.name} {angle} size="min(19rem, 78vw)" />
    </div>
  {/if}
  <Fuse endsAt={perk.until} totalMs={perk.totalMs} label="Ends in" />
  <button class="btn ghost block" disabled={busy} onclick={close}><X size={18} /> {perk.kind === 'lights' ? 'Give the lights back' : "I'm done"}</button>
</div>

<style>
  .perk {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
  }
  h1 {
    font-size: 2rem;
  }
  .perk :global(.pad) {
    width: 100%;
  }
  .disc {
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: grab;
    border-radius: 50%;
    margin: 0.5rem 0;
  }
  .disc.holding {
    cursor: grabbing;
  }
</style>
