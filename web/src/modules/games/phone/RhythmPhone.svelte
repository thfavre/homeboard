<script lang="ts">
  import { Music } from '@lucide/svelte';
  import {
    RHYTHM_COLORS,
    rhythmDifficulty,
    RHYTHM_WRONG_PENALTY,
    rhythmGradeOf,
    rhythmMultiplier,
    rhythmTapWindow,
    rhythmTarget,
    songBeat,
    songBpmAt,
    type RhythmColor,
    type MatchState,
    type RhythmGrade,
    type RhythmView,
  } from '$shared/games.ts';
  import { hb, rpc, serverNow } from '$lib/client.svelte.ts';
  import { Now } from '../store.svelte.ts';
  import { rhythmSound } from '../ui/rhythmSound.ts';

  /**
   * A guitar controller: one key per color picked, the notes are on the light so eyes stay on it. A tap with no note of its color in the zone costs points.
   * Each tap is judged right away on the phone (same rule as the server) so its sound and burst come
   * with no delay; the server keeps the score. The sound comes from this phone, except solo with
   * music where the TV plays it with the song.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as RhythmView);
  const me = $derived(hb.me?.id ?? '');
  const mine = $derived(v.scores[me]);
  const now = new Now(250);
  const firstAt = $derived(v.notes[0]?.at ?? v.startAt);
  const countIn = $derived(Math.ceil((firstAt - now.value) / 1000));
  const left = $derived(Math.max(0, Math.ceil((v.endAt - Math.max(now.value, firstAt)) / 1000)));
  const progress = $derived(v.loading ? 0 : Math.min(1, Math.max(0, (now.value - firstAt) / Math.max(1, v.endAt - firstAt))));
  const lanes = $derived(v.lanes.map((id) => RHYTHM_COLORS.find((c) => c.id === id)!));
  const columns = $derived(Math.min(4, lanes.length));
  const LABEL: Record<RhythmGrade, string> = { perfect: 'Perfect', good: 'Good', ok: 'Just', miss: 'Miss' };
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  // The glow behind the keys pulses on the song's beat. A song that changes tempo: the pulse starts
  // again on each change (`section`), at the new tempo and on its beat.
  const section = $derived(v.tempo ? v.tempo.filter((t) => t.ms <= now.value - v.beatAt).length : 0);
  const beatMs = $derived(60_000 / songBpmAt(now.value - v.beatAt, v.bpm || 120, v.tempo));
  const beatDelay = $derived.by(() => {
    void section;
    const beat = songBeat(serverNow() - v.beatAt, v.bpm || 120, v.tempo);
    return -(beat - Math.floor(beat)) * beatMs;
  });

  const combo = $derived(mine?.combo ?? 0);
  const mult = $derived(rhythmMultiplier(combo));
  // The ring fills up to the next multiplier (8 hits in a row each), full at x4
  const ring = $derived(mult >= 4 ? 1 : (combo % 8) / 8);
  const RING = 2 * Math.PI * 26;

  // Notes this phone hit, so a second tap on the same note is a miss here too
  const hitLocal = new Set<number>();
  let pressed = $state<Record<string, boolean>>({});
  let pop = $state<{ grade: RhythmGrade; key: number } | null>(null);
  /** The last burst of each key */
  let bursts = $state<Record<string, { grade: RhythmGrade; key: number }>>({});
  let flash = $state<{ hex: string; key: number } | null>(null);
  let seq = 0;

  function tap(color: RhythmColor, lane: number, hex: string) {
    const at = serverNow();
    // Before the notes show on the light or once they are over, a tap counts for nothing (as on the server)
    const window = v.loading ? null : rhythmTapWindow(v.notes, v.travelMs);
    if (!window || at < window[0] || at > window[1]) return;
    const i = rhythmTarget(v.notes, at, color, (n) => hitLocal.has(n));
    const grade = i < 0 ? 'miss' : rhythmGradeOf(at - v.notes[i].at);
    if (i >= 0) hitLocal.add(i);
    if (!v.tvSounds) rhythmSound(grade, lane, 0, 0.45);
    navigator.vibrate?.(grade === 'miss' ? 35 : 8);
    seq += 1;
    pop = { grade, key: seq };
    bursts = { ...bursts, [color]: { grade, key: seq } };
    if (grade !== 'miss') flash = { hex, key: seq };
    void rpc('games', 'play', { color, at }).catch(() => {});
  }

  const press = (id: string, on: boolean) => (pressed = { ...pressed, [id]: on });
</script>

<div class="rhythm">
  {#key section}<div class="glow" style:--beat="{beatMs}ms" style:--beat-delay="{beatDelay}ms"></div>{/key}
  {#if flash}{#key flash.key}<div class="flash" style:--c={flash.hex}></div>{/key}{/if}

  <header class="song">
    {#if v.music}
      <span class="cover" style:background-image={v.music.cover ? `url("${v.music.cover}")` : undefined}>{#if !v.music.cover}<Music size={18} />{/if}</span>
      <span class="what">
        <strong class="truncate">{v.music.title}</strong>
        <span class="faint truncate">{v.music.artist ? `${v.music.artist} · ` : ''}{rhythmDifficulty(v.chart).name}</span>
      </span>
    {:else}
      <span class="cover beat"><Music size={18} /></span>
      <span class="what">
        <strong class="truncate">Rhythm Rain</strong>
        <span class="faint truncate">{rhythmDifficulty(v.chart).name} · just the beat</span>
      </span>
    {/if}
    <span class="mono time">{v.loading ? '-:--' : clock(left)}</span>
    <span class="bar" style:width="{progress * 100}%"></span>
  </header>

  <div class="hud">
    <span class="score">
      <span class="eyebrow">Score</span>
      <strong class="mono">{mine?.score ?? 0}</strong>
    </span>
    <span class="mult" class:max={mult >= 4}>
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle class="track" cx="30" cy="30" r="26" />
        <circle class="fill" class:empty={ring === 0} cx="30" cy="30" r="26" stroke-dasharray={RING} stroke-dashoffset={RING * (1 - ring)} />
      </svg>
      {#key mult}<strong class="mono">x{mult}</strong>{/key}
    </span>
    <span class="streak">
      <span class="eyebrow">Streak</span>
      <strong class="mono">{combo}</strong>
    </span>
  </div>

  <div class="status">
    {#if v.loading}
      <span class="dim">Loading the song on the TV...</span>
    {:else if countIn > 0}
      <span class="dim">Eyes on the light</span>
      {#key countIn}<strong class="mono count">{countIn}</strong>{/key}
    {:else if pop}
      {#key pop.key}<strong class="pop {pop.grade}">{LABEL[pop.grade]}{#if pop.grade === 'miss'}<span class="minus mono"> -{RHYTHM_WRONG_PENALTY}</span>{/if}</strong>{/key}
    {:else}
      <span class="dim">Tap the color in the zone</span>
    {/if}
  </div>

  <div class="frets" style:--cols={columns} style:--rows={Math.ceil(lanes.length / columns)}>
    {#each lanes as c, i (c.id)}
      {@const b = bursts[c.id]}
      <button
        class="fret"
        class:down={pressed[c.id]}
        style:--c={c.hex}
        aria-label={c.name}
        onpointerdown={(e) => {
          e.preventDefault();
          press(c.id, true);
          tap(c.id, i, c.hex);
        }}
        onpointerup={() => press(c.id, false)}
        onpointercancel={() => press(c.id, false)}
        onpointerleave={() => press(c.id, false)}
        oncontextmenu={(e) => e.preventDefault()}
      >
        <span class="string"></span>
        <span class="gem">
          {#if b}{#key b.key}<span class="burst {b.grade}"></span>{/key}{/if}
        </span>
      </button>
    {/each}
  </div>
</div>

<style>
  .rhythm {
    position: relative;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto auto 1fr;
    gap: 0.7rem;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    isolation: isolate;
  }
  /* Behind everything: a soft light under the keys, beating with the song, and a flash on each hit */
  .glow,
  .flash {
    position: absolute;
    inset: 30% -1rem -1rem;
    z-index: -1;
    pointer-events: none;
  }
  .glow {
    background: radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 70%);
    animation: beat var(--beat) ease-out var(--beat-delay) infinite;
  }
  @keyframes beat {
    from {
      opacity: 0.9;
    }
    to {
      opacity: 0.25;
    }
  }
  .flash {
    background: radial-gradient(ellipse at 50% 90%, color-mix(in srgb, var(--c) 45%, transparent), transparent 65%);
    animation: fade 0.35s ease-out forwards;
  }
  @keyframes fade {
    to {
      opacity: 0;
    }
  }

  .song {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.55rem 0.8rem 0.65rem 0.55rem;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .cover {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.55rem;
    background: var(--surface-2) center / cover no-repeat;
    color: var(--text-dim);
  }
  .cover.beat {
    background: linear-gradient(135deg, #3dff9b, #8b3dff);
    color: #fff;
  }
  .what {
    flex: 1;
    min-width: 0;
    display: grid;
    line-height: 1.25;
  }
  .what .faint {
    font-size: 0.8rem;
  }
  .time {
    font-size: 1.15rem;
    font-weight: 700;
  }
  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 0.2rem;
    background: var(--gradient);
    transition: width 0.25s linear;
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
    font-size: 1.7rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .mult {
    position: relative;
    display: grid;
    place-items: center;
    width: 4.2rem;
    height: 4.2rem;
  }
  .mult svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }
  .mult circle {
    fill: none;
    stroke-width: 5;
  }
  .mult .track {
    stroke: var(--surface-2);
  }
  .mult .fill {
    stroke: var(--accent);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.2s ease;
  }
  .mult .fill.empty {
    opacity: 0;
  }
  .mult.max .fill {
    stroke: var(--coin);
    filter: drop-shadow(0 0 4px var(--coin));
  }
  .mult strong {
    font-size: 1.35rem;
    font-weight: 800;
    animation: pop 0.35s ease-out;
  }
  .mult.max strong {
    color: var(--coin);
  }

  .status {
    height: 2.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    font-weight: 600;
  }
  .count {
    font-size: 1.8rem;
    animation: pop 0.5s ease-out;
  }
  .pop {
    font-family: var(--font-display);
    font-size: 1.9rem;
    font-weight: 800;
    font-style: italic;
    text-transform: uppercase;
    animation: pop 0.5s ease-out;
  }
  .pop.perfect {
    color: #2bff6a;
    text-shadow: 0 0 1rem rgb(43 255 106 / 0.5);
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
    from {
      transform: scale(1.4);
      opacity: 0;
    }
  }
  .minus {
    font-size: 1.1rem;
    font-style: normal;
    color: var(--danger);
  }

  /* Tall keys side by side, easy to find with the thumbs without looking */
  .frets {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(var(--rows), 1fr);
    gap: 0.5rem;
    touch-action: none;
  }
  .fret {
    position: relative;
    display: grid;
    place-items: end center;
    padding: 0 0 1.2rem;
    border: 0;
    border-radius: 1.3rem;
    background:
      linear-gradient(to bottom, rgb(255 255 255 / 0.07), transparent 30%),
      linear-gradient(to bottom, color-mix(in srgb, var(--c) 10%, var(--surface)), color-mix(in srgb, var(--c) 32%, var(--surface)));
    box-shadow:
      inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent),
      0 0.4rem 1rem -0.6rem rgb(0 0 0 / 0.6);
    transition:
      transform 0.06s ease,
      background 0.06s ease,
      box-shadow 0.06s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
    overflow: hidden;
  }
  .string {
    position: absolute;
    top: 0.9rem;
    bottom: 0.9rem;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--c) 45%, transparent) 25%, color-mix(in srgb, var(--c) 45%, transparent) 75%, transparent);
  }
  .gem {
    position: relative;
    width: min(4.2rem, 72%);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, #fff 55%, var(--c)), var(--c) 45%, color-mix(in srgb, #000 35%, var(--c)));
    box-shadow:
      0 0 0 0.25rem color-mix(in srgb, var(--c) 25%, transparent),
      0 0.3rem 0.8rem -0.2rem rgb(0 0 0 / 0.6);
    transition:
      transform 0.06s ease,
      box-shadow 0.06s ease;
  }
  .fret.down {
    transform: scale(0.97);
    background:
      linear-gradient(to bottom, rgb(255 255 255 / 0.12), transparent 40%),
      linear-gradient(to bottom, color-mix(in srgb, var(--c) 40%, var(--surface)), var(--c));
    box-shadow:
      inset 0 0 0 2px var(--c),
      0 0 2rem color-mix(in srgb, var(--c) 70%, transparent);
  }
  .fret.down .gem {
    transform: scale(0.92);
    box-shadow:
      0 0 0 0.3rem rgb(255 255 255 / 0.5),
      0 0 1.4rem var(--c);
  }
  /* A ring opening from the key: white on a perfect, the key color otherwise, red on a miss */
  .burst {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 3px solid var(--c);
    animation: burst 0.45s ease-out forwards;
    pointer-events: none;
  }
  .burst.perfect {
    border-color: #fff;
    box-shadow: 0 0 1rem var(--c);
  }
  .burst.miss {
    border-color: var(--danger);
    animation-duration: 0.3s;
  }
  @keyframes burst {
    from {
      transform: scale(0.9);
      opacity: 1;
    }
    to {
      transform: scale(2.2);
      opacity: 0;
    }
  }
</style>
