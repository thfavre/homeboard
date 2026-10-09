<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { CoinView, MatchState } from '$shared/games.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { Now } from '../store.svelte.ts';
  import { coinDraw } from '../ui/coinDraw.ts';
  import Fuse from '../ui/Fuse.svelte';
  import Coin3D from '../ui/Coin3D.svelte';

  /** The draw for who throws, then the thrower swipes the coin up to send it flying on the TV */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CoinView);
  const me = $derived(hb.me?.id ?? '');
  const now = new Now(50);
  const draw = $derived(coinDraw(v, m.players, now.value));
  const player = (id: string) => m.players.find((p) => p.id === id) ?? m.players[0];
  const heads = $derived(player(v.heads));
  const tails = $derived(player(v.tails));
  const other = $derived(m.players.find((p) => p.id !== me) ?? m.players[0]);
  /** The thrower holds the coin with their own face up */
  const mine = $derived(v.tails === me ? 'rotateX(180deg)' : 'rotateX(0deg)');
  const landed = $derived(v.outcome ? player(v.outcome === 'heads' ? v.heads : v.tails) : null);

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
  {#if v.step === 'draw'}
    <span class="eyebrow">{!draw.settled ? 'Who throws the coin?' : v.flipper === me ? 'You throw it!' : `${player(v.flipper).name} throws it`}</span>
    <div class="duo">
      {#each m.players as p (p.id)}
        <span class="pick" class:lit={draw.highlighted === p.id}>
          <Avatar name={p.name} color={p.color} id={p.id} size="4.5rem" />
          <span class="truncate">{p.id === me ? 'You' : p.name}</span>
        </span>
      {/each}
    </div>
    <Coin3D {heads} {tails} size="7.5rem" idle />
    <p class="dim">Your face is on one side of the coin, {other.name}'s on the other. It lands on yours: you win.</p>
  {:else if v.flipper === me && (v.step === 'toss' || (thrown && !v.outcome))}
    <!-- Stays after the throw so the coin can leave the screen; it lands on the TV -->
    <span class="eyebrow">You throw it</span>
    <h1>{thrown ? 'Look at the TV!' : 'Throw it!'}</h1>
    <p class="dim">{thrown ? 'The coin is in the air' : 'Swipe the coin up to the TV. Harder, higher.'}</p>
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
        aria-label="Swipe up to throw the coin"
      >
        <span class:spinning={thrown}><Coin3D {heads} {tails} size="10rem" transform="rotateY(-14deg) {mine} rotateX(16deg)" /></span>
      </span>
    </div>
    {#if m.endsAt && !thrown}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Thrown by itself in" />{/if}
  {:else if landed}
    <span class="eyebrow">It landed on</span>
    <h1>{landed.id === me ? 'Your face!' : `${landed.name}'s face`}</h1>
    <span in:scale={{ start: 0.5, duration: 600 }}>
      <Coin3D {heads} {tails} size="10rem" transform="rotateX({v.outcome === 'tails' ? 180 : 0}deg) rotateX(12deg)" />
    </span>
    <p class="dim">{landed.id === me ? 'The pot is yours!' : 'Not this time...'}</p>
  {:else}
    <span class="eyebrow">{v.step === 'toss' ? `${player(v.flipper).name} throws the coin` : 'The coin is in the air'}</span>
    <h1>Watch the TV!</h1>
    <Coin3D {heads} {tails} size="8.5rem" idle />
    {#if v.step === 'toss'}
      <p class="dim" in:fade>Your face is on one side, {other.name}'s on the other.</p>
      {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Thrown by itself in" />{/if}
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
  .spinning {
    display: grid;
    animation: tumble 0.3s linear infinite;
  }
  @keyframes tumble {
    to {
      transform: rotateX(360deg);
    }
  }
</style>
