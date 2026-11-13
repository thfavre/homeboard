/**
 * Plays the town (server/modules/world/sim.ts) on a fake clock, hours in seconds, with many
 * characters: guests leave and come back, change their looks, cheer, and the King holds a ceremony
 * every 15 minutes, and a whole town day goes by every hour (night from 20:00 to 07:00). It watches every step for trouble (walking on the spot, standing in the
 * fountain, off the square, in the river, an activity that never ends, a chat partner who is not
 * chatting back) and measures how things go (shop trips, the ceremony, sleep, who sleeps at night, variety).
 *
 *   npx tsx scripts/town-sim-test.ts [minutes] [characters] [seed]
 *
 * Nothing runs but the sim: no server, no data folder, no lights. Run it after changing how the
 * characters walk or choose what to do; "no problems" at the end is what you want.
 */
import { TownSim, type RosterEntry, type TownOptions } from '../server/modules/world/sim.ts';
import { BROOK_HW, CROSSING, DAIS_FOOT, TOWN, TOWN_AREA, TOWN_OBSTACLES, WANIM, FRAME_STRIDE, brookSide, type PlaceId } from '../shared/world.ts';

const MINUTES = Number(process.argv[2]) || 120;
const N = Number(process.argv[3]) || 30;
let seed = Number(process.argv[4]) || 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
Math.random = rnd;

let clock = 1_800_000_000_000;
Date.now = () => clock;

const errands = new Map<string, PlaceId[]>();
/** When each errand was given, to measure how long until the character is dressed */
const errandAt = new Map<string, number>();
const errandWaits: number[] = [];
const sim = new TownSim({
  dress(id, place) {
    const at = errandAt.get(id + place);
    if (at !== undefined) {
      errandWaits.push(clock - at);
      errandAt.delete(id + place);
    }
    errands.set(id, (errands.get(id) ?? []).filter((p) => p !== place));
  },
  caught() {
    fishCaught++;
  },
});
const kinds = new Map<string, Set<string>>();
let chatGiveUps = 0;
/** Fish pulled out of the river */
let fishCaught = 0;
const courtShares: number[] = [];
let lastPhase: string | null = null;
let leaveAt = 0;
const backLate: string[] = [];
const sleepLate: number[] = [];
const awaySince = new Map<string, number>();
const roster: (RosterEntry & { away: number })[] = [];
for (let i = 0; i < N; i++) roster.push({ id: `g${i}`, online: true, awayMs: 0, away: 0, noSit: i % 9 === 0, noCheer: i % 9 === 0 });

/** A whole day on the town's clock goes by in this much test time; the test starts at noon */
const DAY_MS = 60 * 60_000;
const opts: TownOptions = {
  sleepAfterMs: 4 * 60_000,
  fadeAfterMs: 3 * 60_000,
  insideMs: [2000, 5000] as [number, number],
  finishWithinMs: 20_000,
  wrapUpMs: [2000, 10_000] as [number, number],
  quickStopMs: [1000, 3000] as [number, number],
  chatChance: 0.3,
  chatMs: [8000, 18_000] as [number, number],
  king: 'g1' as string | null,
  courtMs: 60_000,
  graceMs: 20_000,
  dayNight: { on: true, dusk: '20:00', dawn: '07:00', twilightMin: 90 },
  localMinutes: 12 * 60,
  nightSleep: true,
  bedtimeSpreadMin: 180,
  nightOwls: 0.2,
  activities: { cafe: true, fountain: true, board: true, fish: true, fire: true },
  lamplighter: true,
  // A party every other night, so a two hour test sees one
  party: { on: true, everyDays: 2, hours: 5, goers: 0.7 },
};
/** The share of characters asleep for the night at 3:00, at 9:00 (the night owls) and at noon, each day */
const atNight: number[] = [];
/** Pairs of sleepers lying on top of each other at 3:00, and how many slept then */
let stacked = 0;
const bedsAt3: number[] = [];
const atMorning: number[] = [];
const atNoon: number[] = [];

const STEP = 100;
type Track = { kind: string; since: number; x: number; y: number; stillSince: number };
const track = new Map<string, Track>();
const problems = new Map<string, { n: number; example: string }>();
const report = (key: string, example: string) => {
  const p = problems.get(key);
  if (p) p.n++;
  else problems.set(key, { n: 1, example });
};
const stats = { chats: 0, ceremonies: 0, visits: 0, maxKindMs: {} as Record<string, number> };
/** Longest a kind may last before it looks stuck (ms) */
const LIMIT: Record<string, number> = {
  idle: 15_000, wander: 60_000, goBench: 60_000, sit: 30_000, goPet: 45_000, pet: 10_000, goChat: 20_000, chat: 40_000,
  cheer: 4000, goSleep: 90_000, visit: 120_000, goThrone: 120_000, descend: 60_000, goHall: 120_000, goPray: 120_000,
  goSeat: 60_000, seated: 60_000, goRead: 60_000, read: 10_000, goFish: 60_000, fish: 50_000, lamps: 150_000, party: 90_000,
};

/** How often each activity was started, the lamps lit at 23:00 and at 10:00 each day, the most dancing at the party at once */
const started: Record<string, number> = {};
const lampsAt: string[] = [];
let dancersMax = 0;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const start = clock;
let lastCeremony = clock;
const end = clock + MINUTES * 60_000;
let frame: ReturnType<TownSim['tick']>;
const simAny = sim as any;

while (clock < end) {
  clock += STEP;
  // Life: guests leave and come back, change their looks, cheer; a ceremony every 15 minutes
  for (const r of roster) {
    if (r.online && rnd() < 0.00004) r.online = false;
    else if (!r.online && rnd() < 0.0004) r.online = true;
    r.awayMs = r.online ? 0 : r.awayMs + STEP;
    if (rnd() < 0.00008) {
      const place: PlaceId = rnd() < 0.5 ? 'clothes' : 'barber';
      if (!errandAt.has(r.id + place)) errandAt.set(r.id + place, clock);
      errands.set(r.id, [...new Set([...(errands.get(r.id) ?? []), place])]);
    }
    if (rnd() < 0.00005) sim.cheer(r.id);
    r.errands = errands.get(r.id) ?? [];
  }
  if (clock - lastCeremony > 15 * 60_000 && sim.inTown('g1')) {
    if (sim.startCeremony()) stats.ceremonies++;
    lastCeremony = clock;
  }
  const prevKinds = new Map([...(simAny.walkers as Map<string, any>)].map(([id, w]) => [id, w.doing.kind]));
  const before = opts.localMinutes % 1440;
  opts.localMinutes = 12 * 60 + ((clock - start) / DAY_MS) * 1440;
  const minute = opts.localMinutes % 1440;
  frame = sim.tick(roster, opts);
  const asleep = () => {
    const all = [...(simAny.walkers as Map<string, any>).values()];
    return all.filter((w) => (w.doing.kind === 'sleep' || w.doing.kind === 'goSleep') && w.doing.night).length / Math.max(1, all.length);
  };
  if (before < 180 && minute >= 180) {
    atNight.push(asleep());
    // Sleepers lying on top of each other (a body takes room sideways: closer counts above and below)
    const beds = [...(simAny.walkers as Map<string, any>).values()].filter((w) => w.doing.kind === 'sleep');
    for (let i = 0; i < beds.length; i++) for (let j = i + 1; j < beds.length; j++) if (Math.hypot((beds[i].x - beds[j].x) * 0.5, beds[i].y - beds[j].y) < 26) stacked++;
    bedsAt3.push(beds.length);
  }
  if (before < 540 && minute >= 540) atMorning.push(asleep());
  if (before < 720 && minute >= 720 && clock - start > DAY_MS / 2) atNoon.push(asleep());
  const lit = (bits = frame.lamps ?? 0) => bits.toString(2).split('1').length - 1;
  if (before < 1380 && minute >= 1380) lampsAt.push(`23:00 ${lit()}`);
  if (before < 600 && minute >= 600) lampsAt.push(`10:00 ${lit()}`);
  dancersMax = Math.max(dancersMax, frame.a.filter((_, i) => i % FRAME_STRIDE === 2).filter((a) => a === WANIM.dance).length);
  for (const [id, w] of simAny.walkers as Map<string, any>) {
    (kinds.get(id) ?? kinds.set(id, new Set()).get(id)!).add(w.doing.kind);
    if (prevKinds.get(id) === 'goChat' && w.doing.kind === 'idle') chatGiveUps++;
  }
  // The ceremony: who is in place when the court opens; everyone back in town a minute after it ends
  const phase = simAny.ceremony?.phase ?? null;
  if (phase === 'court' && lastPhase !== 'court') {
    const crowd = [...(simAny.walkers as Map<string, any>).values()].filter((w) => w.id !== 'g1' && w.doing.kind !== 'sleep' && w.doing.kind !== 'goSleep');
    courtShares.push(crowd.filter((w) => w.doing.kind === 'pray').length / Math.max(1, crowd.length));
    (stats as any).courtWaits = [...((stats as any).courtWaits ?? []), Math.round((clock - simAny.ceremony.open) / 1000)];
    (stats as any).spots = simAny.ceremony.spots.length;
  }
  if (lastPhase && !phase) leaveAt = clock;
  if (leaveAt && clock - leaveAt > 60_000) {
    // (sleepers lie at the town's edge, right of the square)
    for (const w of (simAny.walkers as Map<string, any>).values()) if (w.x > TOWN_AREA.x1 + 40 && w.doing.kind !== 'sleep' && w.doing.kind !== 'goSleep') backLate.push(`${w.id} ${w.doing.kind} at ${Math.round(w.x)}`);
    leaveAt = 0;
  }
  lastPhase = phase;
  // Away guests: asleep within their time (plus the walk to the edge, and what cannot be cut short)
  for (const r of roster) {
    if (r.online) awaySince.delete(r.id);
    else if (!awaySince.has(r.id)) awaySince.set(r.id, clock);
    const w = simAny.walkers.get(r.id);
    const since = awaySince.get(r.id);
    if (w && since !== undefined && !simAny.ceremony && clock - since > opts.sleepAfterMs + 150_000 && w.doing.kind !== 'sleep' && w.doing.kind !== 'goSleep') {
      sleepLate.push(clock - since);
      awaySince.set(r.id, clock);
    }
  }

  for (const [id, w] of simAny.walkers as Map<string, any>) {
    const d = w.doing;
    const kind: string = d.kind === 'visit' ? `visit` : d.kind;
    let t = track.get(id);
    if (!t || t.kind !== kind) {
      if (t) stats.maxKindMs[t.kind] = Math.max(stats.maxKindMs[t.kind] ?? 0, clock - t.since);
      if (kind === 'chat') stats.chats++;
      if (kind === 'visit') stats.visits++;
      started[kind] = (started[kind] ?? 0) + 1;
      if (kind === 'seated') started[`seated ${d.at}`] = (started[`seated ${d.at}`] ?? 0) + 1;
      t = { kind, since: clock, x: w.x, y: w.y, stillSince: clock };
      track.set(id, t);
    }
    if (Math.hypot(w.x - t.x, w.y - t.y) > 3) {
      t.x = w.x;
      t.y = w.y;
      t.stillSince = clock;
    }
    const i = frame.ids.indexOf(id);
    const anim = frame.a[i * FRAME_STRIDE + 2];
    if ((t as any).anim !== anim) {
      (t as any).anim = anim;
      t.stillSince = clock;
    }
    const where = `${id} ${kind}${d.phase ? '/' + d.phase : ''} at ${Math.round(w.x)},${Math.round(w.y)} t=${sec(clock - start)}`;
    // Walking on the spot
    if (anim === WANIM.walk && clock - t.stillSince > 6000) {
      report(`walks without moving (${kind}${d.phase ? '/' + d.phase : ''})`, where);
      t.stillSince = clock;
    }
    // One thing far too long (asleep is fine, the ceremony's places are held until it ends)
    const limit = LIMIT[kind];
    if (limit && clock - t.since > limit && !(kind === 'pray' || kind === 'throne' || kind === 'sleep')) {
      report(`${kind} lasts over ${sec(limit)}`, where);
      t.since = clock;
    }
    // Inside something on the square (sitting on a log is fine), out of bounds, in the river
    const inside = TOWN_OBSTACLES.find((o) => ((w.x - o.x) / o.rx) ** 2 + ((w.y - o.y) / o.ry) ** 2 < 0.6);
    if (inside && !(d.kind === 'visit' && d.phase === 'inside') && d.kind !== 'sleep' && d.kind !== 'seated') report(`stands inside an obstacle (${kind})`, `${where} obstacle ${inside.x},${inside.y}`);
    const inTown = w.x >= TOWN_AREA.x0 - 30 && w.x <= TOWN_AREA.x1 + 30;
    const inHall = w.x > CROSSING.x1;
    if (w.x > CROSSING.x0 + 4 && w.x < CROSSING.x1 - 4 && (w.y < CROSSING.y0 - 4 || w.y > CROSSING.y1 + 4)) report('in the river off the bridge', where);
    // (a visit or the party goes up to a door)
    if ((w.y < TOWN_AREA.y0 - 40 || w.y > TOWN_AREA.y1 + 10) && !(d.kind === 'visit' || d.kind === 'party')) report('off the square (y)', where);
    if (w.x < TOWN.w && brookSide(w.x, w.y) > -BROOK_HW + 2) report(`in the town's river (${kind})`, where);
    if (!inTown && !inHall && !(w.x > TOWN_AREA.x1) && !(w.x < TOWN_AREA.x0 && (d.kind === 'wander' || d.kind === 'goSleep' || d.kind === 'sleep' || w.x >= 20))) report('off the square (x)', where);
    if (w.x > DAIS_FOOT + 60 && d.kind !== 'throne' && d.kind !== 'descend' && d.kind !== 'goThrone') report('on the dais without being King', where);
    // A chat with someone who is not chatting back
    if ((d.kind === 'chat' || d.kind === 'goChat') && clock - t.since > 1500 && clock - (t as any).ok > 300) {
      const o = simAny.walkers.get(d.with);
      if (!o || (o.doing.kind !== 'chat' && o.doing.kind !== 'goChat') || o.doing.with !== id) report('chat partner not chatting back', where);
    }
    if (!(d.kind === 'chat' || d.kind === 'goChat') || (() => { const o = simAny.walkers.get(d.with); return o && (o.doing.kind === 'chat' || o.doing.kind === 'goChat') && o.doing.with === id; })()) (t as any).ok = clock;
    // Two characters on top of each other while standing
  }
}
console.log(`${MINUTES} min, ${N} characters, seed ${process.argv[4] ?? 1}: ${stats.chats} chats, ${stats.visits} shop visits, ${stats.ceremonies} ceremonies`);
const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)] : 0);
console.log(`errands dressed: ${errandWaits.length}, waiting at the end: ${errandAt.size}, wait median ${sec(pct(errandWaits, 0.5))}, 95% ${sec(pct(errandWaits, 0.95))}, max ${sec(pct(errandWaits, 1))}`);
console.log(`chat walks given up: ${chatGiveUps} of ${stats.chats + chatGiveUps}`);
console.log(`court opened after (s from the call): ${(stats as any).courtWaits?.join(' ')}, places: ${(stats as any).spots}`);
console.log(`in place when the court opens: ${courtShares.map((x) => Math.round(x * 100) + '%').join(' ')}`);
console.log(`still out by the throne room a minute after: ${backLate.length ? backLate.slice(0, 5).join('; ') : 'nobody'}`);
console.log(`away guests not asleep in time: ${sleepLate.length}`);
console.log(`asleep for the night at 3:00: ${atNight.map((x) => Math.round(x * 100) + '%').join(' ') || '-'}; at 9:00: ${atMorning.map((x) => Math.round(x * 100) + '%').join(' ') || '-'}; at noon: ${atNoon.map((x) => Math.round(x * 100) + '%').join(' ') || '-'}; dark now ${frame!.dark}`);
const never = (k: string) => [...kinds].filter(([id, set]) => !set.has(k) && !(Number(id.slice(1)) % 9 === 0 && (k === 'sit' || k === 'pet'))).length;
console.log(`characters that never: sat ${never('sit')}, petted ${never('pet')}, chatted ${never('chat')}, wandered ${never('wander')}`);
console.log(`sleepers on top of each other at 3:00: ${stacked} pairs (sleepers ${bedsAt3.join(' ')})`);
console.log('started:', started);
console.log(`fish caught: ${fishCaught} in ${started.fish ?? 0} fishing trips`);
console.log(`lamps lit: ${lampsAt.join(', ')}; most dancing at once: ${dancersMax}`);
console.log('longest per activity:', Object.fromEntries(Object.entries(stats.maxKindMs).map(([k, v]) => [k, sec(v)])));
if (!problems.size) console.log('no problems');
for (const [k, p] of [...problems].sort((a, b) => b[1].n - a[1].n)) console.log(`${String(p.n).padStart(5)}  ${k}   e.g. ${p.example}`);
