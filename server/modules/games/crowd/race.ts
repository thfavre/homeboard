import { ANIM, RACE_AREA, RACE_LOOKS, RACE_WALK_UPS, walkSpeed, type CrowdEvent, type CrowdFrame, type CrowdKill, type CrowdRaceView } from '../../../../shared/crowd.ts';
import type { GameFactory } from '../engine.ts';
import { TICK_MS, aimOut, dealLooks, hitTest, moveAim, newActor, newAim, pack, rand, stick, type Actor, type Aim } from './sim.ts';

/** The start line and the finish line (world x) */
const START_X = 95;
const FINISH_X = 1480;
/** Everyone waits on the start line this long (the count down), and the reveal lasts this long */
const READY_MS = 4500;
const REVEAL_MS = 7500;
/** On the start line: this many people a row at most, rows this far apart (world units) */
const ROW_SIZE = 80;
const COL_GAP = 20;
/** Passers-by start walking within this time after the go, one by one */
const START_SPREAD_MS = 1600;

type Move = 'stop' | 'walk' | 'run';

/**
 * Crowd Race: every player is one of the people on the start line, and nobody knows who. Everyone walks to
 * the finish line at the same pace; passers-by stop now and then, players stop when they let go of WALK, and
 * can RUN (nobody else does). Each player also has a sniper with a few shots. The first to cross wins the
 * round, unless a passer-by gets there first. Even the last player standing still has to cross the line.
 */
export const crowdRace: GameFactory = (m) => {
  const s = m.settings;
  const walk = walkSpeed(s.crowdWalk, RACE_WALK_UPS);
  const run = walk * (Number(s.crowdRun) || 2);
  const rounds = Math.max(1, s.crowdRounds);
  const reloadMs = Math.max(0, s.crowdReloadSec) * 1000;
  // Longest a race can last: the time to walk there, and a lot more
  const maxRaceMs = ((FINISH_X - START_X) / walk) * 1000 * 4;
  /** The start line of this round (further right for a big crowd) */
  let startX = START_X;
  const ids = m.players.map((p) => p.id);
  const colorOf = (id: string) => m.players.find((p) => p.id === id)?.color;

  let step: CrowdRaceView['step'] = 'ready';
  let round = 0;
  let goAt = 0;
  let revealUntil = 0;
  let actors: Actor[] = [];
  let looks: number[] = [];
  const aims = new Map<string, Aim>();
  const moves = new Map<string, Move>();
  const alive = new Set<string>();
  const points: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const totalKills: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  let kills: CrowdKill[] = [];
  let winner: string | null = null;
  let why: CrowdRaceView['why'] = null;
  let events: CrowdEvent[] = [];
  let over = false;
  let last = Date.now();

  const newRound = () => {
    const now = Date.now();
    round += 1;
    step = 'ready';
    goAt = now + READY_MS;
    kills = [];
    winner = null;
    why = null;
    const n = Math.max(ids.length, s.crowdNpcs + ids.length);
    looks = dealLooks(n, RACE_LOOKS);
    // Everyone gets a place of their own on the start line, slightly staggered. A big crowd lines up in a
    // few rows behind it, and the start line moves right so they all fit on the screen
    const cols = Math.max(1, Math.ceil(n / ROW_SIZE));
    const perCol = Math.ceil(n / cols);
    startX = START_X + Math.max(0, cols - 2) * COL_GAP;
    const spots = Array.from({ length: n }, (_, k) => {
      const col = Math.floor(k / perCol);
      const row = k % perCol;
      return { x: startX - col * COL_GAP - rand(0, cols > 1 ? 10 : 34), y: RACE_AREA.y0 + ((RACE_AREA.y1 - RACE_AREA.y0) * (row + (col % 2 ? 0.75 : 0.25) + 0.25)) / perCol + rand(-4, 4) };
    }).sort(() => Math.random() - 0.5);
    actors = spots.map((p, i) => {
      const a = newActor(i, looks[i], p.x, Math.min(RACE_AREA.y1, p.y), 3);
      a.next = goAt + rand(0, START_SPREAD_MS);
      return a;
    });
    // The players take characters at random
    const free = actors.map((a) => a.i).sort(() => Math.random() - 0.5);
    ids.forEach((id, k) => (actors[free[k]].player = id));
    alive.clear();
    for (const id of ids) {
      alive.add(id);
      moves.set(id, 'stop');
      const old = aims.get(id);
      const a = newAim(id, goAt, Math.max(1, s.crowdShots));
      // The crosshair stays where it was from one round to the next
      if (old) {
        a.x = old.x;
        a.y = old.y;
      }
      aims.set(id, a);
    }
    m.publish();
  };

  const endRound = (by: Actor | null, reason: NonNullable<CrowdRaceView['why']>) => {
    if (step === 'reveal') return;
    const now = Date.now();
    step = 'reveal';
    revealUntil = now + REVEAL_MS;
    winner = by?.player ?? null;
    why = reason;
    if (winner) points[winner] += 1;
    for (const a of actors) {
      if (!a.alive) continue;
      // Everyone stops and turns to the room; the winner jumps for joy
      a.anim = a === by && winner ? ANIM.win : ANIM.idle;
      a.dir = 2;
    }
    for (const a of aims.values()) a.sx = a.sy = a.vx = a.vy = 0;
    events.push({ k: 'end' });
    if (winner) m.flash('win', { color: colorOf(winner) });
    m.publish();
  };

  const finishGame = () => {
    if (over) return;
    over = true;
    m.watchLights(false);
    const top = Math.max(0, ...ids.map((id) => points[id]));
    const winners = top > 0 ? ids.filter((id) => points[id] === top) : [];
    const sorted = [...ids].sort((a, b) => points[b] - points[a] || totalKills[b] - totalKills[a]);
    m.finish({
      winners,
      headline: winners.length ? undefined : 'The passers-by won every round',
      lines: sorted.map((id) => ({
        id,
        label: `${points[id]} ${points[id] === 1 ? 'round' : 'rounds'}`,
        detail: `${totalKills[id]} ${totalKills[id] === 1 ? 'player' : 'players'} shot`,
      })),
    });
  };

  /**
   * Passers-by: walk a couple of seconds, stop about as long (now and then a long while), and so on. They
   * walk about half the time: the first of them gets to the line after about 75 s (see raceRoundSec).
   */
  const think = (a: Actor, now: number) => {
    if (now < a.next) return;
    if (a.moving) {
      a.moving = false;
      a.next = now + (Math.random() < 0.15 ? rand(3500, 6000) : rand(1000, 3500));
    } else {
      a.moving = true;
      a.next = now + rand(1200, 3500);
    }
  };

  const tick = () => {
    if (over) return;
    const now = Date.now();
    const dt = Math.min(0.2, (now - last) / 1000);
    last = now;
    if (step === 'ready' && now >= goAt) {
      step = 'race';
      events.push({ k: 'go' });
      m.publish();
    }
    if (step === 'race') {
      let first: Actor | null = null;
      for (const a of actors) {
        if (!a.alive) continue;
        let speed = 0;
        if (a.player) {
          const mv = moves.get(a.player) ?? 'stop';
          speed = mv === 'run' ? run : mv === 'walk' ? walk : 0;
        } else {
          think(a, now);
          speed = a.moving ? walk : 0;
        }
        a.x += speed * dt;
        a.anim = speed === 0 ? ANIM.idle : speed > walk ? ANIM.run : ANIM.walk;
        a.dir = 3;
        if (a.x >= FINISH_X && (!first || a.x > first.x)) first = a;
      }
      if (first) {
        events.push({ k: 'cross', actor: first.i, player: first.player });
        endRound(first, first.player ? 'crossed' : 'npc');
      } else if (now > goAt + maxRaceMs) endRound(null, 'time');
    }
    if (step !== 'reveal') for (const a of aims.values()) if (alive.has(a.id)) moveAim(a, dt);
    if (step === 'reveal' && now >= revealUntil) {
      if (round >= rounds) {
        finishGame();
        return;
      }
      newRound();
    }
    const frame: CrowdFrame = {
      t: now,
      a: pack(actors),
      aims: [...aims.values()].filter((a) => alive.has(a.id) && step !== 'reveal').map((a) => aimOut(a, step === 'race' && a.shots > 0 && now >= a.readyAt)),
      ev: events,
    };
    m.tv('crowd', frame);
    events = [];
  };

  const fire = (id: string) => {
    const now = Date.now();
    const a = aims.get(id);
    if (!a || step !== 'race' || !alive.has(id)) return { hit: null, shots: a?.shots ?? 0 };
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
      if (target.player) {
        alive.delete(target.player);
        moves.set(target.player, 'stop');
        if (target.player !== id) totalKills[id] += 1;
        m.flash('kill');
        // Nobody left: nobody wins. The last one standing still has to beat the passers-by to the line
        if (alive.size === 0) endRound(null, 'none');
      }
    }
    m.publish();
    return { hit: target ? (target.player ? (target.player === id ? 'self' : 'player') : 'npc') : 'miss', shots: a.shots };
  };

  return {
    start() {
      m.watchLights(true);
      newRound();
      m.every(TICK_MS, tick);
    },

    input(id, args) {
      switch (args?.t) {
        case 'move': {
          const mv: Move = args?.m === 'run' ? 'run' : args?.m === 'walk' ? 'walk' : 'stop';
          if (alive.has(id)) moves.set(id, mv);
          return true;
        }
        case 'aim': {
          const a = aims.get(id);
          if (a) Object.assign(a, ((v) => ({ sx: v.x, sy: v.y }))(stick(args)));
          return true;
        }
        case 'fire':
          return fire(id);
        default:
          return true;
      }
    },

    skip() {
      if (step === 'ready') goAt = Date.now();
      else if (step === 'reveal') revealUntil = Date.now();
    },

    view(role): CrowdRaceView {
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
        goAt,
        revealUntil,
        startX,
        finishX: FINISH_X,
        ...(role === 'tv' ? { looks } : {}),
        shots,
        readyAt,
        reloadMs,
        alive: [...alive],
        points,
        kills,
        totalKills,
        winner,
        why,
        ...(step === 'reveal' ? { reveal: Object.fromEntries(actors.filter((a) => a.player).map((a) => [a.player!, a.i])) } : {}),
        soundVolume: s.sniperSounds,
      };
    },
  };
};
