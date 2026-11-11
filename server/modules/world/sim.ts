import { BENCHES, TOWN, TOWN_AREA, TOWN_OBSTACLES, WANIM, type TownFrame, type WDir } from '../../../shared/world.ts';

/**
 * The life of the town: characters wander the ground band, stop for a while, sit on benches, pet
 * the cat; a guest away for too long walks to the edge, lies down to sleep and slowly fades out.
 * The module ticks it and sends the frames to the TV.
 */

const WALK_UPS = 42;
const CAT_UPS = 26;

/**
 * What a character can go do. An activity is only considered within its viewing distance of the
 * character (0: seen from the whole town) and while it has room: `capacity` characters may do it,
 * or head for it, at once (per bench for the benches).
 */
const ACTIVITIES = {
  petCat: { radius: 300, capacity: 1 },
  bench: { radius: 540, capacity: 1 },
};
/** Two standing characters this close push each other apart (nobody stands on anyone) */
const PERSONAL_SPACE = 34;
/** Close enough to a target to be there */
const ARRIVE = 6;

type Doing =
  | { kind: 'idle'; until: number }
  | { kind: 'wander'; tx: number; ty: number }
  | { kind: 'goBench'; bench: number }
  | { kind: 'sit'; bench: number; until: number }
  | { kind: 'goPet' }
  | { kind: 'pet'; until: number }
  | { kind: 'goSleep'; tx: number; ty: number }
  | { kind: 'sleep' }
  | { kind: 'cheer'; until: number };

interface Walker {
  id: string;
  x: number;
  y: number;
  dir: WDir;
  doing: Doing;
  /** 0..1, fading out while leaving; a walker at 0 is removed */
  alpha: number;
  fading: boolean;
  /** The worn art has no sitting sheets: stays off benches and away from the cat */
  noSit: boolean;
}

export interface RosterEntry {
  id: string;
  online: boolean;
  /** How long they have been away (ms; 0 while online) */
  awayMs: number;
  /** See Walker.noSit */
  noSit?: boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Inside an obstacle on the square (the fountain, a tree, a lamp post) */
function blocked(x: number, y: number, margin = 0): boolean {
  return TOWN_OBSTACLES.some((o) => ((x - o.x) / (o.rx + margin)) ** 2 + ((y - o.y) / (o.ry + margin)) ** 2 < 1);
}

/** Push a character out of the obstacle it walked into, to its edge */
function keepOut(a: { x: number; y: number }): void {
  for (const o of TOWN_OBSTACLES) {
    const nx = (a.x - o.x) / o.rx;
    const ny = (a.y - o.y) / o.ry;
    const d = Math.hypot(nx, ny);
    if (d >= 1 || d === 0) continue;
    a.x = o.x + (nx / d) * o.rx;
    a.y = o.y + (ny / d) * o.ry;
  }
}

/** A free spot on the square */
function randSpot() {
  for (let k = 0; k < 20; k++) {
    const x = rand(TOWN_AREA.x0, TOWN_AREA.x1);
    const y = rand(TOWN_AREA.y0, TOWN_AREA.y1);
    if (!blocked(x, y, 14)) return { x, y };
  }
  return { x: TOWN.w / 2, y: (TOWN_AREA.y0 + TOWN_AREA.y1) / 2 };
}

export class TownSim {
  private walkers = new Map<string, Walker>();
  private cat = { x: 500, y: 760, dir: 3 as WDir, doing: { kind: 'idle', until: 0 } as Doing, petted: false };
  private last = Date.now();

  /** Make a guest's character cheer for a moment (a win, a purchase) */
  cheer(id: string): void {
    const w = this.walkers.get(id);
    if (!w || w.doing.kind === 'sleep' || w.doing.kind === 'goSleep') return;
    w.doing = { kind: 'cheer', until: Date.now() + 2600 };
  }

  /** Advance the town and build the frame for the TV */
  tick(roster: RosterEntry[], sleepAfterMs: number, fadeAfterMs: number): TownFrame {
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;

    const seen = new Set<string>();
    for (const r of roster) {
      seen.add(r.id);
      let w = this.walkers.get(r.id);
      const shouldSleep = !r.online && r.awayMs > sleepAfterMs;
      const shouldFade = !r.online && r.awayMs > sleepAfterMs + fadeAfterMs;
      if (!w) {
        // Faded away (or new): only come back when awake. New arrivals walk in from an edge.
        if (shouldSleep) continue;
        const from = Math.random() < 0.5 ? -20 : TOWN.w + 20;
        const spot = randSpot();
        w = { id: r.id, x: from, y: spot.y, dir: from < 0 ? 3 : 1, doing: { kind: 'wander', tx: spot.x, ty: spot.y }, alpha: 1, fading: false, noSit: !!r.noSit };
        this.walkers.set(r.id, w);
      }
      w.noSit = !!r.noSit;
      // An outfit change mid-sit (or mid-pet) would show missing art: stand up
      if (w.noSit && (w.doing.kind === 'sit' || w.doing.kind === 'goBench' || w.doing.kind === 'pet' || w.doing.kind === 'goPet')) {
        w.doing = { kind: 'idle', until: now + 400 };
      }
      if (shouldSleep && w.doing.kind !== 'sleep' && w.doing.kind !== 'goSleep') {
        // Walk to the nearest edge of the town and lie down there
        const edge = w.x < TOWN.w / 2 ? rand(30, 90) : rand(TOWN.w - 90, TOWN.w - 30);
        w.doing = { kind: 'goSleep', tx: edge, ty: rand(TOWN_AREA.y0 + 40, TOWN_AREA.y1 - 20) };
      }
      if (!shouldSleep && (w.doing.kind === 'sleep' || w.doing.kind === 'goSleep')) {
        w.fading = false;
        w.alpha = 1;
        w.doing = { kind: 'idle', until: now + 600 };
      }
      w.fading = shouldFade;
    }
    for (const [id, w] of this.walkers) {
      if (!seen.has(id)) this.walkers.delete(id);
      else this.step(w, now, dt);
      if (w.fading) {
        w.alpha = Math.max(0, w.alpha - dt / 3);
        if (w.alpha === 0) this.walkers.delete(id);
      }
    }
    this.separate();
    this.stepCat(now, dt);

    const ids: string[] = [];
    const a: number[] = [];
    for (const w of this.walkers.values()) {
      ids.push(w.id);
      a.push(Math.round(w.x), Math.round(w.y), this.animOf(w), w.dir, Math.round(w.alpha * 100));
    }
    const someonePets = [...this.walkers.values()].some((w) => w.doing.kind === 'pet');
    return {
      t: now,
      ids,
      a,
      cat: { x: Math.round(this.cat.x), y: Math.round(this.cat.y), dir: this.cat.dir, walk: this.cat.doing.kind === 'wander' && !someonePets, hearts: someonePets },
    };
  }

  private animOf(w: Walker): number {
    switch (w.doing.kind) {
      case 'wander':
      case 'goBench':
      case 'goPet':
      case 'goSleep':
        return WANIM.walk;
      case 'sit':
        return WANIM.sit;
      case 'sleep':
        return WANIM.sleep;
      case 'pet':
        return WANIM.pet;
      case 'cheer':
        return WANIM.cheer;
      default:
        return WANIM.idle;
    }
  }

  /** Walk toward a point; true when there */
  private walkTo(w: Walker, tx: number, ty: number, speed: number, dt: number): boolean {
    const dx = tx - w.x;
    const dy = ty - w.y;
    const d = Math.hypot(dx, dy);
    if (d < ARRIVE) return true;
    const step = Math.min(d, speed * dt);
    w.x += (dx / d) * step;
    w.y += (dy / d) * step;
    w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : dy > 0 ? 2 : 0;
    return false;
  }

  private step(w: Walker, now: number, dt: number): void {
    const d = w.doing;
    switch (d.kind) {
      case 'wander':
        if (this.walkTo(w, d.tx, d.ty, WALK_UPS, dt)) {
          w.dir = Math.random() < 0.7 ? 2 : w.dir;
          w.doing = { kind: 'idle', until: now + rand(2000, 9000) };
        }
        break;
      case 'idle': {
        if (now < d.until) break;
        const roll = Math.random();
        const all = [...this.walkers.values()];
        // Benches this character can see with a seat left (sitting there, or walking to it, takes the seat)
        const benches = w.noSit
          ? []
          : BENCHES.map((b, i) => ({ ...b, i })).filter(
              (b) =>
                Math.hypot(b.x - w.x, b.y - w.y) < ACTIVITIES.bench.radius &&
                all.filter((o) => (o.doing.kind === 'sit' || o.doing.kind === 'goBench') && o.doing.bench === b.i).length < ACTIVITIES.bench.capacity,
            );
        const petters = all.filter((o) => o.doing.kind === 'pet' || o.doing.kind === 'goPet').length;
        const catInSight = !w.noSit && petters < ACTIVITIES.petCat.capacity && Math.hypot(this.cat.x - w.x, this.cat.y - w.y) < ACTIVITIES.petCat.radius;
        if (roll < 0.14 && benches.length) {
          const b = benches[Math.floor(Math.random() * benches.length)];
          w.doing = { kind: 'goBench', bench: b.i };
        } else if (roll < 0.24 && catInSight) {
          w.doing = { kind: 'goPet' };
        } else {
          const t = randSpot();
          w.doing = { kind: 'wander', tx: t.x, ty: t.y };
        }
        break;
      }
      case 'goBench': {
        const b = BENCHES[d.bench];
        const taken = [...this.walkers.values()].some((o) => o !== w && o.doing.kind === 'sit' && o.doing.bench === d.bench);
        if (!b || taken) {
          w.doing = { kind: 'idle', until: now + rand(300, 1200) };
          break;
        }
        if (this.walkTo(w, b.x, b.y, WALK_UPS, dt)) {
          w.x = b.x;
          w.y = b.y;
          w.dir = 2;
          w.doing = { kind: 'sit', bench: d.bench, until: now + rand(9000, 26_000) };
        }
        break;
      }
      case 'goPet':
        if (this.walkTo(w, this.cat.x - 26, this.cat.y, WALK_UPS, dt)) {
          w.dir = this.cat.x > w.x ? 3 : 1;
          w.doing = { kind: 'pet', until: now + rand(3500, 7000) };
        }
        break;
      case 'pet':
        if (now >= d.until) w.doing = { kind: 'idle', until: now + rand(800, 2500) };
        break;
      case 'sit':
        if (now >= d.until) w.doing = { kind: 'idle', until: now + rand(500, 2000) };
        break;
      case 'goSleep':
        if (this.walkTo(w, d.tx, d.ty, WALK_UPS, dt)) w.doing = { kind: 'sleep' };
        break;
      case 'cheer':
        if (now >= d.until) w.doing = { kind: 'idle', until: now + rand(500, 1500) };
        break;
      case 'sleep':
        break;
    }
  }

  /** Push standing characters apart so nobody overlaps anyone */
  private separate(): void {
    const list = [...this.walkers.values()].filter((w) => w.doing.kind !== 'sit' && w.doing.kind !== 'sleep' && w.doing.kind !== 'pet');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = (b.y - a.y) * 2.2; // Depth counts more: same depth means standing on each other
        const d = Math.hypot(dx, dy);
        if (d >= PERSONAL_SPACE || d === 0) continue;
        const push = ((PERSONAL_SPACE - d) / d) * 0.5;
        a.x = clampX(a.x - dx * push);
        b.x = clampX(b.x + dx * push);
        a.y = clampY(a.y - (dy / 2.2) * push);
        b.y = clampY(b.y + (dy / 2.2) * push);
      }
    }
  }

  private stepCat(now: number, dt: number): void {
    const petted = [...this.walkers.values()].some((w) => w.doing.kind === 'pet' || w.doing.kind === 'goPet');
    const c = this.cat;
    if (petted) return; // It likes it: it stays
    if (c.doing.kind === 'wander') {
      const d = c.doing;
      const dx = d.tx - c.x;
      const dist = Math.abs(dx) + Math.abs(d.ty - c.y);
      if (dist < ARRIVE) {
        c.doing = { kind: 'idle', until: now + rand(4000, 16_000) };
        return;
      }
      const step = Math.min(dist, CAT_UPS * dt);
      const len = Math.hypot(dx, d.ty - c.y) || 1;
      c.x += (dx / len) * step;
      c.y += ((d.ty - c.y) / len) * step;
      c.dir = dx > 0 ? 3 : 1;
    } else if (c.doing.kind === 'idle' && now >= c.doing.until) {
      const t = randSpot();
      c.doing = { kind: 'wander', tx: t.x, ty: t.y };
    }
  }
}

const clampX = (x: number) => Math.max(TOWN_AREA.x0, Math.min(TOWN_AREA.x1, x));
const clampY = (y: number) => Math.max(TOWN_AREA.y0, Math.min(TOWN_AREA.y1, y));
