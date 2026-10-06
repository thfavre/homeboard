<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { CoinSide, CoinView, MatchState } from '$shared/games.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { Now } from '../store.svelte.ts';
  import { coinDraw } from '../ui/coinDraw.ts';
  import Fuse from '../ui/Fuse.svelte';
  import Coin from '../tv/CoinFace.svelte';

  /** The draw for who calls, the call itself, then the flipper swipes the coin up to send it to the TV */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CoinView);
  const me = $derived(hb.me?.id ?? '');
  const now = new Now(50);
  const draw = $derived(coinDraw(v, m.players, now.value));
  const nameOf = (id: string) => m.players.find((p) => p.id === id)?.name ?? '';
  const mySide = $derived(!v.side ? null : v.caller === me ? v.side : v.side === 'heads' ? 'tails' : 'heads');
  const SIDES: CoinSide[] = ['heads', 'tails'];
  let busy = $state(false);

  async function call(side: CoinSide) {
    busy = true;
    await attempt(() => rpc('games', 'play', { side }));
    busy = false;
  }

  // Swipe: the coin follows the finger, a quick flick upwards throws it
  let dy = $state(0);
  let dragging = $state(false);
  let thrown = $state(false);
  let trail: { y: number; t: number }[] = [];
  let startY = 0;

  function down(e: PointerEvent) {
    if (thrown) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = true;
    startY = e.clientY;
    trail = [{ y: e.clientY, t: e.timeStamp }];
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    const d = e.clientY - startY;
    // Free upwards, stiff downwards
    dy = d < 0 ? d : d * 0.25;
    trail.push({ y: e.clientY, t: e.timeStamp });
    if (trail.length > 8) trail.shift();
  }

  async function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const first = trail.find((p) => e.timeStamp - p.t < 120) ?? trail[0];
    const speed = (first.y - e.clientY) / Math.max(16, e.timeStamp - first.t); // px/ms, upwards
    if (speed < 0.4 && dy > -window.innerHeight * 0.25) {
      dy = 0;
      return;
    }
    thrown = true;
    if (!(await attempt(() => rpc('games', 'play', { power: Math.min(1, Math.max(0, (speed - 0.4) / 2.2)) })))) {
      thrown = false;
      dy = 0;
    }
  }
</script>

<div class="coin">
  {#if v.step === 'draw' || (v.step === 'call' && v.caller !== me)}
    <span class="eyebrow">{v.step === 'draw' && !draw.settled ? 'Who calls it?' : v.caller === me ? 'You call it!' : `${nameOf(v.caller)} calls it`}</span>
    <div class="duo">
      {#each m.players as p (p.id)}
        <span class="pick" class:lit={draw.highlighted === p.id}>
          <Avatar name={p.name} color={p.color} id={p.id} size="4.5rem" />
          <span class="truncate">{p.id === me ? 'You' : p.name}</span>
        </span>
      {/each}
    </div>
    {#if v.step === 'call'}
      <p class="dim" in:fade>{nameOf(v.caller)} is choosing heads or tails. Then you flip the coin.</p>
      {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Chosen at random in" />{/if}
    {/if}
  {:else if v.step === 'call'}
    <span class="eyebrow">You call it</span>
    <h1>Heads or tails?</h1>
    <div class="sides">
      {#each SIDES as side (side)}
        <button class="side" disabled={busy} onclick={() => call(side)} in:scale={{ start: 0.6, duration: 400 }}>
          <Coin outcome={side} size="7.5rem" />
          <strong>{side === 'heads' ? 'Heads' : 'Tails'}</strong>
        </button>
      {/each}
    </div>
    {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Chosen at random in" />{/if}
  {:else if v.flipper === me && (v.step === 'toss' || (thrown && !v.outcome))}
    <!-- Stays after the throw so the coin can leave the screen; it lands on the TV -->
    <span class="eyebrow">You have {mySide}</span>
    <h1>{thrown ? 'Look at the TV!' : 'Flip it!'}</h1>
    <p class="dim">{thrown ? 'The coin is in the air' : 'Swipe the coin up to the TV'}</p>
    <div class="pad">
      <span
        class="flick"
        class:dragging
        class:thrown
        style:transform={thrown ? 'translateY(-120vh) rotate(-20deg)' : `translateY(${dy}px)`}
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
        role="button"
        tabindex="-1"
        aria-label="Swipe up to flip the coin"
      >
        <Coin outcome={null} still size="9rem" />
      </span>
    </div>
    {#if m.endsAt && !thrown}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Flips by itself in" />{/if}
  {:else}
    <span class="eyebrow">You have</span>
    <h1>{mySide === 'heads' ? 'Heads' : 'Tails'}</h1>
    {#if v.outcome}
      <Coin outcome={v.outcome} size="10rem" />
      <p class="dim">{v.outcome === mySide ? 'It landed on your side!' : 'Not your side...'}</p>
    {:else if v.step === 'toss'}
      <p class="dim">{nameOf(v.flipper)} is about to flip the coin. Watch the TV.</p>
    {:else}
      <p class="dim">The coin is in the air. Watch the TV.</p>
    {/if}
  {/if}
</div>

<style>
  .coin {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
    padding: 1.5rem 0;
  }
  h1 {
    font-size: 2.4rem;
  }
  .duo {
    display: flex;
    gap: 2rem;
    margin: 0.5rem 0;
  }
  .pick {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    max-width: 7rem;
    font-weight: 600;
    opacity: 0.45;
    transition:
      opacity 0.12s ease,
      transform 0.12s ease;
  }
  .pick :global(.avatar) {
    border-radius: 50%;
    transition: box-shadow 0.12s ease;
  }
  .pick.lit {
    opacity: 1;
    transform: scale(1.1);
  }
  .pick.lit :global(.avatar) {
    box-shadow: 0 0 0 0.25rem var(--coin);
  }
  .sides {
    display: flex;
    gap: 1rem;
  }
  .side {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    padding: 0.8rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--text);
    font-size: 1.1rem;
  }
  .side:active {
    transform: scale(0.96);
  }
  .pad {
    height: 18rem;
    display: grid;
    place-items: center;
  }
  .flick {
    display: grid;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    cursor: grab;
    transition: transform 0.35s cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .flick.dragging {
    transition: none;
    cursor: grabbing;
  }
  .flick.thrown {
    transition: transform 0.45s cubic-bezier(0.5, 0, 0.9, 0.6);
  }
</style>
