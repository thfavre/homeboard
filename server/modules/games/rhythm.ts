import {
  GAME_COLORS,
  RHYTHM,
  RHYTHM_LANES,
  RHYTHM_POINTS,
  rhythmGradeOf,
  rhythmMultiplier,
  rhythmTarget,
  type GameColor,
  type RhythmGrade,
  type RhythmNote,
  type RhythmScore,
  type RhythmView,
} from '../../../shared/games.ts';
import { HbError, clamp, num } from '../../core/util.ts';
import { best, type GameFactory } from './engine.ts';

const FPS = 40;
/** A tap reaches the server up to this late; notes count as missed only after it */
const GRACE_MS = 400;
/** Time after the last note before the result */
const OUTRO_MS = 1200;
/** A hit lights up the zone for this long */
const FLASH_MS = 260;

/**
 * Notes of a bar in eighths (1: a note), by level: the song gets busier as it goes.
 * Every pattern starts on the beat so the bars stay easy to feel.
 */
const PATTERNS = [
  [
    [1, 0, 0, 0, 1, 0, 0, 0],
    [1, 0, 0, 0, 1, 0, 1, 0],
    [1, 0, 1, 0, 1, 0, 0, 0],
  ],
  [
    [1, 0, 1, 0, 1, 0, 1, 0],
    [1, 0, 1, 1, 1, 0, 1, 0],
    [1, 0, 0, 1, 1, 0, 1, 0],
  ],
  [
    [1, 0, 1, 1, 1, 0, 1, 1],
    [1, 1, 1, 0, 1, 0, 1, 1],
    [1, 0, 1, 1, 1, 1, 1, 0],
  ],
  [
    [1, 1, 1, 1, 1, 0, 1, 1],
    [1, 1, 1, 0, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 0],
  ],
];

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** A song: notes on a steady beat, the lane wandering left and right like a guitar line */
function compose(firstAt: number, beatMs: number, songMs: number): RhythmNote[] {
  const notes: RhythmNote[] = [];
  const bars = Math.max(2, Math.floor(songMs / (beatMs * 4)));
  let lane = Math.floor(Math.random() * RHYTHM_LANES.length);
  for (let bar = 0; bar < bars; bar++) {
    const last = bar === bars - 1;
    const level = Math.min(3, Math.floor((bar / bars) * 4.4));
    const pattern = last ? [1, 0, 0, 0, 0, 0, 0, 0] : pick(PATTERNS[level]);
    pattern.forEach((on, i) => {
      if (!on) return;
      // Calm songs repeat lanes more, busy ones jump around
      lane += pick(level < 1 ? [-1, 0, 0, 1] : [-2, -1, -1, 0, 1, 1, 2]);
      if (lane < 0) lane = -lane;
      if (lane > 3) lane = 6 - lane;
      lane = clamp(lane, 0, 3);
      notes.push({ at: Math.round(firstAt + (bar * 8 + i) * (beatMs / 2)), color: RHYTHM_LANES[lane] });
    });
  }
  return notes;
}

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const LED = Object.fromEntries(GAME_COLORS.map((c) => [c.id, rgbOf(c.led)])) as Record<GameColor, [number, number, number]>;
const ZONE = { perfect: [0, 255, 40], good: [255, 110, 0], ok: [255, 0, 0] } as const;

/** Rhythm Rain: notes climb a light strip; tap their color as they cross the zone at the top */
export const rhythmRain: GameFactory = (m) => {
  const bpm = 100 + Math.floor(Math.random() * 25);
  const beatMs = 60_000 / bpm;
  const startAt = Date.now();
  // The count-in: whole beats, long enough for the first note to climb the strip
  const firstAt = startAt + Math.ceil(Math.max(RHYTHM.leadMs, RHYTHM.travelMs + beatMs * 2) / beatMs) * beatMs;
  const notes = compose(firstAt, beatMs, m.settings.rhythmSec * 1000);
  const endAt = notes[notes.length - 1].at + RHYTHM.okMs + GRACE_MS + OUTRO_MS;

  const scores = new Map<string, RhythmScore>(
    m.players.map((p) => [p.id, { score: 0, combo: 0, bestCombo: 0, perfect: 0, good: 0, ok: 0, missed: 0, wrong: 0, last: null }]),
  );
  const hits = new Map<string, Set<number>>(m.players.map((p) => [p.id, new Set()]));
  /** Next note to check for a miss, per player */
  const passed = new Map<string, number>(m.players.map((p) => [p.id, 0]));
  let seq = 0;
  let over = false;
  const flashes: { at: number; rgb: [number, number, number] }[] = [];

  const strip = m.settings.rhythmLight ? m.strip(m.settings.rhythmLight) : null;
  const reverse = m.settings.rhythmReverse;

  const judge = (s: RhythmScore, grade: RhythmGrade) => {
    s.last = { grade, at: Date.now(), seq: ++seq };
  };

  /** One frame of the strip: the hit zone breathing on the beat, the notes climbing, flashes on hits */
  const render = (now: number, leds: number): Uint8Array => {
    const px = new Float32Array(leds * 3);
    const add = (i: number, rgb: readonly number[], k: number) => {
      if (i < 0 || i >= leds || k <= 0) return;
      for (let c = 0; c < 3; c++) px[i * 3 + c] += rgb[c] * k;
    };
    const zone = Math.round(RHYTHM.zoneAt * (leds - 1));
    const speed = zone / RHYTHM.travelMs;
    const sinceBeat = (((now - startAt) % beatMs) + beatMs) % beatMs;
    const pulse = now >= startAt && now < endAt ? Math.exp(-sinceBeat / 140) : 0;
    for (let i = 0; i < leds; i++) {
      const gap = Math.abs(i - zone) / speed;
      const kind = gap <= RHYTHM.perfectMs ? 'perfect' : gap <= RHYTHM.goodMs ? 'good' : gap <= RHYTHM.okMs ? 'ok' : null;
      if (kind) add(i, ZONE[kind], 0.13 + 0.12 * pulse);
    }
    for (const n of notes) {
      const pos = zone - (n.at - now) * speed;
      if (pos < -1 || pos > leds + 5) continue;
      for (let i = Math.floor(pos - 5); i <= Math.ceil(pos + 1); i++) {
        // A bright head with a short fading tail below it
        const d = pos - i;
        const k = d < -1 ? 0 : d < 0 ? 1 + d : d < 1 ? 1 : 0.5 * Math.exp(-(d - 1) * 0.9);
        add(i, LED[n.color], k);
      }
    }
    for (const f of flashes) {
      const t = (now - f.at) / FLASH_MS;
      if (t < 0 || t > 1) continue;
      const spread = 1 + t * 4;
      for (let i = Math.floor(zone - spread); i <= Math.ceil(zone + spread); i++) {
        add(i, f.rgb, (1 - t) * Math.max(0, 1 - Math.abs(i - zone) / (spread + 1)));
      }
    }
    const out = new Uint8Array(leds * 3);
    for (let i = 0; i < leds; i++) {
      const o = (reverse ? leds - 1 - i : i) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = Math.min(255, Math.round(px[i * 3 + c]));
    }
    return out;
  };

  const tick = () => {
    if (over) return;
    const now = Date.now();
    let changed = false;
    for (const p of m.players) {
      const s = scores.get(p.id)!;
      let i = passed.get(p.id)!;
      while (i < notes.length && notes[i].at + RHYTHM.okMs + GRACE_MS < now) {
        if (!hits.get(p.id)!.has(i)) {
          s.missed += 1;
          s.combo = 0;
          judge(s, 'miss');
          changed = true;
        }
        i += 1;
      }
      passed.set(p.id, i);
    }
    while (flashes.length && now - flashes[0].at > FLASH_MS) flashes.shift();
    if (strip) strip.send(render(now, strip.leds));
    if (changed) m.publish();
    if (now >= endAt) end();
  };

  const end = () => {
    if (over) return;
    over = true;
    stopTicks();
    if (strip) strip.send(new Uint8Array(strip.leds * 3));
    const score = (id: string) => scores.get(id)!.score;
    m.finish({
      winners: best(m.players, score),
      lines: [...m.players]
        .sort((a, b) => score(b.id) - score(a.id))
        .map((p) => {
          const s = scores.get(p.id)!;
          return {
            id: p.id,
            label: `${s.score} pts`,
            detail: `${s.perfect + s.good + s.ok} of ${notes.length} notes hit, ${s.perfect} perfect, best streak ${s.bestCombo}`,
          };
        }),
    });
  };

  let stopTicks = () => {};

  return {
    start() {
      stopTicks = m.every(1000 / FPS, tick);
      m.publish();
    },

    input(id, args) {
      const color = args?.color as GameColor;
      if (!RHYTHM_LANES.includes(color)) throw new HbError('Pick a color');
      const now = Date.now();
      // The phone sends when it was tapped (server clock), a little before the message got here
      const at = clamp(num(args?.at, now), now - GRACE_MS, now + 50);
      if (over || at < firstAt - RHYTHM.travelMs) return { grade: null };
      const s = scores.get(id)!;
      const player = m.players.findIndex((p) => p.id === id);
      const lane = RHYTHM_LANES.indexOf(color);
      const i = rhythmTarget(notes, at, color, (n) => hits.get(id)!.has(n));
      if (i < 0) {
        s.wrong += 1;
        s.combo = 0;
        judge(s, 'miss');
        m.sound('rhythm', { player, lane, grade: 'miss' });
        m.publish();
        return { grade: 'miss' };
      }
      const grade = rhythmGradeOf(at - notes[i].at);
      hits.get(id)!.add(i);
      s.combo += 1;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.score += RHYTHM_POINTS[grade] * rhythmMultiplier(s.combo);
      s[grade as 'perfect' | 'good' | 'ok'] += 1;
      judge(s, grade);
      const rgb = LED[color];
      flashes.push({ at: now, rgb: grade === 'perfect' ? [255, 255, 255] : rgb });
      m.sound('rhythm', { player, lane, grade });
      m.publish();
      return { grade, note: i };
    },

    view(): RhythmView {
      return {
        notes,
        bpm,
        startAt,
        endAt,
        scores: Object.fromEntries(scores),
        leds: strip?.leds ?? null,
      };
    },
  };
};
