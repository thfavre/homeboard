import {
  RHYTHM,
  RHYTHM_COLORS,
  RHYTHM_POINTS,
  RHYTHM_WRONG_PENALTY,
  rhythmLevel,
  rhythmGradeOf,
  rhythmMultiplier,
  rhythmTarget,
  type RhythmColor,
  type RhythmGrade,
  type RhythmNote,
  type RhythmScore,
  type RhythmView,
} from '../../../shared/games.ts';
import { HbError, clamp, num } from '../../core/util.ts';
import { best, type GameFactory } from './engine.ts';
import { BS_DIFFICULTIES, type BsDifficulty, type BsNote, type Song } from './beatsaver.ts';

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

/**
 * A song: notes on a steady beat, the lane wandering left and right like a guitar line.
 * `busy` starts it denser; with one or two colors it never gets to the densest patterns.
 */
function compose(firstAt: number, beatMs: number, songMs: number, lanes: RhythmColor[], busy: number): RhythmNote[] {
  const notes: RhythmNote[] = [];
  const bars = Math.max(2, Math.floor(songMs / (beatMs * 4)));
  const top = lanes.length - 1;
  const densest = lanes.length <= 2 ? 2 : 3;
  let lane = Math.floor(Math.random() * lanes.length);
  for (let bar = 0; bar < bars; bar++) {
    const last = bar === bars - 1;
    const level = Math.min(densest, busy + Math.floor((bar / bars) * 4.4));
    const pattern = last ? [1, 0, 0, 0, 0, 0, 0, 0] : pick(PATTERNS[level]);
    pattern.forEach((on, i) => {
      if (!on) return;
      // Calm songs repeat lanes more, busy ones jump around (further with many colors)
      lane += pick(level < 1 ? [-1, 0, 0, 1] : lanes.length > 4 ? [-3, -2, -1, -1, 0, 1, 1, 2, 3] : [-2, -1, -1, 0, 1, 1, 2]);
      if (lane < 0) lane = -lane;
      if (lane > top) lane = 2 * top - lane;
      lane = clamp(lane, 0, top);
      notes.push({ at: Math.round(firstAt + (bar * 8 + i) * (beatMs / 2)), color: lanes[lane] });
    });
  }
  return notes;
}

/** Beat Saber chart for each level (the closest one the map has is used) */
const CHART_FOR_LEVEL: BsDifficulty[] = ['Easy', 'Easy', 'Normal', 'Normal', 'Hard', 'Hard', 'Expert', 'Expert', 'ExpertPlus', 'ExpertPlus'];
/** Shortest gap kept between two notes of a chart, per level: Beat Saber is played with two arms, here one strip and thumbs */
const MIN_GAP_MS = [520, 450, 380, 340, 300, 260, 230, 200, 185, 185];

function chartFor(song: Song, difficulty: number): BsNote[] {
  const want = BS_DIFFICULTIES.indexOf(CHART_FOR_LEVEL[difficulty - 1]);
  // The wanted one, then easier ones, then harder ones
  const order = [...BS_DIFFICULTIES.slice(0, want + 1).reverse(), ...BS_DIFFICULTIES.slice(want + 1)];
  for (const d of order) if (song.charts[d]?.length) return song.charts[d]!;
  return [];
}

/**
 * The song's notes between `fromMs` and `toMs`, timed for this game. The 4 columns of Beat Saber become
 * the keys: 2 keys follow the two sabers, 8 keys are the 4 columns of each saber.
 */
function songNotes(chart: BsNote[], fromMs: number, toMs: number, zeroAt: number, lanes: RhythmColor[], minGapMs: number): RhythmNote[] {
  const notes: RhythmNote[] = [];
  let last = -Infinity;
  for (const n of chart) {
    if (n.ms < fromMs || n.ms > toMs || n.ms - last < minGapMs) continue;
    last = n.ms;
    const k = lanes.length;
    const lane = k === 8 ? n.x + 4 * n.c : k === 2 ? n.c : Math.min(k - 1, Math.floor((n.x * k) / 4));
    notes.push({ at: zeroAt + n.ms, color: lanes[lane] });
  }
  return notes;
}

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const LED = Object.fromEntries(RHYTHM_COLORS.map((c) => [c.id, rgbOf(c.led)])) as Record<RhythmColor, [number, number, number]>;
const ZONE = { perfect: [0, 255, 40], good: [255, 110, 0], ok: [255, 0, 0] } as const;

/** Rhythm Rain: notes climb a light strip; tap their color as they cross the zone at the top */
export const rhythmRain: GameFactory = (m) => {
  const difficulty = Math.min(10, Math.max(1, Math.round(m.options.difficulty ?? 5)));
  const level = rhythmLevel(difficulty);
  const lanes = RHYTHM_COLORS.slice(0, level.lanes).map((c) => c.id);
  // The host's speed scales how fast the notes climb, at every level
  const travelMs = Math.round(level.travelMs / (Math.max(50, m.settings.rhythmSpeed || 100) / 100));
  const song = m.options.music ? m.song : null;
  const chart = song ? chartFor(song, difficulty) : [];
  const bpm = song ? Math.round(song.bpm * 100) / 100 : level.bpm[0] + Math.floor(Math.random() * (level.bpm[1] - level.bpm[0] + 1));
  const beatMs = 60_000 / bpm;
  const startAt = Date.now();
  const songMs = m.settings.rhythmSec * 1000;
  let notes: RhythmNote[];
  let music: RhythmView['music'] = null;
  /** Server time of the song's beat 0 (the zone pulses on its beats) */
  let beatZero = startAt;
  if (song && chart.length) {
    // The map's "best part", or from the first note when it has none
    let fromMs = song.previewMs > 0 ? song.previewMs : chart[0].ms;
    if (chart.filter((n) => n.ms >= fromMs && n.ms <= fromMs + songMs).length < 10) fromMs = Math.max(0, chart[0].ms - 1000);
    // The music starts once the count-in is over, the first notes already climbing
    const musicAt = startAt + Math.max(RHYTHM.leadMs, travelMs + 1000);
    beatZero = musicAt - fromMs;
    notes = songNotes(chart, fromMs, fromMs + songMs, beatZero, lanes, MIN_GAP_MS[difficulty - 1]);
    const lastAt = notes.length ? notes[notes.length - 1].at : musicAt + songMs;
    music = {
      url: song.url,
      title: song.title,
      artist: song.artist,
      at: musicAt,
      offsetMs: fromMs,
      durationMs: lastAt + RHYTHM.okMs + GRACE_MS + OUTRO_MS - musicAt,
    };
  } else {
    // The count-in: whole beats, long enough for the first note to climb the strip
    const firstAt = startAt + Math.ceil(Math.max(RHYTHM.leadMs, travelMs + beatMs * 2) / beatMs) * beatMs;
    notes = compose(firstAt, beatMs, songMs, lanes, level.busy);
  }
  if (!notes.length) notes = compose(startAt + RHYTHM.leadMs, beatMs, songMs, lanes, level.busy);
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
    const speed = zone / travelMs;
    const sinceBeat = (((now - beatZero) % beatMs) + beatMs) % beatMs;
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
      if (music) m.sound('rhythmMusic', { ...music, earlyMs: m.settings.rhythmAudioOffset });
      m.publish();
    },

    input(id, args) {
      const color = args?.color as RhythmColor;
      if (!lanes.includes(color)) throw new HbError('Pick a color');
      const now = Date.now();
      // The phone sends when it was tapped (server clock), a little before the message got here
      const at = clamp(num(args?.at, now), now - GRACE_MS, now + 50);
      if (over || at < notes[0].at - travelMs) return { grade: null };
      const s = scores.get(id)!;
      const player = m.players.findIndex((p) => p.id === id);
      const lane = lanes.indexOf(color);
      const i = rhythmTarget(notes, at, color, (n) => hits.get(id)!.has(n));
      if (i < 0) {
        s.wrong += 1;
        s.combo = 0;
        s.score = Math.max(0, s.score - RHYTHM_WRONG_PENALTY);
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
        music,
        difficulty,
        lanes,
        travelMs,
        startAt,
        endAt,
        scores: Object.fromEntries(scores),
        leds: strip?.leds ?? null,
      };
    },
  };
};
