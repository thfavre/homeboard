<script lang="ts">
  import { Footprints, Crosshair, Trophy } from '@lucide/svelte';
  import type { CrowdRaceView } from '$shared/crowd.ts';
  import type { MatchState } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import { Now } from '../store.svelte.ts';
  import HoldButton from './HoldButton.svelte';
  import Joystick from './Joystick.svelte';
  import Bullets from './Bullets.svelte';
  import { play, stickSender } from './input.ts';

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
  const shotBy = $derived(v?.kills.find((k) => k.victim === me)?.by ?? null);
  const nameOf = (id: string | null) => m.players.find((p) => p.id === id)?.name ?? 'Someone';

  let walk = $state(false);
  let run = $state(false);
  const mode = $derived(!alive || v?.step !== 'race' ? 'stop' : run ? 'run' : walk ? 'walk' : 'stop');
  // The server hears each change of pace once
  let sent = 'stop';
  $effect(() => {
    if (mode === sent) return;
    sent = mode;
    void play({ t: 'move', m: mode });
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

  const status = $derived.by(() => {
    if (!v) return { big: '', small: '' };
    if (v.step === 'ready') return { big: 'Get ready', small: 'When it starts, press WALK and look who moves on the TV' };
    if (v.step === 'reveal') {
      if (v.winner === me) return { big: 'You won the round!', small: v.why === 'last' ? 'Last one standing' : 'First across the line' };
      if (v.winner) return { big: `${nameOf(v.winner)} won it`, small: 'Look at the TV: who was who?' };
      return { big: v.why === 'npc' ? 'A passer-by won' : 'Nobody won', small: 'Look at the TV: who was who?' };
    }
    if (!alive) return { big: 'You are out', small: shotBy === me ? 'You shot yourself' : `${nameOf(shotBy)} shot you. Back next round` };
    return { big: run ? 'Running!' : walk ? 'Walking' : 'Standing still', small: run ? 'Fast, but nobody else runs...' : 'Hold WALK. Stop now and then, like the others' };
  });
</script>

{#if v}
  <div class="pad" style:--me={myColor}>
    <div class="top">
      <span class="pill mono">Round {v.round}/{v.rounds}</span>
      <span class="pill"><Bullets left={shots} /></span>
      <span class="pill"><Trophy size={16} /> {v.points[me] ?? 0}</span>
    </div>

    <div class="status" class:out={!alive && v.step === 'race'}>
      <strong>{status.big}</strong>
      <span>{status.small}</span>
      {#if feedback}
        {#key feedback.key}<span class="feedback {feedback.tone}">{feedback.text}</span>{/key}
      {/if}
    </div>

    <div class="controls">
      <div class="left">
        <HoldButton color="#ff7a3d" disabled={!alive || v.step !== 'race'} onpress={() => (run = true)} onrelease={() => (run = false)}>RUN</HoldButton>
        <HoldButton color="#2fd27a" size="big" disabled={!alive || v.step !== 'race'} onpress={() => (walk = true)} onrelease={() => (walk = false)}>
          <Footprints size={30} />WALK
        </HoldButton>
      </div>
      <div class="right">
        <HoldButton color="#ff3b5c" size="small" disabled={!alive || v.step !== 'race' || shots <= 0 || reloading} onpress={fire}>
          <Crosshair size={22} />{shots <= 0 ? 'NO SHOTS' : reloading ? 'RELOADING' : 'SHOOT'}
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
    min-height: 7rem;
  }
  .status strong {
    font-family: var(--font-display);
    font-size: 2rem;
    line-height: 1.1;
  }
  .status span {
    color: var(--text-dim);
    font-size: 0.95rem;
    max-width: 22rem;
  }
  .status.out strong {
    color: var(--danger, #ff5a5a);
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
