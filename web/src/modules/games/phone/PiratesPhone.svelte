<script lang="ts">
  import { Volume2 } from '@lucide/svelte';
  import { PIRATE, PIRATE_SHIPS, pirateGradeOf, type MatchState, type PirateGrade, type PirateView } from '$shared/games.ts';
  import { hb, rpc, serverNow } from '$lib/client.svelte.ts';
  import PirateCrewCard from './PirateCrewCard.svelte';
  import { gamesState } from '../store.svelte.ts';
  import { BUILT_IN_FILES, loadPirateSound, pirateSound } from '../ui/pirateSound.ts';

  /**
   * The oar: this player's ship and crew, how the last stroke went, and one big ROW button in the ship's
   * color. Nothing on the phone shows the beat: the crew listens to the drum on the TV, where the race is.
   * Each tap is judged here right away for its feedback; the server keeps the real score.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as PirateView);
  const me = $derived(hb.me?.id ?? '');
  const crew = $derived(v.crews.find((c) => c.members.includes(me)));
  const ship = $derived(PIRATE_SHIPS.find((s) => s.id === crew?.ship) ?? PIRATE_SHIPS[0]);
  const oarUrl = $derived(gamesState()?.settings.pirateSounds?.oar?.url ?? null);
  // The oar's file is decoded ahead, so the first stroke is not the made-up sound
  $effect(() => void loadPirateSound(oarUrl ?? BUILT_IN_FILES.oar!));

  const step = $derived(v.step);
  const raceAt = $derived(v.raceAt);
  /** My last tap: the oars of my ship make one stroke */
  let tappedAt = $state(0);

  /**
   * The clock moves every frame only while something does: the count-in, and the stroke after a tap.
   * The rest of the race the phone stays idle (a nonstop redraw heats it up and slows it down over time).
   */
  let now = $state(serverNow());
  $effect(() => {
    const until = Math.max(step === 'race' ? raceAt + 200 : 0, tappedAt + 700);
    let raf = 0;
    const loop = () => {
      now = serverNow();
      if (now < until) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  const prev = $derived([...v.beats].reverse().find((b) => b.at <= now - 40) ?? null);
  const countIn = $derived(step === 'race' && now < raceAt ? PIRATE.countIn - (prev?.i ?? -1) : null);
  const myStroke = $derived(now - tappedAt < 650 ? (now - tappedAt) / 650 : null);

  const LABEL: Record<PirateGrade, string> = { perfect: 'Perfect!', good: 'Good', ok: 'Almost', splash: 'Splash!' };
  let feedback = $state<{ grade: PirateGrade; hint: string; key: number } | null>(null);
  let pressed = $state(false);
  let seq = 0;
  /** Beats this phone already rowed (one stroke a beat) */
  const rowed = new Set<number>();

  function row() {
    pressed = true;
    setTimeout(() => (pressed = false), 120);
    const at = serverNow();
    tappedAt = at;
    if (v.step !== 'race' || at < v.raceAt - PIRATE.okMs) return;
    let best = null;
    for (const b of v.beats) if (b.i >= PIRATE.countIn && (!best || Math.abs(b.at - at) < Math.abs(best.at - at))) best = b;
    if (!best || rowed.has(best.i)) return;
    rowed.add(best.i);
    const gap = at - best.at;
    const grade = pirateGradeOf(gap);
    pirateSound('oar', { url: oarUrl, volume: grade === 'splash' ? 0.35 : 0.6 });
    navigator.vibrate?.(grade === 'splash' ? 40 : 12);
    const hint = grade === 'perfect' ? 'Right on the beat' : gap < 0 ? 'A bit early' : 'A bit late';
    feedback = { grade, hint, key: ++seq };
    void rpc('games', 'play', { at }).catch(() => {});
  }
</script>

<div class="oar" style:--team={ship.hex}>
  {#if crew}<PirateCrewCard {crew} players={m.players} {me} phase={myStroke} compact />{/if}

  <div class="state">
    {#if v.step === 'crew'}
      <strong>Get ready</strong>
      <span><Volume2 size={16} /> The drum starts on the TV in a moment</span>
    {:else if v.step === 'finish'}
      <strong>Land ho!</strong>
      <span>{crew?.finishedAt ? 'Your ship reached the treasure' : 'A ship reached the treasure'}</span>
    {:else if countIn !== null}
      <strong class="big mono">{countIn > PIRATE.countIn ? 'Ready' : countIn}</strong>
      <span>Listen to the drum...</span>
    {:else if feedback}
      {#key feedback.key}
        <strong class="grade {feedback.grade}">{LABEL[feedback.grade]}</strong>
      {/key}
      <span>{feedback.grade === 'splash' ? 'Off the beat: that stroke is lost' : feedback.hint}</span>
    {:else}
      <strong>Row!</strong>
      <span>Tap on every beat of the drum</span>
    {/if}
  </div>

  <div class="pad">
    <button class="row" class:pressed onpointerdown={row} disabled={v.step === 'finish'}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round">
          <path d="M14 50 L46 18" />
          <path d="M50 50 L18 18" />
        </g>
        <path d="M42 22 Q48 8 58 6 Q56 16 42 22 Z M22 22 Q16 8 6 6 Q8 16 22 22 Z" fill="currentColor" />
      </svg>
      ROW
    </button>
  </div>
</div>

<style>
  .oar {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 1rem;
    min-height: 100%;
    padding: 0.5rem 0 1.6rem;
    color: var(--text);
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }
  .state {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.3rem;
    text-align: center;
  }
  .state strong {
    font-family: var(--font-display);
    font-size: 2.2rem;
    line-height: 1.1;
  }
  .state span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--text-dim);
    font-size: 0.95rem;
  }
  .big {
    font-size: 4rem !important;
  }
  .grade {
    animation: popin 0.25s ease-out;
  }
  .grade.perfect {
    color: #ffe14d;
  }
  .grade.good {
    color: #7dffb0;
  }
  .grade.ok {
    color: #ffb07d;
  }
  .grade.splash {
    color: #9fd6ff;
  }
  @keyframes popin {
    from {
      transform: scale(1.4);
    }
  }
  .pad {
    display: grid;
    place-items: center;
  }
  .row {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.2rem;
    padding: 0;
    width: min(70vw, 17rem);
    aspect-ratio: 1;
    border-radius: 50%;
    border: 0.35rem solid color-mix(in srgb, var(--team) 45%, #fff);
    background: radial-gradient(circle at 40% 30%, color-mix(in srgb, var(--team) 55%, #fff), var(--team) 58%, color-mix(in srgb, var(--team) 55%, #000));
    color: #fff;
    font-family: var(--font-display);
    font-size: 3.2rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-shadow: 0 0.2rem 0.6rem rgb(0 0 0 / 0.45);
    box-shadow:
      0 1.4rem 3rem -1.2rem var(--team),
      0 0.5rem 0 color-mix(in srgb, var(--team) 45%, #000),
      inset 0 -0.6rem 1.2rem rgb(0 0 0 / 0.25);
    transition:
      transform 0.08s ease,
      box-shadow 0.08s ease;
  }
  .row svg {
    width: 3.2rem;
    filter: drop-shadow(0 0.15rem 0.3rem rgb(0 0 0 / 0.4));
  }
  .row.pressed {
    transform: translateY(0.4rem) scale(0.97);
    box-shadow:
      0 0.8rem 2rem -1.2rem var(--team),
      0 0.1rem 0 color-mix(in srgb, var(--team) 45%, #000),
      inset 0 -0.6rem 1.2rem rgb(0 0 0 / 0.25);
  }
  .row:disabled {
    opacity: 0.5;
  }
</style>
