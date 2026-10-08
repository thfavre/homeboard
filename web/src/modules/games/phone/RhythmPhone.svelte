<script lang="ts">
  import { untrack } from 'svelte';
  import { Eye } from '@lucide/svelte';
  import {
    GAME_COLORS,
    RHYTHM,
    RHYTHM_LANES,
    rhythmGradeOf,
    rhythmMultiplier,
    rhythmTarget,
    type GameColor,
    type MatchState,
    type RhythmGrade,
    type RhythmView,
  } from '$shared/games.ts';
  import { hb, rpc, serverNow } from '$lib/client.svelte.ts';
  import { Now } from '../store.svelte.ts';
  import { rhythmSound } from '../ui/rhythmSound.ts';

  /**
   * A guitar neck with four frets. The notes are on the light, not here: eyes up, thumbs on the frets.
   * Each tap is judged right away on the phone (same rule as the server) so the sound and the
   * PERFECT / MISS come with no delay; the server keeps the score.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as RhythmView);
  const me = $derived(hb.me?.id ?? '');
  const mine = $derived(v.scores[me]);
  const now = new Now(100);
  const beatMs = $derived(60_000 / v.bpm);
  const firstAt = $derived(v.notes[0]?.at ?? v.startAt);
  const progress = $derived(Math.min(1, Math.max(0, (now.value - firstAt) / (v.endAt - firstAt))));
  const countIn = $derived(Math.ceil((firstAt - now.value) / 1000));
  const lanes = RHYTHM_LANES.map((id) => GAME_COLORS.find((c) => c.id === id)!);
  const LABEL: Record<RhythmGrade, string> = { perfect: 'Perfect', good: 'Good', ok: 'Just', miss: 'Miss' };

  // Notes this phone hit, so a second tap on the same note is a miss here too
  const hitLocal = new Set<number>();
  let pressed = $state<Record<string, boolean>>({});
  let pop = $state<{ grade: RhythmGrade; key: number; lane: number } | null>(null);
  let bursts = $state<{ lane: number; grade: RhythmGrade; key: number }[]>([]);
  let popKey = 0;
  let lastTap = 0;

  // Fret bars scroll on the beat: start their animation in phase with the song
  const beatPhase = untrack(() => -((serverNow() - v.startAt) % beatMs));

  function show(grade: RhythmGrade, lane: number) {
    const key = ++popKey;
    pop = { grade, key, lane };
    if (grade !== 'miss') {
      bursts = [...bursts.slice(-5), { lane, grade, key }];
      setTimeout(() => (bursts = bursts.filter((b) => b.key !== key)), 450);
    }
  }

  function tap(color: GameColor, lane: number) {
    const at = serverNow();
    lastTap = Date.now();
    const i = rhythmTarget(v.notes, at, color, (n) => hitLocal.has(n));
    const grade = i < 0 ? 'miss' : rhythmGradeOf(at - v.notes[i].at);
    if (i >= 0) hitLocal.add(i);
    rhythmSound(grade, lane, 0, 0.45);
    if (grade === 'miss') navigator.vibrate?.(35);
    show(grade, lane);
    void rpc('games', 'play', { color, at }).catch(() => {});
  }

  // A note that went by without a tap: the server says so, show it unless a tap just did
  let seenSeq = 0;
  $effect(() => {
    const last = mine?.last;
    if (!last || last.seq === seenSeq) return;
    seenSeq = last.seq;
    if (last.grade === 'miss' && Date.now() - lastTap > 600) show('miss', -1);
  });

  const press = (id: string, on: boolean) => (pressed = { ...pressed, [id]: on });
  const mult = $derived(rhythmMultiplier(mine?.combo ?? 0));
  const toNext = $derived(mult >= 4 ? 1 : ((mine?.combo ?? 0) % 8) / 8);
</script>

<div class="rhythm" style:--beat="{beatMs}ms" style:--phase="{beatPhase}ms">
  <div class="hud">
    <div class="score">
      <span class="eyebrow">Score</span>
      <strong class="mono">{mine?.score ?? 0}</strong>
    </div>
    <div class="mult" class:max={mult >= 4} style:--fill={toNext}>
      <span class="mono">x{mult}</span>
    </div>
    <div class="streak">
      <span class="eyebrow">Streak</span>
      <strong class="mono">{mine?.combo ?? 0}</strong>
    </div>
  </div>
  <div class="bar"><span style:width="{progress * 100}%"></span></div>

  <div class="neck">
    <div class="board">
      {#each lanes as c (c.id)}<span class="string" style:--c={c.hex}></span>{/each}
      <div class="zone"></div>
      {#each bursts as b (b.key)}
        <span class="burst {b.grade}" style:--lane={b.lane} style:--c={lanes[b.lane].hex}></span>
      {/each}
    </div>

    {#if countIn > 0}
      <div class="overlay">
        <span class="eye"><Eye size={34} /></span>
        <p>Eyes on the light</p>
        {#key countIn}<strong class="mono count">{countIn}</strong>{/key}
      </div>
    {:else if pop}
      {#key pop.key}
        <div class="pop {pop.grade}">
          <strong>{LABEL[pop.grade]}</strong>
          {#if pop.grade !== 'miss' && (mine?.combo ?? 0) > 2}<span class="mono">{mine?.combo} in a row</span>{/if}
        </div>
      {/key}
    {/if}
  </div>

  <div class="frets">
    {#each lanes as c, i (c.id)}
      <button
        class="fret"
        class:down={pressed[c.id]}
        style:--c={c.hex}
        aria-label={c.name}
        onpointerdown={(e) => {
          e.preventDefault();
          press(c.id, true);
          tap(c.id, i);
        }}
        onpointerup={() => press(c.id, false)}
        onpointercancel={() => press(c.id, false)}
        onpointerleave={() => press(c.id, false)}
        oncontextmenu={(e) => e.preventDefault()}
      ><span class="cap"></span></button>
    {/each}
  </div>
</div>

<style>
  .rhythm {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 0.7rem;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .hud {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }
  .score,
  .streak {
    display: grid;
  }
  .streak {
    text-align: right;
  }
  .hud strong {
    font-size: 1.9rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .mult {
    display: grid;
    place-items: center;
    width: 3.6rem;
    height: 3.6rem;
    border-radius: 50%;
    background:
      radial-gradient(circle, var(--surface) 62%, transparent 63%),
      conic-gradient(var(--accent) calc(var(--fill) * 360deg), var(--surface-2) 0);
    font-size: 1.25rem;
    font-weight: 800;
    transition: transform 0.2s ease;
  }
  .mult.max {
    background:
      radial-gradient(circle, var(--surface) 62%, transparent 63%),
      conic-gradient(var(--coin), var(--coin-2), var(--coin));
    color: var(--coin);
    transform: scale(1.08);
  }
  .bar {
    height: 0.3rem;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--gradient);
    transition: width 0.1s linear;
  }

  /* The neck, tilted away like the guitar game */
  .neck {
    position: relative;
    min-height: 12rem;
    perspective: 26rem;
    perspective-origin: 50% 0%;
    overflow: hidden;
  }
  .board {
    position: absolute;
    inset: -40% 6% 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    transform: rotateX(42deg);
    transform-origin: 50% 100%;
    border-radius: 0.6rem 0.6rem 0 0;
    background:
      repeating-linear-gradient(to bottom, transparent 0 calc(25% - 3px), rgb(255 255 255 / 0.13) calc(25% - 3px) 25%),
      linear-gradient(to bottom, #07060c, #181425 60%, #221c33);
    background-size:
      100% 25%,
      100% 100%;
    animation: frets var(--beat) linear infinite;
    animation-delay: var(--phase);
    box-shadow:
      inset 3px 0 0 rgb(255 255 255 / 0.18),
      inset -3px 0 0 rgb(255 255 255 / 0.18);
  }
  @keyframes frets {
    from {
      background-position:
        0 0,
        0 0;
    }
    to {
      background-position:
        0 25%,
        0 0;
    }
  }
  .string {
    position: relative;
  }
  .string::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--c) 70%, transparent));
  }
  /* The same zone as on the light: red, orange, green, orange, red */
  .zone {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 4%;
    height: 9%;
    background: linear-gradient(to bottom, #ff2a2a, #ff8a00 22%, #2bff6a 42% 58%, #ff8a00 78%, #ff2a2a);
    opacity: 0.55;
    filter: blur(1px);
    animation: breathe var(--beat) ease-out infinite;
    animation-delay: var(--phase);
  }
  @keyframes breathe {
    from {
      opacity: 0.85;
    }
    to {
      opacity: 0.4;
    }
  }
  .burst {
    position: absolute;
    bottom: 0;
    left: calc(var(--lane) * 25%);
    width: 25%;
    height: 40%;
    background: linear-gradient(to top, var(--c), transparent);
    animation: burst 0.45s ease-out forwards;
    pointer-events: none;
  }
  .burst.perfect {
    background: linear-gradient(to top, #fff, var(--c) 30%, transparent);
  }
  @keyframes burst {
    from {
      opacity: 0.95;
      transform: scaleY(0.4);
      transform-origin: bottom;
    }
    to {
      opacity: 0;
      transform: scaleY(1.2);
      transform-origin: bottom;
    }
  }

  .overlay,
  .pop {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    text-align: center;
    pointer-events: none;
  }
  .overlay p {
    font-weight: 700;
    font-size: 1.2rem;
  }
  .eye {
    color: var(--text-dim);
  }
  .count {
    font-size: 4.5rem;
    font-weight: 800;
    line-height: 1;
    animation: count 0.5s ease-out;
  }
  @keyframes count {
    from {
      transform: scale(1.6);
      opacity: 0;
    }
  }
  .pop strong {
    font-family: var(--font-display);
    font-size: 3rem;
    font-weight: 800;
    font-style: italic;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    text-shadow: 0 0 1.4rem currentColor;
  }
  .pop span {
    font-weight: 700;
    color: var(--text-dim);
  }
  .pop {
    animation: pop 0.6s ease-out forwards;
  }
  .pop.perfect {
    color: #2bff6a;
  }
  .pop.good {
    color: #ffa020;
  }
  .pop.ok {
    color: #ff5a4a;
  }
  .pop.miss {
    color: var(--text-faint);
  }
  @keyframes pop {
    0% {
      transform: scale(1.5);
      opacity: 0;
    }
    15% {
      transform: scale(1);
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      transform: translateY(-1.2rem);
      opacity: 0;
    }
  }

  /* Fret buttons: a colored ring with a dark cap that lights up when pressed */
  .frets {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.6rem;
    padding: 0 0.2rem;
    touch-action: none;
  }
  .fret {
    aspect-ratio: 1;
    border: 0;
    padding: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 65%, #fff), var(--c) 55%, color-mix(in srgb, var(--c) 60%, #000));
    box-shadow:
      0 0.5rem 0 color-mix(in srgb, var(--c) 45%, #000),
      0 0.9rem 1.6rem -0.6rem var(--c);
    transition:
      transform 0.06s ease,
      box-shadow 0.06s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
  }
  .cap {
    width: 62%;
    height: 62%;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #3a3a46, #101016 70%);
    box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.6);
    transition: background 0.06s ease;
  }
  .fret.down {
    transform: translateY(0.4rem);
    box-shadow:
      0 0.1rem 0 color-mix(in srgb, var(--c) 45%, #000),
      0 0 2.2rem 0.2rem var(--c);
  }
  .fret.down .cap {
    background: radial-gradient(circle at 40% 35%, #fff, var(--c) 70%);
  }
</style>
