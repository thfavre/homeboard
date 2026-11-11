<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { hb, onEvent, serverNow } from '$lib/client.svelte.ts';
  import { BODY, SPRITE_SCALE, WORLD } from '$shared/crowd.ts';
  import { FRAME_STRIDE, TOWN, TOWN_AREA, TOWN_PLACES, WANIM, type TownFrame, type TownPlace, type WorldState } from '$shared/world.ts';
  import { drawCharacter } from '../games/crowd/sprites.ts';
  import { loadEnv, squareGround, squareProps, type Env, type Prop } from '../games/crowd/scene.ts';
  import { Pigeons } from '../games/crowd/effects.ts';
  import { asSheets, gameAnim, sheetImage } from './sprites.ts';
  import { drawCut, drawShop, drawSnips, drawSwish, insideFeet } from './shops.ts';

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
  /**
   * Per character: the sheet drawn (the last one kept until a new one has loaded), its URL, and for a
   * look that changed inside a shop the one before and when the change started
   */
  const shown = new Map<string, { url: string; img: HTMLImageElement | null; prev: HTMLImageElement | null; at: number }>();
  /** How long the clothes shop's curtain takes, and the barber's cut across the hair */
  const SWISH_MS = 900;
  const CUT_MS = 2500;

  /** Cut hair falling in the barber's window: the old hair's own pixels, in world units (per second) */
  let clippings: { x: number; y: number; vx: number; vy: number; color: string; life: number; floor: number }[] = [];
  /** Per character in the chair: the last sprite column the scissors went through */
  const cutCols = new Map<string, number>();
  /** Two small canvases to read a character's pixels from, the old look and the new */
  let scratch: CanvasRenderingContext2D[] | null = null;
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

    const byId = new Map(world?.characters.map((c) => [c.id, c]) ?? []);
    const sheets = asSheets(world?.sheet ?? null);

    // The ones inside a shop are seen through its window, on the wall behind everyone else
    const inside = people.filter((p) => p.anim === WANIM.inside);
    for (let i = people.length - 1; i >= 0; i--) if (people[i].anim === WANIM.inside) people.splice(i, 1);

    // The birds fly off on their own when someone walks up to them
    pigeons.update(step, people.filter((p) => p.anim !== WANIM.sleep));
    if (!env) pigeons.draw(g, null);

    // Sleepers lie on the ground under everyone, then back to front
    people.sort((a, b) => (a.anim === WANIM.sleep ? 0 : 1) - (b.anim === WANIM.sleep ? 0 : 1) || a.y - b.y);

    // Shadows in one pass: round under the standing, long under the sleepers
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    for (const p of people) {
      // Half through a shop door: no shadow
      if (p.alpha < 0.6) continue;
      if (p.anim === WANIM.sleep) {
        const s = sleepSide(p.x);
        g.moveTo(p.x + s * 30 + 30, p.y + 2);
        g.ellipse(p.x + s * 30, p.y + 2, 30, 7, 0, 0, Math.PI * 2);
      } else {
        g.moveTo(p.x + 15, p.y);
        g.ellipse(p.x, p.y, 15, 5, 0, 0, Math.PI * 2);
      }
    }
    g.fill();

    /** The sheets of a character: its own, the previous one while a new look loads (and while it changes in a shop) */
    const sheetOf = (id: string, inShop: boolean) => {
      const c = byId.get(id);
      let s = shown.get(id);
      if (!s) shown.set(id, (s = { url: c?.url ?? '', img: null, prev: null, at: -Infinity }));
      if (!c) return s;
      s.url = c.url;
      const img = sheetImage(c.url);
      if (img && img !== s.img) {
        // The new look is there: inside a shop it changes before our eyes, from now
        s.prev = inShop ? s.img : null;
        s.at = now;
        s.img = img;
      }
      return s;
    };
    /** How a character stands this frame (the same pose for both looks during a cut) */
    const poseOf = (p: Person) => {
      let l = locals.get(p.id);
      if (!l) locals.set(p.id, (l = { dist: 0, anim: -1, since: now, phase: Math.random() * 3000, lx: p.x, ly: p.y }));
      l.dist += Math.hypot(p.x - l.lx, p.y - l.ly);
      l.lx = p.x;
      l.ly = p.y;
      if (l.anim !== p.anim) {
        l.anim = p.anim;
        l.since = now;
      }
      return l;
    };
    const drawPerson = (p: Person, sheet?: HTMLImageElement | null) => {
      const l = poseOf(p);
      const img = (sheet !== undefined ? sheet : sheetOf(p.id, false).img) ?? undefined;
      g.globalAlpha = p.alpha;
      if (p.anim === WANIM.sleep) {
        // Asleep on their side: the side-view idle turned flat (the breathing keeps playing),
        // head away from the edge of town so nobody's head sticks out of the picture
        const s = sleepSide(p.x);
        g.save();
        g.translate(p.x, p.y);
        g.rotate((s * Math.PI) / 2);
        // The clock runs slow for a sleeper, so the idle breathing is calm
        drawCharacter(g, sheets, img, 0, 0, { anim: gameAnim(WANIM.idle), dir: s === 1 ? 1 : 3, dist: 0, since: now - l.since, now: now / 2.5, phase: l.phase / 2.5 }, hue(p.id));
        g.restore();
      } else {
        drawCharacter(g, sheets, img, p.x, p.y, { anim: gameAnim(p.anim), dir: p.dir, dist: l.dist, since: now - l.since, now, phase: l.phase }, hue(p.id));
      }
      g.globalAlpha = 1;
    };

    // The shops, with whoever is inside seen through the window
    const tall = world?.sheet ? (world.sheet.feet - world.sheet.body.top) * 1.35 : 64;
    for (const place of Object.values(TOWN_PLACES)) {
      const here = inside.filter((p) => p.x >= place.window.x && p.x <= place.window.x + place.window.w);
      drawShop(g, place, now, (gg) => {
        for (const p of here) {
          const q = { ...p, y: insideFeet(place) };
          const s = sheetOf(p.id, true);
          const e = now - s.at;
          const headY = q.y - tall + 6;
          if (place.id === 'barber') {
            if (s.prev && e < CUT_MS) {
              // The cut: the new hair column after column from the left, the old one still on the right of the scissors
              const info = world?.sheet;
              const left = Math.max(0, (info?.body.left ?? 20) - 7);
              const right = Math.min(64, (info?.body.right ?? 44) + 7);
              const col = left + Math.floor((e / CUT_MS) * (right - left + 1));
              const cutX = Math.round(q.x + (col - BODY.centerX) * SPRITE_SCALE);
              // Each look only on its side of the scissors: the new hair shows where the old one is cut away, never under it
              const { x: wx, y: wy, w: ww, h: wh } = place.window;
              for (const [sheet, x0, x1] of [
                [s.img, wx, cutX],
                [s.prev, cutX, wx + ww],
              ] as const) {
                gg.save();
                gg.beginPath();
                gg.rect(x0, wy, x1 - x0, wh);
                gg.clip();
                drawPerson(q, sheet);
                gg.restore();
              }
              // What the scissors went through since the last frame falls off, in the old hair's colors
              const done = cutCols.get(p.id) ?? left - 1;
              if (col > done && s.img) {
                cutCols.set(p.id, col);
                const l = poseOf(q);
                const pose = { anim: gameAnim(q.anim), dir: q.dir, dist: l.dist, since: now - l.since, now, phase: l.phase };
                snip(q, s.prev, s.img, pose, done + 1, col, place.window.y + place.window.h - 2);
              }
              drawCut(gg, cutX, headY, now);
            } else {
              cutCols.delete(p.id);
              drawPerson(q);
              drawSnips(gg, q.x, headY, now, 'rgba(58,40,30,0.9)');
            }
          } else {
            // Behind the curtain: the old look until it is closed, then the new one
            drawPerson(q, s.prev && e < SWISH_MS * 0.4 ? s.prev : s.img);
            if (s.prev && e < SWISH_MS) drawSwish(gg, place, q.x, e / SWISH_MS);
          }
        }
        if (place.id === 'barber') drawClippings(gg, step);
      });
    }

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
    for (const p of inside) {
      const c = byId.get(p.id);
      const place = placeAt(p.x);
      if (c && place) nameTag(g, c.name, p.x, place.window.y + place.window.h + 14, p.alpha);
    }
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

  /** A sprite of a character drawn alone (feet at the usual spot), to read its pixels */
  function pixelsOf(k: number, img: HTMLImageElement, pose: Parameters<typeof drawCharacter>[5]): Uint8ClampedArray {
    const size = Math.ceil(64 * SPRITE_SCALE);
    if (!scratch) {
      scratch = [0, 1].map(() => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        return c.getContext('2d', { willReadFrequently: true })!;
      });
    }
    const g = scratch[k];
    g.clearRect(0, 0, size, size);
    g.imageSmoothingEnabled = false;
    drawCharacter(g, asSheets(world?.sheet ?? null), img, BODY.centerX * SPRITE_SCALE, BODY.feetY * SPRITE_SCALE, pose, 0);
    return g.getImageData(0, 0, size, size).data;
  }

  /**
   * The scissors went through sprite columns c0..c1: every pixel there that the new look does not
   * have (the hair that is cut off) falls, in its own color
   */
  function snip(q: { x: number; y: number }, before: HTMLImageElement, after: HTMLImageElement, pose: Parameters<typeof drawCharacter>[5], c0: number, c1: number, floor: number): void {
    const a = pixelsOf(0, before, pose);
    const b = pixelsOf(1, after, pose);
    const size = Math.ceil(64 * SPRITE_SCALE);
    const ox = q.x - BODY.centerX * SPRITE_SCALE;
    const oy = q.y - BODY.feetY * SPRITE_SCALE;
    for (let c = c0; c <= c1; c++) {
      // One sample per sprite pixel: the middle of its square
      const px = Math.floor((c + 0.5) * SPRITE_SCALE);
      if (px >= size) break;
      for (let r = 0; r < 64; r++) {
        const py = Math.floor((r + 0.5) * SPRITE_SCALE);
        const i = (py * size + px) * 4;
        if (a[i + 3] < 128) continue;
        const same = b[i + 3] >= 128 && Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) < 36;
        if (same) continue;
        clippings.push({
          x: ox + c * SPRITE_SCALE,
          y: oy + r * SPRITE_SCALE,
          vx: (Math.random() - 0.5) * 30,
          vy: -10 - Math.random() * 25,
          color: `rgb(${a[i]},${a[i + 1]},${a[i + 2]})`,
          life: 1.1 + Math.random() * 0.6,
          floor,
        });
      }
    }
    if (clippings.length > 600) clippings = clippings.slice(-600);
  }

  /** The cut hair: it falls, flutters a little, lands on the floor and fades */
  function drawClippings(g: CanvasRenderingContext2D, dt: number): void {
    for (const h of clippings) {
      h.life -= dt;
      if (h.y < h.floor) {
        h.vy += 260 * dt;
        h.vx *= 1 - 2 * dt;
        h.x += (h.vx + Math.sin(h.life * 9) * 6) * dt;
        h.y = Math.min(h.floor, h.y + h.vy * dt);
      }
      g.globalAlpha = Math.max(0, Math.min(1, h.life * 2));
      g.fillStyle = h.color;
      g.fillRect(h.x, h.y, SPRITE_SCALE, SPRITE_SCALE);
    }
    g.globalAlpha = 1;
    clippings = clippings.filter((h) => h.life > 0);
  }

  /** The shop whose window this x is in */
  const placeAt = (x: number): TownPlace | undefined => Object.values(TOWN_PLACES).find((pl) => x >= pl.window.x && x <= pl.window.x + pl.window.w);

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
