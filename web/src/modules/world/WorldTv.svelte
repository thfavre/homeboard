<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { FastForward } from '@lucide/svelte';
  import { attempt, hb, onEvent, rpc, serverNow } from '$lib/client.svelte.ts';
  import { BODY, SPRITE_SCALE, SQUARE_HOUSES, WORLD, houseRow } from '$shared/crowd.ts';
  import { CAFE, CROSSING, FIRE_SEATS, DAIS_FOOT, FRAME_STRIDE, HALL_PAN, RIVERSIDE, TOWN, TOWN_AREA, TOWN_PLACES, TOWN_SCENE, WANIM, TOWN_SPEEDS, hallLift, townMinutes, townTime, type SheetInfo, type TownFrame, type TownPlace, type WorldState } from '$shared/world.ts';
  import { drawCharacter } from '../games/crowd/sprites.ts';
  import { SQUARE_STREET, loadEnv, squareGround, type Env, type Prop } from '../games/crowd/scene.ts';
  import { DANCE_FEET, cafeArt, drawCafe, drawCafeLight, type CafeArt } from './cafe.ts';
  import { drawAngler, drawCatch, drawDancing, drawGlass, drawPerched, drawPole } from './poses.ts';
  import { GREEN_TOP, brookFrames, drawBrook, drawBrookGlints, townGround } from './townGround.ts';
  import { drawCup, drawFireLight, drawKindling, lampLevel, townNow, townProps } from './townScene.ts';
  import { Pigeons } from '../games/crowd/effects.ts';
  import { asSheets, gameAnim, sheetImage } from './sprites.ts';
  import { drawCut, drawShop, drawShopLight, drawSnips, drawSwish, insideFeet, setShopArt } from './shops.ts';
  import { loadShopArt, shopSwap, type ShopArt } from './shopfronts.ts';
  import { TOWN_HALL_SPAN, drawTownHall, drawTownHallClock, drawTownHallLight } from './townHall.ts';
  import { drawLaughing, drawTalking, nodDip } from './chat.ts';
  import { crownMark, drawEnthroned, drawHailing, drawHallLight, drawHallWall, drawKneeling, drawRiver, hallProps, loadHall, townEdge, type HallArt } from './throneRoom.ts';

  /**
   * The town on the TV: the crowd games' square (same LPC environment art, same renderer) with the
   * town's own places (the river along the bottom, the campfire's grass, the cafe, the notice board),
   * lived in by the guests' avatars. The server sends where everyone is a few times a second, this
   * draws it smoothly in between, with the birds, the cat, a night veil in the evening, the lamps and
   * the fire lit, and a name over every head. For the King's ceremony the camera moves to the right,
   * over to the throne room.
   */

  const world = $derived(hb.modules.world as WorldState | undefined);
  /** How many times faster than real time the town runs, and the button that goes round the speeds */
  const speed = $derived(world?.warp?.speed ?? 1);
  function faster() {
    const i = TOWN_SPEEDS.indexOf(speed as (typeof TOWN_SPEEDS)[number]);
    void attempt(() => rpc('world', 'setSpeed', { speed: TOWN_SPEEDS[(i + 1) % TOWN_SPEEDS.length] }));
  }

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let env: Env | null = null;
  let shopArt: ShopArt | null = null;
  let hall: HallArt | null = null;
  let cafe: CafeArt | null = null;
  /** The town's river in the frames of its flow */
  let brook: ReturnType<typeof brookFrames> | null = null;
  let standingProps: Prop[] = [];
  /** What stands up in the throne room (only drawn while the camera shows it) */
  let hallStanding: Prop[] = [];

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
  /** The measurements of each loaded sheet (every look has its own: a tall hat, a dress without sit art) */
  const infos = new WeakMap<HTMLImageElement, SheetInfo>();
  /** The renderer's view of each measurement, made once */
  const sheetsCache = new WeakMap<SheetInfo, ReturnType<typeof asSheets>>();
  /** The measurements of a drawn sheet, or the shared fallback */
  const infoOf = (img: HTMLImageElement | null | undefined): SheetInfo | null => (img && infos.get(img)) || world?.sheet || null;
  const sheetsOf = (img: HTMLImageElement | null | undefined) => {
    const info = infoOf(img);
    if (!info) return null;
    let v = sheetsCache.get(info);
    if (!v) sheetsCache.set(info, (v = asSheets(info)));
    return v;
  };
  /** How tall a character stands in world units (for the name over the head) */
  const tallOf = (img: HTMLImageElement | null | undefined) => {
    const info = infoOf(img);
    return info ? (info.feet - info.body.top) * 1.35 : 64;
  };
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
  /** When the King opened the court (his hands up before the throne): the throne glows from then on, until he comes down from the dais */
  let courtSince: number | null = null;

  onMount(() => {
    let raf = 0;
    void Promise.all([loadEnv(), loadShopArt()]).then(([e, a]) => {
      env = e;
      shopArt = a;
      setShopArt(e, a);
      if (e) standingProps = townProps(e, (x) => x < TOWN_HALL_SPAN.x0 || x > TOWN_HALL_SPAN.x1).sort((a, b) => a.y - b.y);
      if (e && a) cafe = cafeArt(e, a);
      brook = brookFrames();
    });
    void loadHall().then((h) => {
      hall = h;
      hallStanding = h ? hallProps(h) : [];
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

  /** A lamp post at night: a warm glow around its light, and a pool of it on the ground */
  function drawLampLight(g: CanvasRenderingContext2D, x: number, y: number, dark: number, now: number): void {
    const ly = y - 82;
    const glow = g.createRadialGradient(x, ly, 0, x, ly, 60);
    glow.addColorStop(0, `rgba(255,214,130,${(0.34 + 0.04 * Math.sin(now / 700 + x)) * dark})`);
    glow.addColorStop(1, 'rgba(255,214,130,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(x, ly, 60, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(x, y);
    g.scale(1, 0.4);
    const pool = g.createRadialGradient(0, 0, 0, 0, 0, 80);
    pool.addColorStop(0, `rgba(255,205,130,${0.16 * dark})`);
    pool.addColorStop(1, 'rgba(255,205,130,0)');
    g.fillStyle = pool;
    g.beginPath();
    g.arc(0, 0, 80, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  /** A name over a head, like a game nametag; the King's is gold, with a crown before the name */
  function nameTag(g: CanvasRenderingContext2D, text: string, x: number, y: number, alpha: number, king = false): void {
    g.font = '600 15px system-ui, sans-serif';
    const crown = king ? 18 : 0;
    const w = g.measureText(text).width + 16 + crown;
    g.fillStyle = king ? `rgba(206,158,38,${0.92 * alpha})` : `rgba(10,10,18,${0.55 * alpha})`;
    g.beginPath();
    g.roundRect(x - w / 2, y - 11, w, 22, 6);
    g.fill();
    if (king) {
      g.strokeStyle = `rgba(255,232,150,${0.9 * alpha})`;
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = `rgba(70,40,6,${0.95 * alpha})`;
      crownMark(g, x - w / 2 + 15, y + 5, 6);
    }
    g.fillStyle = king ? `rgba(48,26,4,${alpha})` : `rgba(255,255,255,${0.92 * alpha})`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x + crown / 2, y);
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

  // The ground, built once per art state: the town, and the river and the throne room to its right once their art is there
  let bg: HTMLCanvasElement | null = null;
  let bgKey = '';
  /** Where the town meets the grass (built with the ground once the throne room's art is there): drawn over the river's frames */
  let edge: { canvas: HTMLCanvasElement; x: number } | null = null;
  function background(): HTMLCanvasElement {
    const key = `${!!env}${!!shopArt}${!!hall}${!!cafe}`;
    if (bg && bgKey === key) return bg;
    if (env) {
      const c = document.createElement('canvas');
      c.width = WORLD.w + (hall ? Math.ceil(HALL_PAN) : 0);
      c.height = WORLD.h;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      // With the riverside, the square is built on past the screen's edge: its last house sticks out over the grass
      const screen = Math.ceil(WORLD.w / SPRITE_SCALE);
      const last = houseRow(SQUARE_HOUSES.seed, screen).at(-1)!;
      // The shops and the cafe built on their houses
      const shops = shopArt ? shopSwap(env, shopArt) : undefined;
      const built = cafe;
      const swap = shops && built ? (kind: Parameters<typeof shops>[0], x: number) => (kind === 'paneled' && x === CAFE.house.art ? built.house : shops(kind, x)) : shops;
      const ground = squareGround(env, swap, hall ? last.x + last.w + 40 : screen);
      // The town's grass, its bank and its river over the square's paving
      townGround(ground);
      g.drawImage(ground, 0, 0, screen, ground.height, 0, 0, screen * SPRITE_SCALE, ground.height * SPRITE_SCALE);
      drawTownHall(g);
      edge = null;
      if (hall) {
        g.drawImage(hall.ground, RIVERSIDE.x0, 0, hall.ground.width * SPRITE_SCALE, hall.ground.height * SPRITE_SCALE);
        edge = townEdge(ground, screen, last.x + last.w, SQUARE_STREET, Math.floor(GREEN_TOP));
        g.drawImage(edge.canvas, edge.x * SPRITE_SCALE, 0, edge.canvas.width * SPRITE_SCALE, edge.canvas.height * SPRITE_SCALE);
      }
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
    g.imageSmoothingEnabled = false;
    const real = serverNow();
    // The town's own time: it can run faster than real time (the button), and everything that moves
    // on its own (walk cycles, water, fire, birds, lights) follows it
    const now = townTime(real, world?.warp);
    const step = Math.min(0.4, Math.max(0, (now - lastDraw) / 1000));
    lastDraw = now;

    // The two frames around the drawn time (they come by real time); positions are mixed between them by id
    const t = real - DELAY_MS;
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
    const mix = f0 && f1 && f1 !== f0 ? Math.max(0, Math.min(1, (t - f0.t) / (f1.t - f0.t))) : 0;

    // The camera: on the town, or moved to the right for the ceremony in the throne room (on
    // whole screen pixels, so the ground does not shimmer as it slides)
    const k = Math.min(cw / TOWN.w, ch / TOWN.h);
    const cam = f0 ? (f0.cam ?? 0) + (f1 ? ((f1.cam ?? 0) - (f0.cam ?? 0)) * mix : 0) : 0;
    const shift = Math.round(Math.max(0, Math.min(1, cam)) * HALL_PAN * k);
    const away = shift > 0;
    g.setTransform(k, 0, 0, k, (cw - TOWN.w * k) / 2 - shift, (ch - TOWN.h * k) / 2);
    g.save();
    if (away) {
      // Moved over: only what the screen shows of both (nothing spills into the letterbox bands)
      g.beginPath();
      g.rect(shift / k, 0, TOWN.w, TOWN.h);
      g.clip();
    }

    const ground = background();
    if (ground.width < TOWN.w) g.drawImage(ground, 0, 0, TOWN.w, TOWN.h);
    else if (away) g.drawImage(ground, 0, 0);
    else g.drawImage(ground, 0, 0, TOWN.w, TOWN.h, 0, 0, TOWN.w, TOWN.h);
    if (away && (!hall || ground.width <= TOWN.w)) {
      // The throne room's art is not there: plain stone
      g.fillStyle = '#3a3c42';
      g.fillRect(TOWN.w, 0, HALL_PAN, TOWN.h);
    }
    // The town's river flowing, glinting in the light
    if (env && ground.width >= TOWN.w) {
      if (brook) drawBrook(g, brook, now, away);
      drawBrookGlints(g, env['water-sparkle-anim'], now, away);
    }
    // What the town's things need to know: how dark it is, which lamps are lit, a party on
    const dark = f0 ? (f0.dark ?? 0) + (f1 ? ((f1.dark ?? 0) - (f0.dark ?? 0)) * mix : 0) : 0;
    const party = !!f0?.party;
    townNow.dark = dark;
    townNow.lamps = f0?.lamps ?? 0;
    townNow.party = party;
    townNow.fire = !!f0?.fire;
    const inHall = away && hall ? hallStanding : [];
    if (away && hall) {
      drawRiver(g, hall, now);
      if (edge) g.drawImage(edge.canvas, edge.x * SPRITE_SCALE, 0, edge.canvas.width * SPRITE_SCALE, edge.canvas.height * SPRITE_SCALE);
      drawHallWall(g, now);
    }

    interface Person {
      id: string;
      x: number;
      y: number;
      /** How high above the ground it is drawn: the steps of the throne's dais */
      lift: number;
      anim: number;
      dir: 0 | 1 | 2 | 3;
      alpha: number;
    }
    const people: Person[] = [];
    if (f0) {
      const at1 = new Map<string, number>();
      if (f1 && f1 !== f0) f1.ids.forEach((id, i) => at1.set(id, i));
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
        // Still out in the throne room once the camera is back on the town: out of the picture
        if (!away && x > TOWN.w + 40) continue;
        people.push({ id, x, y, lift: hallLift(x, y), anim: f0.a[o + 2], dir: f0.a[o + 3] as 0 | 1 | 2 | 3, alpha: f0.a[o + 4] / 100 });
      }
    }

    const byId = new Map(world?.characters.map((c) => [c.id, c]) ?? []);

    // The ones inside a shop are seen through its window, on the wall behind everyone else; so are
    // the ones dancing in the cafe
    const inside = people.filter((p) => p.anim === WANIM.inside);
    const dancers = people.filter((p) => p.anim === WANIM.dance);
    for (let i = people.length - 1; i >= 0; i--) if (people[i].anim === WANIM.inside || people[i].anim === WANIM.dance) people.splice(i, 1);

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
        // (sitting sideways the body is over the seat, behind the feet: its shadow goes there)
        const perch = p.anim === WANIM.perch;
        const sx = p.x + (perch ? (p.dir === 1 ? 2 : p.dir === 3 ? -2 : 0) * SPRITE_SCALE : 0);
        const sy = p.y - p.lift - (perch && (p.dir === 1 || p.dir === 3) ? 4 : 0);
        g.moveTo(sx + 15, sy);
        g.ellipse(sx, sy, 15, 5, 0, 0, Math.PI * 2);
      }
    }
    g.fill();
    // What lies on the ground (the logs by the fire, the chairs, the shadows of the trees and the
    // fountain), over the characters' own shadows: whoever sits on a log casts its shadow under it
    for (const p of standingProps) p.ground?.(g, now);
    for (const p of inHall) p.ground?.(g, now);

    /** The sheets of a character: its own, the previous one while a new look loads (and while it changes in a shop) */
    const sheetOf = (id: string, inShop: boolean) => {
      const c = byId.get(id);
      let s = shown.get(id);
      if (!s) shown.set(id, (s = { url: c?.url ?? '', img: null, prev: null, at: -Infinity }));
      if (!c) return s;
      s.url = c.url;
      const img = sheetImage(c.url);
      if (img && c.sheet && !infos.has(img)) infos.set(img, c.sheet);
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
      const sheets = sheetsOf(img);
      const info = img ? infoOf(img) : null;
      const y = p.y - p.lift;
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
      } else if (p.anim === WANIM.pray && img && info && drawKneeling(g, img, info, p.x, y, now - l.since, now)) {
        // Kneeling toward the throne
      } else if (p.anim === WANIM.sit && p.dir === 1 && img && info && drawEnthroned(g, img, info, p.x, y)) {
        // The King on the throne, seen from the side
      } else if (p.anim === WANIM.talk && img && info && drawTalking(g, img, info, p.x, y, p.dir, now, l.phase)) {
        // Chatting: talking with the hands
      } else if (p.anim === WANIM.laugh && img && info && drawLaughing(g, img, info, p.x, y, p.dir, now - l.since)) {
        // Chatting: both laughing
      } else if (p.anim === WANIM.cheer && p.dir === 1 && img && info && drawHailing(g, img, info, p.x, y, now - l.since)) {
        // The King before the throne, both hands up
      } else if (p.anim === WANIM.perch && img && info && drawPerched(g, img, info, p.x, y, p.dir, now - l.since, FIRE_SEATS.some((s) => s.ground && Math.abs(s.x - p.x) < 3 && Math.abs(s.y - p.y) < 3))) {
        // On the fountain's rim, a log by the fire, a cafe chair (with a cup on the table)
        if (CAFE.seats.some((s) => Math.abs(s.x - p.x) < 3 && Math.abs(s.y - p.y) < 3)) drawCup(g, p.x, y, p.dir, now, l.phase);
      } else if (
        (p.anim === WANIM.fish || p.anim === WANIM.bite || p.anim === WANIM.catch) &&
        drawAngler(g, p.x, y, p.dir, p.anim === WANIM.fish ? 'fish' : p.anim === WANIM.bite ? 'bite' : 'catch', now - l.since, now, l.phase, () =>
          drawCharacter(g, sheets, img, p.x, y, { anim: gameAnim(WANIM.idle), dir: p.dir, dist: l.dist, since: now - l.since, now, phase: l.phase }, hue(p.id)),
        )
      ) {
        // Fishing with the rod: casting, waiting, a bite, the line whipped up with the fish
      } else if (p.anim === WANIM.kindle && img && info && drawPerched(g, img, info, p.x, y, p.dir, 0, true)) {
        // Kneeling by the campfire to light it
        drawKindling(g, now);
      } else if (p.anim === WANIM.dance && img && info && drawDancing(g, img, info, p.x, y, now, l.phase)) {
        // Dancing in the cafe
      } else {
        // (a listener in a chat nods now and then)
        const dip = p.anim === WANIM.listen ? nodDip(now, l.phase) : 0;
        drawCharacter(g, sheets, img, p.x, y + dip, { anim: gameAnim(p.anim), dir: p.dir, dist: l.dist, since: now - l.since, now, phase: l.phase }, hue(p.id));
        // What they hold: the rod (the fish caught), a glass at the party, the lamplighter's pole
        if (p.anim === WANIM.catch) drawCatch(g, p.x, y, p.dir === 1 ? -1 : 1, now - l.since);
        else if (p.anim === WANIM.drink) drawGlass(g, p.x, y, p.dir, now, l.phase);
        else if (p.anim === WANIM.light) drawPole(g, p.x, y, townNow.dark >= 0.3, now);
      }
      g.globalAlpha = 1;
    };

    // The shops, with whoever is inside seen through the window
    for (const place of Object.values(TOWN_PLACES)) {
      const here = inside.filter((p) => p.x >= place.window.x && p.x <= place.window.x + place.window.w);
      // The door opens for whoever is on its last steps, going in or coming out (only visitors go up there)
      const busy = people.some((p) => Math.abs(p.x - place.door.x) < 24 && p.y < place.door.y + 46);
      drawShop(g, place, now, busy, (gg) => {
        for (const p of here) {
          const q = { ...p, y: insideFeet(place) };
          const s = sheetOf(p.id, true);
          const e = now - s.at;
          const headY = q.y - tallOf(s.img) + 6;
          if (place.id === 'barber') {
            if (s.prev && e < CUT_MS) {
              // The cut: the new hair column after column from the left, the old one still on the right of the scissors
              const info = infoOf(s.img);
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
    // The cafe, with the dancers seen through its window on a party night
    if (cafe) drawCafe(g, cafe, now, dark, party, () => dancers.forEach((p) => drawPerson({ ...p, y: DANCE_FEET })));

    // The characters, the things that stand up, the birds and the cat, back to front together
    let pi = 0;
    while (pi < people.length && people[pi].anim === WANIM.sleep) drawPerson(people[pi++]);
    const cat = frames[frames.length - 1]?.cat;
    const standing = [
      ...standingProps,
      ...inHall,
      ...(env ? pigeons.groundItems(env) : []),
      ...(cat && env ? [{ y: cat.y, draw: (gg: CanvasRenderingContext2D) => drawCat(gg, cat, now) }] : []),
    ].sort((a, b) => a.y - b.y);
    let qi = 0;
    while (pi < people.length || qi < standing.length) {
      if (qi < standing.length && (pi >= people.length || standing[qi].y <= people[pi].y)) standing[qi++].draw(g, now);
      else drawPerson(people[pi++]);
    }
    pigeons.drawAir(g, env);

    // The evening lies over the square (the lamps keep their glow). The server keeps the time of
    // day the host set, and sends how dark it is with every frame.
    if (dark > 0.02) {
      g.fillStyle = `rgba(14,16,42,${0.44 * dark})`;
      g.fillRect(0, 0, TOWN.w + (away ? HALL_PAN : 0), TOWN.h);
      // The shops stay lit inside
      for (const place of Object.values(TOWN_PLACES)) drawShopLight(g, place, dark);
      // The lamp posts the lamplighter has lit shine through the veil, with a pool of light on the pavement under them
      TOWN_SCENE.lamps.forEach((l, i) => {
        const level = lampLevel(i, now);
        if (level > 0) drawLampLight(g, l.x, l.y, dark * level, now);
      });
      drawTownHallLight(g, dark);
      drawFireLight(g, dark, now);
    }
    // The cafe's window at night, and its party lights
    drawCafeLight(g, dark, party, now);
    // The town hall's clock shows the town's own time (the real one when its day is off)
    const day = world?.day;
    const local = new Date(now);
    drawTownHallClock(g, day?.on ? townMinutes(now, day) : local.getHours() * 60 + local.getMinutes() + local.getSeconds() / 60);
    // The throne room has its own light: the windows by day, its fires at any time
    // The throne glows from the moment the King opens the court, until he comes down from the dais
    const king = people.find((p) => p.id === world?.king?.id);
    if (!away || !king || king.x < DAIS_FOOT) courtSince = null;
    else if (courtSince === null && (king.anim === WANIM.cheer || (king.anim === WANIM.sit && king.dir === 1))) courtSince = now;
    if (away && hall) drawHallLight(g, now, dark, courtSince === null ? null : now - courtSince);

    // Names and sleep bubbles over everything. The head's top comes from the measured sheet, so
    // the name hangs just over the hair.
    for (const p of inside) {
      const c = byId.get(p.id);
      const place = placeAt(p.x);
      if (c && place) nameTag(g, c.name, p.x, place.window.y + place.window.h + 14, p.alpha, p.id === world?.king?.id);
    }
    for (const p of people) {
      const c = byId.get(p.id);
      const s = sleepSide(p.x);
      const king = p.id === world?.king?.id;
      // Kneeling, or seated on the throne: the name comes down with the head
      const tall = tallOf(shown.get(p.id)?.img) * (p.anim === WANIM.pray ? 0.66 : p.anim === WANIM.sit && p.dir === 1 ? 0.86 : 1);
      // Over at the castle only the King keeps a name: the others' fade out as they cross the bridge,
      // and back in as they cross it home
      const nameAlpha = king ? p.alpha : p.alpha * Math.max(0, Math.min(1, (CROSSING.x1 - p.x) / (CROSSING.x1 - CROSSING.x0)));
      if (c && nameAlpha > 0) nameTag(g, c.name, p.anim === WANIM.sleep ? p.x + s * 36 : p.x, p.anim === WANIM.sleep ? p.y - 26 : p.y - p.lift - tall - 14, nameAlpha, king);
      if (p.anim === WANIM.sleep) drawZzz(g, p.x + s * 58, p.y - 4, now, p.alpha);
    }
    g.restore();
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
    drawCharacter(g, sheetsOf(img), img, BODY.centerX * SPRITE_SCALE, BODY.feetY * SPRITE_SCALE, pose, 0);
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
  <button type="button" class="speed" class:on={speed > 1} aria-label="Town speed {speed} times" onclick={faster}>
    <FastForward size={18} />{speed}×
  </button>
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
  /* The town's speed, top right: quiet at real speed, lit while sped up */
  .speed {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--surface) 80%, transparent);
    color: var(--text-dim);
    font: 600 14px var(--font-body);
    cursor: pointer;
    opacity: 0.75;
  }
  .speed.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
    opacity: 1;
  }
</style>
