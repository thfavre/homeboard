<script lang="ts">
  import { onMount } from 'svelte';
  import { AIM_RADIUS, ANIM, CASE_RADIUS, SMOKE_RADIUS, SPRITE_SCALE, WORLD, type CrowdAim, type CrowdEvent, type CrowdFrame, type Dir } from '$shared/crowd.ts';
  import type { GamePlayer } from '$shared/games.ts';
  import { onEvent, serverNow } from '$lib/client.svelte.ts';
  import { drawCharacter, loadSheets, type Sheets } from './sprites.ts';
  import { crowdSound } from './sound.ts';

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
    reloadMs?: number;
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
  let { kind, round, looks, players, soundVolume, readyAt, reloadMs = 2000, reveal = null, winner = null, startX = 95, finishX = 1480, cases = [], smoke = null, blindUntil = 0, drawFadeMs = 4000, onevent }: Props = $props();

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
  let effects: { k: string; x: number; y: number; at: number; color?: string }[] = [];
  /** Snipers' drawings: points with their time, a gap where the pen was lifted */
  let trails = new Map<string, { x: number; y: number; t: number; gap: boolean }[]>();
  let lastRound = -1;
  /** Where each crosshair is drawn: it glides to the server's position */
  const aimShown = new Map<string, { x: number; y: number }>();
  let lastDraw = 0;

  const handle = (e: CrowdEvent, frame: CrowdFrame) => {
    const at = frame.t;
    switch (e.k) {
      case 'shot':
        effects.push({ k: 'shot', x: e.x, y: e.y, at, color: color(e.by) });
        crowdSound('shot', soundVolume);
        break;
      case 'kill': {
        const x = frame.a[e.actor * 4];
        const y = frame.a[e.actor * 4 + 1];
        effects.push({ k: 'hit', x, y: y - 50, at, color: e.victim ? '#ff3040' : '#ffb0a0' });
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
        if (cases[e.i]) effects.push({ k: 'case', x: cases[e.i].x, y: cases[e.i].y, at });
        crowdSound('case', soundVolume);
        break;
      case 'gadget':
        if (e.g === 'flashbang') crowdSound('flashbang', soundVolume);
        else if (e.g === 'smoke') crowdSound('smoke', soundVolume);
        else {
          // The decoy falls as if shot: a shot sound from nowhere
          crowdSound('shot', soundVolume);
          crowdSound('fall', soundVolume * 0.8);
          effects.push({ k: 'hit', x: e.x, y: e.y - 50, at, color: '#ffb0a0' });
        }
        break;
    }
    onevent?.(e);
  };

  onMount(() => {
    let raf = 0;
    void loadSheets().then((s) => (sheets = s));
    const off = onEvent<CrowdFrame>('games', 'crowd', (f) => {
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
    const key = `${kind}:${startX}:${finishX}`;
    if (bg && bgKind === key) return bg;
    const c = document.createElement('canvas');
    const k = 1.5;
    c.width = WORLD.w * k;
    c.height = WORLD.h * k;
    const g = c.getContext('2d')!;
    g.scale(k, k);
    if (kind === 'race') drawStreet(g);
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
    g.font = '700 46px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.translate(finishX + 82, (WORLD.h + 114) / 2);
    g.rotate(-Math.PI / 2);
    g.fillText('F I N I S H', 0, 16);
    g.restore();
    g.save();
    g.font = '700 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.translate(startX - 34, (WORLD.h + 114) / 2);
    g.rotate(-Math.PI / 2);
    g.fillText('S T A R T', 0, 12);
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
    tag(g, name(a.id), 0, r + 30, c, 20);
    g.restore();
  }

  /** A name on a dark pill */
  function tag(g: CanvasRenderingContext2D, text: string, x: number, y: number, c: string, size = 22) {
    if (!text) return;
    g.font = `700 ${size}px system-ui, sans-serif`;
    const w = g.measureText(text).width + size;
    g.fillStyle = 'rgba(10,10,16,0.78)';
    g.beginPath();
    g.roundRect(x - w / 2, y - size * 0.85, w, size * 1.4, size * 0.7);
    g.fill();
    g.strokeStyle = c;
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.fillText(text, x, y + size * 0.3);
  }

  function smokeCloud(g: CanvasRenderingContext2D, s: { x: number; y: number; until: number }, now: number) {
    const left = s.until - now;
    const age = 8000 - left;
    const a = Math.max(0, Math.min(1, age / 500, left / 1200));
    if (a <= 0) return;
    const grow = Math.min(1, age / 700);
    // A thick core nobody can see through, then puffs rolling around it
    const core = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, SMOKE_RADIUS * grow);
    core.addColorStop(0, `rgba(170,172,180,${0.97 * a})`);
    core.addColorStop(0.7, `rgba(165,167,176,${0.9 * a})`);
    core.addColorStop(1, 'rgba(160,162,170,0)');
    g.fillStyle = core;
    g.beginPath();
    g.ellipse(s.x, s.y, SMOKE_RADIUS * grow, SMOKE_RADIUS * grow * 0.85, 0, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 26; k++) {
      const ang = k * 2.4 + now / (2600 + k * 90);
      const d = SMOKE_RADIUS * grow * (0.15 + 0.7 * ((k * 37) % 10) / 10);
      const x = s.x + Math.cos(ang) * d;
      const y = s.y + Math.sin(ang) * d * 0.75;
      const rad = (70 + ((k * 53) % 50)) * grow;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      const shade = 150 + ((k * 29) % 50);
      grad.addColorStop(0, `rgba(${shade},${shade},${shade + 8},${0.55 * a})`);
      grad.addColorStop(1, `rgba(${shade},${shade},${shade + 8},0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
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

    if (round !== lastRound) {
      lastRound = round;
      locals = [];
      downed = new Map();
      trails = new Map();
      effects = [];
      frames = frames.filter((f) => f.t >= now - 200);
    }

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

    for (const p of people) {
      const l = locals[p.i];
      const look = looks[p.i] ?? 0;
      const imgs = kind === 'spy' ? sheets?.suits : sheets?.people;
      const img = imgs?.length ? imgs[look % imgs.length] : undefined;
      drawCharacter(g, sheets, img, p.x, p.y, { anim: p.anim, dir: p.dir, dist: l.dist, since: now - l.since, now, phase: l.phase }, (look * 47) % 360);
    }

    // Names over the players shown (taken out, or everyone at the reveal)
    const tall = 64 * SPRITE_SCALE;
    for (const p of people) {
      const who = revealed.get(p.i) ?? downed.get(p.i);
      if (!who) continue;
      const dead = p.anim === ANIM.dead;
      const label = kind === 'spy' && reveal ? `Spy: ${name(who)}` : name(who);
      tag(g, label + (winner === who ? '  WINS' : ''), p.x, dead ? p.y - 40 : p.y - tall - 6, color(who), winner === who ? 30 : 24);
    }

    if (kind === 'spy' && smoke) smokeCloud(g, smoke, now);

    // Effects
    effects = effects.filter((e) => now - e.at < 900);
    for (const e of effects) {
      const p = (now - e.at) / 900;
      if (p < 0) continue;
      if (e.k === 'shot') {
        g.strokeStyle = `rgba(255,255,255,${1 - p})`;
        g.lineWidth = 6 * (1 - p);
        g.beginPath();
        g.arc(e.x, e.y, 10 + p * 60, 0, Math.PI * 2);
        g.stroke();
        if (p < 0.15) {
          g.fillStyle = `rgba(255,250,220,${1 - p / 0.15})`;
          g.beginPath();
          g.arc(e.x, e.y, 16, 0, Math.PI * 2);
          g.fill();
        }
      } else if (e.k === 'hit') {
        for (let s = 0; s < 10; s++) {
          const ang = (s / 10) * Math.PI * 2 + s;
          const d = 8 + p * (40 + (s % 3) * 14);
          g.fillStyle = e.color ?? '#f33';
          g.globalAlpha = 1 - p;
          g.fillRect(e.x + Math.cos(ang) * d - 3, e.y + Math.sin(ang) * d + p * p * 40 - 3, 6, 6);
        }
        g.globalAlpha = 1;
      } else if (e.k === 'case') {
        for (let s = 0; s < 14; s++) {
          const ang = (s / 14) * Math.PI * 2;
          const d = 20 + p * 90;
          g.fillStyle = `rgba(255,215,90,${1 - p})`;
          g.fillRect(e.x + Math.cos(ang) * d - 3, e.y - 10 + Math.sin(ang) * d - 3, 6, 6);
        }
      }
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
    const dt = Math.min(0.1, Math.max(0, (now - lastDraw) / 1000));
    lastDraw = now;
    const glide = 1 - Math.exp(-dt * 22);
    if (latest) {
      for (const a of latest.aims) {
        const shown = aimShown.get(a.id);
        if (!shown || Math.hypot(a.x - shown.x, a.y - shown.y) > 400) aimShown.set(a.id, { x: a.x, y: a.y });
        else {
          shown.x += (a.x - shown.x) * glide;
          shown.y += (a.y - shown.y) * glide;
        }
      }
      if (now >= blindUntil) for (const a of latest.aims) crosshair(g, { ...a, ...aimShown.get(a.id)! }, now);
    }

    // The flashbang: everything white, clearing slowly
    if (now < blindUntil) {
      const left = blindUntil - now;
      g.fillStyle = `rgba(255,253,245,${Math.min(1, left / 1800)})`;
      g.fillRect(0, 0, WORLD.w, WORLD.h);
    }
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
