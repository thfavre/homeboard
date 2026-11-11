<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { hb, onEvent, serverNow } from '$lib/client.svelte.ts';
  import { WORLD } from '$shared/crowd.ts';
  import { FRAME_STRIDE, TOWN, TOWN_AREA, WANIM, type TownFrame, type WorldState } from '$shared/world.ts';
  import { drawCharacter } from '../games/crowd/sprites.ts';
  import { loadEnv, squareGround, squareProps, type Env, type Prop } from '../games/crowd/scene.ts';
  import { Pigeons } from '../games/crowd/effects.ts';
  import { asSheets, gameAnim, sheetImage } from './sprites.ts';

  /**
   * The town on the TV: the crowd games' square (same LPC environment art, same renderer), lived in
   * by the guests' avatars. The server sends where everyone is a few times a second, this draws it
   * smoothly in between, with the birds, the cat, a night veil in the evening and a name over every
   * head.
   */

  const world = $derived(hb.modules.world as WorldState | undefined);

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let env: Env | null = null;
  let standingProps: Prop[] = [];

  /** Frames kept to draw between, a little in the past */
  const DELAY_MS = 180;
  let frames: TownFrame[] = [];

  /** Per character: distance walked, when its anim started, a breathing offset */
  const locals = new Map<string, { dist: number; anim: number; since: number; phase: number; lx: number; ly: number }>();
  const pigeons = untrack(() => new Pigeons(3, TOWN_AREA));
  let lastDraw = 0;

  onMount(() => {
    let raf = 0;
    void loadEnv().then((e) => {
      env = e;
      if (e) standingProps = squareProps(e).sort((a, b) => a.y - b.y);
    });
    const off = onEvent<TownFrame>('world', 'frame', (f) => {
      frames.push(f);
      if (frames.length > 30) frames = frames.slice(-15);
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

  /** How deep into the night it is: 0 in the day, 1 at night */
  function darkness(): number {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h < 5.5) return 1;
    if (h < 8) return 1 - (h - 5.5) / 2.5;
    if (h < 17) return 0;
    if (h < 21) return (h - 17) / 4;
    return 1;
  }

  /** A name over a head, like a game nametag */
  function nameTag(g: CanvasRenderingContext2D, text: string, x: number, y: number, alpha: number): void {
    g.font = '600 15px system-ui, sans-serif';
    const w = g.measureText(text).width + 16;
    g.fillStyle = `rgba(10,10,18,${0.55 * alpha})`;
    g.beginPath();
    g.roundRect(x - w / 2, y - 11, w, 22, 6);
    g.fill();
    g.fillStyle = `rgba(255,255,255,${0.92 * alpha})`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y);
    g.textBaseline = 'alphabetic';
  }

  /** The Zzz over a sleeper */
  function drawZzz(g: CanvasRenderingContext2D, x: number, y: number, now: number, alpha: number): void {
    g.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const t = (((now / 2600 + i / 3) % 1) + 1) % 1;
      g.font = `bold ${10 + t * 10}px system-ui, sans-serif`;
      g.fillStyle = `rgba(225,230,255,${(1 - t) * 0.8 * alpha})`;
      g.fillText('z', x + 14 + t * 18 + Math.sin((t + i) * 7) * 4, y - 20 - t * 34);
    }
  }

  function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    g.beginPath();
    g.moveTo(x, y + s);
    g.bezierCurveTo(x - s * 1.4, y - s * 0.4, x - s * 0.6, y - s * 1.3, x, y - s * 0.4);
    g.bezierCurveTo(x + s * 0.6, y - s * 1.3, x + s * 1.4, y - s * 0.4, x, y + s);
    g.fill();
  }

  /** The cat the server wanders around the square, drawn with the games' cat sprites */
  function drawCat(g: CanvasRenderingContext2D, cat: TownFrame['cat'], now: number): void {
    if (!env) return;
    const size = 32 * 1.35;
    const row = cat.dir === 1 ? 3 : 0;
    // Lying still (column 3) unless it walks; it lies down for whoever pets it
    const col = cat.walk ? Math.floor(now / 140) % 3 : 3;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(cat.x, cat.y + 1, 14, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(env.cats, col * 32, row * 32, 32, 32, Math.round(cat.x - size / 2), Math.round(cat.y - size + 6), size, size);
    if (cat.hearts) {
      for (let i = 0; i < 3; i++) {
        const t = (((now / 900 + i / 3) % 1) + 1) % 1;
        g.fillStyle = `rgba(240,90,120,${(1 - t) * 0.9})`;
        heart(g, cat.x + Math.sin((t + i) * 9) * 10, cat.y - 26 - t * 30, 5);
      }
    }
  }

  // The ground, built once per env state
  let bg: HTMLCanvasElement | null = null;
  let bgKey = '';
  function background(): HTMLCanvasElement {
    const key = `${!!env}`;
    if (bg && bgKey === key) return bg;
    if (env) {
      const c = document.createElement('canvas');
      c.width = WORLD.w;
      c.height = WORLD.h;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      const ground = squareGround(env);
      g.drawImage(ground, 0, 0, ground.width * 1.35, ground.height * 1.35);
      bg = c;
    } else {
      // Until the art is there: plain stone
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 9;
      const g = c.getContext('2d')!;
      g.fillStyle = '#3a3c42';
      g.fillRect(0, 0, 16, 9);
      bg = c;
    }
    bgKey = key;
    return bg;
  }

  function draw(): void {
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
    // The whole canvas: birds fly off above the town rectangle, into the letterbox bands
    g.clearRect(0, 0, cw, ch);
    const k = Math.min(cw / TOWN.w, ch / TOWN.h);
    g.setTransform(k, 0, 0, k, (cw - TOWN.w * k) / 2, (ch - TOWN.h * k) / 2);
    g.imageSmoothingEnabled = false;
    const now = serverNow();
    const step = Math.min(0.1, Math.max(0, (now - lastDraw) / 1000));
    lastDraw = now;

    g.drawImage(background(), 0, 0, TOWN.w, TOWN.h);
    // Shadows of the things standing up, on the ground under everyone
    for (const p of standingProps) p.ground?.(g, now);

    // The two frames around the drawn time; positions are mixed between them by id
    const t = now - DELAY_MS;
    let f0: TownFrame | null = null;
    let f1: TownFrame | null = null;
    for (const f of frames) {
      if (f.t <= t) f0 = f;
      else {
        f1 = f;
        break;
      }
    }
    f0 ??= f1;

    interface Person {
      id: string;
      x: number;
      y: number;
      anim: number;
      dir: 0 | 1 | 2 | 3;
      alpha: number;
    }
    const people: Person[] = [];
    if (f0) {
      const at1 = new Map<string, number>();
      if (f1 && f1 !== f0) f1.ids.forEach((id, i) => at1.set(id, i));
      const mix = f1 && f1 !== f0 ? Math.max(0, Math.min(1, (t - f0.t) / (f1.t - f0.t))) : 0;
      for (let i = 0; i < f0.ids.length; i++) {
        const id = f0.ids[i];
        const o = i * FRAME_STRIDE;
        let x = f0.a[o];
        let y = f0.a[o + 1];
        const j = at1.get(id);
        if (j !== undefined && f1) {
          x += (f1.a[j * FRAME_STRIDE] - x) * mix;
          y += (f1.a[j * FRAME_STRIDE + 1] - y) * mix;
        }
        people.push({ id, x, y, anim: f0.a[o + 2], dir: f0.a[o + 3] as 0 | 1 | 2 | 3, alpha: f0.a[o + 4] / 100 });
      }
    }

    // The birds fly off on their own when someone walks up to them
    pigeons.update(step, people.filter((p) => p.anim !== WANIM.sleep));
    if (!env) pigeons.draw(g, null);

    // Sleepers lie on the ground under everyone, then back to front
    people.sort((a, b) => (a.anim === WANIM.sleep ? 0 : 1) - (b.anim === WANIM.sleep ? 0 : 1) || a.y - b.y);

    // Shadows in one pass: round under the standing, long under the sleepers
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    for (const p of people) {
      if (p.anim === WANIM.sleep) {
        const s = sleepSide(p.x);
        g.moveTo(p.x + s * 36 + 40, p.y + 2);
        g.ellipse(p.x + s * 36, p.y + 2, 40, 8, 0, 0, Math.PI * 2);
      } else {
        g.moveTo(p.x + 15, p.y);
        g.ellipse(p.x, p.y, 15, 5, 0, 0, Math.PI * 2);
      }
    }
    g.fill();

    const byId = new Map(world?.characters.map((c) => [c.id, c]) ?? []);
    const sheets = asSheets(world?.sheet ?? null);
    const drawPerson = (p: Person) => {
      let l = locals.get(p.id);
      if (!l) locals.set(p.id, (l = { dist: 0, anim: -1, since: now, phase: Math.random() * 3000, lx: p.x, ly: p.y }));
      l.dist += Math.hypot(p.x - l.lx, p.y - l.ly);
      l.lx = p.x;
      l.ly = p.y;
      if (l.anim !== p.anim) {
        l.anim = p.anim;
        l.since = now;
      }
      const c = byId.get(p.id);
      const img = (c && sheetImage(c.url)) ?? undefined;
      g.globalAlpha = p.alpha;
      if (p.anim === WANIM.sleep) {
        // Asleep on their side: the side-view idle turned flat (the breathing keeps playing),
        // head away from the edge of town so nobody's head sticks out of the picture
        const s = sleepSide(p.x);
        g.save();
        g.translate(p.x, p.y);
        g.rotate((s * Math.PI) / 2);
        drawCharacter(g, sheets, img, 0, 0, { anim: gameAnim(WANIM.idle), dir: s === 1 ? 1 : 3, dist: 0, since: now - l.since, now, phase: l.phase }, hue(p.id));
        g.restore();
      } else {
        drawCharacter(g, sheets, img, p.x, p.y, { anim: gameAnim(p.anim), dir: p.dir, dist: l.dist, since: now - l.since, now, phase: l.phase }, hue(p.id));
      }
      g.globalAlpha = 1;
    };

    // The characters, the things that stand up, the birds and the cat, back to front together
    let pi = 0;
    while (pi < people.length && people[pi].anim === WANIM.sleep) drawPerson(people[pi++]);
    const cat = frames[frames.length - 1]?.cat;
    const standing = [
      ...standingProps,
      ...(env ? pigeons.groundItems(env) : []),
      ...(cat && env ? [{ y: cat.y, draw: (gg: CanvasRenderingContext2D) => drawCat(gg, cat, now) }] : []),
    ].sort((a, b) => a.y - b.y);
    let qi = 0;
    while (pi < people.length || qi < standing.length) {
      if (qi < standing.length && (pi >= people.length || standing[qi].y <= people[pi].y)) standing[qi++].draw(g, now);
      else drawPerson(people[pi++]);
    }
    pigeons.drawAir(g, env);

    // The evening lies over the square (the lamps keep their glow)
    const dark = darkness();
    if (dark > 0.02) {
      g.fillStyle = `rgba(14,16,42,${0.34 * dark})`;
      g.fillRect(0, 0, TOWN.w, TOWN.h);
    }

    // Names and sleep bubbles over everything. The head's top comes from the measured sheet, so
    // the name hangs just over the hair.
    const tall = world?.sheet ? (world.sheet.feet - world.sheet.body.top) * 1.35 : 64;
    for (const p of people) {
      const c = byId.get(p.id);
      const s = sleepSide(p.x);
      if (c) nameTag(g, c.name, p.anim === WANIM.sleep ? p.x + s * 36 : p.x, p.anim === WANIM.sleep ? p.y - 26 : p.y - tall - 14, p.alpha);
      if (p.anim === WANIM.sleep) drawZzz(g, p.x + s * 58, p.y - 4, now, p.alpha);
    }

    // Nobody lives here yet: say how to move in
    if (!world?.characters.length) {
      g.textAlign = 'center';
      g.font = '600 34px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText('The town is empty', TOWN.w / 2, 420);
      g.font = '400 24px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillText('Create your avatar on your phone to move in', TOWN.w / 2, 462);
    }
  }

  /** Which way a sleeper lies: body toward the middle of the town */
  const sleepSide = (x: number) => (x < TOWN.w / 2 ? 1 : -1);

  /** A steady hue for a guest whose sheet is still loading */
  function hue(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return h;
  }
</script>

<div class="town" bind:this={wrap}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .town {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: var(--radius);
    overflow: hidden;
    background: #26272c;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
