import { SPRITE_SCALE, WORLD } from '$shared/crowd.ts';
import type { Env } from './scene.ts';

/**
 * Everything on the crowd field that is not a character: particles (smoke, dust, sparks, the muzzle
 * flash...), the screen shaking on a shot, cloud shadows drifting over the ground, and pigeons that peck
 * around and fly off when someone comes close or a shot lands near them. All in world units.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------ soft puff textures

/** A soft, slightly lumpy round puff, white, made once and tinted by drawing it with a color below */
let puffTexture: HTMLCanvasElement | null = null;
function puff(): HTMLCanvasElement {
  if (puffTexture) return puffTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // A few blobs on top of each other: a cloud, not a perfect disc
  for (let k = 0; k < 9; k++) {
    const x = 64 + rand(-18, 18);
    const y = 64 + rand(-18, 18);
    const r = rand(28, 46);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  puffTexture = c;
  return c;
}

/** The puff in a color (cached per color) */
const tinted = new Map<string, HTMLCanvasElement>();
function puffIn(color: string): HTMLCanvasElement {
  let c = tinted.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.drawImage(puff(), 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  tinted.set(color, c);
  return c;
}

// ------------------------------------------------------------ particles

type Kind = 'smoke' | 'dust' | 'spark' | 'flash' | 'ring' | 'bit' | 'gold' | 'text';

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds lived and to live */
  age: number;
  life: number;
  size: number;
  grow: number;
  rot: number;
  spin: number;
  color: string;
  alpha: number;
  gravity: number;
  drag: number;
  text?: string;
  /** Drawn over the characters (smoke, flash) or under them (dust on the ground) */
  over: boolean;
}

export interface Cloud {
  x: number;
  y: number;
  until: number;
}

export class Effects {
  particles: Particle[] = [];
  private shakeUntil = 0;
  private shakePower = 0;
  /** Smoke clouds still giving off puffs */
  private smokes: { x: number; y: number; from: number; until: number; next: number }[] = [];

  private add(p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y' | 'life'>) {
    this.particles.push({ vx: 0, vy: 0, age: 0, size: 10, grow: 0, rot: rand(0, Math.PI * 2), spin: 0, color: '#fff', alpha: 1, gravity: 0, drag: 0, over: true, ...p });
    if (this.particles.length > 1400) this.particles.splice(0, this.particles.length - 1400);
  }

  shake(power: number, ms: number) {
    const now = performance.now();
    if (now + ms > this.shakeUntil || power > this.shakePower) {
      this.shakeUntil = now + ms;
      this.shakePower = Math.max(power, now < this.shakeUntil ? this.shakePower : 0);
    }
  }

  /** How far the field is moved this frame (a quick tremble that dies out) */
  offset(): { x: number; y: number } {
    const left = this.shakeUntil - performance.now();
    if (left <= 0) {
      this.shakePower = 0;
      return { x: 0, y: 0 };
    }
    const k = this.shakePower * Math.min(1, left / 200);
    return { x: rand(-k, k), y: rand(-k, k) };
  }

  /** A shot: the flash at the crosshair, a ring, and dust and sparks where it lands */
  shot(x: number, y: number, hit: boolean) {
    this.add({ kind: 'flash', x, y, life: 0.09, size: 46 });
    this.add({ kind: 'ring', x, y, life: 0.45, size: 12, grow: 150, color: '#ffffff' });
    for (let k = 0; k < 10; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(160, 420);
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: rand(0.15, 0.35), size: rand(2, 3.5), color: '#ffe9a0', drag: 4, gravity: 600 });
    }
    if (!hit) for (let k = 0; k < 6; k++) this.add({ kind: 'dust', x: x + rand(-8, 8), y: y + rand(-4, 4), vx: rand(-40, 40), vy: rand(-50, -10), life: rand(0.6, 1.1), size: rand(10, 18), grow: 30, color: '#9c8f80', alpha: 0.6, drag: 2, over: false });
    this.shake(5, 180);
  }

  /** Someone falls: dust from the ground, and a few dark bits */
  fall(x: number, y: number, player: boolean) {
    for (let k = 0; k < 8; k++) this.add({ kind: 'dust', x: x + rand(-20, 20), y: y + rand(-6, 4), vx: rand(-60, 60), vy: rand(-30, 0), life: rand(0.7, 1.3), size: rand(12, 22), grow: 26, color: '#8d8274', alpha: 0.55, drag: 2.5, over: false });
    for (let k = 0; k < (player ? 14 : 7); k++) {
      const a = rand(-Math.PI, 0);
      const v = rand(80, 220);
      this.add({ kind: 'bit', x, y: y - 50, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.8), size: rand(3, 5), color: player ? '#c4162a' : '#8a1020', gravity: 700, drag: 1 });
    }
    if (player) this.shake(9, 260);
  }

  /** A suitcase opens: gold sparkles rising and a "+1" */
  gold(x: number, y: number) {
    for (let k = 0; k < 26; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(30, 160);
      this.add({ kind: 'gold', x: x + rand(-10, 10), y: y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, life: rand(0.7, 1.4), size: rand(2.5, 4.5), color: Math.random() < 0.5 ? '#ffd35a' : '#fff3b0', drag: 1.5, gravity: -40 });
    }
    this.add({ kind: 'text', x, y: y - 50, vy: -40, life: 1.4, size: 26, color: '#ffd35a', text: '+1' });
  }

  /** A shot in a tree: leaves twirling down */
  leaves(x: number, y: number) {
    for (let k = 0; k < 14; k++) {
      this.add({ kind: 'bit', x: x + rand(-30, 30), y: y + rand(-20, 20), vx: rand(-60, 60), vy: rand(-40, 20), life: rand(1.2, 2.2), size: rand(4, 6), color: Math.random() < 0.5 ? '#4f8a2e' : '#79b03a', gravity: 90, drag: 2.5 });
    }
  }

  /** A lamp shot: its glass bursts in glints */
  glass(x: number, y: number) {
    for (let k = 0; k < 16; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(60, 220);
      this.add({ kind: 'gold', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: rand(0.5, 0.9), size: rand(2.5, 4), color: Math.random() < 0.5 ? '#e8f4ff' : '#ffe2a0', gravity: 500, drag: 1 });
    }
  }

  /** The fountain shot: a splash */
  splash(x: number, y: number) {
    for (let k = 0; k < 18; k++) {
      const a = rand(-Math.PI, 0);
      const v = rand(80, 260);
      this.add({ kind: 'bit', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.8), size: rand(3, 5), color: Math.random() < 0.5 ? '#7fd3f0' : '#d6f4ff', gravity: 700, drag: 0.8 });
    }
    this.add({ kind: 'ring', x, y, life: 0.5, size: 8, grow: 90, color: '#bfeeff' });
  }

  /** The flashbang: a big ring and a hard shake */
  flashbang(x: number, y: number) {
    this.add({ kind: 'ring', x, y, life: 0.7, size: 20, grow: 1400, color: '#ffffff' });
    this.shake(16, 500);
  }

  /** Smoke: a burst now, then puffs keep coming from it until it clears */
  smoke(x: number, y: number, ms: number) {
    const now = performance.now();
    this.smokes.push({ x, y, from: now, until: now + ms, next: now });
    for (let k = 0; k < 40; k++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(60, 230);
      this.add({ kind: 'smoke', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, life: rand(2.4, 4), size: rand(40, 70), grow: rand(25, 50), spin: rand(-0.4, 0.4), color: '#c9cbd2', alpha: 0.85, drag: 1.6 });
    }
    this.shake(4, 200);
  }

  /** Move everything by `dt` seconds */
  update(dt: number) {
    const now = performance.now();
    // The smoke keeps coming while it lasts: puffs rolling out of the middle, slow
    this.smokes = this.smokes.filter((s) => now < s.until);
    for (const s of this.smokes) {
      const fading = s.until - now < 1600;
      while (s.next < now) {
        s.next += fading ? 140 : 45;
        const a = rand(0, Math.PI * 2);
        const r = rand(0, 120);
        this.add({
          kind: 'smoke',
          x: s.x + Math.cos(a) * r,
          y: s.y + Math.sin(a) * r * 0.7,
          vx: Math.cos(a) * rand(5, 30),
          vy: Math.sin(a) * rand(5, 25) - 6,
          life: rand(2.2, 3.6),
          size: rand(55, 90),
          grow: rand(10, 25),
          spin: rand(-0.3, 0.3),
          color: Math.random() < 0.5 ? '#c4c6ce' : '#b4b7c0',
          alpha: 0.8,
          drag: 0.6,
        });
      }
    }
    for (const p of this.particles) {
      p.age += dt;
      p.vx -= p.vx * Math.min(1, p.drag * dt);
      p.vy -= p.vy * Math.min(1, p.drag * dt);
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  /** Draw the particles under (`over` false) or over the characters */
  draw(g: CanvasRenderingContext2D, over: boolean, font: string) {
    for (const p of this.particles) {
      if (p.over !== over) continue;
      const t = p.age / p.life;
      switch (p.kind) {
        case 'smoke':
        case 'dust': {
          // Fades in quickly, out slowly
          const a = p.alpha * Math.min(1, t / 0.12) * (1 - t) ** 1.2;
          if (a <= 0.01) break;
          g.save();
          g.globalAlpha = a;
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.drawImage(puffIn(p.color), -p.size, -p.size, p.size * 2, p.size * 2);
          g.restore();
          break;
        }
        case 'flash': {
          const a = 1 - t;
          const r = p.size * (0.6 + t);
          const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          grad.addColorStop(0, `rgba(255,255,240,${a})`);
          grad.addColorStop(0.3, `rgba(255,220,120,${a * 0.8})`);
          grad.addColorStop(1, 'rgba(255,160,40,0)');
          g.fillStyle = grad;
          g.beginPath();
          g.arc(p.x, p.y, r, 0, Math.PI * 2);
          g.fill();
          // Four sharp rays
          g.fillStyle = `rgba(255,255,230,${a})`;
          g.fillRect(p.x - r * 1.3, p.y - 1.5, r * 2.6, 3);
          g.fillRect(p.x - 1.5, p.y - r * 1.3, 3, r * 2.6);
          break;
        }
        case 'ring': {
          g.strokeStyle = p.color;
          g.globalAlpha = (1 - t) * 0.9;
          g.lineWidth = Math.max(1, 6 * (1 - t));
          g.beginPath();
          g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'spark': {
          g.strokeStyle = p.color;
          g.globalAlpha = 1 - t;
          g.lineWidth = p.size;
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'bit':
        case 'gold': {
          g.fillStyle = p.color;
          g.globalAlpha = p.kind === 'gold' ? (1 - t) * (0.6 + 0.4 * Math.sin(p.age * 30)) : 1 - t * t;
          g.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
          g.globalAlpha = 1;
          break;
        }
        case 'text': {
          g.globalAlpha = Math.min(1, (1 - t) * 2);
          g.font = `${p.size}px ${font}`;
          g.textAlign = 'center';
          g.fillStyle = '#000';
          g.fillText(p.text ?? '', p.x + 3, p.y + 3);
          g.fillStyle = p.color;
          g.fillText(p.text ?? '', p.x, p.y);
          g.globalAlpha = 1;
          break;
        }
      }
    }
  }
}

// ------------------------------------------------------------ cloud shadows

/** Soft shadows of clouds drifting slowly over the ground, so the place feels outdoors and alive */
export class CloudShadows {
  private clouds = Array.from({ length: 4 }, (_, k) => ({ x: rand(-200, WORLD.w), y: rand(100, WORLD.h), r: rand(180, 320), speed: rand(9, 16), k }));

  update(dt: number) {
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      c.y -= c.speed * 0.25 * dt;
      if (c.x - c.r * 1.6 > WORLD.w || c.y + c.r < 0) {
        c.x = -c.r * 1.6;
        c.y = rand(200, WORLD.h + 100);
        c.r = rand(180, 320);
      }
    }
  }

  draw(g: CanvasRenderingContext2D) {
    for (const c of this.clouds) {
      g.save();
      g.globalAlpha = 0.16;
      g.translate(c.x, c.y);
      g.scale(1.6, 1);
      g.drawImage(puffIn('#0a0c18'), -c.r, -c.r, c.r * 2, c.r * 2);
      g.restore();
    }
  }
}

// ------------------------------------------------------------ pigeons

interface Pigeon {
  x: number;
  y: number;
  dir: 1 | -1;
  /** walk, peck, fly away (off the screen), land (coming back) */
  state: 'idle' | 'walk' | 'fly' | 'land';
  next: number;
  vx: number;
  vy: number;
  /** Height above the ground when flying */
  z: number;
  tx: number;
  ty: number;
  shade: number;
}

/**
 * Pigeons on the ground: they walk a few steps, peck, and fly off when a person walks close or a shot
 * lands near them; a while later they come back and land somewhere else. Drawn in pixels, like the rest.
 */
export class Pigeons {
  private birds: Pigeon[] = [];

  constructor(
    count: number,
    private area: { x0: number; x1: number; y0: number; y1: number },
  ) {
    for (let k = 0; k < count; k++) this.birds.push(this.newBird(true));
  }

  private newBird(onGround: boolean): Pigeon {
    const x = rand(this.area.x0, this.area.x1);
    const y = rand(this.area.y0, this.area.y1);
    return { x, y, dir: Math.random() < 0.5 ? 1 : -1, state: onGround ? 'idle' : 'land', next: performance.now() + rand(300, 3000), vx: 0, vy: 0, z: onGround ? 0 : 400, tx: x, ty: y, shade: rand(0, 1) };
  }

  /** Startle the birds within `r` of (x, y) */
  scare(x: number, y: number, r: number) {
    for (const b of this.birds) {
      if (b.state === 'fly' || Math.hypot(b.x - x, b.y - y) > r) continue;
      b.state = 'fly';
      const away = Math.atan2(b.y - y, b.x - x) + rand(-0.5, 0.5);
      b.vx = Math.cos(away) * rand(260, 380);
      b.vy = Math.sin(away) * rand(150, 250);
      b.dir = b.vx < 0 ? -1 : 1;
    }
  }

  /** `people`: where the characters are (x, y pairs), to fly off when someone walks up */
  update(dt: number, people: { x: number; y: number }[]) {
    const now = performance.now();
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      if (b.state === 'fly') {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += 220 * dt;
        if (b.x < -100 || b.x > WORLD.w + 100 || b.y + -b.z < -100 || b.y > WORLD.h + 100) {
          // Gone: another one comes to land somewhere after a while
          const nb = this.newBird(false);
          nb.next = now + rand(4000, 12000);
          this.birds[i] = nb;
        }
        continue;
      }
      if (b.state === 'land') {
        if (now < b.next) continue;
        b.z = Math.max(0, b.z - 260 * dt);
        if (!b.z) {
          b.state = 'idle';
          b.next = now + rand(2000, 5000);
        }
        continue;
      }
      // On the ground: someone too close, off it goes
      for (let k = 0; k < people.length; k++) {
        const p = people[k];
        if (Math.abs(p.x - b.x) < 46 && Math.abs(p.y - b.y) < 30) {
          this.scare(b.x, b.y, 1);
          break;
        }
      }
      if (b.state !== 'idle' && b.state !== 'walk') continue;
      if (b.state === 'walk') {
        const dx = b.tx - b.x;
        const dy = b.ty - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 2) {
          b.state = 'idle';
          b.next = now + rand(3000, 8000);
        } else {
          b.x += (dx / d) * 18 * dt;
          b.y += (dy / d) * 18 * dt;
        }
      } else if (now > b.next) {
        b.state = 'walk';
        b.tx = Math.min(this.area.x1, Math.max(this.area.x0, b.x + rand(-30, 30)));
        b.ty = Math.min(this.area.y1, Math.max(this.area.y0, b.y + rand(-14, 14)));
        b.dir = b.tx < b.x ? -1 : 1;
      }
    }
  }

  /**
   * The birds, each with its feet at (x, y): pigeon sprites walking and pecking, black birds flying off.
   * Without the sprites, little drawn birds.
   */
  draw(g: CanvasRenderingContext2D, env: Env | null) {
    const now = performance.now();
    if (env) return this.drawSprites(g, env, now);
    const px = 4;
    for (const b of this.birds) {
      if (b.state === 'land' && now < b.next) continue;
      const flying = b.state === 'fly' || b.z > 0;
      const x = Math.round(b.x);
      const y = Math.round(b.y - b.z);
      // Shadow on the ground
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(Math.round(b.x) - 6, Math.round(b.y) - 1, 12, 3);
      const body = b.shade < 0.5 ? '#8a8f9c' : '#a3a6b0';
      const dark = '#4d5260';
      const d = b.dir;
      // A pixel bird: body, head, tail, legs; pecking bobs the head down
      const peck = b.state === 'idle' && Math.sin(now / 140 + b.shade * 9) > 0.6 ? px : 0;
      const p = (cx: number, cy: number, w: number, h: number, c: string) => {
        g.fillStyle = c;
        g.fillRect(x + (d > 0 ? cx : -cx - w) * px, y + cy * px, w * px, h * px);
      };
      if (flying) {
        const up = Math.sin(now / 50 + b.shade * 10) > 0;
        p(-2, -4, 5, 2, body);
        p(2, -5, 2, 2, dark);
        p(-1, up ? -7 : -3, 3, up ? 3 : 2, '#c9ccd4');
      } else {
        p(-3, -4, 5, 3, body);
        p(-4, -4, 1, 1, dark);
        g.fillStyle = dark;
        g.fillRect(x + (d > 0 ? 2 : -4) * px, y - 6 * px + peck, 2 * px, 2 * px);
        p(-1, -1, 1, 1, '#c8775a');
        p(1, -1, 1, 1, '#c8775a');
      }
    }
  }

  private drawSprites(g: CanvasRenderingContext2D, env: Env, now: number) {
    const size = 32 * SPRITE_SCALE;
    for (const b of this.birds) {
      if (b.state === 'land' && now < b.next) continue;
      const flying = b.state === 'fly' || b.z > 0;
      const x = Math.round(b.x - size / 2);
      const y = Math.round(b.y - b.z - size + 6);
      // Shadow on the ground
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath();
      g.ellipse(b.x, b.y + 2, 7, 3, 0, 0, Math.PI * 2);
      g.fill();
      // Each bird keeps its own sheet, walking or flying: rows 0 and 3 fly to the left and the right,
      // rows 4 and 7 walk to the left and the right (the middle frame stands still)
      const sheet = env[b.shade < 0.4 ? 'bird-brown' : b.shade < 0.75 ? 'bird-black' : 'bird-white'];
      if (flying) {
        const f = Math.floor(now / 70 + b.shade * 10) % 3;
        g.drawImage(sheet, f * 32, (b.dir < 0 ? 0 : 3) * 32, 32, 32, x, y, size, size);
      } else {
        const walking = b.state === 'walk';
        const peck = !walking && Math.sin(now / 200 + b.shade * 9) > 0.8;
        const f = walking ? [0, 1, 2, 1][Math.floor(now / 140 + b.shade * 7) % 4] : peck ? 0 : 1;
        g.drawImage(sheet, f * 32, (b.dir < 0 ? 4 : 7) * 32, 32, 32, x, y, size, size);
      }
    }
  }
}

// ------------------------------------------------------------ a cat

/**
 * A cat on the sidewalk: it lies in the sun, now and then gets up and strolls a little further, and
 * runs off when a shot goes off near it (coming back a while later).
 */
export class Cat {
  private x: number;
  private dir: 1 | -1 = 1;
  private state: 'lie' | 'walk' | 'run' | 'gone' = 'lie';
  private next = performance.now() + rand(6000, 14000);
  private tx = 0;
  private color = Math.floor(rand(0, 4));

  constructor(
    private y: number,
    private x0: number,
    private x1: number,
  ) {
    this.x = rand(x0, x1);
  }

  scare(x: number, y: number, r: number) {
    if (this.state === 'gone' || this.state === 'run' || Math.hypot(this.x - x, this.y - y) > r) return;
    this.state = 'run';
    this.dir = this.x < x ? -1 : 1;
  }

  /** Something hovering over it (a crosshair): it gets up and strolls off, away from it */
  nudge(x: number, y: number, r: number) {
    if ((this.state !== 'lie' && this.state !== 'walk') || Math.abs(this.x - x) > r || Math.abs(this.y - 20 - y) > r) return;
    if (this.state === 'walk' && Math.sign(this.tx - this.x) === Math.sign(this.x - x)) return;
    this.tx = Math.min(this.x1, Math.max(this.x0, this.x + Math.sign(this.x - x || 1) * rand(140, 280)));
    this.dir = this.tx < this.x ? -1 : 1;
    this.state = 'walk';
  }

  update(dt: number) {
    const now = performance.now();
    if (this.state === 'run') {
      this.x += this.dir * 260 * dt;
      if (this.x < -60 || this.x > WORLD.w + 60) {
        this.state = 'gone';
        this.next = now + rand(15000, 30000);
      }
    } else if (this.state === 'gone') {
      if (now > this.next) {
        // Back from a side, strolling in
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.x = this.dir > 0 ? -40 : WORLD.w + 40;
        this.tx = rand(this.x0, this.x1);
        this.state = 'walk';
      }
    } else if (this.state === 'walk') {
      const d = this.tx - this.x;
      if (Math.abs(d) < 2) {
        this.state = 'lie';
        this.next = now + rand(8000, 20000);
      } else this.x += Math.sign(d) * 34 * dt;
    } else if (now > this.next) {
      this.tx = Math.min(this.x1, Math.max(this.x0, this.x + rand(-260, 260)));
      this.dir = this.tx < this.x ? -1 : 1;
      this.state = 'walk';
    }
  }

  draw(g: CanvasRenderingContext2D, env: Env | null) {
    if (!env || this.state === 'gone') return;
    const now = performance.now();
    const size = 32 * SPRITE_SCALE;
    // Rows: 0 to the right (lying in column 3), 3 to the left; four colors side by side
    const row = this.dir > 0 ? 0 : 3;
    const col = this.state === 'lie' ? 3 : Math.floor(now / (this.state === 'run' ? 70 : 140)) % 3;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(this.x, this.y + 1, 14, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(env.cats, (this.color * 4 + col) * 32, row * 32, 32, 32, Math.round(this.x - size / 2), Math.round(this.y - size + 6), size, size);
  }
}
