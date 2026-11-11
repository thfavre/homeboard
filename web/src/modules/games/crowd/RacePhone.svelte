<script lang="ts">
  import { Footprints, Crosshair, Trophy } from '@lucide/svelte';
  import type { CrowdRaceView } from '$shared/crowd.ts';
  import type { MatchState } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import { Now } from '../store.svelte.ts';
  import HoldButton from './HoldButton.svelte';
  import Joystick from './Joystick.svelte';
  import Bullets from './Bullets.svelte';
  import { HOLD_REPEAT_MS, play, stickSender } from './input.ts';

  /**
   * Crowd Race on a phone: WALK and RUN under the left thumb (held down), the sniper under the right one:
   * a stick that moves the crosshair on the TV and a SHOOT button. Nothing here says which character is
   * mine: the TV does, to whoever watches closely.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as CrowdRaceView | null);
  const me = $derived(hb.me?.id ?? '');
  const myColor = $derived(hb.me?.color ?? '#3d8bff');
  const now = new Now(150);
  const alive = $derived(!!v?.alive.includes(me));
  const shots = $derived(v?.shots[me] ?? 0);
  const reloading = $derived(!!v && (v.readyAt[me] ?? 0) > now.value && v.step === 'race');

  let walk = $state(false);
  let run = $state(false);
  const mode = $derived(!alive || v?.step !== 'race' ? 'stop' : run ? 'run' : walk ? 'walk' : 'stop');
  // The server hears each change of pace at once, and the pace again every second while WALK or RUN is held
  // (it stops a character whose phone went quiet)
  $effect(() => {
    const m = mode;
    void play({ t: 'move', m });
    if (m === 'stop') return;
    const t = setInterval(() => void play({ t: 'move', m }), HOLD_REPEAT_MS);
    return () => clearInterval(t);
  });

  const aim = stickSender('aim');
  let feedback = $state<{ text: string; tone: 'good' | 'bad' | 'dim'; key: number } | null>(null);
  let seq = 0;
  async function fire() {
    navigator.vibrate?.(30);
    const r = await play<{ hit: string | null; shots: number }>({ t: 'fire' });
    const hit = r?.hit;
    const text = hit === 'player' ? 'Got one!' : hit === 'self' ? 'You shot yourself...' : hit === 'npc' ? 'A passer-by. Oops' : hit === 'miss' ? 'Missed' : null;
    if (!text) return;
    if (hit === 'player') navigator.vibrate?.([60, 40, 120]);
    feedback = { text, tone: hit === 'player' ? 'good' : hit === 'miss' ? 'dim' : 'bad', key: ++seq };
    const mine = seq;
    setTimeout(() => feedback?.key === mine && (feedback = null), 2200);
  }

  // Shot: a long buzz
  let wasAlive = true;
  $effect(() => {
    if (wasAlive && !alive && v?.step === 'race') navigator.vibrate?.([200, 80, 200]);
    wasAlive = alive;
  });
</script>

{#if v}
  <div class="pad" style:--me={myColor}>
    <div class="top">
      <span class="pill mono">Round {v.round}/{v.rounds}</span>
      <span class="pill"><Bullets left={shots} /></span>
      <span class="pill"><Trophy size={16} /> {v.points[me] ?? 0}</span>
      {#if !alive && v.step === 'race'}<span class="pill out">Out</span>{/if}
    </div>

    <!-- No text here: the game is on the TV. Only how a shot went, for a moment -->
    <div class="status">
      {#if feedback}
        {#key feedback.key}<span class="feedback {feedback.tone}">{feedback.text}</span>{/key}
      {/if}
    </div>

    <div class="controls">
      <div class="left">
        <HoldButton color="#ff7a3d" disabled={!alive || v.step !== 'race'} onpress={() => (run = true)} onrelease={() => (run = false)}>RUN</HoldButton>
        <HoldButton color="#2fd27a" size="tall" disabled={!alive || v.step !== 'race'} onpress={() => (walk = true)} onrelease={() => (walk = false)}>
          <Footprints size={30} />WALK
        </HoldButton>
      </div>
      <div class="right">
        <HoldButton color="#ff3b5c" size="square" disabled={!alive || v.step !== 'race' || shots === 0 || reloading} onpress={fire}>
          <Crosshair size={34} />{shots === 0 ? 'NO SHOTS' : reloading ? 'RELOADING' : 'SHOOT'}
        </HoldButton>
        <Joystick label="Aim" color={myColor} disabled={!alive || v.step === 'reveal'} onmove={aim} />
      </div>
    </div>
  </div>
{/if}

<style>
  .pad {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 0.8rem;
    min-height: 100%;
    padding: 0.3rem 0 2.2rem;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }
  .top {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .status {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.35rem;
    text-align: center;
    min-height: 3rem;
  }
  .out {
    color: var(--danger, #ff5a5a);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .feedback {
    margin-top: 0.3rem;
    padding: 0.25rem 0.9rem;
    border-radius: 999px;
    font-weight: 700;
    animation: pop 0.25s ease-out;
  }
  .feedback.good {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success) !important;
  }
  .feedback.bad {
    background: color-mix(in srgb, #ff5a5a 18%, transparent);
    color: #ff8a8a !important;
  }
  .feedback.dim {
    background: var(--surface);
  }
  @keyframes pop {
    from {
      transform: scale(1.3);
    }
  }
  .controls {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 1rem;
    align-items: end;
  }
  .left,
  .right {
    display: grid;
    gap: 0.9rem;
  }
</style>
