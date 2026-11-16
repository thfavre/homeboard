<script lang="ts">
  import { Heart, LoaderCircle, Music, Smartphone, TriangleAlert } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { scale } from 'svelte/transition';
  import { zzfx } from 'zzfx';
  import type { MatchState } from '$shared/games.ts';
  import {
    WALLRUSH_JUDGE_MS,
    poseDef,
    poseShape,
    wallRushGrade,
    wallRushLevel,
    wallRushMultiplier,
    type WallRushFit,
    type WallRushGrade,
    type WallRushSignal,
    type WallRushView,
  } from '$shared/wallrush.ts';
  import { onEvent, rpc, serverNow } from '$lib/client.svelte.ts';
  import { Now } from '../store.svelte.ts';
  import { Body, GH, GW, holeGrid, loadTracker, track } from './tracker.ts';
  import { NEON, Silhouette, Sparks, drawCorridor, drawWall, holeOutline, look, project, wallPicture } from './scene.ts';
  import { RTC_CONFIG, gathered } from './rtc.ts';

  /**
   * The game on the TV: receives the phone camera, tracks the player on this computer's graphics card,
   * plays the music, draws the corridor, the walls and the player's silhouette, and tells the server
   * how each wall fit.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as WallRushView);
  const now = new Now(100);

  /** After reaching the player, a wall flies past (or stays stuck) this long */
  const AFTER_MS = 900;
  const GRADE_COLORS: Record<WallRushGrade, string[]> = {
    perfect: [NEON.green, '#ffffff', NEON.cyan],
    great: [NEON.cyan, '#ffffff', NEON.green],
    good: ['#ffd23d', NEON.cyan],
    hit: [NEON.red, NEON.magenta, '#ffffff'],
  };

  let canvas = $state<HTMLCanvasElement>();
  let video = $state<HTMLVideoElement>();
  let audio = $state<HTMLAudioElement>();
  let engine = $state<'loading' | 'ready' | 'error'>('loading');
  let engineError = $state('');
  let link = $state<'waiting' | 'connecting' | 'on' | 'lost'>('waiting');
  /** Why the player cannot be measured yet ('' when they are seen whole) */
  let hint = $state('Step in front of the camera');
  let calibrated = $state(false);
  let fps = $state(0);

  const send = (a: Record<string, unknown>) => rpc('games', 'play', { wallrush: a }).catch(() => {});

  // ------------------------------------------------------------ the camera link

  let pc: RTCPeerConnection | null = null;
  async function answer(sig: WallRushSignal) {
    pc?.close();
    const p = new RTCPeerConnection(RTC_CONFIG);
    pc = p;
    link = 'connecting';
    p.ontrack = (e) => {
      if (!video) return;
      video.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      video.play().catch(() => {});
    };
    p.onconnectionstatechange = () => {
      if (pc !== p) return;
      if (p.connectionState === 'connected') {
        link = 'on';
        send({ kind: 'camera', on: true });
      } else if (p.connectionState === 'failed' || p.connectionState === 'disconnected') {
        link = 'lost';
        send({ kind: 'camera', on: false });
      }
    };
    try {
      await p.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
      await p.setLocalDescription(await p.createAnswer());
      await gathered(p);
      send({ kind: 'answer', sdp: p.localDescription!.sdp, to: sig.from });
    } catch {
      if (pc === p) link = 'lost';
    }
  }

  $effect(() => {
    const off = onEvent<WallRushSignal>('games', 'wallrush:rtc', (sig) => {
      if (sig.kind === 'offer') void answer(sig);
    });
    // Opened (or reloaded) during the game: ask the phone for its camera again
    send({ kind: 'hello' });
    return () => {
      off();
      pc?.close();
      pc = null;
    };
  });

  // ------------------------------------------------------------ tracking

  const body = new Body();
  const silhouette = new Silhouette();
  let tracked = false;

  $effect(() => {
    if (!video) return;
    const el = video;
    let alive = true;
    let tracker: Awaited<ReturnType<typeof loadTracker>> | null = null;
    let frames = 0;
    let since = performance.now();
    // Loaded once: the view changes all the time, the model does not during a game
    loadTracker(untrack(() => v.model))
      .then((t) => {
        if (!alive) return t.landmarker.close();
        tracker = t;
        engine = 'ready';
      })
      .catch((err) => {
        engine = 'error';
        engineError = (err as Error)?.message ?? String(err);
      });

    const onFrame = () => {
      if (!alive) return;
      if (tracker && el.videoWidth) {
        const at = performance.now();
        const f = track(tracker, el, at);
        if (!body.ratio) {
          hint = Body.problem(f) || 'Stand still, arms by your sides';
          if (body.calibrate(f)) {
            calibrated = true;
            hint = '';
            send({ kind: 'ready' });
          }
        }
        tracked = body.update(f);
        frames += 1;
        if (at - since > 1000) {
          fps = Math.round((frames * 1000) / (at - since));
          frames = 0;
          since = at;
        }
      }
      el.requestVideoFrameCallback(onFrame);
    };
    el.requestVideoFrameCallback(onFrame);
    return () => {
      alive = false;
      tracker?.landmarker.close();
    };
  });

  // ------------------------------------------------------------ music

  /** Keep the song where the walls expect it, fading out at the end */
  function syncMusic(t: number) {
    const el = audio;
    const mu = v.music;
    if (!el) return;
    if (!mu) {
      if (!el.paused) el.pause();
      return;
    }
    if (el.dataset.src !== mu.url) {
      el.src = mu.url;
      el.dataset.src = mu.url;
    }
    // The host's Rhythm Rain timing: the music plays early by the TV's sound delay
    const heard = t + v.audioOffset;
    if (heard < mu.at - 30 || t >= mu.untilAt) {
      if (!el.paused) el.pause();
      return;
    }
    const pos = Math.max(0, (mu.fromMs + heard - mu.at) / 1000);
    if (el.paused) {
      el.currentTime = pos;
      el.play().catch(() => {});
    } else if (Math.abs(el.currentTime - pos) > 0.15) el.currentTime = pos;
    el.volume = Math.max(0, Math.min(1, (mu.untilAt - t) / 1500)) * 0.9;
  }

  // ------------------------------------------------------------ drawing

  interface WallArt {
    hole: Uint8Array;
    pic: HTMLCanvasElement;
    rim: HTMLCanvasElement;
    outline: { x: number; y: number }[];
  }
  /** Each wall's hole on the grid, its pictures and outline, made when it first shows */
  const walls = new Map<number, WallArt>();
  /** The best fit seen in the last moment before each wall arrived */
  const bestFit = new Map<number, WallRushFit>();
  const reported = new Set<number>();
  const heard = new Set<number>();
  const level = $derived(wallRushLevel(v.level));
  const sparks = new Sparks();

  function wallAt(i: number): WallArt {
    let w = walls.get(i);
    if (!w) {
      const def = v.walls[i];
      const shape = poseShape(poseDef(def.pose), def.x);
      const hole = holeGrid(shape, level.margin);
      w = { hole, ...wallPicture(shape, level.margin), outline: holeOutline(hole, GW, GH) };
      walls.set(i, w);
    }
    return w;
  }

  /** Less sticking out wins; on a tie, the fuller fit */
  const better = (a: WallRushFit, b: WallRushFit | undefined) => !b || (a.seen && !b.seen) || (a.seen === b.seen && (a.outside < b.outside - 0.005 || (Math.abs(a.outside - b.outside) <= 0.005 && a.coverage > b.coverage)));

  $effect(() => {
    if (!canvas) return;
    const c = canvas;
    const g = c.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let shakeUntil = 0;
    let flash = { color: '', start: 0, until: 0 };
    /** Smoothed: how green the player glows (they fit the coming hole) */
    let glow = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const pnow = performance.now();
      const dt = Math.min(0.05, (pnow - last) / 1000);
      last = pnow;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const t = serverNow();
      const l = look(w, h);
      const view = v;
      syncMusic(t);

      // The beat: a flash on every beat of the song
      let pulse = 0;
      let rush = 0.6;
      const mu = view.music;
      if (mu && t >= mu.at && t < mu.untilAt) {
        const beat = 60_000 / mu.bpm;
        const phase = (((mu.fromMs + t - mu.at) / beat) % 1 + 1) % 1;
        pulse = Math.pow(1 - phase, 3);
        rush = mu.bpm / 100;
      }

      const playing = view.step === 'walls' || view.step === 'done';
      // Walls on screen: set off and not yet gone past (several can be on their way)
      const shown = playing ? view.walls.map((x, i) => i).filter((i) => t >= view.walls[i].arriveAt - view.walls[i].travelMs && t < view.walls[i].arriveAt + AFTER_MS) : [];
      const coming = shown.filter((i) => t < view.walls[i].arriveAt);
      const passed = shown.filter((i) => t >= view.walls[i].arriveAt);
      const next = coming[0] ?? -1;
      const lastHit = passed.some((i) => view.results[i] && !view.results[i]!.pass);

      g.save();
      if (pnow < shakeUntil) {
        const k = (shakeUntil - pnow) / 450;
        g.translate((Math.random() - 0.5) * 40 * k, (Math.random() - 0.5) * 40 * k);
      }
      drawCorridor(g, l, w, h, t / 1000, coming.length ? rush * 1.3 : rush * 0.5, lastHit ? NEON.red : NEON.magenta, pulse);

      // Walls coming, the farthest first, behind the player
      for (const i of [...coming].reverse()) {
        const def = view.walls[i];
        const z = (def.arriveAt - t) / def.travelMs;
        drawWall(g, l, wallAt(i).pic, z, Math.min(1, (1 - z) * 4));
      }

      // The next wall: its hole drawn at the player's place as it gets near, and the fit judged
      let fitNow: WallRushFit | null = null;
      if (next >= 0) {
        const def = view.walls[next];
        const art = wallAt(next);
        const z = (def.arriveAt - t) / def.travelMs;
        if (z < 0.7) drawWall(g, l, art.rim, 0, ((0.7 - z) / 0.7) * 0.55);
        if (z < 0.5 && tracked) fitNow = body.fit(art.hole, pnow);
        // The best fit over the last moment counts: one shaky frame does not ruin it
        if (fitNow && def.arriveAt - t <= WALLRUSH_JUDGE_MS && better(fitNow, bestFit.get(next))) bestFit.set(next, fitNow);
      }
      // A wall arrives: say how the player fit (once)
      for (const i of passed) {
        if (reported.has(i) || view.step !== 'walls') continue;
        reported.add(i);
        const fit = bestFit.get(i) ?? body.fit(wallAt(i).hole, pnow);
        send({ kind: 'fit', wall: i, ...fit });
      }

      // The player: red where they stick out as a wall gets near, green when they fit it
      const fits = fitNow && wallRushGrade(fitNow, level.outside) !== 'hit' ? 1 : 0;
      glow += (fits - glow) * Math.min(1, dt * 12);
      if (tracked || calibrated) {
        const z = next >= 0 ? (view.walls[next].arriveAt - t) / view.walls[next].travelMs : 1;
        const warn = next >= 0 ? Math.max(0, Math.min(1, (0.45 - z) / 0.3)) : 0;
        // Just hit: the parts that stuck out stay red a moment, against that wall's hole
        const hit = passed.find((i) => view.results[i] && !view.results[i]!.pass && t - view.walls[i].arriveAt < 700);
        if (hit !== undefined && !(next >= 0 && z < 0.5)) silhouette.paint(body.cells, wallAt(hit).hole, 1, 0);
        else silhouette.paint(body.cells, next >= 0 && z < 0.5 ? wallAt(next).hole : null, warn, glow);
        silhouette.draw(g, l, tracked ? 1 : 0.35);
      }

      // Past the player: a wall that fit flies by, a wall that hit stays a moment, shaking
      for (const i of passed) {
        const def = view.walls[i];
        const res = view.results[i];
        const k = Math.min(1, (t - def.arriveAt) / AFTER_MS);
        if (res && !res.pass) drawWall(g, l, wallAt(i).pic, 0, 0.9 * (1 - k * k), 26 * (1 - k));
        else drawWall(g, l, wallAt(i).pic, -0.1 * k, 1 - k);
      }

      // Effects as the results come
      view.results.forEach((res, i) => {
        if (!res || heard.has(i)) return;
        heard.add(i);
        const quiet = mu ? 0.5 : 1;
        const pts = wallAt(i).outline.map((p) => project(l, p.x, p.y, 0));
        if (res.pass) {
          const n = res.grade === 'perfect' ? 3 : res.grade === 'great' ? 2 : 1;
          for (let k = 0; k < n; k++) sparks.along(pts, GRADE_COLORS[res.grade], 300 + k * 260, 5 + k * 2);
          const centre = project(l, 0, 0.55, 0);
          if (res.grade === 'perfect') sparks.burst(centre.x, centre.y, 90, GRADE_COLORS.perfect, 1100, 8);
          flash = { color: res.grade === 'perfect' ? '61, 255, 155' : '0, 229, 255', start: pnow, until: pnow + 260 };
          zzfx(0.6 * quiet, 0.03, 480 * (1 + 0.05 * Math.min(12, view.combo)), 0, 0.07, 0.25, 0, 1.6, 0, 0, res.grade === 'perfect' ? 520 : 300, 0.05);
        } else {
          sparks.along(pts, GRADE_COLORS.hit, 700, 9);
          shakeUntil = pnow + 450;
          flash = { color: '255, 51, 85', start: pnow, until: pnow + 420 };
          zzfx(1 * quiet, 0.1, 70, 0, 0.12, 0.45, 4, 2.2, -1.5, 0, 0, 0, 0, 1.2);
        }
      });
      sparks.draw(g, dt);
      g.restore();

      // A flash of the whole screen: green fit, red hit
      if (pnow < flash.until) {
        g.fillStyle = `rgba(${flash.color}, ${0.28 * (1 - (pnow - flash.start) / (flash.until - flash.start))})`;
        g.fillRect(0, 0, w, h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });

  // ------------------------------------------------------------ what the HUD shows

  const done = $derived(v.results.filter((r) => r !== null).length);
  const lastIndex = $derived(v.results.reduce((last, r, i) => (r ? i : last), -1));
  const last = $derived(lastIndex >= 0 ? v.results[lastIndex] : null);
  /** The wall coming now, to name its pose */
  const next = $derived(v.walls.find((w, i) => !v.results[i] && w.arriveAt > now.value));
  const countdown = $derived(v.step === 'countdown' && v.until ? Math.max(1, Math.ceil((v.until - now.value) / 1000)) : 0);
  const go = $derived(v.step === 'walls' && !!v.walls.length && now.value < v.walls[0].arriveAt - v.walls[0].travelMs + 700);
  const mult = $derived(wallRushMultiplier(v.combo));
  const GRADES: Record<WallRushGrade, string> = { perfect: 'Perfect', great: 'Great', good: 'Good', hit: 'Hit' };

  // A beep on each number of the countdown, a higher one for GO
  $effect(() => {
    if (countdown) zzfx(0.5, 0, 440, 0, 0.05, 0.12, 1);
  });
  $effect(() => {
    if (go) zzfx(0.6, 0, 880, 0, 0.08, 0.2, 1);
  });
</script>

<div class="wallrush">
  <canvas bind:this={canvas}></canvas>
  <!-- The camera picture: small once the player is measured -->
  <video bind:this={video} class="cam" class:small={calibrated} muted playsinline autoplay></video>
  <audio bind:this={audio} preload="auto"></audio>

  {#if v.step === 'walls' || v.step === 'done' || v.step === 'countdown'}
    <div class="hud">
      <div class="stat">
        <span class="eyebrow">Score</span>
        <strong class="mono">{v.score}</strong>
      </div>
      {#if v.combo >= 2}
        <div class="stat combo" in:scale>
          <span class="eyebrow">Streak {v.combo}</span>
          <strong class="mono">x{mult}</strong>
        </div>
      {/if}
      <span class="spacer"></span>
      {#if v.lives !== null && v.maxLives}
        <div class="lives">
          {#each Array.from({ length: v.maxLives }, (_, k) => k) as k (k)}
            <span class:gone={k >= v.lives}><Heart size="1.8rem" fill="currentColor" /></span>
          {/each}
        </div>
      {/if}
      <div class="stat">
        <span class="eyebrow">Wall</span>
        <strong class="mono">{Math.min(done + 1, v.walls.length || 1)}/{v.walls.length || '-'}</strong>
      </div>
    </div>
  {/if}

  {#if next && v.step === 'walls'}
    {#key next.arriveAt}
      <div class="pose" class:move={!!poseDef(next.pose).rects} in:scale={{ start: 0.6, duration: 250 }}>{poseDef(next.pose).name}</div>
    {/key}
  {/if}

  {#if last && v.step !== 'camera'}
    {#key lastIndex}
      <div class="verdict {last.grade}">
        <strong>{GRADES[last.grade]}</strong>
        {#if last.pass}
          <span class="mono">+{last.points}</span>
        {:else}
          <span>{last.seen ? `${Math.round(last.outside * 100)}% of you stuck out` : 'The camera lost you'}</span>
        {/if}
      </div>
    {/key}
  {/if}

  {#if v.combo >= 3 && v.combo % 3 === 0 && last?.pass}
    {#key v.combo}
      <div class="streak">x{mult} streak!</div>
    {/key}
  {/if}

  {#if countdown}
    {#key countdown}
      <div class="count mono" in:scale={{ start: 1.6 }}>{countdown}</div>
    {/key}
  {:else if go}
    <div class="count go" in:scale={{ start: 1.8 }}>Go!</div>
  {/if}

  {#if v.music && v.step !== 'camera'}
    <div class="song"><Music size="1.2rem" /> {v.music.title}{#if v.music.artist} · <span class="dim">{v.music.artist}</span>{/if}</div>
  {/if}

  {#if v.step === 'camera'}
    <div class="setup">
      <h2>Get ready</h2>
      <ol>
        <li class:ok={engine === 'ready'} class:bad={engine === 'error'}>
          {#if engine === 'loading'}<LoaderCircle class="spin" size="1.6rem" /> Loading the body tracking
          {:else if engine === 'error'}<TriangleAlert size="1.6rem" /> The body tracking could not start: {engineError}
          {:else}Body tracking ready{/if}
        </li>
        <li class:ok={link === 'on'} class:bad={link === 'lost'}>
          {#if link === 'waiting'}<Smartphone size="1.6rem" /> On your phone, tap <strong>Use this phone as the camera</strong>
          {:else if link === 'connecting'}<LoaderCircle class="spin" size="1.6rem" /> Connecting to the camera
          {:else if link === 'lost'}<TriangleAlert size="1.6rem" /> Camera lost: the phone must be on the same Wi-Fi as the TV
          {:else}Camera on{/if}
        </li>
        <li class:ok={calibrated}>{calibrated ? 'Got you!' : link === 'on' && engine === 'ready' ? hint : 'Stand 3 m from the camera, all of you in the picture'}</li>
      </ol>
    </div>
  {:else if link === 'lost'}
    <div class="banner"><TriangleAlert size="1.4rem" /> Camera lost: check the phone</div>
  {/if}

  {#if engine === 'ready' && link === 'on'}<span class="fps mono">{fps} fps</span>{/if}
</div>

<style>
  /* The whole TV: the corridor needs every pixel */
  .wallrush {
    position: fixed;
    inset: 0;
    z-index: 5;
    overflow: hidden;
    background: #030108;
    color: #fff;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .cam {
    position: absolute;
    right: 2rem;
    bottom: 2rem;
    width: 30vw;
    border-radius: 1rem;
    border: 2px solid color-mix(in srgb, #00e5ff 60%, transparent);
    box-shadow: 0 0 2rem color-mix(in srgb, #00e5ff 35%, transparent);
    /* As in a mirror, like the silhouette */
    transform: scaleX(-1);
    transition:
      width 0.6s,
      opacity 0.6s;
  }
  .cam.small {
    width: 9vw;
    opacity: 0.55;
  }
  .hud {
    position: absolute;
    top: 1.5rem;
    left: 2rem;
    right: 2rem;
    display: flex;
    align-items: flex-start;
    gap: 2.5rem;
    pointer-events: none;
  }
  .spacer {
    flex: 1;
  }
  .stat {
    display: flex;
    flex-direction: column;
  }
  .stat strong {
    font-size: 3.2rem;
    line-height: 1;
    text-shadow: 0 0 1.2rem #00e5ff;
  }
  .combo strong {
    color: #3dff9b;
    text-shadow: 0 0 1.2rem #3dff9b;
  }
  .eyebrow {
    font-size: 1rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    opacity: 0.75;
  }
  .lives {
    display: flex;
    gap: 0.4rem;
    color: #ff2bd6;
    filter: drop-shadow(0 0 0.6rem #ff2bd6);
    padding-top: 0.6rem;
  }
  .lives .gone {
    opacity: 0.18;
    filter: none;
  }
  .pose {
    position: absolute;
    top: 9%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
    text-shadow:
      0 0 1rem #ff2bd6,
      0 0 2.5rem #ff2bd6;
  }
  .pose.move {
    color: #ffd23d;
    font-size: 4rem;
    text-shadow:
      0 0 1rem #ff8a3a,
      0 0 2.5rem #ff8a3a;
  }
  .verdict {
    position: absolute;
    top: 27%;
    left: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translateX(-50%);
    animation: pop 1.2s ease-out forwards;
    pointer-events: none;
  }
  .verdict strong {
    font-size: 6.5rem;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
    font-style: italic;
  }
  .verdict span {
    font-size: 2.2rem;
    font-weight: 700;
  }
  .verdict.perfect {
    color: #3dff9b;
    text-shadow:
      0 0 1.5rem #3dff9b,
      0 0 4rem #3dff9b;
  }
  .verdict.great {
    color: #00e5ff;
    text-shadow: 0 0 2rem #00e5ff;
  }
  .verdict.good {
    color: #ffd23d;
    text-shadow: 0 0 2rem #ff8a3a;
  }
  .verdict.hit {
    color: #ff3355;
    text-shadow: 0 0 2rem #ff3355;
  }
  @keyframes pop {
    0% {
      opacity: 0;
      transform: translateX(-50%) scale(0.5);
    }
    12% {
      opacity: 1;
      transform: translateX(-50%) scale(1.15);
    }
    25% {
      transform: translateX(-50%) scale(1);
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-2.5rem) scale(1);
    }
  }
  .streak {
    position: absolute;
    top: 45%;
    left: 50%;
    font-size: 4.5rem;
    font-weight: 900;
    font-style: italic;
    text-transform: uppercase;
    color: #3dff9b;
    text-shadow:
      0 0 1.5rem #3dff9b,
      0 0 4rem #00e5ff;
    white-space: nowrap;
    animation: streak 1.4s ease-out forwards;
    pointer-events: none;
  }
  @keyframes streak {
    0% {
      opacity: 0;
      transform: translate(-50%, 0) rotate(-8deg) scale(2.2);
    }
    18% {
      opacity: 1;
      transform: translate(-50%, 0) rotate(-4deg) scale(1);
    }
    75% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -3rem) rotate(-4deg) scale(1);
    }
  }
  .count {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 16rem;
    font-weight: 900;
    text-shadow:
      0 0 2rem #00e5ff,
      0 0 5rem #00e5ff;
    pointer-events: none;
  }
  .count.go {
    color: #3dff9b;
    font-style: italic;
    text-transform: uppercase;
    text-shadow:
      0 0 2rem #3dff9b,
      0 0 5rem #3dff9b;
  }
  .song {
    position: absolute;
    left: 2rem;
    bottom: 1.6rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.2rem;
    opacity: 0.8;
    text-shadow: 0 0 0.8rem #ff2bd6;
  }
  .dim {
    opacity: 0.7;
  }
  .setup {
    position: absolute;
    left: 3rem;
    top: 50%;
    transform: translateY(-50%);
    max-width: 44vw;
    padding: 2rem 2.4rem;
    border-radius: 1.4rem;
    background: rgba(8, 2, 20, 0.72);
    border: 1px solid rgba(255, 43, 214, 0.45);
    box-shadow: 0 0 3rem rgba(255, 43, 214, 0.2);
  }
  .setup h2 {
    margin: 0 0 1.2rem;
    font-size: 2.6rem;
    text-shadow: 0 0 1.2rem #ff2bd6;
  }
  .setup ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    font-size: 1.6rem;
  }
  .setup li {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    opacity: 0.85;
  }
  .setup li.ok {
    color: #3dff9b;
    opacity: 1;
  }
  .setup li.bad {
    color: #ff3355;
    opacity: 1;
  }
  .setup :global(.spin) {
    animation: spin 1s linear infinite;
    flex: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .banner {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.6rem;
    align-items: center;
    padding: 0.8rem 1.4rem;
    border-radius: 999px;
    background: rgba(255, 51, 85, 0.85);
    font-size: 1.4rem;
    font-weight: 700;
  }
  .fps {
    position: absolute;
    right: 1rem;
    top: 0.4rem;
    font-size: 0.9rem;
    opacity: 0.35;
  }
</style>
