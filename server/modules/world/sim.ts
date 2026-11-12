import { BENCHES, TOWN, TOWN_AREA, TOWN_OBSTACLES, TOWN_PLACES, WANIM, type PlaceId, type TownFrame, type WDir } from '../../../shared/world.ts';

/**
 * The life of the town: characters wander the ground band, stop for a while, sit on benches, pet
 * the cat; a guest away for too long walks to the edge, lies down to sleep and slowly fades out.
 * When a guest changes their look on the phone, the character walks to the shop for it (clothes or
 * barber) and comes out in the new look. The module ticks it and sends the frames to the TV.
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
/** Room between two characters queueing at a shop door */
const QUEUE_GAP = 36;
/** How far from a door a character fades in or out of it */
const DOOR_FADE = 26;
/** Time inside after the look changes: the TV shows it changing (the barber's cut, the curtain) */
const CHANGE_MS = 3200;

type Doing =
  | { kind: 'idle'; until: number }
  | { kind: 'wander'; tx: number; ty: number }
  | { kind: 'goBench'; bench: number }
  | { kind: 'sit'; bench: number; until: number }
  | { kind: 'goPet' }
  | { kind: 'pet'; until: number }
  | { kind: 'goSleep'; tx: number; ty: number }
  | { kind: 'sleep' }
  | { kind: 'cheer'; until: number }
  | Visit;

/**
 * A trip to a shop: walk to its door, queue if it is full, go in, be seen through the window for a
 * while (the look changes halfway), come out. `seat` is the place inside, `since` when the
 * character joined the queue (first come, first in).
 */
interface Visit {
  kind: 'visit';
  place: PlaceId;
  phase: 'go' | 'queue' | 'enter' | 'inside' | 'exit';
  seat: number;
  since: number;
  until: number;
  dressAt: number;
  dressed: boolean;
}

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
  /** Shops to go to, in order (see RosterEntry.errands) */
  errands: PlaceId[];
  /** The activity already asked to wrap up for a trip (it is asked once) */
  wrapped: Doing | null;
}

/**
 * How an activity ends, for a character with a shop to go to. `left` is how long it would still take
 * on its own (ms). `wrapUp` ends it early and naturally within `ms` (standing up from the bench,
 * stopping a walk); an activity without it cannot be cut short, and the trip waits until it is over.
 * `quickStop` marks a casual activity (wandering, a bench) that is dropped within a moment for a
 * trip, however long it had left. A new activity declares its rule here; going to sleep and cheering
 * respect it too.
 */
interface Rule<D extends Doing> {
  left(d: D, w: Walker, now: number): number;
  wrapUp?(d: D, w: Walker, now: number, ms: number): void;
  quickStop?(d: D, w: Walker, now: number, ms: number): void;
}
type Rules = { [K in Doing['kind']]: Rule<Extract<Doing, { kind: K }>> };

export interface RosterEntry {
  id: string;
  online: boolean;
  /** How long they have been away (ms; 0 while online) */
  awayMs: number;
  /** See Walker.noSit */
  noSit?: boolean;
  /** Shops the character has to visit to look like on the phone (the latest look counts, so one trip each) */
  errands?: PlaceId[];
}

export interface TownOptions {
  /** Away this long: lies down to sleep; this much longer: fades out */
  sleepAfterMs: number;
  fadeAfterMs: number;
  /** How long a character stays inside a shop (ms, a random time in the range) */
  insideMs: [number, number];
  /** Wandering or sitting on a bench is dropped within a random time in this range (ms) */
  quickStopMs: [number, number];
  /** Another activity ending on its own within this is finished before going to the shop */
  finishWithinMs: number;
  /** A longer one is wrapped up within a random time in this range, if it can be cut short */
  wrapUpMs: [number, number];
}

export interface TownHooks {
  /** Halfway through a visit, and again on the way out: the character now wears what its guest picked for this shop */
  dress(id: string, place: PlaceId): void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const idle = (now: number, a: number, b: number): Doing => ({ kind: 'idle', until: now + rand(a, b) });

/** Walking time to a point (ms) */
const walkMs = (w: Walker, x: number, y: number) => (Math.hypot(x - w.x, y - w.y) / WALK_UPS) * 1000;

/** A walk ends naturally anywhere: stop, look around for a moment */
const stopWalking = (_d: Doing, w: Walker, now: number, ms: number) => {
  w.doing = { kind: 'idle', until: now + Math.min(ms, rand(400, 1200)) };
};

/** Stop where you are and stand there for `ms` (the moment before heading off) */
const pauseFor = (_d: Doing, w: Walker, now: number, ms: number) => {
  w.doing = { kind: 'idle', until: now + ms };
};

/** Something with an end time ends a little sooner */
const sooner = (d: { until: number }, _w: Walker, now: number, ms: number) => {
  d.until = Math.min(d.until, now + ms);
};

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

  constructor(private hooks: TownHooks) {}

  private rules: Rules = {
    idle: { left: (d, _w, now) => d.until - now, wrapUp: sooner },
    // Wandering and benches are casual: dropped within a moment when a shop calls
    wander: { left: (d, w) => walkMs(w, d.tx, d.ty), wrapUp: stopWalking, quickStop: pauseFor },
    goBench: { left: (d, w) => walkMs(w, BENCHES[d.bench]?.x ?? w.x, BENCHES[d.bench]?.y ?? w.y), wrapUp: stopWalking, quickStop: pauseFor },
    goPet: { left: (_d, w) => walkMs(w, this.cat.x, this.cat.y), wrapUp: stopWalking },
    // Sitting and petting end whenever: get up a little sooner
    sit: { left: (d, _w, now) => d.until - now, wrapUp: sooner, quickStop: sooner },
    pet: { left: (d, _w, now) => d.until - now, wrapUp: sooner },
    // Never cut short: a cheer is over in a moment, a sleeper wakes when the guest is back, a visit runs its course
    cheer: { left: (d, _w, now) => d.until - now },
    goSleep: { left: () => Infinity },
    sleep: { left: () => Infinity },
    visit: { left: () => Infinity },
  };

  /** The rule of what a character is doing now */
  private rule(w: Walker): Rule<Doing> {
    return this.rules[w.doing.kind] as Rule<Doing>;
  }

  /** Make a guest's character cheer for a moment (a win, a purchase), unless it is busy with something that cannot be cut short */
  cheer(id: string): void {
    const w = this.walkers.get(id);
    if (!w || (!this.rule(w).wrapUp && w.doing.kind !== 'cheer')) return;
    w.doing = { kind: 'cheer', until: Date.now() + 2600 };
  }

  /** Advance the town and build the frame for the TV */
  tick(roster: RosterEntry[], o: TownOptions): TownFrame {
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;

    const seen = new Set<string>();
    for (const r of roster) {
      seen.add(r.id);
      let w = this.walkers.get(r.id);
      const shouldSleep = !r.online && r.awayMs > o.sleepAfterMs;
      const shouldFade = !r.online && r.awayMs > o.sleepAfterMs + o.fadeAfterMs;
      const errands = r.errands ?? [];
      if (!w) {
        // Nobody sees a character that is not in the town: it takes its new look at once
        for (const p of errands) this.hooks.dress(r.id, p);
        // Faded away (or new): only come back when awake. New arrivals walk in from an edge.
        if (shouldSleep) continue;
        const from = Math.random() < 0.5 ? -20 : TOWN.w + 20;
        const spot = randSpot();
        w = { id: r.id, x: from, y: spot.y, dir: from < 0 ? 3 : 1, doing: { kind: 'wander', tx: spot.x, ty: spot.y }, alpha: 1, fading: false, noSit: !!r.noSit, errands: [], wrapped: null };
        this.walkers.set(r.id, w);
        continue;
      }
      w.noSit = !!r.noSit;
      w.errands = errands;
      // An outfit change mid-sit (or mid-pet) would show missing art: stand up
      if (w.noSit && (w.doing.kind === 'sit' || w.doing.kind === 'goBench' || w.doing.kind === 'pet' || w.doing.kind === 'goPet')) {
        w.doing = { kind: 'idle', until: now + 400 };
      }
      // Off to sleep, unless busy with something that cannot be cut short (a shop visit is finished first)
      if (shouldSleep && w.doing.kind !== 'sleep' && w.doing.kind !== 'goSleep' && this.rule(w).wrapUp) {
        // Walk to the nearest edge of the town and lie down there
        const edge = w.x < TOWN.w / 2 ? rand(30, 90) : rand(TOWN.w - 90, TOWN.w - 30);
        w.doing = { kind: 'goSleep', tx: edge, ty: rand(TOWN_AREA.y0 + 40, TOWN_AREA.y1 - 20) };
      }
      if (!shouldSleep && (w.doing.kind === 'sleep' || w.doing.kind === 'goSleep')) {
        w.fading = false;
        w.alpha = 1;
        w.doing = { kind: 'idle', until: now + 600 };
      }
      w.fading = shouldFade && (w.doing.kind === 'sleep' || w.doing.kind === 'goSleep');
    }
    for (const [id, w] of this.walkers) {
      if (!seen.has(id)) {
        // Gone from the party: a place it held in a shop is free again (seats are counted from the walkers)
        this.walkers.delete(id);
        continue;
      }
      this.plan(w, now, o);
      this.step(w, now, dt, o);
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
      const d = w.doing;
      if (d.kind === 'visit' && d.phase === 'inside') {
        // Seen through the shop window: x is the place inside, y the window's bottom
        const p = TOWN_PLACES[d.place];
        a.push(Math.round(p.seats[d.seat]), Math.round(p.window.y + p.window.h), WANIM.inside, this.insideDir(w, d, now), Math.round(w.alpha * 100));
      } else {
        a.push(Math.round(w.x), Math.round(w.y), this.animOf(w), w.dir, Math.round(w.alpha * this.doorAlpha(w) * 100));
      }
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
    const d = w.doing;
    switch (d.kind) {
      case 'wander':
      case 'goBench':
      case 'goPet':
      case 'goSleep':
        return WANIM.walk;
      case 'visit':
        return this.walking(w, d) ? WANIM.walk : WANIM.idle;
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

  private step(w: Walker, now: number, dt: number, o: TownOptions): void {
    const d = w.doing;
    switch (d.kind) {
      case 'visit':
        this.stepVisit(w, d, now, dt, o);
        break;
      case 'wander':
        if (this.walkTo(w, d.tx, d.ty, WALK_UPS, dt)) {
          w.dir = Math.random() < 0.7 ? 2 : w.dir;
          w.doing = { kind: 'idle', until: now + rand(2000, 9000) };
        }
        break;
      case 'idle': {
        if (now < d.until) break;
        // Between two activities: off to the shop first
        if (w.errands.length) {
          w.doing = { kind: 'visit', place: w.errands[0], phase: 'go', seat: -1, since: 0, until: 0, dressAt: 0, dressed: false };
          break;
        }
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

  // ------------------------------------------------------------ shop visits

  /**
   * A character with a shop to go to: wandering or a bench is dropped within a moment; another
   * activity about to end on its own is finished, a longer one wraps up early if it can be cut
   * short, otherwise the trip waits. The trip itself starts from idle, between two activities
   * (see step).
   */
  private plan(w: Walker, now: number, o: TownOptions): void {
    if (!w.errands.length || w.doing.kind === 'visit' || w.wrapped === w.doing) return;
    const d = w.doing;
    const rule = this.rule(w);
    // Standing around: a moment to notice, and off
    if (d.kind === 'idle') rule.wrapUp!(d, w, now, rand(300, 1200));
    else if (rule.quickStop) rule.quickStop(d, w, now, rand(o.quickStopMs[0], o.quickStopMs[1]));
    else if (rule.left(d, w, now) >= o.finishWithinMs && rule.wrapUp) rule.wrapUp(d, w, now, rand(o.wrapUpMs[0], o.wrapUpMs[1]));
    // What it was swapped for (the pause after a walk) already has its time: it is not cut short again
    w.wrapped = w.doing;
  }

  /** The visits of a shop in some phases */
  private visits(place: PlaceId, ...phases: Visit['phase'][]): Visit[] {
    const out: Visit[] = [];
    for (const o of this.walkers.values()) if (o.doing.kind === 'visit' && o.doing.place === place && phases.includes(o.doing.phase)) out.push(o.doing);
    return out;
  }

  /** The queue at a shop's door, first come first */
  private queue(place: PlaceId): Visit[] {
    return this.visits(place, 'queue').sort((a, b) => a.since - b.since);
  }

  /** A free place inside the shop (going in or inside holds one), or -1 */
  private freeSeat(place: PlaceId): number {
    const taken = new Set(this.visits(place, 'enter', 'inside').map((v) => v.seat));
    return TOWN_PLACES[place].seats.findIndex((_, i) => !taken.has(i));
  }

  private stepVisit(w: Walker, d: Visit, now: number, dt: number, o: TownOptions): void {
    const p = TOWN_PLACES[d.place];
    switch (d.phase) {
      case 'go':
      case 'queue': {
        // Changed back on the phone before getting in: no need to go anymore
        if (!w.errands.includes(d.place)) {
          w.doing = idle(now, 300, 900);
          break;
        }
        if (d.phase === 'go') {
          // At the door: in if there is room and nobody waits, else at the end of the queue
          const there = this.walkTo(w, p.front.x, p.front.y + QUEUE_GAP / 2, WALK_UPS, dt);
          if (there || Math.hypot(w.x - p.front.x, w.y - p.front.y) < QUEUE_GAP) {
            const seat = this.freeSeat(d.place);
            if (seat >= 0 && !this.queue(d.place).length) Object.assign(d, { phase: 'enter', seat });
            else Object.assign(d, { phase: 'queue', since: now });
          }
          break;
        }
        const rank = this.queue(d.place).indexOf(d);
        const seat = rank === 0 ? this.freeSeat(d.place) : -1;
        if (seat >= 0) {
          Object.assign(d, { phase: 'enter', seat });
          break;
        }
        // A line down from the door, everyone facing the shop
        if (this.walkTo(w, p.front.x, p.front.y + QUEUE_GAP * (rank + 1), WALK_UPS, dt)) w.dir = 0;
        break;
      }
      case 'enter':
        if (this.walkTo(w, p.door.x, p.door.y, WALK_UPS, dt)) {
          const stay = rand(o.insideMs[0], o.insideMs[1]);
          const dressAt = now + stay * 0.35;
          Object.assign(d, { phase: 'inside', until: Math.max(now + stay, dressAt + CHANGE_MS), dressAt });
        }
        break;
      case 'inside':
        if (!d.dressed && now >= d.dressAt) {
          d.dressed = true;
          this.hooks.dress(w.id, d.place);
        }
        if (now >= d.until) {
          // Once more on the way out: a change made while inside is taken too, without a second trip
          this.hooks.dress(w.id, d.place);
          d.phase = 'exit';
          w.dir = 2;
        }
        break;
      case 'exit':
        // Out, and a step aside from the door to show the new look
        if (this.walkTo(w, p.front.x + (w.id.charCodeAt(0) % 2 ? 40 : -40), p.front.y + 16, WALK_UPS, dt)) {
          w.dir = 2;
          w.doing = idle(now, 1800, 3200);
        }
        break;
    }
  }

  /** On the move during a visit (else standing in the queue) */
  private walking(w: Walker, d: Visit): boolean {
    if (d.phase !== 'queue') return d.phase !== 'inside';
    const p = TOWN_PLACES[d.place];
    const rank = this.queue(d.place).indexOf(d);
    return Math.hypot(w.x - p.front.x, w.y - (p.front.y + QUEUE_GAP * (rank + 1))) >= ARRIVE;
  }

  /** Going through a shop door: faded by how close to it */
  private doorAlpha(w: Walker): number {
    const d = w.doing;
    if (d.kind !== 'visit' || (d.phase !== 'enter' && d.phase !== 'exit')) return 1;
    const p = TOWN_PLACES[d.place];
    return Math.max(0, Math.min(1, Math.hypot(w.x - p.door.x, w.y - p.door.y) / DOOR_FADE));
  }

  /** Facing inside: turning around before the mirror at the clothes shop, still in the barber's chair */
  private insideDir(w: Walker, d: Visit, now: number): WDir {
    if (d.place === 'barber') return 2;
    const turns: WDir[] = [2, 2, 1, 2, 3, 0, 2];
    return turns[Math.floor((now + w.id.charCodeAt(0) * 97) / 800) % turns.length];
  }

  /** Push standing characters apart so nobody overlaps anyone */
  private separate(): void {
    // Not the ones sitting, lying or crouching, nor on a shop's steps (going in, inside, coming out)
    const list = [...this.walkers.values()].filter(
      (w) =>
        w.doing.kind !== 'sit' &&
        w.doing.kind !== 'sleep' &&
        w.doing.kind !== 'pet' &&
        !(w.doing.kind === 'visit' && (w.doing.phase === 'enter' || w.doing.phase === 'inside' || w.doing.phase === 'exit')),
    );
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
