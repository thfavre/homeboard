<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { AIM_RADIUS, ANIM, CASE_RADIUS, SMOKE_RADIUS, SPRITE_SCALE, WORLD, type CrowdAim, type CrowdEvent, type CrowdFrame, type Dir } from '$shared/crowd.ts';
  import type { GamePlayer } from '$shared/games.ts';
  import { onEvent, serverNow } from '$lib/client.svelte.ts';
  import { drawCharacter, loadSheets, type Sheets } from './sprites.ts';
  import { crowdSound } from './sound.ts';
  import '@fontsource/press-start-2p';
  import { Cat, CloudShadows, Effects, Pigeons } from './effects.ts';
  import { loadEnv, squareGround, squareProps, streetGround, streetProps, type Env, type Prop, type PropHit } from './scene.ts';
  import { RACE_AREA, SPY_AREA, SMOKE_MS } from '$shared/crowd.ts';

  /**
   * The crowd on the TV: the server sends where everyone is 20 times a second, this draws it smoothly (a
   * little in the past, between two frames), with the crosshairs, the shots, and for Spy Hunt the
   * suitcases, the smoke, the flashbang and the snipers' drawings. Plays the sounds of what happens.
   */
  interface Props {
    kind: 'race' | 'spy';
    round: number;
    looks: number[];
    players: GamePlayer[];
    soundVolume: number;
    /** When each sniper can shoot again (the reload ring) */
    readyAt: Record<string, number>;
    /** Shots left of each sniper, shown under their crosshair */
    shots?: Record<string, number>;
    reloadMs?: number;
    /** Server time the screen is black at the end of a round (it fades out before, and in again on the next round) */
    curtainAt?: number | null;
    /** Who was who: player to character (race reveal), the spy's character (spy reveal) */
    reveal?: Record<string, number> | null;
    winner?: string | null;
    /** Race: the lines */
    startX?: number;
    finishX?: number;
    /** Spy Hunt */
    cases?: { x: number; y: number; open: boolean }[];
    smoke?: { x: number; y: number; until: number } | null;
    blindUntil?: number;
    drawFadeMs?: number;
    /** Each event as it comes, for the screen around */
    onevent?: (e: CrowdEvent) => void;
  }
  let { kind, round: _round, curtainAt = null, looks, players, soundVolume, readyAt, shots = {}, reloadMs = 2000, reveal = null, winner = null, startX = 95, finishX = 1480, cases = [], smoke = null, blindUntil = 0, drawFadeMs = 4000, onevent }: Props = $props();

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let sheets: Sheets | null = null;
  const color = (id: string) => players.find((p) => p.id === id)?.color ?? '#ffffff';
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '';

  /** Frames kept to draw between (server time), and how far in the past the screen is drawn */
  const DELAY_MS = 110;
  let frames: CrowdFrame[] = [];

  /** Per character: distance walked (the steps follow it), when its anim started, a breathing offset */
  interface Local {
    dist: number;
    anim: number;
    since: number;
    phase: number;
    lx: number;
    ly: number;
  }
  let locals: Local[] = [];
  /** Players taken out this round, by character (their name shows over the body) */
  let downed = new Map<number, string>();
  /** Effects: shots, hits, sparkles */
  const fx = new Effects();
  const clouds = new CloudShadows();
  // Pigeons on the square, or on the sidewalk and the street of the race
  const pigeons = untrack(() => new Pigeons(kind === 'spy' ? 6 : 5, kind === 'spy' ? SPY_AREA : { x0: 60, x1: WORLD.w - 60, y0: 120, y1: RACE_AREA.y1 }));
  // A cat lazing on the sidewalk
  const cat = untrack(() => (kind === 'spy' ? new Cat(158, 120, WORLD.w - 120) : new Cat(150, 80, WORLD.w - 80)));
  /** The environment art (null until loaded, or when it cannot be: the places are drawn plain) */
  let env: Env | null = null;
  let standingProps: Prop[] = [];
  /** The pixel font of the game's text, once it is loaded (the canvas cannot wait for it) */
  const PIXEL = '"Press Start 2P", monospace';
  let fontReady = $state(false);
  void document.fonts?.load(`16px ${PIXEL}`).then(() => (fontReady = true));
  /** Snipers' drawings: points with their time, a gap where the pen was lifted */
  let trails = new Map<string, { x: number; y: number; t: number; gap: boolean }[]>();
  /** Bullet holes in the ground this round */
  let holes: { x: number; y: number; r: number }[] = [];
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  /** When the current round first showed (it fades in from black) */
  let roundShownAt = 0;
  /** Where each crosshair is drawn: it glides to the server's position */
  const aimShown = new Map<string, { x: number; y: number }>();
  let lastDraw = 0;

  const handle = (e: CrowdEvent, frame: CrowdFrame) => {
    const at = frame.t;
    switch (e.k) {
      case 'shot': {
        fx.shot(e.x, e.y, e.hit >= 0);
        pigeons.scare(e.x, e.y, 260);
        cat.scare(e.x, e.y, 400);
        if (e.hit >= 0) break;
        // Nobody hit: the shot lands on a thing (leaves, glass, water) or leaves a hole in the ground
        let what: PropHit | null = null;
        for (const p of standingProps) if ((what = p.hit?.(e.x, e.y) ?? null)) break;
        if (what === 'leaves') fx.leaves(e.x, e.y);
        else if (what === 'glass') fx.glass(e.x, e.y);
        else if (what === 'water') fx.splash(e.x, e.y);
        else holes.push({ x: e.x, y: e.y, r: rand(0, Math.PI * 2) });
        break;
      }
        crowdSound('shot', soundVolume);
        break;
      case 'kill': {
        const x = frame.a[e.actor * 4];
        const y = frame.a[e.actor * 4 + 1];
        fx.fall(x, y, !!e.victim);
        if (e.victim) {
          downed.set(e.actor, e.victim);
          crowdSound('hit', soundVolume);
        }
        crowdSound('fall', soundVolume * 0.8);
        break;
      }
      case 'go':
        crowdSound('go', soundVolume);
        break;
      case 'case':
        if (cases[e.i]) fx.gold(cases[e.i].x, cases[e.i].y);
        crowdSound('case', soundVolume);
        break;
      case 'gadget':
        if (e.g === 'flashbang') {
          crowdSound('flashbang', soundVolume);
          fx.flashbang(e.x, e.y - 40);
          pigeons.scare(e.x, e.y, 2000);
        } else if (e.g === 'smoke') {
          crowdSound('smoke', soundVolume);
          fx.smoke(e.x, e.y, SMOKE_MS);
          pigeons.scare(e.x, e.y, 300);
        } else {
          // The decoy falls as if shot: a shot sound from nowhere
          crowdSound('shot', soundVolume);
          crowdSound('fall', soundVolume * 0.8);
          fx.fall(e.x, e.y, false);
        }
        break;
    }
    onevent?.(e);
  };

  onMount(() => {
    let raf = 0;
    void loadSheets().then((s) => (sheets = s));
    void loadEnv().then((e) => {
      env = e;
      if (e) standingProps = kind === 'spy' ? squareProps(e) : streetProps(e);
    });
    const off = onEvent<CrowdFrame>('games', 'crowd', (f) => {
      // A new round: everyone is somewhere else, start over (and fade in from black)
      if (frames.length && frames[frames.length - 1].r !== f.r) {
        frames = [];
        locals = [];
        downed = new Map();
        trails = new Map();
        holes = [];
        for (const p of standingProps) p.reset?.();
        roundShownAt = serverNow();
      }
      frames.push(f);
      if (frames.length > 40) frames = frames.slice(-20);
      for (const e of f.ev) handle(e, f);
      // The pen of each sniper: a point while it draws
      for (const a of f.aims) {
        let t = trails.get(a.id);
        if (!t) trails.set(a.id, (t = []));
        if (a.draw) t.push({ x: a.x, y: a.y, t: f.t, gap: false });
        else if (t.length && !t[t.length - 1].gap) t[t.length - 1].gap = true;
      }
    });
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      off();
    };
  });

  // ------------------------------------------------------------ the backgrounds

  let bg: HTMLCanvasElement | null = null;
  let bgKind = '';

  /** A small random generator, so the speckles are the same every time */
  function seeded(seed: number) {
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  }

  function background(): HTMLCanvasElement {
    const key = `${kind}:${startX}:${finishX}:${fontReady}:${!!env}`;
    if (bg && bgKind === key) return bg;
    const c = document.createElement('canvas');
    const k = 1.5;
    c.width = WORLD.w * k;
    c.height = WORLD.h * k;
    const g = c.getContext('2d')!;
    g.scale(k, k);
    if (env) {
      // The place built from the art at the sprites' size, then scaled up with sharp pixels
      const ground = kind === 'race' ? streetGround(env, startX, finishX, PIXEL) : squareGround(env, cases);
      g.imageSmoothingEnabled = false;
      g.drawImage(ground, 0, 0, ground.width * SPRITE_SCALE, ground.height * SPRITE_SCALE);
    } else if (kind === 'race') drawStreet(g);
    else drawPlaza(g);
    bg = c;
    bgKind = key;
    return c;
  }

  function drawStreet(g: CanvasRenderingContext2D) {
    const r = seeded(7);
    // Asphalt with a soft light in the middle
    const grad = g.createLinearGradient(0, 0, 0, WORLD.h);
    grad.addColorStop(0, '#1d2027');
    grad.addColorStop(0.5, '#2b2f37');
    grad.addColorStop(1, '#1f2229');
    g.fillStyle = grad;
    g.fillRect(0, 0, WORLD.w, WORLD.h);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
      g.fillRect(r() * WORLD.w, r() * WORLD.h, 2, 2);
    }
    // Sidewalks top and bottom, with the curb
    g.fillStyle = '#3a3d45';
    g.fillRect(0, 0, WORLD.w, 112);
    g.fillRect(0, WORLD.h - 14, WORLD.w, 14);
    g.fillStyle = '#555a65';
    g.fillRect(0, 108, WORLD.w, 6);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    for (let x = 0; x < WORLD.w; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 108);
      g.stroke();
    }
    // Lane marks, very faint
    g.setLineDash([46, 38]);
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 5;
    for (const y of [360, 620]) {
      g.beginPath();
      g.moveTo(startX + 30, y);
      g.lineTo(finishX - 20, y);
      g.stroke();
    }
    g.setLineDash([]);
    // Distance marks on the curb, every tenth
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 1; k < 10; k++) g.fillRect(startX + ((finishX - startX) * k) / 10 - 2, 114, 4, k === 5 ? 18 : 10);
    // Past the finish: lighter ground
    g.fillStyle = 'rgba(255,220,120,0.06)';
    g.fillRect(finishX, 114, WORLD.w - finishX, WORLD.h - 128);
    // Start line
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(startX + 6, 120, 6, WORLD.h - 140);
    // Finish: a checkered band
    const sq = 13;
    for (let y = 114, row = 0; y < WORLD.h - 14; y += sq, row++) {
      for (let col = 0; col < 3; col++) {
        g.fillStyle = (row + col) % 2 ? '#f4f4f4' : '#15161a';
        g.fillRect(finishX + col * sq, y, sq, sq);
      }
    }
    // Words on the ground
    g.save();
    g.font = `40px ${PIXEL}`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.translate(finishX + 82, (WORLD.h + 114) / 2);
    g.rotate(-Math.PI / 2);
    g.fillText('FINISH', 0, 16);
    g.restore();
    g.save();
    g.font = `28px ${PIXEL}`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.translate(startX - 34, (WORLD.h + 114) / 2);
    g.rotate(-Math.PI / 2);
    g.fillText('START', 0, 12);
    g.restore();
  }

  function drawPlaza(g: CanvasRenderingContext2D) {
    const r = seeded(11);
    const grad = g.createRadialGradient(WORLD.w / 2, WORLD.h * 0.55, 100, WORLD.w / 2, WORLD.h * 0.55, 1000);
    grad.addColorStop(0, '#4a4440');
    grad.addColorStop(1, '#2c2826');
    g.fillStyle = grad;
    g.fillRect(0, 0, WORLD.w, WORLD.h);
    // Big stone slabs, every other one a little darker
    for (let y = 0, row = 0; y < WORLD.h; y += 100, row++) {
      for (let x = (row % 2) * -50, col = 0; x < WORLD.w; x += 100, col++) {
        if ((row + col) % 3 === 0) {
          g.fillStyle = 'rgba(0,0,0,0.07)';
          g.fillRect(x, y, 100, 100);
        }
        g.strokeStyle = 'rgba(0,0,0,0.22)';
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, 98, 98);
      }
    }
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,240,220,0.04)' : 'rgba(0,0,0,0.1)';
      g.fillRect(r() * WORLD.w, r() * WORLD.h, 2, 2);
    }
    // A mosaic in the middle
    const cx = WORLD.w / 2;
    const cy = 525;
    for (let k = 5; k >= 1; k--) {
      g.beginPath();
      g.arc(cx, cy, k * 48, 0, Math.PI * 2);
      g.fillStyle = k % 2 ? 'rgba(180,140,90,0.13)' : 'rgba(60,70,90,0.14)';
      g.fill();
    }
    g.strokeStyle = 'rgba(220,190,140,0.18)';
    g.lineWidth = 3;
    for (let a = 0; a < 16; a++) {
      g.beginPath();
      g.moveTo(cx + Math.cos((a * Math.PI) / 8) * 50, cy + Math.sin((a * Math.PI) / 8) * 50);
      g.lineTo(cx + Math.cos((a * Math.PI) / 8) * 240, cy + Math.sin((a * Math.PI) / 8) * 240);
      g.stroke();
    }
    // Buildings along the top (the score sits there), with lit windows
    g.fillStyle = '#1b1a20';
    g.fillRect(0, 0, WORLD.w, 128);
    for (let x = 0; x < WORLD.w; x += 160) {
      g.fillStyle = (x / 160) % 2 ? '#24222b' : '#211f27';
      g.fillRect(x, 0, 160, 124);
      for (let wx = x + 22; wx < x + 150; wx += 40) {
        g.fillStyle = r() < 0.45 ? 'rgba(255,200,120,0.32)' : 'rgba(120,140,180,0.12)';
        g.fillRect(wx, 74, 18, 26);
      }
    }
    g.fillStyle = '#5a524b';
    g.fillRect(0, 124, WORLD.w, 8);
    // Planters at the bottom edge
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, WORLD.h - 12, WORLD.w, 12);
    // The drop zones under the suitcases
    for (const c of cases) {
      g.beginPath();
      g.arc(c.x, c.y, CASE_RADIUS + 26, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,190,80,0.07)';
      g.fill();
      g.setLineDash([10, 9]);
      g.strokeStyle = 'rgba(255,200,110,0.35)';
      g.lineWidth = 3;
      g.stroke();
      g.setLineDash([]);
    }
  }

  // ------------------------------------------------------------ drawing

  function suitcase(g: CanvasRenderingContext2D, x: number, y: number, open: boolean, now: number) {
    g.save();
    g.translate(x, y);
    if (open) {
      const glow = g.createRadialGradient(0, -8, 4, 0, -8, 70);
      glow.addColorStop(0, `rgba(255,210,90,${0.55 + 0.15 * Math.sin(now / 300)})`);
      glow.addColorStop(1, 'rgba(255,210,90,0)');
      g.fillStyle = glow;
      g.fillRect(-70, -78, 140, 140);
    }
    // Shadow, body, edges, clasps, handle
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(0, 16, 34, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5b3a1e';
    g.fillRect(-28, -14, 56, 30);
    g.fillStyle = '#7a4f29';
    g.fillRect(-28, -14, 56, 6);
    g.fillStyle = '#3b2512';
    g.fillRect(-28, 12, 56, 4);
    if (open) {
      // The lid up, papers inside
      g.fillStyle = '#6a4423';
      g.beginPath();
      g.moveTo(-28, -14);
      g.lineTo(28, -14);
      g.lineTo(22, -40);
      g.lineTo(-22, -40);
      g.closePath();
      g.fill();
      g.fillStyle = '#f2ead8';
      g.fillRect(-20, -18, 40, 8);
      g.fillStyle = '#ffd35a';
      g.fillRect(-6, -21, 12, 4);
    } else {
      g.strokeStyle = '#2a1a0c';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, -16, 9, Math.PI, 0);
      g.stroke();
      g.fillStyle = '#d8c070';
      g.fillRect(-18, -10, 6, 6);
      g.fillRect(12, -10, 6, 6);
    }
    g.restore();
  }

  function crosshair(g: CanvasRenderingContext2D, a: CrowdAim, now: number) {
    const c = color(a.id);
    const r = AIM_RADIUS;
    const until = readyAt[a.id] ?? 0;
    g.save();
    g.translate(a.x, a.y);
    g.globalAlpha = a.ready ? 1 : 0.55;
    g.lineCap = 'round';
    // A dark outline under the color, readable on any background
    for (const [w, s] of [
      [7, 'rgba(0,0,0,0.55)'],
      [3.2, c],
    ] as const) {
      g.lineWidth = w;
      g.strokeStyle = s;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        g.moveTo(dx * (r - 12), dy * (r - 12));
        g.lineTo(dx * (r + 12), dy * (r + 12));
      }
      g.stroke();
    }
    g.fillStyle = c;
    g.beginPath();
    g.arc(0, 0, 3.5, 0, Math.PI * 2);
    g.fill();
    // Reloading: a ring filling up
    if (!a.ready && until > now) {
      const total = Math.max(1, reloadMs);
      const p = 1 - Math.min(1, (until - now) / total);
      g.globalAlpha = 0.9;
      g.lineWidth = 5;
      g.strokeStyle = c;
      g.beginPath();
      g.arc(0, 0, r + 9, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    tag(g, name(a.id), 0, r + 26, c, 12, shots[a.id]);
    g.restore();
  }

  /**
   * A name in the pixel font on a dark plate with a border of the player's color and a hard shadow.
   * `ammo`: the shots left, after the name with a little bullet (red when there are none)
   */
  function tag(g: CanvasRenderingContext2D, text: string, x: number, y: number, c: string, size = 14, ammo?: number) {
    if (!text) return;
    g.font = `${size}px ${PIXEL}`;
    const nameW = g.measureText(text).width;
    const ammoText = ammo === undefined ? '' : String(ammo);
    const ammoW = ammoText ? g.measureText(`x${ammoText}`).width + size * 0.8 + 16 : 0;
    const w = Math.round(nameW + ammoW + size * 1.4);
    const h = Math.round(size * 2);
    const left = Math.round(x - w / 2);
    const top = Math.round(y - h / 2);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(left + 4, top + 4, w, h);
    g.fillStyle = '#14131c';
    g.fillRect(left, top, w, h);
    g.fillStyle = c;
    g.fillRect(left, top, w, 3);
    g.fillRect(left, top + h - 3, w, 3);
    g.fillRect(left, top, 3, h);
    g.fillRect(left + w - 3, top, 3, h);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const tx = left + Math.round(size * 0.7);
    g.fillStyle = '#000';
    g.fillText(text, tx + 2, y + 3);
    g.fillStyle = '#fff';
    g.fillText(text, tx, y + 1);
    if (ammoText) {
      // A bullet drawn in pixels, then the number
      const bx = Math.round(tx + nameW + size * 0.8);
      const by = Math.round(y - size * 0.55);
      const out = ammo === 0;
      const tall = Math.round(size * 1.1);
      // A cartridge: a pointed tip, the body, a darker base; clearly not a digit
      g.fillStyle = out ? '#ff5a5a' : '#ffc84a';
      g.fillRect(bx + 3, by, 3, 2);
      g.fillRect(bx + 1, by + 2, 7, 2);
      g.fillRect(bx, by + 4, 9, tall - 6);
      g.fillStyle = out ? '#b02a2a' : '#b8741f';
      g.fillRect(bx, by + tall - 2, 9, 3);
      g.fillStyle = '#000';
      g.fillText(`x${ammoText}`, bx + 14 + 2, y + 3);
      g.fillStyle = out ? '#ff8080' : '#ffd36b';
      g.fillText(`x${ammoText}`, bx + 14, y + 1);
    }
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
  }

  function smokeCloud(g: CanvasRenderingContext2D, s: { x: number; y: number; until: number }, now: number) {
    const left = s.until - now;
    const age = 8000 - left;
    const a = Math.max(0, Math.min(1, age / 500, left / 1200));
    if (a <= 0) return;
    const grow = Math.min(1, age / 700);
    // The heart of the cloud, so nobody can be seen inside even between the puffs (they make the look)
    const core = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, SMOKE_RADIUS * 0.8 * grow);
    core.addColorStop(0, `rgba(190,192,200,${0.92 * a})`);
    core.addColorStop(0.75, `rgba(185,187,196,${0.75 * a})`);
    core.addColorStop(1, 'rgba(180,182,190,0)');
    g.fillStyle = core;
    g.beginPath();
    g.ellipse(s.x, s.y, SMOKE_RADIUS * 0.8 * grow, SMOKE_RADIUS * 0.7 * grow, 0, 0, Math.PI * 2);
    g.fill();
  }

  function draw() {
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(wrap.clientWidth * dpr));
    const ch = Math.max(1, Math.round(wrap.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const g = canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const k = Math.min(cw / WORLD.w, ch / WORLD.h);
    g.setTransform(k, 0, 0, k, (cw - WORLD.w * k) / 2, (ch - WORLD.h * k) / 2);
    g.imageSmoothingEnabled = false;
    const now = serverNow();
    const t = now - DELAY_MS;
    const step = Math.min(0.1, Math.max(0, (now - lastDraw) / 1000));
    fx.update(step);
    clouds.update(step);
    // A shot shakes the whole field a little
    const shake = fx.offset();
    g.translate(shake.x, shake.y);

    g.drawImage(background(), 0, 0, WORLD.w, WORLD.h);
    if (kind === 'spy') for (const c of cases) suitcase(g, c.x, c.y, c.open, now);

    // The two frames around the time drawn
    let f0: CrowdFrame | null = null;
    let f1: CrowdFrame | null = null;
    for (const f of frames) {
      if (f.t <= t) f0 = f;
      else {
        f1 = f;
        break;
      }
    }
    f0 ??= f1;
    if (!f0) return;
    const n = Math.floor(f0.a.length / 4);
    const mix = f1 && f1 !== f0 && f1.a.length === f0.a.length ? Math.max(0, Math.min(1, (t - f0.t) / (f1.t - f0.t))) : 0;
    if (locals.length !== n) locals = Array.from({ length: n }, (_, i) => ({ dist: 0, anim: -1, since: now, phase: ((i * 7919) % 1000) * 3, lx: f0!.a[i * 4], ly: f0!.a[i * 4 + 1] }));

    const people: { i: number; x: number; y: number; anim: number; dir: Dir }[] = [];
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const x = f0.a[o] + (f1 && mix ? (f1.a[o] - f0.a[o]) * mix : 0);
      const y = f0.a[o + 1] + (f1 && mix ? (f1.a[o + 1] - f0.a[o + 1]) * mix : 0);
      const anim = f0.a[o + 2];
      const dir = f0.a[o + 3] as Dir;
      const l = locals[i];
      l.dist += Math.hypot(x - l.lx, y - l.ly);
      l.lx = x;
      l.ly = y;
      if (l.anim !== anim) {
        l.anim = anim;
        l.since = now;
      }
      people.push({ i, x, y, anim, dir });
    }
    // Bullet holes, dust on the ground and the pigeons, under everyone
    for (const h of holes) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.ellipse(h.x, h.y, 6, 4, h.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(Math.round(h.x - 7), Math.round(h.y + 3), 3, 2);
      g.fillRect(Math.round(h.x + 4), Math.round(h.y - 5), 2, 2);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let k = 0; k < 4; k++) g.fillRect(Math.round(h.x + Math.cos(h.r + k * 1.6) * 9), Math.round(h.y + Math.sin(h.r + k * 1.6) * 6), 2, 2);
    }
    fx.draw(g, false, PIXEL);
    pigeons.update(step, people.filter((p) => p.anim !== ANIM.dead));
    pigeons.draw(g, env);
    cat.update(step);
    cat.draw(g, env);
    // The fallen first (on the ground), then from the back to the front
    people.sort((a, b) => (a.anim === ANIM.dead ? 0 : 1) - (b.anim === ANIM.dead ? 0 : 1) || a.y - b.y);

    const revealed = new Map<number, string>();
    if (reveal) for (const [id, i] of Object.entries(reveal)) revealed.set(i, id);

    // Shadows, all in one path (a big crowd draws much faster that way), then a ring under the players shown
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    for (const p of people) {
      if (p.anim === ANIM.dead) continue;
      g.moveTo(p.x + 15, p.y);
      g.ellipse(p.x, p.y, 15, 5, 0, 0, Math.PI * 2);
    }
    g.fill();
    for (const p of people) {
      if (p.anim === ANIM.dead) continue;
      const who = revealed.get(p.i);
      if (who) {
        const pulse = 0.6 + 0.4 * Math.sin(now / 200);
        g.strokeStyle = color(who);
        g.lineWidth = 5;
        g.globalAlpha = pulse;
        g.beginPath();
        g.ellipse(p.x, p.y, 34, 12, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    // The characters and the things that stand up (trees, lamps, the fountain), back to front together,
    // so people walk behind and in front of them; the fallen lie on the ground under everything
    const imgs = kind === 'spy' ? sheets?.suits : sheets?.people;
    const drawPerson = (p: (typeof people)[number]) => {
      const l = locals[p.i];
      const look = looks[p.i] ?? 0;
      const img = imgs?.length ? imgs[look % imgs.length] : undefined;
      drawCharacter(g, sheets, img, p.x, p.y, { anim: p.anim, dir: p.dir, dist: l.dist, since: now - l.since, now, phase: l.phase }, (look * 47) % 360);
    };
    let pi = 0;
    while (pi < people.length && people[pi].anim === ANIM.dead) drawPerson(people[pi++]);
    let qi = 0;
    const standing = standingProps;
    while (pi < people.length || qi < standing.length) {
      if (qi < standing.length && (pi >= people.length || standing[qi].y <= people[pi].y)) standing[qi++].draw(g, now);
      else drawPerson(people[pi++]);
    }

    // Smoke, the flashes and sparks over everyone, then the cloud shadows drifting over the whole place
    if (kind === 'spy' && smoke) smokeCloud(g, smoke, now);
    fx.draw(g, true, PIXEL);
    clouds.draw(g);

    // Names over the players shown (taken out, or everyone at the reveal)
    const tall = 64 * SPRITE_SCALE;
    for (const p of people) {
      const who = revealed.get(p.i) ?? downed.get(p.i);
      if (!who) continue;
      const dead = p.anim === ANIM.dead;
      const label = kind === 'spy' && reveal ? `Spy: ${name(who)}` : name(who);
      tag(g, label + (winner === who ? '  WINS' : ''), p.x, dead ? p.y - 40 : p.y - tall - 6, color(who), winner === who ? 20 : 15);
    }

    // The snipers' drawings, fading
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [id, pts] of trails) {
      const keep = pts.filter((q) => now - q.t < drawFadeMs);
      trails.set(id, keep);
      g.strokeStyle = color(id);
      for (let q = 1; q < keep.length; q++) {
        const a = keep[q - 1];
        if (a.gap) continue;
        const b = keep[q];
        g.globalAlpha = Math.max(0, 1 - (now - b.t) / drawFadeMs) * 0.9;
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
    }
    g.globalAlpha = 1;

    // Crosshairs: they glide to where the newest frame has them (quick, but no jump at each frame), hidden
    // while the snipers are blinded
    const latest = frames[frames.length - 1];
    lastDraw = now;
    const glide = 1 - Math.exp(-step * 22);
    if (latest) {
      for (const a of latest.aims) {
        const shown = aimShown.get(a.id);
        if (!shown || Math.hypot(a.x - shown.x, a.y - shown.y) > 400) aimShown.set(a.id, { x: a.x, y: a.y });
        else {
          shown.x += (a.x - shown.x) * glide;
          shown.y += (a.y - shown.y) * glide;
        }
      }
      for (const a of latest.aims) {
        const at = aimShown.get(a.id)!;
        pigeons.scare(at.x, at.y + 14, 42);
        cat.nudge(at.x, at.y, 50);
      }
      if (now >= blindUntil) for (const a of latest.aims) crosshair(g, { ...a, ...aimShown.get(a.id)! }, now);
    }

    // The flashbang: everything white, clearing slowly
    if (now < blindUntil) {
      const left = blindUntil - now;
      g.fillStyle = `rgba(255,253,245,${Math.min(1, left / 1800)})`;
      g.fillRect(-20, -20, WORLD.w + 40, WORLD.h + 40);
    }
    // A soft vignette: the eye goes to the middle, the edges feel like a scene
    g.drawImage(vignette(), -20, -20, WORLD.w + 40, WORLD.h + 40);
    // Between two rounds: fade to black, and in again on the new one
    const CURTAIN_MS = 700;
    const out = curtainAt ? Math.min(1, Math.max(0, 1 - (curtainAt - now) / CURTAIN_MS)) : 0;
    const back = Math.max(0, 1 - (now - roundShownAt) / CURTAIN_MS);
    const black = Math.max(out, back);
    if (black > 0) {
      g.fillStyle = `rgba(6,6,12,${black})`;
      g.fillRect(-20, -20, WORLD.w + 40, WORLD.h + 40);
    }
  }

  let vignetteCanvas: HTMLCanvasElement | null = null;
  function vignette(): HTMLCanvasElement {
    if (vignetteCanvas) return vignetteCanvas;
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 225;
    const v = c.getContext('2d')!;
    const grad = v.createRadialGradient(200, 112, 70, 200, 112, 240);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,10,0.42)');
    v.fillStyle = grad;
    v.fillRect(0, 0, 400, 225);
    vignetteCanvas = c;
    return c;
  }
</script>

<div class="field" bind:this={wrap}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .field {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: var(--radius);
    overflow: hidden;
    background: #111;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
