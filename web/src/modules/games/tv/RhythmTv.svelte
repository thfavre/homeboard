<script lang="ts">
  import { Lightbulb } from '@lucide/svelte';
  import { GAME_COLORS, RHYTHM, rhythmMultiplier, type MatchState, type RhythmGrade, type RhythmView } from '$shared/games.ts';
  import { onEvent, serverNow } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { Now, gamesState } from '../store.svelte.ts';
  import { rhythmSound } from '../ui/rhythmSound.ts';

  /**
   * The two players on each side, and in the middle the light strip as the TV draws it (the same
   * notes and zone as the WLED light; hidden when the host only wants it on the light).
   * The TV that plays the sound plucks each hit, the first player on the left speaker, the second on the right.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as RhythmView);
  const s = $derived(gamesState());
  const now = new Now(100);
  const showLane = $derived(v.leds === null || !!s?.settings.tvColors);
  const firstAt = $derived(v.notes[0]?.at ?? v.startAt);
  const countIn = $derived(Math.ceil((firstAt - now.value) / 1000));
  const progress = $derived(Math.min(1, Math.max(0, (now.value - firstAt) / (v.endAt - firstAt))));
  const HEX = Object.fromEntries(GAME_COLORS.map((c) => [c.id, c.hex]));
  const LABEL: Record<RhythmGrade, string> = { perfect: 'Perfect', good: 'Good', ok: 'Just', miss: 'Miss' };

  $effect(() =>
    onEvent<{ player: number; lane: number; grade: RhythmGrade }>('games', 'rhythm', (d) => rhythmSound(d.grade, d.lane, d.player === 0 ? -0.7 : 0.7, 0.6)),
  );

  // Hits light up the zone in the player's color
  const flashes: { at: number; color: string }[] = [];
  const seen = new Map<string, number>();
  $effect(() => {
    for (const p of m.players) {
      const last = v.scores[p.id]?.last;
      if (!last || seen.get(p.id) === last.seq) continue;
      seen.set(p.id, last.seq);
      if (last.grade !== 'miss') flashes.push({ at: performance.now(), color: last.grade === 'perfect' ? '#ffffff' : p.color });
    }
  });

  let canvas = $state<HTMLCanvasElement>();
  $effect(() => {
    const c = canvas;
    if (!c) return;
    const g = c.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const t = serverNow();
      const view = v;
      const pad = w * 0.5;
      const span = h - pad * 2;
      const yOf = (f: number) => pad + span * (1 - f);
      const zoneY = yOf(RHYTHM.zoneAt);
      const pxPerMs = (span * RHYTHM.zoneAt) / RHYTHM.travelMs;
      g.clearRect(0, 0, w, h);

      // The strip: everything is drawn inside it
      const left = w * 0.3;
      const width = w * 0.4;
      g.save();
      g.beginPath();
      g.roundRect(left, pad * 0.4, width, h - pad * 0.8, width / 2);
      g.fillStyle = '#0b0a12';
      g.fill();
      g.clip();

      // The zone, breathing on the beat
      const beat = 60_000 / view.bpm;
      const since = (((t - view.startAt) % beat) + beat) % beat;
      const pulse = t < view.endAt ? Math.exp(-since / 160) : 0;
      g.globalAlpha = 0.45 + 0.4 * pulse;
      for (const [ms, color] of [
        [RHYTHM.okMs, '#ff2a2a'],
        [RHYTHM.goodMs, '#ff8a00'],
        [RHYTHM.perfectMs, '#2bff6a'],
      ] as const) {
        g.fillStyle = color;
        g.fillRect(left, zoneY - ms * pxPerMs, width, ms * pxPerMs * 2);
      }
      g.globalAlpha = 1;

      // Hit flashes
      const real = performance.now();
      while (flashes.length && real - flashes[0].at > 350) flashes.shift();
      for (const f of flashes) {
        const k = 1 - (real - f.at) / 350;
        g.globalAlpha = k;
        g.fillStyle = f.color;
        g.shadowColor = f.color;
        g.shadowBlur = w * 0.8;
        g.beginPath();
        g.ellipse(w / 2, zoneY, width * (0.5 + (1 - k) * 0.2), width * (0.2 + (1 - k) * 0.4), 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.shadowBlur = 0;

      // The notes, a glowing head and a tail below it
      const r = width * 0.28;
      for (const n of view.notes) {
        const y = zoneY + (n.at - t) * pxPerMs;
        if (y < -r * 2 || y > h + r * 6) continue;
        const color = HEX[n.color];
        const tail = g.createLinearGradient(0, y, 0, y + r * 5);
        tail.addColorStop(0, color);
        tail.addColorStop(1, 'transparent');
        g.globalAlpha = 0.5;
        g.fillStyle = tail;
        g.fillRect(w / 2 - r * 0.5, y, r, r * 5);
        g.globalAlpha = 1;
        g.shadowColor = color;
        g.shadowBlur = r * 1.6;
        g.fillStyle = color;
        g.beginPath();
        g.arc(w / 2, y, r, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = 'rgb(255 255 255 / 0.55)';
        g.beginPath();
        g.arc(w / 2 - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="rhythm">
  {#each m.players as p, i (p.id)}
    {@const sc = v.scores[p.id]}
    {@const mult = rhythmMultiplier(sc?.combo ?? 0)}
    <div class="player" class:right={i === 1} style:--pc={p.color}>
      <div class="who">
        <Avatar name={p.name} color={p.color} id={p.id} size="5rem" />
        <strong class="truncate">{p.name}</strong>
      </div>
      <div class="score mono">{sc?.score ?? 0}</div>
      <div class="chips">
        <span class="mult mono" class:max={mult >= 4}>x{mult}</span>
        <span class="streak">{sc?.combo ?? 0} in a row</span>
      </div>
      <div class="judge">
        {#if sc?.last && countIn <= 0}
          {#key sc.last.seq}<span class="pop {sc.last.grade}">{LABEL[sc.last.grade]}</span>{/key}
        {/if}
      </div>
      <dl class="stats">
        <div><dt>Perfect</dt><dd class="mono">{sc?.perfect ?? 0}</dd></div>
        <div><dt>Good</dt><dd class="mono">{(sc?.good ?? 0) + (sc?.ok ?? 0)}</dd></div>
        <div><dt>Missed</dt><dd class="mono">{(sc?.missed ?? 0) + (sc?.wrong ?? 0)}</dd></div>
      </dl>
    </div>
    {#if i === 0}
      <div class="middle">
        <div class="bar"><span style:height="{progress * 100}%"></span></div>
        {#if showLane}
          <canvas bind:this={canvas}></canvas>
        {:else}
          <div class="watch"><Lightbulb size="4rem" /><span>Watch the light</span></div>
        {/if}
        {#if countIn > 0}
          {#key countIn}<strong class="count mono">{countIn}</strong>{/key}
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .rhythm {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 16rem 1fr;
    gap: 3rem;
    align-items: stretch;
  }
  .player {
    display: grid;
    align-content: center;
    justify-items: end;
    gap: 1.2rem;
    text-align: right;
  }
  .player.right {
    justify-items: start;
    text-align: left;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 2rem;
    max-width: 100%;
  }
  .right .who {
    flex-direction: row-reverse;
  }
  .score {
    font-size: 6.5rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
  }
  .chips {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1.4rem;
  }
  .right .chips {
    flex-direction: row-reverse;
  }
  .mult {
    padding: 0.2rem 1rem;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    font-size: 1.8rem;
    font-weight: 800;
  }
  .mult.max {
    background: linear-gradient(135deg, var(--coin), var(--coin-2));
    color: #fff;
    border: 0;
    box-shadow: 0 0 2rem -0.4rem var(--coin);
  }
  .streak {
    color: var(--text-dim);
    font-weight: 600;
  }
  .judge {
    height: 4.5rem;
    display: grid;
    align-items: center;
  }
  .pop {
    font-family: var(--font-display);
    font-size: 3.6rem;
    font-weight: 800;
    font-style: italic;
    text-transform: uppercase;
    text-shadow: 0 0 2rem currentColor;
    animation: pop 0.7s ease-out forwards;
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
      opacity: 0;
    }
  }
  .stats {
    display: flex;
    gap: 2rem;
    margin: 0;
  }
  .stats div {
    display: grid;
  }
  .stats dt {
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .stats dd {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 700;
  }
  .middle {
    position: relative;
    min-height: 0;
    display: grid;
  }
  canvas {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .bar {
    position: absolute;
    left: -1.2rem;
    top: 5%;
    bottom: 5%;
    width: 0.35rem;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
    display: flex;
    align-items: flex-end;
  }
  .bar span {
    display: block;
    width: 100%;
    background: var(--gradient);
    transition: height 0.1s linear;
  }
  .watch {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 1rem;
    color: var(--warning);
    font-size: 1.5rem;
    font-weight: 700;
    text-align: center;
  }
  .count {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 9rem;
    font-weight: 800;
    text-shadow: 0 0 3rem rgb(0 0 0 / 0.8);
    animation: count 0.6s ease-out;
    pointer-events: none;
  }
  @keyframes count {
    from {
      transform: scale(1.8);
      opacity: 0;
    }
  }
</style>
