<script lang="ts">
  import {
    GAME_COLORS,
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
   * Just the four frets: the notes are on the light, eyes stay on it.
   * Each tap is judged right away on the phone (same rule as the server) so its sound comes with no
   * delay; the server keeps the score.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as RhythmView);
  const me = $derived(hb.me?.id ?? '');
  const mine = $derived(v.scores[me]);
  const now = new Now(250);
  const firstAt = $derived(v.notes[0]?.at ?? v.startAt);
  const countIn = $derived(Math.ceil((firstAt - now.value) / 1000));
  const left = $derived(Math.max(0, Math.ceil((v.endAt - Math.max(now.value, firstAt)) / 1000)));
  const lanes = RHYTHM_LANES.map((id) => GAME_COLORS.find((c) => c.id === id)!);
  const LABEL: Record<RhythmGrade, string> = { perfect: 'Perfect', good: 'Good', ok: 'Just', miss: 'Miss' };

  // Notes this phone hit, so a second tap on the same note is a miss here too
  const hitLocal = new Set<number>();
  let pressed = $state<Record<string, boolean>>({});
  let pop = $state<{ grade: RhythmGrade; key: number } | null>(null);

  function tap(color: GameColor, lane: number) {
    const at = serverNow();
    const i = rhythmTarget(v.notes, at, color, (n) => hitLocal.has(n));
    const grade = i < 0 ? 'miss' : rhythmGradeOf(at - v.notes[i].at);
    if (i >= 0) hitLocal.add(i);
    rhythmSound(grade, lane, 0, 0.45);
    if (grade === 'miss') navigator.vibrate?.(35);
    pop = { grade, key: (pop?.key ?? 0) + 1 };
    void rpc('games', 'play', { color, at }).catch(() => {});
  }

  const press = (id: string, on: boolean) => (pressed = { ...pressed, [id]: on });
  const mult = $derived(rhythmMultiplier(mine?.combo ?? 0));
</script>

<div class="rhythm">
  <div class="hud">
    <span><span class="eyebrow">Score</span><strong class="mono">{mine?.score ?? 0}</strong></span>
    <span class="mult mono" class:max={mult >= 4}>x{mult}</span>
    <span class="right"><span class="eyebrow">Left</span><strong class="mono">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</strong></span>
  </div>

  <div class="status">
    {#if countIn > 0}
      <span class="dim">Eyes on the light</span>
      {#key countIn}<strong class="mono count">{countIn}</strong>{/key}
    {:else if pop}
      {#key pop.key}<strong class="pop {pop.grade}">{LABEL[pop.grade]}</strong>{/key}
    {:else}
      <span class="dim">Tap the color in the zone</span>
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
      ></button>
    {/each}
  </div>
</div>

<style>
  .rhythm {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 0.8rem;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .hud {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }
  .hud > span:not(.mult) {
    display: grid;
  }
  .right {
    text-align: right;
  }
  .hud strong {
    font-size: 1.6rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .mult {
    padding: 0.2rem 0.9rem;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    font-size: 1.2rem;
    font-weight: 800;
  }
  .mult.max {
    background: linear-gradient(135deg, var(--coin), var(--coin-2));
    border-color: transparent;
    color: #fff;
  }
  .status {
    height: 2.6rem;
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
  /* Four tall keys side by side: easy to find with the thumbs without looking */
  .frets {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    touch-action: none;
  }
  .fret {
    border: 0;
    border-radius: 1.2rem;
    background: linear-gradient(to bottom, color-mix(in srgb, var(--c) 30%, transparent), color-mix(in srgb, var(--c) 75%, transparent));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--c) 70%, transparent);
    transition:
      transform 0.06s ease,
      background 0.06s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
  }
  .fret.down {
    transform: scale(0.97);
    background: var(--c);
    box-shadow: 0 0 2rem var(--c);
  }
</style>
