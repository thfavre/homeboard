import {
  PIRATE,
  PIRATE_POWER,
  PIRATE_SHIPS,
  pirateFormation,
  pirateGradeOf,
  pirateLength,
  pirateSyncNeed,
  type PirateBeat,
  type PirateCrew,
  type PirateCrewDeal,
  type PirateGrade,
  type PirateSoundId,
  type PirateView,
} from '../../../shared/games.ts';
import { clamp, num } from '../../core/util.ts';
import { shuffle, type GameFactory } from './engine.ts';

const FPS = 40;
/** The crews are shown this long before the drum starts */
const CREW_MS = 6000;
/** A tap reaches the server up to this late: a beat is judged only after it */
const GRACE_MS = 400;
/** Longest race: then the ship furthest ahead wins */
const MAX_RACE_MS = 5 * 60_000;
/** Time the light plays the finale before the result */
const OUTRO_MS = 3500;
/** Beats sent to the screens: this far back and ahead */
const BEATS_BACK_MS = 1500;
const BEATS_AHEAD_MS = 6000;
/** The tempo: where it starts, how low and high it goes */
const START_BPM = 88;
const MIN_BPM = 66;
const MAX_BPM = 136;

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
};
const SHIP_LED = Object.fromEntries(PIRATE_SHIPS.map((s) => [s.id, rgbOf(s.led)])) as Record<string, [number, number, number]>;
const GOLD = [255, 150, 0] as const;
const WHITE = [255, 255, 255] as const;

/**
 * The drum: a steady start, then the tempo drifts up or down a little at a time (a few bpm a beat over
 * 8 to 14 beats), holds for a while, and drifts again. Never a sudden jump: the crews can follow it.
 */
function drumBeats(firstAt: number, totalMs: number, steadyBeats: number): number[] {
  const out: number[] = [];
  let bpm = START_BPM;
  let step = 0;
  let ramp = 0;
  let hold = steadyBeats;
  let t = firstAt;
  while (t < firstAt + totalMs) {
    out.push(Math.round(t));
    if (ramp > 0) {
      bpm += step;
      ramp -= 1;
    } else if (hold > 0) {
      hold -= 1;
    } else {
      const up = bpm < 80 ? true : bpm > 124 ? false : Math.random() < 0.55;
      const target = clamp(bpm + (up ? 1 : -1) * (12 + Math.random() * 26), MIN_BPM, MAX_BPM);
      ramp = 8 + Math.floor(Math.random() * 7);
      step = (target - bpm) / ramp;
      hold = 6 + Math.floor(Math.random() * 10);
    }
    t += 60_000 / bpm;
  }
  return out;
}

/** The sea, for one pixel: deep blue rolling waves with a bit of foam on the crests */
function sea(i: number, now: number, u: number, k = 1): [number, number, number] {
  const a = 0.5 + 0.5 * Math.sin((i / u) * 0.42 - now * 0.0024);
  const b = 0.5 + 0.5 * Math.sin((i / u) * 0.16 + now * 0.0011);
  const w = a * (0.55 + 0.45 * b);
  const foam = w > 0.88 ? (w - 0.88) * 6 : 0;
  return [(4 + 60 * foam) * k, (18 + 55 * w + 70 * foam) * k, (60 + 140 * w + 70 * foam) * k];
}

/** Players shuffled into crews, one ship each */
export function dealPirateCrews(ids: string[]): PirateCrewDeal[] {
  const order = shuffle([...ids]);
  let next = 0;
  return pirateFormation(ids.length).map((size, c) => ({ ship: PIRATE_SHIPS[c].id, members: order.slice(next, (next += size)) }));
}

/** The crews still fit these players: everyone in exactly one crew, in the formation for their number */
function sameCrews(deal: PirateCrewDeal[], ids: string[]): boolean {
  const all = deal.flatMap((d) => d.members);
  const sizes = pirateFormation(ids.length);
  return all.length === ids.length && new Set(all).size === all.length && ids.every((id) => all.includes(id)) && deal.length === sizes.length && deal.every((d, i) => d.members.length === sizes[i]);
}

interface Crew extends PirateCrew {
  /** Distance rowed, in perfect strokes */
  distance: number;
}

/**
 * Pirate Race: the players are split into crews, one ship each. A drum beats on the TV; every tap on ROW
 * is judged against the closest beat. Each beat, a ship moves by the average stroke of its crew (so uneven
 * crews stay fair), more when the crew rows together, and a lot more during a boost. First to the treasure.
 */
export const pirateRace: GameFactory = (m) => {
  const goal = pirateLength(m.settings.pirateLength).strokes;
  // The crews dealt on the rules screen, unless the players changed since
  const dealt = m.options.crews;
  const ids = m.players.map((p) => p.id);
  const deal = dealt && sameCrews(dealt, ids) ? dealt : dealPirateCrews(ids);
  const crews: Crew[] = deal.map((d) => ({
    ship: d.ship,
    members: [...d.members],
    progress: 0,
    distance: 0,
    streak: 0,
    boostUntil: 0,
    stroke: { seq: 0, power: 0, synced: false, at: 0, rowers: 0 },
    finishedAt: null,
    place: null,
  }));
  const crewOf = new Map<string, Crew>();
  for (const c of crews) for (const id of c.members) crewOf.set(id, c);

  const startAt = Date.now();
  const drumAt = startAt + CREW_MS;
  const beats = drumBeats(drumAt, MAX_RACE_MS + 20_000, PIRATE.countIn + 8);
  const first = PIRATE.countIn;
  const raceAt = beats[first];
  let step: PirateView['step'] = 'crew';
  let over = false;
  let finishAt = 0;
  /** Next beat to judge */
  let judged = first;
  /** Taps not judged yet: per player, the grade on each beat */
  const marks = new Map<string, Map<number, PirateGrade>>(m.players.map((p) => [p.id, new Map()]));
  const stats = new Map(m.players.map((p) => [p.id, { onBeat: 0, perfect: 0, beats: 0 }]));
  let winners: Crew[] = [];

  const raceLight = m.settings.pirateLight;
  const reverse = m.settings.pirateReverse;
  const treasureAt = clamp(m.settings.pirateTreasure, 10, 100) / 100;

  /** The beat closest to `at` (a counted one) */
  const closest = (at: number) => {
    let lo = first;
    let hi = beats.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (beats[mid] < at) lo = mid + 1;
      else hi = mid;
    }
    return lo > first && at - beats[lo - 1] < beats[lo] - at ? lo - 1 : lo;
  };

  const judge = (i: number, now: number) => {
    for (const c of crews) {
      let power = 0;
      let onBeat = 0;
      let rowers = 0;
      for (const id of c.members) {
        const grade = marks.get(id)?.get(i);
        marks.get(id)?.delete(i);
        const s = stats.get(id)!;
        s.beats += 1;
        if (!grade) continue;
        rowers += 1;
        power += PIRATE_POWER[grade];
        if (grade === 'perfect' || grade === 'good') {
          onBeat += 1;
          s.onBeat += 1;
        }
        if (grade === 'perfect') s.perfect += 1;
      }
      // The average: a crew of 3 rows as far as a crew of 4
      power /= c.members.length;
      const synced = onBeat >= pirateSyncNeed(c.members.length);
      const boosted = beats[i] < c.boostUntil;
      c.distance += power * (synced ? PIRATE.syncBonus : 1) * (boosted ? PIRATE.boostSpeed : 1);
      c.progress = Math.min(1, c.distance / goal);
      c.stroke = { seq: c.stroke.seq + 1, power, synced, at: now, rowers };
      c.streak = synced ? c.streak + 1 : 0;
      if (c.streak >= PIRATE.boostStreak) {
        c.streak = 0;
        c.boostUntil = beats[Math.min(beats.length - 1, i + 1 + PIRATE.boostBeats)];
        m.sound('pirateBoost', { ship: c.ship });
      }
      if (c.distance >= goal && c.finishedAt === null) c.finishedAt = now;
    }
  };

  const endRace = (now: number) => {
    if (step === 'finish') return;
    step = 'finish';
    finishAt = now;
    const sorted = [...crews].sort((a, b) => b.distance - a.distance);
    sorted.forEach((c, k) => (c.place = k > 0 && c.distance === sorted[k - 1].distance ? sorted[k - 1].place : k + 1));
    winners = sorted[0].distance > 0 ? crews.filter((c) => c.place === 1) : [];
    m.sound('pirateFinish', { ships: winners.map((c) => c.ship) });
    m.publish();
    m.later(OUTRO_MS, end);
  };

  const shipName = (c: Crew) => `${PIRATE_SHIPS.find((s) => s.id === c.ship)!.name} ship`;
  const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

  const end = () => {
    if (over) return;
    over = true;
    stopTicks();
    for (const s of m.strips()) s.send(new Uint8Array(s.leds * 3));
    const sorted = [...crews].sort((a, b) => (a.place ?? 9) - (b.place ?? 9));
    const names = winners.map(shipName);
    m.finish({
      winners: winners.flatMap((c) => c.members),
      headline: !names.length ? 'Nobody rowed: no treasure' : names.length === 1 ? `The ${names[0]} finds the treasure!` : `Tie: ${names.join(' and ')}`,
      lines: sorted.flatMap((c) =>
        [...c.members]
          .sort((a, b) => stats.get(b)!.onBeat - stats.get(a)!.onBeat)
          .map((id) => {
            const s = stats.get(id)!;
            return { id, label: `${shipName(c)} · ${ordinal(c.place ?? crews.length)}`, detail: `${s.onBeat} of ${s.beats} strokes on the beat, ${s.perfect} perfect` };
          }),
      ),
    });
  };

  // ------------------------------------------------------------ the lights

  /** The race light: the sea, the treasure glowing gold, the ships sailing to it with their wake */
  const renderRace = (now: number, n: number): Uint8Array => {
    const u = Math.max(1, n / 60);
    const px = new Float32Array(n * 3);
    const add = (i: number, rgb: readonly number[], k: number) => {
      if (i < 0 || i >= n || k <= 0) return;
      for (let c = 0; c < 3; c++) px[i * 3 + c] += rgb[c] * k;
    };
    const dot = (pos: number, rgb: readonly number[], k: number, width: number) => {
      for (let i = Math.floor(pos - width); i <= Math.ceil(pos + width); i++) add(i, rgb, k * Math.max(0, 1 - Math.abs(i + 0.5 - pos) / width));
    };
    const start = 0.5 * u;
    const treasure = treasureAt * (n - 1);
    const finale = step === 'finish' ? Math.min(1, (now - finishAt) / 900) : 0;
    const fade = step === 'finish' ? Math.max(0, Math.min(1, (finishAt + OUTRO_MS - now) / 600)) : 1;

    for (let i = 0; i < n; i++) add(i, sea(i, now, u, (i > treasure + u ? 0.35 : 0.8) * (1 - finale * 0.6)), fade);

    // The treasure: gold, twinkling; brighter as the leader gets close
    const lead = Math.max(...crews.map((c) => c.progress));
    const glow = 0.45 + 0.35 * Math.sin(now / 180) + 0.3 * lead;
    dot(treasure, GOLD, glow * fade, 1.4 * u);
    if (Math.random() < 0.25) add(Math.round(treasure + (Math.random() - 0.5) * 2 * u), WHITE, 0.5 * fade);

    // The ships; ships on top of each other take turns, so each one can be seen
    const ships = crews.map((c) => ({ c, pos: start + c.progress * (treasure - start) })).sort((a, b) => a.pos - b.pos);
    const groups: (typeof ships)[] = [];
    for (const s of ships) {
      const g = groups[groups.length - 1];
      if (g && s.pos - g[g.length - 1].pos < 2.2 * u) g.push(s);
      else groups.push([s]);
    }
    for (const g of groups) {
      const shown = g[Math.floor(now / 420) % g.length];
      for (const { c, pos } of g) {
        const rgb = SHIP_LED[c.ship];
        const boosted = now < c.boostUntil;
        // The wake behind the ship, longer after a strong stroke and during a boost
        const since = now - c.stroke.at;
        const surge = c.stroke.seq ? Math.max(0, 1 - since / 600) * c.stroke.power : 0;
        const wake = (2 + 4 * surge + (boosted ? 5 : 0)) * u;
        for (let d = 1; d < wake; d++) add(Math.round(pos - d), boosted ? WHITE : rgb, 0.3 * (1 - d / wake) * (boosted && Math.random() < 0.4 ? 1.6 : 1) * fade);
        if (c !== shown.c) continue;
        const win = winners.includes(c);
        const k = (step === 'finish' && !win ? 0.5 : 1) * fade;
        dot(pos, rgb, k, 1.3 * u);
        // A synchronized stroke sparkles; a boost burns white hot
        if (boosted || (c.stroke.synced && since < 250)) dot(pos, WHITE, 0.45 * k, 0.6 * u);
      }
    }

    // The winner's color spreads from the treasure over the whole light
    if (step === 'finish' && winners.length) {
      const rgb = SHIP_LED[winners[Math.floor(now / 500) % winners.length].ship];
      const reach = finale * n;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(i - treasure);
        if (d > reach) continue;
        const front = Math.max(0, 1 - (reach - d) / (5 * u));
        add(i, rgb, (0.3 + 0.6 * front) * fade);
        if (Math.random() < 0.04) add(i, WHITE, 0.6 * fade);
      }
    }
    return pack(px, n, reverse);
  };

  /** Every other light: the rolling sea, taking the winner's color at the end */
  const renderSea = (now: number, n: number): Uint8Array => {
    const u = Math.max(1, n / 60);
    const px = new Float32Array(n * 3);
    const tint = step === 'finish' && winners.length ? SHIP_LED[winners[0].ship] : null;
    const k = step === 'finish' ? Math.max(0, Math.min(1, (finishAt + OUTRO_MS - now) / 600)) : 1;
    for (let i = 0; i < n; i++) {
      const rgb = sea(i, now, u);
      const mix = tint ? Math.min(1, (now - finishAt) / 900) * 0.7 : 0;
      for (let c = 0; c < 3; c++) px[i * 3 + c] = (rgb[c] * (1 - mix) + (tint ? tint[c] * mix * (rgb[2] / 200) : 0)) * k;
    }
    return pack(px, n, false);
  };

  const tick = () => {
    if (over) return;
    const now = Date.now();
    if (step === 'crew' && now >= drumAt) {
      step = 'race';
      m.publish();
    }
    if (step === 'race') {
      let changed = false;
      while (judged < beats.length && beats[judged] + PIRATE.okMs + GRACE_MS < now) {
        judge(judged, now);
        judged += 1;
        changed = true;
      }
      if (crews.some((c) => c.finishedAt !== null) || now > raceAt + MAX_RACE_MS) endRace(now);
      else if (changed) m.publish();
    }
    for (const s of m.strips()) s.send(s.id === raceLight ? renderRace(now, s.leds) : renderSea(now, s.leds));
  };

  let stopTicks = () => {};
  // The beats around now go out with the state: refresh it even when nothing else happens
  let stopRefresh = () => {};

  const windowOf = (now: number): PirateBeat[] => {
    const out: PirateBeat[] = [];
    for (let i = 0; i < beats.length; i++) {
      if (beats[i] < now - BEATS_BACK_MS) continue;
      if (beats[i] > now + BEATS_AHEAD_MS) break;
      out.push({ i, at: beats[i] });
    }
    return out;
  };

  const tempo = (now: number) => {
    let k = Math.max(0, beats.findIndex((t) => t > now) - 1);
    k = Math.min(k, beats.length - 8);
    const gap = beats[k + 1] - beats[k];
    const later = beats[k + 7] - beats[k + 6];
    const bpm = Math.round(60_000 / gap);
    return { bpm, trend: (later < gap * 0.97 ? 'faster' : later > gap * 1.03 ? 'slower' : 'steady') as PirateView['trend'] };
  };

  return {
    start() {
      stopTicks = m.every(1000 / FPS, tick);
      stopRefresh = m.every(1000, () => (over ? stopRefresh() : m.publish()));
      m.publish();
    },

    input(id, args) {
      const now = Date.now();
      // The phone sends when it was tapped (server clock), a little before the message got here
      const at = clamp(num(args?.at, now), now - GRACE_MS, now + 50);
      if (step !== 'race' || at < raceAt - PIRATE.okMs) return { grade: null };
      const i = closest(at);
      if (i < judged) return { grade: null };
      const mine = marks.get(id)!;
      // One stroke a beat: a second tap on the same beat does nothing
      if (mine.has(i)) return { grade: null };
      const grade = pirateGradeOf(at - beats[i]);
      mine.set(i, grade);
      return { grade, beat: i };
    },

    view(): PirateView {
      const now = Date.now();
      const { bpm, trend } = tempo(Math.max(now, drumAt));
      const sounds: PirateView['sounds'] = {};
      for (const [k, v] of Object.entries(m.settings.pirateSounds ?? {})) if (v) sounds[k as PirateSoundId] = v.url;
      return {
        step,
        crews: crews.map(({ distance: _d, ...c }) => c),
        drumAt,
        raceAt,
        beats: step === 'finish' ? [] : windowOf(now),
        bpm,
        trend,
        strokes: goal,
        treasureAt: raceLight && m.strip(raceLight) ? treasureAt : null,
        audioOffset: m.settings.pirateAudioOffset,
        sounds,
        stats: Object.fromEntries(stats),
      };
    },
  };
};

function pack(px: Float32Array, n: number, reverse: boolean): Uint8Array {
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = (reverse ? n - 1 - i : i) * 3;
    for (let c = 0; c < 3; c++) out[o + c] = Math.min(255, Math.max(0, Math.round(px[i * 3 + c])));
  }
  return out;
}
