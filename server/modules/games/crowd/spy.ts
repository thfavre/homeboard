import {
  ANIM,
  CASE_RADIUS,
  FLASHBANG_MS,
  SMOKE_MS,
  SPY_AREA,
  SPY_CASES,
  SPY_GADGETS,
  SPY_OBSTACLES,
  SPY_POINTS,
  SUIT_LOOKS,
  SPY_WALK_UPS,
  walkSpeed,
  type CrowdEvent,
  type CrowdFrame,
  type CrowdKill,
  type SpyGadget,
  type SpyMe,
  type SpyView,
} from '../../../../shared/crowd.ts';
import { shuffle, type GameFactory } from '../engine.ts';
import { TICK_MS, aimOut, blocked, dealLooks, dirOf, hitTest, keepOut, moveAim, newActor, newAim, pack, pick, rand, stick, type Actor, type Aim } from './sim.ts';

/** The spy picks a gadget and finds their character this long before the snipers can shoot */
const PICK_MS = 12_000;
/** The end of a round stays this long: who the spy was, how it ended, the points (time to take it in) */
const REVEAL_MS = 14_000;
/** A stick pushed less than this is let go */
const DEAD_ZONE = 0.35;
/** A decoy jumps at least this far away when it can */
const DECOY_MIN_DIST = 320;

/**
 * Spy Hunt: one player is the spy, hidden in a crowd wandering at random; every other player holds a
 * sniper. The spy walks like everyone else and touches the suitcases in the corners: each one opens a few
 * seconds after being touched. Snipers have a few shots and can draw on the TV to point out suspects. The
 * spy has one gadget a round. Each round has a new spy; points add up over the rounds.
 */
export const spyHunt: GameFactory = (m) => {
  const s = m.settings;
  const walk = walkSpeed(s.spyWalk, SPY_WALK_UPS);
  const rounds = Math.max(1, s.spyRounds);
  const huntMs = Math.max(1, s.spyMinutes) * 60_000;
  const reloadMs = Math.max(0, s.spyReloadSec) * 1000;
  const needed = Math.min(SPY_CASES.length, Math.max(1, s.spyNeeded));
  const delay = () => rand(Math.min(s.spyCollectMin, s.spyCollectMax), Math.max(s.spyCollectMin, s.spyCollectMax)) * 1000;
  const gadgets = (s.spyGadgets ?? []).filter((g) => SPY_GADGETS.some((x) => x.id === g));
  const ids = m.players.map((p) => p.id);
  // Every player is the spy in turn (in a random order), round after round
  const order = shuffle(ids);

  let step: SpyView['step'] = 'pick';
  let round = 0;
  let until = 0;
  let spy = order[0];
  let spyActor: Actor | null = null;
  let actors: Actor[] = [];
  let looks: number[] = [];
  const aims = new Map<string, Aim>();
  let push = { x: 0, y: 0 };
  let cases: { x: number; y: number; open: boolean; at: number | null }[] = [];
  let gadget: SpyGadget | null = null;
  let used: SpyGadget | null = null;
  let smoke: SpyView['smoke'] = null;
  let blindUntil = 0;
  const points: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  let kills: CrowdKill[] = [];
  let outcome: SpyView['outcome'] = null;
  let shooter: string | null = null;
  let events: CrowdEvent[] = [];
  let over = false;
  let last = Date.now();

  const snipers = () => ids.filter((id) => id !== spy);

  const newRound = () => {
    const now = Date.now();
    round += 1;
    step = 'pick';
    until = now + PICK_MS;
    spy = order[(round - 1) % order.length];
    kills = [];
    outcome = null;
    shooter = null;
    gadget = null;
    used = null;
    smoke = null;
    blindUntil = 0;
    push = { x: 0, y: 0 };
    cases = SPY_CASES.map((c) => ({ ...c, open: false, at: null }));
    const n = Math.max(1, s.spyNpcs + 1);
    looks = dealLooks(n, Math.min(SUIT_LOOKS, Math.max(1, s.spyLooks)));
    actors = looks.map((look, i) => {
      // Nobody starts inside the fountain or a tree
      let x = rand(SPY_AREA.x0, SPY_AREA.x1);
      let y = rand(SPY_AREA.y0, SPY_AREA.y1);
      for (let k = 0; k < 20 && blocked(x, y, SPY_OBSTACLES, 12); k++) {
        x = rand(SPY_AREA.x0, SPY_AREA.x1);
        y = rand(SPY_AREA.y0, SPY_AREA.y1);
      }
      const a = newActor(i, look, x, y, pick([0, 1, 2, 3] as const));
      // The crowd comes to life a little at a time
      a.next = now + rand(0, 2500);
      a.tx = a.x;
      a.ty = a.y;
      return a;
    });
    actors.sort((a, b) => a.y - b.y).forEach((a, i) => (a.i = i));
    // The spy starts away from the suitcases, so the first one is not too easy
    const away = actors.filter((a) => SPY_CASES.every((c) => Math.hypot(a.x - c.x, a.y - c.y) > 260));
    spyActor = pick(away.length ? away : actors);
    spyActor.player = spy;
    aims.clear();
    for (const id of snipers()) aims.set(id, newAim(id, until, Math.max(1, s.spyShots)));
    m.publish();
  };

  const endRound = (why: NonNullable<SpyView['outcome']>, by: string | null = null) => {
    if (step === 'reveal') return;
    const now = Date.now();
    step = 'reveal';
    until = now + REVEAL_MS;
    outcome = why;
    shooter = by;
    if (why === 'cases' || why === 'ammo') points[spy] += SPY_POINTS.escape;
    else if (why === 'shot' && by) points[by] += SPY_POINTS.kill;
    else if (why === 'time') for (const id of snipers()) points[id] += SPY_POINTS.time;
    smoke = null;
    for (const a of actors) {
      if (!a.alive) continue;
      a.anim = a === spyActor && why !== 'time' ? ANIM.win : ANIM.idle;
      a.dir = 2;
    }
    for (const a of aims.values()) {
      a.sx = a.sy = a.vx = a.vy = 0;
      a.draw = false;
    }
    events.push({ k: 'end' });
    const color = m.players.find((p) => p.id === (why === 'shot' ? by : spy))?.color;
    if (why !== 'time' && color) m.flash('win', { color });
    m.publish();
  };

  const finishGame = () => {
    if (over) return;
    over = true;
    m.watchLights(false);
    const top = Math.max(0, ...ids.map((id) => points[id]));
    const winners = top > 0 ? ids.filter((id) => points[id] === top) : [];
    m.finish({
      winners,
      lines: [...ids]
        .sort((a, b) => points[b] - points[a])
        .map((id) => ({ id, label: `${points[id]} ${points[id] === 1 ? 'point' : 'points'}` })),
    });
  };

  /** Passers-by: walk somewhere at random, look around a while, walk again; now and then a stop on the way */
  const think = (a: Actor, now: number) => {
    const close = Math.hypot(a.tx - a.x, a.ty - a.y) < 6;
    if (a.moving && !close && now < a.next) return;
    if (!a.moving && now < a.next) return;
    if (a.moving) {
      a.moving = false;
      a.next = now + (close ? rand(600, 4500) : rand(500, 1500));
      if (close && Math.random() < 0.6) a.dir = pick([0, 1, 2, 3] as const);
      return;
    }
    a.moving = true;
    if (Math.hypot(a.tx - a.x, a.ty - a.y) < 6 || Math.random() < 0.5) {
      // Somewhere new: often not far, sometimes across the square
      const far = Math.random() < 0.35;
      const r = far ? 900 : rand(120, 420);
      // Not inside the fountain or a tree: another spot then
      for (let k = 0; k < 12; k++) {
        a.tx = Math.min(SPY_AREA.x1, Math.max(SPY_AREA.x0, a.x + rand(-r, r)));
        a.ty = Math.min(SPY_AREA.y1, Math.max(SPY_AREA.y0, a.y + rand(-r, r) * 0.6));
        if (!blocked(a.tx, a.ty, SPY_OBSTACLES, 16)) break;
      }
    }
    // A stop on the way, once in a while
    a.next = now + (Math.random() < 0.25 ? rand(1500, 4000) : 60_000);
  };

  const walkTo = (a: Actor, dx: number, dy: number, dt: number) => {
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;
    const d = Math.min(len, walk * dt);
    a.x = Math.min(SPY_AREA.x1, Math.max(SPY_AREA.x0, a.x + (dx / len) * d));
    a.y = Math.min(SPY_AREA.y1, Math.max(SPY_AREA.y0, a.y + (dy / len) * d));
    a.dir = dirOf(dx, dy);
    // Bumped into the fountain, a tree or a lamp: stay at its edge. A passer-by changes its mind
    if (keepOut(a, SPY_OBSTACLES) && a.player === null) {
      a.moving = false;
      a.next = Date.now() + rand(300, 1200);
    }
  };

  const tick = () => {
    if (over) return;
    const now = Date.now();
    const dt = Math.min(0.2, (now - last) / 1000);
    last = now;
    if (step === 'pick' && now >= until) {
      step = 'hunt';
      until = now + huntMs;
      // No gadget picked in time: one is drawn for the spy
      if (!gadget && gadgets.length) gadget = pick(gadgets);
      events.push({ k: 'go' });
      m.publish();
    }
    if (step !== 'reveal') {
      for (const a of actors) {
        if (!a.alive) continue;
        if (a === spyActor) {
          const len = Math.hypot(push.x, push.y);
          if (len > DEAD_ZONE) {
            walkTo(a, push.x * 1000, push.y * 1000, dt);
            a.anim = ANIM.walk;
          } else a.anim = ANIM.idle;
          continue;
        }
        think(a, now);
        if (a.moving) {
          walkTo(a, a.tx - a.x, a.ty - a.y, dt);
          a.anim = ANIM.walk;
        } else a.anim = ANIM.idle;
      }
    }
    if (step === 'hunt') {
      const blind = now < blindUntil;
      for (const a of aims.values()) if (!blind) moveAim(a, dt);
      if (smoke && now > smoke.until) {
        smoke = null;
        m.publish();
      }
      // Suitcases: touched by the spy, open a few seconds later
      for (const [i, c] of cases.entries()) {
        if (c.open) continue;
        if (c.at === null && spyActor && Math.hypot(spyActor.x - c.x, spyActor.y - c.y) < CASE_RADIUS) c.at = now + delay();
        if (c.at !== null && now >= c.at) {
          c.open = true;
          events.push({ k: 'case', i });
          m.flash('gold');
          m.publish();
        }
      }
      if (cases.filter((c) => c.open).length >= needed) endRound('cases');
      else if (now >= until) endRound('time');
    } else if (step === 'pick') {
      for (const a of aims.values()) moveAim(a, dt);
    }
    if (step === 'reveal' && now >= until) {
      if (round >= rounds) {
        finishGame();
        return;
      }
      newRound();
      return;
    }
    const blind = now < blindUntil;
    const frame: CrowdFrame = {
      t: now,
      r: round,
      a: pack(actors),
      aims: step === 'reveal' ? [] : [...aims.values()].map((a) => aimOut(a, step === 'hunt' && !blind && a.shots > 0 && now >= a.readyAt)),
      ev: events,
    };
    m.tv('crowd', frame);
    events = [];
  };

  const fire = (id: string) => {
    const now = Date.now();
    const a = aims.get(id);
    if (!a || step !== 'hunt') return { hit: null, shots: a?.shots ?? 0 };
    if (now < blindUntil) return { hit: null, shots: a.shots, blind: true };
    if (a.shots <= 0 || now < a.readyAt) return { hit: null, shots: a.shots, wait: Math.max(0, a.readyAt - now) };
    a.shots -= 1;
    a.readyAt = now + reloadMs;
    const target = hitTest(actors, a.x, a.y);
    events.push({ k: 'shot', by: id, x: Math.round(a.x), y: Math.round(a.y), hit: target?.i ?? -1 });
    m.flash('shot');
    if (target) {
      target.alive = false;
      target.anim = ANIM.dead;
      kills.push({ at: now, by: id, victim: target.player });
      events.push({ k: 'kill', actor: target.i, by: id, victim: target.player });
      if (target === spyActor) {
        m.flash('kill');
        endRound('shot', id);
        return { hit: 'spy', shots: a.shots };
      }
    }
    // Every sniper out of shots and the spy still walking: the spy gets away
    if ([...aims.values()].every((x) => x.shots <= 0)) endRound('ammo');
    m.publish();
    return { hit: target ? 'npc' : 'miss', shots: a.shots };
  };

  const useGadget = () => {
    if (step !== 'hunt' || !gadget || used || !spyActor) return false;
    const now = Date.now();
    used = gadget;
    const at = spyActor;
    if (gadget === 'flashbang') {
      blindUntil = now + FLASHBANG_MS;
      for (const a of aims.values()) a.draw = false;
      m.flash('flashbang', { ms: FLASHBANG_MS });
      events.push({ k: 'gadget', g: 'flashbang', x: Math.round(at.x), y: Math.round(at.y) });
    } else if (gadget === 'smoke') {
      smoke = { x: Math.round(at.x), y: Math.round(at.y - 30), until: now + SMOKE_MS };
      m.flash('smoke', { ms: SMOKE_MS });
      events.push({ k: 'gadget', g: 'smoke', x: smoke.x, y: smoke.y });
    } else {
      // The spy jumps into someone else, far if possible; the body left behind falls as if shot
      const others = actors.filter((a) => a.alive && a !== at);
      const far = others.filter((a) => Math.hypot(a.x - at.x, a.y - at.y) > DECOY_MIN_DIST);
      const next = pick(far.length ? far : others);
      if (!next) return false;
      at.alive = false;
      at.anim = ANIM.dead;
      at.player = null;
      next.player = spy;
      next.moving = false;
      spyActor = next;
      push = { x: 0, y: 0 };
      m.flash('kill');
      events.push({ k: 'gadget', g: 'decoy', x: Math.round(at.x), y: Math.round(at.y), actor: at.i });
    }
    m.publish();
    return true;
  };

  const me = (id: string): SpyMe => ({ role: id === spy ? 'spy' : 'sniper', gadget: id === spy ? gadget : null, used: !!used });

  return {
    start() {
      m.watchLights(true);
      newRound();
      m.every(TICK_MS, tick);
    },

    input(id, args) {
      switch (args?.t) {
        case 'me':
          return me(id);
        case 'move':
          if (id === spy) push = stick(args);
          return true;
        case 'pick': {
          const g = String(args?.g ?? '') as SpyGadget;
          if (id !== spy || step !== 'pick' || !gadgets.includes(g)) return me(id);
          gadget = g;
          m.publish();
          return me(id);
        }
        case 'gadget':
          return id === spy ? { ok: useGadget(), ...me(id) } : me(id);
        case 'aim': {
          const a = aims.get(id);
          if (a) Object.assign(a, ((v) => ({ sx: v.x, sy: v.y }))(stick(args)));
          return true;
        }
        case 'draw': {
          const a = aims.get(id);
          if (a) a.draw = !!args?.on && step === 'hunt' && Date.now() >= blindUntil;
          return true;
        }
        case 'fire':
          return fire(id);
        default:
          return true;
      }
    },

    skip() {
      if (step !== 'hunt') until = Date.now();
    },

    view(role): SpyView {
      const readyAt: Record<string, number> = {};
      const shots: Record<string, number> = {};
      for (const a of aims.values()) {
        readyAt[a.id] = a.readyAt;
        shots[a.id] = a.shots;
      }
      return {
        step,
        round,
        rounds,
        until,
        huntMs,
        spy,
        ...(role === 'tv' ? { looks: actors.map((a) => a.look) } : {}),
        cases: cases.map(({ x, y, open }) => ({ x, y, open })),
        needed,
        shots,
        readyAt,
        reloadMs,
        gadget: { picked: !!gadget, used },
        smoke,
        blindUntil,
        points,
        kills,
        outcome,
        shooter,
        ...(step === 'reveal' && spyActor ? { reveal: spyActor.i } : {}),
        drawFadeMs: Math.max(1, s.spyDrawFadeSec) * 1000,
        soundVolume: s.sniperSounds,
      };
    },
  };
};
