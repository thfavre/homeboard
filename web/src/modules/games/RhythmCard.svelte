<script lang="ts">
  import { Check, Crown, Guitar } from '@lucide/svelte';
  import { scale } from 'svelte/transition';
  import { rhythmMultiplier, type RhythmGrade, type RhythmView } from '$shared/games.ts';
  import { hb, onEvent } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { Now, gamesState } from './store.svelte.ts';
  import { rhythmSound } from './ui/rhythmSound.ts';
  import { playMusic, preloadMusic, stopMusic, type MusicCue } from './ui/rhythmMusic.ts';

  /**
   * Rhythm Rain is played on the light strip: the TV keeps its screen and only shows this card above
   * the main widget, with the time left and both scores. The TV that plays the sound plucks each hit,
   * the first player on the left speaker, the second on the right (softer over a song). With music,
   * that TV also plays the song, in time with the notes on the light.
   */
  const m = $derived(gamesState()?.match ?? null);
  const v = $derived(m?.phase === 'play' || m?.phase === 'result' ? (m.view as RhythmView | null) : null);
  const now = new Now(250);
  const economy = $derived(!!hb.core?.economyEnabled);
  const LABEL: Record<RhythmGrade, string> = { perfect: 'Perfect', good: 'Good', ok: 'Just', miss: 'Miss' };

  const withMusic = $derived(!!v?.music);
  $effect(() =>
    onEvent<{ player: number; lane: number; grade: RhythmGrade }>('games', 'rhythm', (d) =>
      rhythmSound(d.grade, d.lane, d.player === 0 ? -0.7 : 0.7, withMusic ? 0.3 : 0.6),
    ),
  );

  // Decode the song while the players read the rules, play it on cue, stop it when the game goes away
  const songUrl = $derived(gamesState()?.rhythmSong?.url);
  $effect(() => {
    if (songUrl) void preloadMusic(songUrl).catch(() => {});
  });
  $effect(() => {
    const off = onEvent<MusicCue>('games', 'rhythmMusic', (cue) => void playMusic(cue).catch(() => {}));
    return () => {
      off();
      stopMusic();
    };
  });

  const firstAt = $derived(v?.notes[0]?.at ?? 0);
  const countIn = $derived(v ? Math.ceil((firstAt - now.value) / 1000) : 0);
  const left = $derived(v ? Math.max(0, Math.ceil((v.endAt - now.value) / 1000)) : 0);
  const progress = $derived(v ? Math.min(1, Math.max(0, (now.value - firstAt) / (v.endAt - firstAt))) : 0);
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const status = $derived.by(() => {
    if (!m) return '';
    if (m.phase === 'intro') return 'Reading the rules';
    if (m.phase === 'result') return m.result?.headline ?? 'Over';
    if (countIn > 0) return `Starts in ${countIn}`;
    return v?.music ? `${v.music.artist ? `${v.music.artist} - ` : ''}${v.music.title}` : 'Watch the light';
  });
</script>

{#if m}
  <div class="card rhythm" in:scale={{ start: 0.95 }}>
    <div class="title">
      <span class="icon"><Guitar size="1.1rem" /></span>
      <span class="what">
        <span class="eyebrow">Rhythm Rain{#if v}<span>{` · level ${v.difficulty}`}</span>{/if}{#if economy && m.pot > 0}<span>{' · pot '}</span><Money amount={m.pot} />{/if}</span>
        <strong class="truncate">{status}</strong>
      </span>
    </div>

    {#each m.players as p, i (p.id)}
      {@const sc = v?.scores[p.id]}
      {@const won = m.result?.winners.includes(p.id)}
      <div class="player" class:won>
        <span class="face">
          <Avatar name={p.name} color={p.color} id={p.id} size="2rem" />
          {#if won}<span class="badge crown"><Crown size="0.7rem" /></span>{:else if m.phase === 'intro' && m.ready.includes(p.id)}<span class="badge ready"><Check size="0.7rem" strokeWidth={3} /></span>{/if}
        </span>
        <span class="who">
          <span class="name truncate">{p.name}</span>
          <span class="line">
            <strong class="mono score">{sc?.score ?? 0}</strong>
            {#if sc && m.phase === 'play'}
              <span class="mult mono" class:max={rhythmMultiplier(sc.combo) >= 4}>x{rhythmMultiplier(sc.combo)}</span>
              {#if sc.last && countIn <= 0}
                {#key sc.last.seq}<span class="pop {sc.last.grade}">{LABEL[sc.last.grade]}</span>{/key}
              {/if}
            {/if}
          </span>
        </span>
      </div>
      {#if i === 0}<span class="vs">VS</span>{/if}
    {/each}

    <div class="time">
      {#if v && m.phase === 'play'}
        <span class="mono clock">{countIn > 0 ? clock(Math.ceil((v.endAt - firstAt) / 1000)) : clock(left)}</span>
        <span class="eyebrow">left</span>
      {/if}
    </div>
    {#if v && m.phase === 'play'}<span class="bar" style:width="{progress * 100}%"></span>{/if}
  </div>
{/if}

<style>
  .rhythm {
    position: relative;
    width: 50%;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem;
    padding: 0.45rem 1rem;
    overflow: hidden;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    flex: none;
    border-radius: 0.6rem;
    background: linear-gradient(135deg, #3dff9b, #8b3dff);
    color: #fff;
  }
  .what {
    display: grid;
    min-width: 0;
  }
  .what .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .what .eyebrow {
    font-size: 0.65rem;
  }
  .what strong {
    font-size: 1rem;
  }
  .player {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }
  .face {
    position: relative;
    flex: none;
  }
  .badge {
    position: absolute;
    right: -0.3rem;
    bottom: -0.3rem;
    display: grid;
    place-items: center;
    width: 1.05rem;
    height: 1.05rem;
    border-radius: 50%;
    color: #fff;
    box-shadow: 0 0 0 0.15rem var(--surface);
  }
  .badge.crown {
    background: var(--coin);
  }
  .badge.ready {
    background: var(--success);
  }
  .who {
    display: grid;
    min-width: 0;
  }
  .name {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.85rem;
  }
  .score {
    font-size: 1.3rem;
    line-height: 1.1;
  }
  .won .score {
    color: var(--coin);
  }
  .mult {
    padding: 0 0.4rem;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    font-weight: 800;
  }
  .mult.max {
    background: linear-gradient(135deg, var(--coin), var(--coin-2));
    border-color: transparent;
    color: #fff;
  }
  .pop {
    font-family: var(--font-display);
    font-weight: 800;
    font-style: italic;
    text-transform: uppercase;
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
      transform: scale(1.4);
      opacity: 0;
    }
    20% {
      transform: scale(1);
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  .vs {
    font-family: var(--font-display);
    font-weight: 700;
    font-style: italic;
    color: var(--text-faint);
  }
  .time {
    display: grid;
    justify-items: end;
    min-width: 3rem;
  }
  .time .eyebrow {
    font-size: 0.6rem;
  }
  .clock {
    font-size: 1.3rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 0.18rem;
    background: var(--gradient);
    transition: width 0.25s linear;
  }
</style>
