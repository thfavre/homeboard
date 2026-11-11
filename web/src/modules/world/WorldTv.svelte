<script lang="ts">
  import { onMount } from 'svelte';
  import { hb, onEvent, serverNow } from '$lib/client.svelte.ts';
  import { FRAME_STRIDE, TOWN, WANIM, WORLD_BODY, WORLD_SPRITE_SCALE, type TownFrame, type WorldState } from '$shared/world.ts';
  import { drawWorldCharacter, sheetImage, type WorldPose } from './sprites.ts';
  import { Birds, daylight, drawCat, drawSky, drawTownLight, drawZzz, townLayer } from './scene.ts';

  /**
   * The town on the TV: the server sends where everyone is a few times a second, this draws it
   * smoothly in between, with the time of day, the birds, the cat and a name over every head.
   */

  const world = $derived(hb.modules.world as WorldState | undefined);

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;

  /** Frames kept to draw between, a little in the past */
  const DELAY_MS = 180;
  let frames: TownFrame[] = [];

  /** Per character: distance walked, when its anim started, a breathing offset */
  const locals = new Map<string, { dist: number; anim: number; since: number; phase: number; lx: number; ly: number }>();
  const birds = new Birds();
  let lastDraw = 0;

  onMount(() => {
    let raf = 0;
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

  /** A name over a head, like a game nametag */
  function nameTag(g: CanvasRenderingContext2D, text: string, color: string, x: number, y: number, alpha: number): void {
    g.font = '600 15px system-ui, sans-serif';
    const w = g.measureText(text).width + 16;
    g.fillStyle = `rgba(10,10,18,${0.55 * alpha})`;
    g.beginPath();
    g.roundRect(x - w / 2, y - 12, w, 22, 6);
    g.fill();
    g.fillStyle = `rgba(255,255,255,${0.92 * alpha})`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y);
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(x - w / 2, y + 8, w, 2.5);
    g.globalAlpha = 1;
    g.textBaseline = 'alphabetic';
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
    const k = Math.min(cw / TOWN.w, ch / TOWN.h);
    g.setTransform(k, 0, 0, k, (cw - TOWN.w * k) / 2, (ch - TOWN.h * k) / 2);
    g.imageSmoothingEnabled = false;
    const now = serverNow();
    const step = Math.min(0.1, Math.max(0, (now - lastDraw) / 1000));
    lastDraw = now;

    const day = daylight(new Date());
    drawSky(g, day, now);
    g.drawImage(townLayer(), 0, 0);

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

    // Birds under everyone, scared by whoever walks near
    birds.update(step, now, people.filter((p) => p.anim === WANIM.walk));
    birds.draw(g, now);
    const cat = frames[frames.length - 1]?.cat;
    if (cat) drawCat(g, cat, now);

    // Lying characters first, then back to front
    people.sort((a, b) => (a.anim === WANIM.sleep ? 0 : 1) - (b.anim === WANIM.sleep ? 0 : 1) || a.y - b.y);

    // Shadows in one pass
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    for (const p of people) {
      if (p.anim === WANIM.sleep) continue;
      g.moveTo(p.x + 16, p.y);
      g.ellipse(p.x, p.y, 16, 5.5, 0, 0, Math.PI * 2);
    }
    g.fill();

    const byId = new Map(world?.characters.map((c) => [c.id, c]) ?? []);
    const tall = WORLD_BODY.feetY * WORLD_SPRITE_SCALE;
    for (const p of people) {
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
      const pose: WorldPose = { anim: p.anim, dir: p.dir, dist: l.dist, since: now - l.since, now, phase: l.phase };
      g.globalAlpha = p.alpha;
      drawWorldCharacter(g, world?.sheet ?? null, c ? sheetImage(c.url) : null, p.x, p.y, pose, c?.color ?? '#ffffff');
      g.globalAlpha = 1;
      if (c) nameTag(g, c.name, c.color, p.x, p.anim === WANIM.sleep ? p.y - 48 : p.y - tall - 14, p.alpha);
      if (p.anim === WANIM.sleep) drawZzz(g, p.x, p.y, now, p.alpha);
    }

    drawTownLight(g, day);

    // Nobody lives here yet: say how to move in
    if (!world?.characters.length) {
      g.textAlign = 'center';
      g.font = '600 34px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillText('The town is empty', TOWN.w / 2, 330);
      g.font = '400 24px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText('Create your avatar on your phone to move in', TOWN.w / 2, 372);
    }
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
    background: #0c0e1c;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
