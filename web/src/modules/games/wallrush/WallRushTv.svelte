<script lang="ts">
  import { Heart, LoaderCircle, Smartphone, TriangleAlert } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { scale } from 'svelte/transition';
  import { zzfx } from 'zzfx';
  import type { MatchState } from '$shared/games.ts';
  import { poseDef, poseShape, wallRushLevel, wallRushMultiplier, type WallRushSignal, type WallRushView } from '$shared/wallrush.ts';
  import { onEvent, rpc, serverNow } from '$lib/client.svelte.ts';
  import { Now } from '../store.svelte.ts';
  import { Body, holeGrid, loadTracker, track } from './tracker.ts';
  import { NEON, Silhouette, drawCorridor, drawWall, look, wallPicture } from './scene.ts';
  import { RTC_CONFIG, gathered } from './rtc.ts';

  /**
   * The game on the TV: receives the phone camera, tracks the player on this computer's graphics card,
   * draws the corridor, the walls and the player's silhouette, and tells the server how each wall fit.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as WallRushView);
  const now = new Now(100);

  /** After reaching the player, a wall flies past (or stays stuck) this long */
  const AFTER_MS = 900;

  let canvas = $state<HTMLCanvasElement>();
  let video = $state<HTMLVideoElement>();
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
    let landmarker: Awaited<ReturnType<typeof loadTracker>> | null = null;
    let frames = 0;
    let since = performance.now();
    // Loaded once: the view changes all the time, the model does not during a game
    loadTracker(untrack(() => v.model))
      .then((lm) => {
        if (!alive) return lm.landmarker.close();
        landmarker = lm;
        engine = 'ready';
      })
      .catch((err) => {
        engine = 'error';
        engineError = (err as Error)?.message ?? String(err);
      });

    const onFrame = () => {
      if (!alive) return;
      if (landmarker && el.videoWidth) {
        const at = performance.now();
        const f = track(landmarker, el, at);
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
      landmarker?.landmarker.close();
    };
  });

  // ------------------------------------------------------------ drawing

  /** Each wall's hole on the grid and its picture, made when it first shows */
  const walls = new Map<number, { hole: Uint8Array; pic: HTMLCanvasElement; rim: HTMLCanvasElement }>();
  const reported = new Set<number>();
  const heard = new Set<number>();
  const level = $derived(wallRushLevel(v.level));

  function wallAt(i: number) {
    let w = walls.get(i);
    if (!w) {
      const def = v.walls[i];
      const shape = poseShape(poseDef(def.pose), def.x);
      w = { hole: holeGrid(shape, level.margin), ...wallPicture(shape, level.margin) };
      walls.set(i, w);
    }
    return w;
  }

  $effect(() => {
    if (!canvas) return;
    const c = canvas;
    const g = c.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
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
      // The wall on screen: the first one not yet gone past
      const i = view.step === 'walls' || view.step === 'done' ? view.walls.findIndex((x) => x.arriveAt + AFTER_MS > t) : -1;
      const def = i >= 0 ? view.walls[i] : null;
      const res = i >= 0 ? view.results[i] : null;
      const before = !!def && t < def.arriveAt;
      const z = def ? Math.max(0, (def.arriveAt - t) / def.travelMs) : 1;
      const wall = def && (before || res || !reported.has(i)) ? wallAt(i) : null;
      const hit = !!res && !res.pass;

      drawCorridor(g, l, w, h, t / 1000, before ? 1.2 : 0.4, hit ? NEON.red : NEON.magenta);

      // The wall behind the player while it comes
      if (wall && def && before) drawWall(g, l, wall.pic, z, Math.min(1, (1 - z) * 4));

      // The wall arrives: say how the player fits (once)
      if (def && wall && !before && !reported.has(i) && view.step === 'walls') {
        reported.add(i);
        send({ kind: 'fit', wall: i, ...body.fit(wall.hole, performance.now()) });
      }

      // Where the hole will be, at the player's place, as the wall gets near
      if (wall && def && before && z < 0.7) drawWall(g, l, wall.rim, 0, ((0.7 - z) / 0.7) * 0.55);

      // The player, red where they stick out as the wall gets near
      const warn = def && before ? Math.max(0, Math.min(1, (0.45 - z) / 0.3)) : res && !res.pass ? 1 : 0;
      if (tracked || calibrated) {
        silhouette.paint(body.cells, wall && (before || hit) ? wall.hole : null, warn);
        silhouette.draw(g, l, tracked ? 1 : 0.35);
      }

      // Past the player: a wall that fit flies by, a wall that hit stays and shakes
      if (wall && def && !before) {
        const k = Math.min(1, (t - def.arriveAt) / AFTER_MS);
        if (hit) drawWall(g, l, wall.pic, 0, 1 - k * k, 26 * (1 - k));
        else drawWall(g, l, wall.pic, -0.1 * k, 1 - k);
      }

      // Sounds as the results come
      if (res && !heard.has(i)) {
        heard.add(i);
        if (res.pass) zzfx(0.6, 0.05, 520, 0, 0.08, 0.3, 0, 1.6, 0, 0, 380, 0.06);
        else zzfx(0.9, 0.1, 70, 0, 0.12, 0.45, 4, 2.2, -1.5, 0, 0, 0, 0, 1.2);
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
</script>

<div class="wallrush">
  <canvas bind:this={canvas}></canvas>
  <!-- The camera picture: hidden once the player is measured -->
  <video bind:this={video} class="cam" class:small={calibrated} muted playsinline autoplay></video>

  {#if v.step === 'walls' || v.step === 'done' || v.step === 'countdown'}
    <div class="hud">
      <div class="stat">
        <span class="eyebrow">Score</span>
        <strong class="mono">{v.score}</strong>
      </div>
      {#if v.combo >= 3}
        <div class="stat combo" in:scale>
          <span class="eyebrow">Streak {v.combo}</span>
          <strong class="mono">x{wallRushMultiplier(v.combo)}</strong>
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
      <div class="pose" in:scale={{ start: 0.7 }}>{poseDef(next.pose).name}</div>
    {/key}
  {/if}

  {#if last && v.step !== 'camera'}
    {#key lastIndex}
      <div class="verdict" class:pass={last.pass} class:hit={!last.pass}>
        {#if last.pass}
          <strong>+{last.points}</strong>
          <span>{last.coverage > 0.8 ? 'Perfect fit' : last.coverage > 0.6 ? 'Nice' : 'Through'}</span>
        {:else}
          <strong>Hit</strong>
          <span>{last.seen ? `${Math.round(last.outside * 100)}% of you stuck out` : 'The camera lost you'}</span>
        {/if}
      </div>
    {/key}
  {/if}

  {#if countdown}
    {#key countdown}
      <div class="count mono" in:scale={{ start: 1.6 }}>{countdown}</div>
    {/key}
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
    text-shadow:
      0 0 1rem #ff2bd6,
      0 0 2.5rem #ff2bd6;
  }
  .verdict {
    position: absolute;
    top: 30%;
    left: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translateX(-50%);
    animation: pop 1.3s ease-out forwards;
    pointer-events: none;
  }
  .verdict strong {
    font-size: 6rem;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }
  .verdict span {
    font-size: 1.8rem;
    font-weight: 600;
  }
  .verdict.pass {
    color: #3dff9b;
    text-shadow: 0 0 2rem #3dff9b;
  }
  .verdict.hit {
    color: #ff3355;
    text-shadow: 0 0 2rem #ff3355;
  }
  @keyframes pop {
    0% {
      opacity: 0;
      transform: translateX(-50%) scale(0.6);
    }
    15% {
      opacity: 1;
      transform: translateX(-50%) scale(1.08);
    }
    70% {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-2rem) scale(1);
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
    left: 1rem;
    bottom: 0.6rem;
    font-size: 0.9rem;
    opacity: 0.4;
  }
</style>
