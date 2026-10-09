<script lang="ts">
  import { X } from '@lucide/svelte';
  import { scale } from 'svelte/transition';
  import { RHYTHM_COLORS, type GameColor, type Perk, type RhythmColor } from '$shared/games.ts';
  import { rpc, attempt } from '$lib/client.svelte.ts';
  import ColorPad from '../ColorPad.svelte';
  import Fuse from '../ui/Fuse.svelte';
  import Vinyl from './Vinyl.svelte';
  import { NORMAL_SPEED } from './scratch.ts';
  import { rhythmSound } from '../ui/rhythmSound.ts';

  /**
   * The winner's prize on their phone: the light colors (Color Reflex), the record to scratch (Perfect
   * Circle), or the keys that shoot fireworks up the game's light (Rhythm Rain)
   */
  let { perk }: { perk: Perk } = $props();
  let busy = $state(false);

  async function close() {
    busy = true;
    await attempt(() => rpc('games', 'perkEnd'));
    busy = false;
  }

  const pickColor = (c: GameColor) => void attempt(() => rpc('games', 'perkColor', { color: c }));

  const WON: Record<Perk['kind'], string> = { lights: 'Color Reflex', scratch: 'Perfect Circle', fireworks: 'Rhythm Rain' };
  // Fireworks: each tap shoots one up the light, with its note here
  const keys = $derived(perk.kind === 'fireworks' ? perk.colors.map((id) => RHYTHM_COLORS.find((c) => c.id === id)!) : []);
  let fired = $state<Record<string, number>>({});
  function shoot(color: RhythmColor, lane: number) {
    rhythmSound('perfect', lane, 0, 0.4);
    navigator.vibrate?.(8);
    fired = { ...fired, [color]: (fired[color] ?? 0) + 1 };
    void rpc('games', 'perkShoot', { color }).catch(() => {});
  }

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
  <span class="eyebrow">You won {WON[perk.kind]}! Your prize</span>
  {#if perk.kind === 'fireworks'}
    <h1>Light it up</h1>
    <p class="dim">Tap the colors: each one shoots a firework up the light.</p>
    <div class="launch">
      {#each keys as c, i (c.id)}
        <button
          class="key"
          style:--c={c.hex}
          aria-label={`Shoot ${c.name}`}
          onpointerdown={(e) => {
            e.preventDefault();
            shoot(c.id, i);
          }}
          oncontextmenu={(e) => e.preventDefault()}
        >
          <span class="gem">{#key fired[c.id]}{#if fired[c.id]}<span class="burst"></span>{/if}{/key}</span>
        </button>
      {/each}
    </div>
  {:else if perk.kind === 'lights'}
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
  /* The fireworks keys: four tall pads like the game's, a gem each */
  .launch {
    width: 100%;
    height: min(22rem, 45vh);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .key {
    display: grid;
    place-items: end center;
    padding: 0 0 1rem;
    border: 0;
    border-radius: 1.3rem;
    background: linear-gradient(to bottom, color-mix(in srgb, var(--c) 8%, var(--surface)), color-mix(in srgb, var(--c) 30%, var(--surface)));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent);
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
    overflow: hidden;
  }
  .key:active {
    background: linear-gradient(to bottom, color-mix(in srgb, var(--c) 30%, var(--surface)), var(--c));
    box-shadow:
      inset 0 0 0 2px var(--c),
      0 0 1.6rem color-mix(in srgb, var(--c) 60%, transparent);
  }
  .gem {
    position: relative;
    width: min(3.6rem, 74%);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, #fff 55%, var(--c)), var(--c) 45%, color-mix(in srgb, #000 35%, var(--c)));
    box-shadow: 0 0 0 0.25rem color-mix(in srgb, var(--c) 25%, transparent);
  }
  /* A ring flying up out of the gem: the shot leaving */
  .burst {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 3px solid var(--c);
    animation: launch 0.5s ease-out forwards;
  }
  @keyframes launch {
    to {
      transform: translateY(-9rem) scale(0.4);
      opacity: 0;
    }
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
