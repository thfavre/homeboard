<script lang="ts">
  import { Volume2, Zap } from '@lucide/svelte';
  import { PIRATE, PIRATE_SHIPS, pirateGradeOf, type MatchState, type PirateGrade, type PirateView } from '$shared/games.ts';
  import { hb, rpc, serverNow } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { gamesState } from '../store.svelte.ts';
  import { pirateSound } from '../ui/pirateSound.ts';

  /**
   * The oar: the whole screen takes the color of this player's ship, with their crew, and one big ROW
   * button. A ring closes on the button on every beat of the drum (the drum itself plays on the TV).
   * Each tap is judged here right away for its feedback; the server keeps the real score.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as PirateView);
  const me = $derived(hb.me?.id ?? '');
  const crew = $derived(v.crews.find((c) => c.members.includes(me)));
  const ship = $derived(PIRATE_SHIPS.find((s) => s.id === crew?.ship) ?? PIRATE_SHIPS[0]);
  const mates = $derived((crew?.members ?? []).map((id) => m.players.find((p) => p.id === id)).filter((p) => !!p));
  const oarUrl = $derived(gamesState()?.settings.pirateSounds?.oar?.url ?? null);

  let now = $state(serverNow());
  $effect(() => {
    let raf = 0;
    const loop = () => {
      now = serverNow();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  const next = $derived(v.beats.find((b) => b.at > now - 40) ?? null);
  const prev = $derived([...v.beats].reverse().find((b) => b.at <= now - 40) ?? null);
  /** The guide ring: 1 just after a beat, 0 on the next one */
  const ring = $derived.by(() => {
    if (v.step !== 'race' || !next || !prev) return null;
    return Math.min(1, Math.max(0, (next.at - now) / Math.max(1, next.at - prev.at)));
  });
  const countIn = $derived(v.step === 'race' && now < v.raceAt ? PIRATE.countIn - (prev?.i ?? -1) : null);
  const boosted = $derived(!!crew && now < crew.boostUntil);

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

<div class="oar" class:boosted style:--team={ship.hex}>
  <header>
    <span class="eyebrow">You row for the</span>
    <h1>{ship.name} ship</h1>
    <div class="mates">
      {#each mates as p (p.id)}
        <span class="mate" class:me={p.id === me}><Avatar name={p.name} color={p.color} id={p.id} size="1.8rem" />{p.id === me ? 'You' : p.name}</span>
      {/each}
    </div>
  </header>

  <div class="track" aria-hidden="true">
    {#each v.crews as c (c.ship)}
      {@const s = PIRATE_SHIPS.find((x) => x.id === c.ship)!}
      <div class="lane" class:mine={c === crew}>
        <span class="dot" style:background={s.hex} style:left="calc({c.progress} * (100% - 1rem))"></span>
      </div>
    {/each}
    <span class="gold">✦</span>
  </div>

  <div class="state">
    {#if v.step === 'crew'}
      <strong>Find your crew!</strong>
      <span><Volume2 size={16} /> The drum starts on the TV in a moment</span>
    {:else if countIn !== null}
      <strong class="big mono">{countIn > PIRATE.countIn ? 'Ready' : countIn}</strong>
      <span>Listen to the drum...</span>
    {:else if boosted}
      <strong class="boost"><Zap size={22} /> BOOST!</strong>
      <span>Keep rowing together</span>
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

  <div class="pips">
    {#each Array.from({ length: PIRATE.boostStreak }) as _, i}<span class:on={i < (crew?.streak ?? 0)}></span>{/each}
    <small>in sync</small>
  </div>

  <div class="pad">
    {#if ring !== null}<span class="guide" style:--r={ring}></span>{/if}
    <button class="row" class:pressed onpointerdown={row} disabled={v.step === 'finish'}>ROW</button>
  </div>
</div>

<style>
  .oar {
    position: relative;
    display: grid;
    grid-template-rows: auto auto auto auto 1fr;
    gap: 0.9rem;
    min-height: 100%;
    padding: 1rem;
    border-radius: var(--radius);
    background:
      radial-gradient(ellipse at 50% 85%, color-mix(in srgb, var(--team) 55%, transparent), transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--team) 40%, #061a33), #061a33);
    border: 3px solid var(--team);
    color: #fff;
    overflow: hidden;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }
  .boosted {
    animation: hot 0.4s ease-in-out infinite alternate;
  }
  @keyframes hot {
    to {
      box-shadow: inset 0 0 3rem #ffe14d;
    }
  }
  header {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    text-align: center;
  }
  header .eyebrow {
    color: rgb(255 255 255 / 0.75);
  }
  h1 {
    font-size: 2.3rem;
    line-height: 1;
    color: var(--team);
    text-shadow: 0 0 1.5rem color-mix(in srgb, var(--team) 60%, transparent);
  }
  .mates {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.35rem 0.7rem;
  }
  .mate {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.85;
  }
  .mate.me {
    opacity: 1;
    font-weight: 800;
  }
  .track {
    position: relative;
    display: grid;
    gap: 0.25rem;
    padding: 0.45rem 2rem 0.45rem 0.5rem;
    border-radius: var(--radius-sm);
    background: rgb(0 30 70 / 0.6);
  }
  .lane {
    position: relative;
    height: 0.7rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.08);
  }
  .lane.mine {
    outline: 1px solid rgb(255 255 255 / 0.5);
  }
  .dot {
    position: absolute;
    top: -0.15rem;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    box-shadow: 0 0 0.5rem rgb(0 0 0 / 0.6);
    transition: left 0.6s ease-out;
  }
  .gold {
    position: absolute;
    right: 0.6rem;
    top: 50%;
    translate: 0 -50%;
    color: #ffd54a;
    font-size: 1.2rem;
  }
  .state {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.2rem;
    min-height: 4.6rem;
    text-align: center;
  }
  .state strong {
    font-size: 1.8rem;
    line-height: 1.1;
  }
  .state span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: rgb(255 255 255 / 0.75);
    font-size: 0.9rem;
  }
  .big {
    font-size: 3rem !important;
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
  .boost {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: #ffe14d;
  }
  .pips {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.4rem;
  }
  .pips span {
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 50%;
    border: 2px solid rgb(255 255 255 / 0.5);
  }
  .pips span.on {
    background: var(--team);
    border-color: var(--team);
    box-shadow: 0 0 0.6rem var(--team);
  }
  .pips small {
    color: rgb(255 255 255 / 0.6);
    margin-left: 0.3rem;
  }
  .pad {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 16rem;
  }
  .row {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    padding: 0;
    width: min(68vw, 17rem);
    aspect-ratio: 1;
    border-radius: 50%;
    border: 0.4rem solid rgb(255 255 255 / 0.85);
    background: radial-gradient(circle at 40% 30%, color-mix(in srgb, var(--team) 60%, #fff), var(--team) 60%, color-mix(in srgb, var(--team) 60%, #000));
    color: #fff;
    font-family: var(--font-display);
    font-size: 3.4rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-shadow: 0 0.2rem 0.6rem rgb(0 0 0 / 0.5);
    box-shadow:
      0 1.2rem 3rem -1rem var(--team),
      inset 0 -0.6rem 1.2rem rgb(0 0 0 / 0.3);
    transition: transform 0.08s ease;
  }
  .row.pressed {
    transform: scale(0.93);
  }
  .guide {
    position: absolute;
    width: min(68vw, 17rem);
    aspect-ratio: 1;
    border-radius: 50%;
    border: 0.3rem solid #fff;
    transform: scale(calc(1 + var(--r) * 0.55));
    opacity: calc(0.2 + (1 - var(--r)) * 0.8);
    pointer-events: none;
  }
</style>
