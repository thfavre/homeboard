import {
  RHYTHM,
  RHYTHM_COLORS,
  RHYTHM_HOLD,
  RHYTHM_POINTS,
  RHYTHM_WRONG_PENALTY,
  rhythmColors,
  rhythmDifficulty,
  rhythmGradeOf,
  rhythmMultiplier,
  rhythmTapWindow,
  rhythmTarget,
  songBeat,
  songBpmAt,
  songMsAt,
  type RhythmColor,
  type RhythmDifficulty,
  type RhythmGrade,
  type RhythmNote,
  type RhythmScore,
  type RhythmTempo,
  type RhythmView,
} from '../../../shared/games.ts';
import { HbError, clamp, num } from '../../core/util.ts';
import { FRAME_MS, best, type GameFactory, type GameRuntime } from './engine.ts';
import { BS_DIFFICULTIES, type BsNote, type Song } from './beatsaver.ts';

const GRACE_MS = RHYTHM.graceMs;
/** Time after the last note is judged before the result: the light plays the finale */
const OUTRO_MS = 2200;
/** A hit lights up the zone for this long */
const FLASH_MS = 280;
/** A new multiplier sends a wave down the strip for this long */
const WAVE_MS = 700;
/** A note's head and tail, in time of travel: the same look whatever the strip's density */
const NOTE_HEAD_MS = 22;
const NOTE_TAIL_MS = 110;
/** Brightness where the tail starts, next to the head (1: as bright as the head) */
const TAIL_START = 0.3;
/** Longest a whole song goes on after its last note (its outro, fading out) */
const SONG_TAIL_MS = 6000;
/** The music starts this long after the TV gets its cue (time for the message to get there) */
const MUSIC_CUE_MS = 1000;
/** Longest wait for the TV to have the song ready before starting anyway */
const TV_WAIT_MS = 12_000;

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
 * `busy` starts it denser, `densest` caps it (one or two colors never get to the densest patterns).
 */
function compose(firstAt: number, beatMs: number, songMs: number, lanes: RhythmColor[], busy: number, densestOf: number): RhythmNote[] {
  const notes: RhythmNote[] = [];
  const bars = Math.max(2, Math.floor(songMs / (beatMs * 4)));
  const top = lanes.length - 1;
  const densest = Math.min(densestOf, lanes.length <= 2 ? 2 : 3);
  let lane = Math.floor(Math.random() * lanes.length);
  for (let bar = 0; bar < bars; bar++) {
    const last = bar === bars - 1;
    const level = Math.min(densest, busy + Math.floor((bar / bars) * 4.4));
    const pattern = last ? [1, 0, 0, 0, 0, 0, 0, 0] : pick(PATTERNS[level]);
    pattern.forEach((on, i) => {
      if (!on) return;
      // Calm songs repeat lanes more, busy ones jump around (further with many colors)
      lane += pick(level < 1 ? [-1, 0, 0, 1] : [-2, -1, -1, 0, 1, 1, 2]);
      if (lane < 0) lane = -lane;
      if (lane > top) lane = 2 * top - lane;
      lane = clamp(lane, 0, top);
      notes.push({ at: Math.round(firstAt + (bar * 8 + i) * (beatMs / 2)), color: lanes[lane] });
    });
  }
  return notes;
}

/** The song's chart of that difficulty, or the closest it has (easier first) */
export function chartFor(song: Song, difficulty: RhythmDifficulty): { id: RhythmDifficulty; notes: BsNote[]; tempo: RhythmTempo[] | null } | null {
  const want = BS_DIFFICULTIES.indexOf(difficulty);
  const order = [...BS_DIFFICULTIES.slice(0, want + 1).reverse(), ...BS_DIFFICULTIES.slice(want + 1)];
  for (const d of order) if (song.charts[d]?.length) return { id: d, notes: song.charts[d]!, tempo: song.tempos?.[d] ?? null };
  return null;
}

/**
 * A time of the song (ms) as it would be on one tempo all along (`bpm`): its beat number times a beat.
 * The beat grid is read there, so a song that changes tempo keeps its bars. Without changes: the same time.
 */
const gridMs = (ms: number, bpm: number, tempo?: RhythmTempo[] | null) => (tempo?.length ? (songBeat(ms, bpm, tempo) * 60_000) / bpm : ms);

/** Two notes this much closer than the difficulty's gap still count as far enough (a 158 bpm beat is 379.7 ms) */
const GAP_TOLERANCE = 0.9;

/**
 * Where the chart's beats fall (ms of a beat line, modulo a beat). Mappers often shift their grid (an editor
 * offset baked into the notes), so it is read from the notes: the most common place within a quarter beat
 * gives the grid, and of its four quarters the one most notes fall on is the beat.
 */
export function gridPhase(chart: BsNote[], beatMs: number): number {
  const q = beatMs / 4;
  const bins = new Map<number, number>();
  for (const n of chart) {
    const r = Math.round((((n.ms % q) + q) % q) / 5) % Math.round(q / 5);
    bins.set(r, (bins.get(r) ?? 0) + 1);
  }
  const sub = ([...bins.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0) * 5;
  const quarters = [0, 0, 0, 0];
  for (const n of chart) quarters[((Math.round((n.ms - sub) / q) % 4) + 4) % 4]++;
  return sub + quarters.indexOf(Math.max(...quarters)) * q;
}

/** How much a note's place in the bar matters: on a beat, on a half beat, on a quarter, elsewhere */
function strength(ms: number, beatMs: number, phase: number): number {
  const beats = (ms - phase) / beatMs;
  const on = (step: number) => Math.abs(beats / step - Math.round(beats / step)) * step < 0.03;
  return on(1) ? 3 : on(0.5) ? 2 : on(0.25) ? 1 : 0;
}

/**
 * The notes of a chart that are played here: Beat Saber is played with two arms, here with thumbs, so notes
 * closer than `minGapMs` are thinned out. Notes standing on their own go first (a syncopated note with room
 * around it is the melody; notes of a fast run are the filler), then by their place in the bar (on the beat,
 * then half beats...: only for charts on a grid), each one only where it fits: what is left still follows
 * the music. Sorted by time.
 */
export function playable(chart: BsNote[], bpm: number, minGapMs: number, tempo?: RhythmTempo[] | null): BsNote[] {
  const beatMs = 60_000 / bpm;
  const gap = minGapMs * GAP_TOLERANCE;
  // Places in the bar and room are read on the beat grid (a song that changes tempo keeps its bars); the gap a thumb needs, in time
  const grid = (ms: number) => gridMs(ms, bpm, tempo);
  const phase = gridPhase(tempo?.length ? chart.map((n) => ({ ...n, ms: grid(n.ms) })) : chart, beatMs);
  // Charts mapped by ear (or drifting from their tempo) have no grid to go by: then only the room counts
  const onGrid = chart.filter((n) => strength(grid(n.ms), beatMs, phase) > 0).length / Math.max(1, chart.length);
  const gridded = onGrid >= 0.8;
  // Room around each note: the smaller gap to the notes before and after (notes of a chord count as one), in eighth beats up to a beat
  const times = [...new Set(chart.map((n) => n.ms))].sort((x, y) => x - y);
  const room = new Map<number, number>();
  times.forEach((t, i) => {
    const r = Math.min(i > 0 ? grid(t) - grid(times[i - 1]) : Infinity, i < times.length - 1 ? grid(times[i + 1]) - grid(t) : Infinity);
    room.set(t, Math.min(8, Math.round((r / beatMs) * 8)));
  });
  const order = chart
    .map((n, i) => ({ n, i, r: room.get(n.ms)!, s: gridded ? strength(grid(n.ms), beatMs, phase) : 0 }))
    .sort((x, y) => y.r - x.r || y.s - x.s || x.n.ms - y.n.ms || x.i - y.i);
  // Kept times, sorted: a note goes in when it is far enough from its neighbours there
  const kept: BsNote[] = [];
  for (const { n } of order) {
    let lo = 0;
    let hi = kept.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (kept[mid].ms < n.ms) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && n.ms - kept[lo - 1].ms < gap) continue;
    if (lo < kept.length && kept[lo].ms - n.ms < gap) continue;
    kept.splice(lo, 0, n);
  }
  return kept;
}

/**
 * How steady a chart's rhythm is as played here: the share of the gaps between notes that have the most
 * common length, in quarter beats (pauses over 4 beats are left out). 1: the same gap all along, too
 * regular to be fun; under about 0.55: a varied rhythm.
 */
export function chartSteadiness(chart: BsNote[], bpm: number, minGapMs: number, tempo?: RhythmTempo[] | null): number {
  const beatMs = 60_000 / bpm;
  const notes = playable(chart, bpm, minGapMs, tempo);
  const counts = new Map<number, number>();
  let gaps = 0;
  for (let i = 1; i < notes.length; i++) {
    const beats = (gridMs(notes[i].ms, bpm, tempo) - gridMs(notes[i - 1].ms, bpm, tempo)) / beatMs;
    if (beats > 4) continue;
    const q = Math.round(beats * 4);
    counts.set(q, (counts.get(q) ?? 0) + 1);
    gaps++;
  }
  return gaps ? Math.round((Math.max(...counts.values()) / gaps) * 100) / 100 : 1;
}

/** Notes a second of a chart as played here, over the whole song */
export function chartNps(chart: BsNote[], bpm: number, minGapMs: number, tempo?: RhythmTempo[] | null): number {
  if (chart.length < 2) return 0;
  const kept = playable(chart, bpm, minGapMs, tempo).length;
  return Math.round((kept / ((chart[chart.length - 1].ms - chart[0].ms) / 1000)) * 10) / 10;
}

/**
 * The part of the song to play, in ms of the song: between `minMs` and `maxMs` long, around the map's
 * "best part" (where its preview starts, usually the chorus, the drop or the famous riff). It starts and ends on
 * whole bars, preferably where the notes pause (a phrase starts or ends there) or at the song's end.
 * The whole song when it fits in `maxMs` or when `whole` is set. `toEnd`: it goes to the song's end.
 */
export function pickSection(
  chart: BsNote[],
  beatMs: number,
  audioMs: number,
  previewMs: number,
  minMs: number,
  maxMs: number,
  whole: boolean,
  tempo?: RhythmTempo[] | null,
): { fromMs: number; toMs: number; toEnd: boolean } {
  if (!tempo?.length) return pickOnGrid(chart, beatMs, audioMs, previewMs, minMs, maxMs, whole);
  // A song that changes tempo: picked on its beat grid, so it starts and ends on whole bars, then back to time
  const bpm = 60_000 / beatMs;
  const grid = (ms: number) => gridMs(ms, bpm, tempo);
  const time = (g: number) => songMsAt(g / beatMs, bpm, tempo);
  const part = pickOnGrid(chart.map((n) => ({ ...n, ms: grid(n.ms) })), beatMs, grid(audioMs), grid(previewMs), minMs, maxMs, whole);
  const fromMs = time(part.fromMs);
  let to = part.toMs;
  let toEnd = part.toEnd;
  // Slower bars last longer: end a bar earlier until it fits the longest part again
  const bar = beatMs * 4;
  while (!whole && time(to) - fromMs > maxMs) {
    const earlier = (Math.ceil(to / bar - 1e-6) - 1) * bar;
    if (earlier <= part.fromMs) break;
    to = earlier;
    toEnd = false;
  }
  return { fromMs, toMs: time(to), toEnd };
}

function pickOnGrid(
  chart: BsNote[],
  beatMs: number,
  audioMs: number,
  previewMs: number,
  minMs: number,
  maxMs: number,
  whole: boolean,
): { fromMs: number; toMs: number; toEnd: boolean } {
  const first = chart[0].ms;
  const last = chart[chart.length - 1].ms;
  // Where the music ends: the song's end, without a long outro
  const end = Math.min(Math.max(audioMs, last + 1000), last + SONG_TAIL_MS);
  // A long quiet intro is skipped, up to a few seconds before the first note
  const intro = first > 6000 ? first - 3000 : 0;
  if (whole || end - intro <= maxMs) return { fromMs: intro, toMs: end, toEnd: true };

  const bar = beatMs * 4;
  /** How quiet the song is around `t`: the gap between the notes on both sides, in bars (0 to 2) */
  const quietAt = (t: number) => {
    let i = 0;
    while (i < chart.length && chart[i].ms < t) i++;
    const before = i > 0 ? chart[i - 1].ms : -Infinity;
    const after = i < chart.length ? chart[i].ms : Infinity;
    return Math.min(after - before, 2 * bar) / bar;
  };
  // The best part is where BeatSaver's preview starts, the one guests hear when they pick the song: the game
  // must have it. Before the first note: the song's start. Past the last one (a broken map): the busiest part.
  const picked = previewMs < last;
  let anchor = Math.max(first, previewMs);
  if (!picked) {
    let most = -1;
    for (let t = Math.floor(first / bar) * bar; t + minMs <= end; t += bar) {
      const count = chart.filter((n) => n.ms >= t && n.ms < t + minMs).length;
      // An earlier part wins unless a later one is clearly busier
      if (count > most * 1.1) {
        most = count;
        anchor = Math.max(first, t);
      }
    }
  }
  const starts = new Set<number>();
  // Up to 8 bars before the best part, for the build-up into it
  for (let k = 0; k <= 8; k++) {
    const t = (Math.floor(anchor / bar) - k) * bar;
    if (t >= 0) starts.add(t);
  }
  // A best part near the end: start earlier, so the part is long enough before the song ends
  for (let t = Math.max(0, Math.floor((end - maxMs) / bar) * bar); t <= end - minMs; t += bar) starts.add(t);

  const fallback = Math.max(0, Math.min(anchor - bar, end - maxMs));
  let pick = { score: -Infinity, fromMs: fallback, toMs: Math.min(end, fallback + maxMs), toEnd: fallback + maxMs >= end };
  const lo = Math.ceil(minMs / bar);
  const hi = Math.max(lo, Math.floor(maxMs / bar));
  for (const from of starts) {
    const back = (anchor - from) / bar;
    // Close to the best part, at a quiet spot; starting after it costs a lot (it would be cut)
    const startScore = (from <= first ? 2 : quietAt(from)) - (back >= 0 ? back * 0.2 : 3 - back);
    const ends: number[] = [];
    for (let j = lo; j <= hi; j++) if (from + j * bar < end) ends.push(from + j * bar);
    if (end - from >= minMs && end - from <= maxMs) ends.push(end);
    for (const to of ends) {
      const bars = Math.round((to - from) / bar);
      // The song's own ending is best; else a pause in the notes, better after 4 or 8 whole bars
      const endScore = to === end ? 3 : quietAt(to) + (bars % 8 === 0 ? 0.8 : bars % 4 === 0 ? 0.4 : 0);
      const longer = ((to - from - minMs) / Math.max(1, maxMs - minMs)) * 0.5;
      const score = startScore + endScore + longer;
      if (score > pick.score) pick = { score, fromMs: from, toMs: to, toEnd: to === end };
    }
  }
  return { fromMs: pick.fromMs, toMs: pick.toMs, toEnd: pick.toEnd };
}

/** Within this many times the difficulty's gap, two notes count as fast: a key repeated there is hard on one thumb */
const FAST_GAPS = 2.2;

/**
 * The key (0 to k - 1, left to right) of each note kept from a chart (`chart`: all its notes, for the chords).
 * Where it is in Beat Saber gives the key: 2 keys follow the two sabers, 3 keys the outer columns and the
 * middle two, 4 keys the columns. Then, measured on the host's songs to play better with thumbs:
 * - a chord (both sabers at once, here one note) takes its note on another key than the last one;
 * - a fast note on the same key as the last one, though the map put it elsewhere (the notes between were
 *   thinned out), moves to the next key the way the map moved: runs alternate instead of hammering one key.
 *   The same note again in the map stays a repeat.
 */
export function songLanes(kept: BsNote[], chart: BsNote[], k: number, minGapMs: number): number[] {
  const base = (n: BsNote) => (k === 2 ? n.c : k === 3 ? (n.x === 0 ? 0 : n.x === 3 ? 2 : 1) : Math.min(k - 1, n.x));
  const at = new Map<number, BsNote[]>();
  for (const n of chart) at.set(n.ms, [...(at.get(n.ms) ?? []), n]);
  const out: number[] = [];
  let last: BsNote | null = null;
  let prev = -1;
  for (const kn of kept) {
    const n = (at.get(kn.ms) ?? [kn]).find((x) => base(x) !== prev) ?? kn;
    let lane = base(n);
    if (last && lane === prev && kn.ms - last.ms < FAST_GAPS * minGapMs && (n.x !== last.x || n.c !== last.c)) {
      const pos = n.x + n.c / 2;
      const was = last.x + last.c / 2;
      const dir = pos > was ? 1 : pos < was ? -1 : lane < (k - 1) / 2 ? 1 : -1;
      lane = lane + dir >= 0 && lane + dir < k ? lane + dir : lane - dir;
    }
    out.push(lane);
    last = n;
    prev = lane;
  }
  return out;
}

/**
 * Which notes are held, and how long (ms, 0: a tap). A note where the music rests after it (see `RHYTHM_HOLD`:
 * a long sung note or chord ringing on, the end of a phrase) is held up to a half beat, leaving time to let go
 * before the next note: nothing else comes while a key is held. Holds start on a half beat of the chart's own
 * grid (often shifted from the song's start) and last `minBeats` to `maxBeats`.
 */
export function songHolds(kept: BsNote[], bpm: number, tempo: RhythmTempo[] | null, minGapMs: number): number[] {
  const beatMs = 60_000 / bpm;
  const phase = gridPhase(kept.map((n) => ({ ...n, ms: gridMs(n.ms, bpm, tempo) })), beatMs);
  /** Beats on the chart's grid, and back to ms of the song */
  const beat = (ms: number) => (gridMs(ms, bpm, tempo) - phase) / beatMs;
  const msAt = (b: number) => songMsAt(b + phase / beatMs, bpm, tempo);
  return kept.map((n, i) => {
    const next = kept[i + 1];
    if (!next) return 0;
    const from = beat(n.ms);
    const to = beat(next.ms);
    // A rest in the music: a long gap for this difficulty, and long next to the gaps just before (in beats)
    const before = kept.slice(Math.max(0, i - 8), i + 1).map((x) => beat(x.ms));
    const gaps = before.slice(1).map((b, j) => b - before[j]).sort((x, y) => x - y);
    const usual = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    const gapBeats = clamp(minGapMs / 190, RHYTHM_HOLD.gapBeats[0], RHYTHM_HOLD.gapBeats[1]);
    if (to - from < Math.max(gapBeats, usual * RHYTHM_HOLD.rest) || Math.abs(from * 2 - Math.round(from * 2)) > 0.06) return 0;
    // Time to let go and find the next key: half a beat, and never less than the difficulty's gap
    const letGo = Math.max(0.5, beat(next.ms) - beat(next.ms - Math.max(minGapMs, RHYTHM_HOLD.letGoMs)));
    const end = Math.min(Math.floor((to - letGo) * 2) / 2, Math.round(from * 2) / 2 + RHYTHM_HOLD.maxBeats);
    if (end - from < RHYTHM_HOLD.minBeats) return 0;
    return Math.round(msAt(end) - n.ms);
  });
}

/** The song's notes between `fromMs` and `toMs`, timed for this game, on the keys of `songLanes`, some held (`songHolds`) */
function songNotes(chart: BsNote[], bpm: number, tempo: RhythmTempo[] | null, fromMs: number, toMs: number, zeroAt: number, lanes: RhythmColor[], minGapMs: number): RhythmNote[] {
  const part = chart.filter((x) => x.ms >= fromMs && x.ms < toMs);
  const kept = playable(part, bpm, minGapMs, tempo);
  const keys = songLanes(kept, part, lanes.length, minGapMs);
  const holds = songHolds(kept, bpm, tempo, minGapMs);
  return kept.map((n, i) => ({ at: zeroAt + n.ms, color: lanes[keys[i]], ...(holds[i] ? { holdMs: holds[i] } : {}) }));
}

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
};
const LED = Object.fromEntries(RHYTHM_COLORS.map((c) => [c.id, rgbOf(c.led)])) as Record<RhythmColor, [number, number, number]>;
const ZONE = { perfect: [0, 255, 40], good: [255, 110, 0], ok: [255, 0, 0] } as const;
const WHITE = [255, 255, 255] as const;
/** The band of the zone a pixel is in, from its distance to the middle in ms (null: outside) */
const gradeAt = (gapMs: number) => (gapMs <= RHYTHM.perfectMs ? 'perfect' : gapMs <= RHYTHM.goodMs ? 'good' : gapMs <= RHYTHM.okMs ? 'ok' : null);
/** Sparks of a hit: direction (up 1, down -1) and how far they fly, in sixtieths of the strip */
const SPARKS: [number, number][] = [
  [1, 3],
  [1, 1.6],
  [-1, 2.4],
  [-1, 1.2],
];
/** Finale color of a solo game, by the share of notes hit: gold, green, blue, red */
const SOLO_FINALE: [number, readonly number[]][] = [
  [0.9, [255, 176, 0]],
  [0.7, [0, 255, 60]],
  [0.4, [0, 120, 255]],
  [0, [255, 0, 40]],
];

/** Rhythm Rain: notes climb a light strip; tap their color as they cross the zone at the top */
export const rhythmRain: GameFactory = (m) => {
  const song = m.song;
  const found = song ? chartFor(song, rhythmDifficulty(m.options.chart).id) : null;
  // The chart played (the closest the song has, should it miss the one asked)
  const level = rhythmDifficulty(found?.id ?? m.options.chart);
  const chart = found?.notes ?? [];
  /** The chart's tempo changes, in ms of the song (null: one tempo all along) */
  const tempo = found?.tempo ?? null;
  const lanes = RHYTHM_COLORS.slice(0, rhythmColors(m.options.colors)).map((c) => c.id);
  const travelMs = level.travelMs;
  const bpm = song ? Math.round(song.bpm * 100) / 100 : level.bpm[0] + Math.floor(Math.random() * (level.bpm[1] - level.bpm[0] + 1));
  const beatMs = 60_000 / bpm;
  const minMs = Math.min(m.settings.rhythmMinSec, m.settings.rhythmMaxSec) * 1000;
  const maxMs = Math.max(m.settings.rhythmMinSec, m.settings.rhythmMaxSec) * 1000;
  const solo = m.mode === 'solo';
  // Solo: the taps sound where the host chose (the TV unless set to the phone; an old 'auto' counts as the TV).
  // A duel: each phone plays its own.
  const tvSounds = solo && m.settings.rhythmSoloTaps !== 'phone';
  // The timeline is set by plan(): at once, or with music once the TV has the song ready to play
  let startAt = Date.now();
  let notes: RhythmNote[] = [];
  let music: RhythmView['music'] = null;
  let endAt = Infinity;
  /** Every note is judged from then on: the light plays the finale until endAt */
  let finaleAt = Infinity;
  /** Server time of the song's beat 0 (the zone pulses on its beats) */
  let beatZero = startAt;
  let loading = !!(song && chart.length);
  /** How many players hit each note (it goes out once everyone did) */
  let hitCount = new Uint8Array(0);

  const plan = () => {
    startAt = Date.now();
    beatZero = startAt;
    let musicEndAt = 0;
    if (song && chart.length) {
      const audioMs = song.durationSec ? song.durationSec * 1000 : chart[chart.length - 1].ms + 2000;
      let part = pickSection(chart, beatMs, audioMs, song.previewMs, minMs, maxMs, m.settings.rhythmFullSong, tempo);
      if (chart.filter((n) => n.ms >= part.fromMs && n.ms < part.toMs).length < 10) {
        part = { fromMs: Math.max(0, chart[0].ms - 1000), toMs: chart[0].ms + maxMs, toEnd: false };
      }
      // The part starts once the count-in is over, the first notes already climbing. The music starts
      // right away a little before the part, so the count-in and the first climbing notes are not silent.
      beatZero = startAt + Math.max(RHYTHM.leadMs, travelMs + 1000) - part.fromMs;
      const musicFrom = Math.max(0, part.fromMs - Math.max(RHYTHM.leadMs, travelMs + 1000) + MUSIC_CUE_MS);
      const musicAt = beatZero + musicFrom;
      notes = songNotes(chart, song.bpm, tempo, part.fromMs, part.toMs, beatZero, lanes, level.minGapMs);
      const lastAt = notes.length ? notes[notes.length - 1].at : musicAt + minMs;
      // Played to the song's end, or a little past the last note, fading out
      musicEndAt = part.toEnd ? beatZero + part.toMs : lastAt + RHYTHM.okMs + GRACE_MS + OUTRO_MS;
      music = {
        url: song.url,
        title: song.title,
        artist: song.artist,
        cover: song.cover,
        at: musicAt,
        offsetMs: musicFrom,
        durationMs: musicEndAt - musicAt,
      };
    } else {
      // The count-in: whole beats, long enough for the first note to climb the strip
      const firstAt = startAt + Math.ceil(Math.max(RHYTHM.leadMs, travelMs + beatMs * 2) / beatMs) * beatMs;
      notes = compose(firstAt, beatMs, minMs, lanes, level.busy, level.densest);
      beatZero = firstAt;
    }
    if (!notes.length) notes = compose(startAt + RHYTHM.leadMs, beatMs, minMs, lanes, level.busy, level.densest);
    hitCount = new Uint8Array(notes.length);
    finaleAt = notes[notes.length - 1].at + RHYTHM.okMs + GRACE_MS;
    endAt = Math.max(finaleAt + OUTRO_MS, musicEndAt);
  };

  /** With music: the TV said the song is decoded and its sound is on (or it took too long) */
  const go = () => {
    if (!loading || over) return;
    loading = false;
    plan();
    if (music) m.sound('rhythmMusic', { ...music, earlyMs: m.settings.rhythmAudioOffset });
    m.publish();
  };

  const scores = new Map<string, RhythmScore>(
    m.players.map((p) => [p.id, { score: 0, combo: 0, bestCombo: 0, perfect: 0, good: 0, ok: 0, missed: 0, wrong: 0, held: 0, last: null }]),
  );
  /** The held note each player keeps down now: its index and when it ends (server time) */
  const holding = new Map<string, { note: number; until: number }>();
  /** Points for the time a held note was kept down, up to `at` (its end when held to it, give or take `earlyMs`) */
  const letGo = (id: string, at: number) => {
    const h = holding.get(id);
    if (!h) return;
    holding.delete(id);
    const s = scores.get(id)!;
    const start = notes[h.note].at;
    const full = at >= h.until - RHYTHM_HOLD.earlyMs;
    const ms = full ? h.until - start : clamp(at - start, 0, h.until - start);
    s.score += Math.round((ms / 1000) * RHYTHM_HOLD.pointsPerSec) * rhythmMultiplier(s.combo);
    if (full) s.held += 1;
    m.publish();
  };
  const hits = new Map<string, Set<number>>(m.players.map((p) => [p.id, new Set()]));
  /** Next note to check for a miss, per player */
  const passed = new Map<string, number>(m.players.map((p) => [p.id, 0]));
  let seq = 0;
  let over = false;
  /** Bursts at the zone: hits (white hot on a perfect), and wrong taps (a short red glow) */
  /** `gapMs`: how late the tap was (early < 0), so the burst is where the note was, in the band it was judged in */
  const flashes: { at: number; rgb: readonly number[]; grade?: RhythmGrade; gapMs?: number; wrong?: boolean }[] = [];
  /** A player reached a new multiplier: a wave of their color runs down the strip */
  const waves: { at: number; rgb: readonly number[] }[] = [];
  /** Finale color: the winner's, white on a tie; solo, by how well it went */
  let finale: readonly number[] | null = null;

  const strip = m.settings.rhythmLight ? m.strip(m.settings.rhythmLight) : null;
  const reverse = m.settings.rhythmReverse;

  const judge = (s: RhythmScore, grade: RhythmGrade) => {
    s.last = { grade, at: Date.now(), seq: ++seq };
  };

  const finaleColor = (): readonly number[] => {
    if (solo) {
      const s = scores.get(m.players[0].id)!;
      const share = notes.length ? (s.perfect + s.good + s.ok) / notes.length : 0;
      return SOLO_FINALE.find(([min]) => share >= min)![1];
    }
    const top = best(m.players, (id) => scores.get(id)!.score);
    return top.length === 1 ? rgbOf(m.players.find((p) => p.id === top[0])!.color) : WHITE;
  };

  /**
   * One frame of the strip: the hit zone breathing on the beat, the notes climbing with a fading tail
   * (gone once hit, dying out when missed), bursts on hits, waves on a new multiplier, then the finale.
   */
  const render = (now: number, leds: number): Uint8Array => {
    const px = new Float32Array(leds * 3);
    const add = (i: number, rgb: readonly number[], k: number) => {
      if (i < 0 || i >= leds || k <= 0) return;
      for (let c = 0; c < 3; c++) px[i * 3 + c] += rgb[c] * k;
    };
    const zone = Math.round(RHYTHM.zoneAt * (leds - 1));
    const speed = zone / travelMs;
    // Sizes: a note is sized by time, so it looks the same on any strip (a dense one moves more pixels a
    // second); the bursts and waves scale with the strip, drawn for 60 pixels (u = 1)
    const u = Math.max(1, leds / 60);
    const head = Math.max(1.2, NOTE_HEAD_MS * speed);
    const tail = Math.max(4, NOTE_TAIL_MS * speed);
    // Time since the last beat, on the tempo of that moment for a song that changes tempo
    const beat = songBeat(now - beatZero, bpm, tempo);
    const sinceBeat = ((beat - Math.floor(beat)) * 60_000) / songBpmAt(now - beatZero, bpm, tempo);
    const playing = now < finaleAt;
    const pulse = playing ? Math.exp(-sinceBeat / 140) : 0;

    // The zone: its timing windows breathing on the beat, fading away for the finale
    const zoneK = playing ? 1 : Math.max(0, 1 - (now - finaleAt) / 400);
    for (let i = 0; i < leds; i++) {
      const gap = Math.abs(i - zone) / speed;
      const kind = gradeAt(gap);
      if (kind) add(i, ZONE[kind], (0.09 + 0.16 * pulse) * zoneK);
    }
    // While the TV loads the song, the middle of the zone breathes: the game is on
    if (loading) for (let i = Math.floor(zone - u); i <= Math.ceil(zone + u); i++) add(i, WHITE, 0.15 + 0.15 * Math.sin(now / 300));

    for (let n = 0; n < notes.length; n++) {
      const note = notes[n];
      const pos = zone - (note.at - now) * speed;
      if (pos < -head) break;
      if (note.holdMs) {
        // A held note: a body as long as the hold under its head. Kept down, it burns away into the zone,
        // which glows; let go early, what is left goes dim; missed, it fades out like the note
        const end = zone - (note.at + note.holdMs - now) * speed;
        const held = [...holding.values()].some((h) => h.note === n);
        const hit = hitCount[n] > 0;
        const late = now - note.at - RHYTHM.okMs;
        const top = hit ? Math.min(pos, zone) : pos - head / 2;
        const k = held ? 0.55 : hit ? 0.1 : late > 0 ? 0.25 * Math.max(0, 1 - late / 600) : 0.32;
        const c = LED[note.color];
        const rgb = !hit && late > 0 ? [c[0] * 0.5 + 120, c[1] * 0.3, c[2] * 0.3] : c;
        for (let i = Math.floor(Math.max(0, end)); i < Math.min(leds, top); i++) add(i, rgb, k * Math.max(0, Math.min(i + 1, top) - Math.max(i, end)));
        if (held && end < zone) {
          for (let i = Math.floor(zone - u); i <= Math.ceil(zone + u); i++) {
            const core = Math.max(0, 1 - Math.abs(i + 0.5 - zone) / (u + 0.5));
            add(i, c, (0.45 + 0.2 * Math.sin(now / 45)) * core);
            add(i, WHITE, 0.2 * core);
          }
        }
      }
      if (pos > leds + tail) continue;
      // Hit by everyone: the burst takes over. Hit by one of two: dimmer, still there for the other.
      if (hitCount[n] >= m.players.length) continue;
      let k = hitCount[n] ? 0.4 : 1;
      let rgb: readonly number[] = LED[note.color];
      const late = now - note.at - RHYTHM.okMs;
      if (late > 0) {
        // Missed: it turns dim red and dies out above the zone
        k *= Math.max(0, 1 - late / 350) * 0.6;
        if (k <= 0) continue;
        rgb = [rgb[0] * 0.5 + 120, rgb[1] * 0.3, rgb[2] * 0.3];
      }
      // A bright head centered on `pos` with a white hot core, and a tail fading below it; the edges are
      // shaded by how much of a pixel they cover, so the note glides instead of jumping pixel to pixel
      const top = pos + head / 2;
      const bottom = pos - head / 2;
      for (let i = Math.floor(bottom - tail); i <= Math.ceil(top); i++) {
        const cover = Math.max(0, Math.min(i + 1, top) - Math.max(i, bottom));
        const below = bottom - (i + 0.5);
        const t = cover > 0 ? cover + (1 - cover) * (below > 0 ? TAIL_START : 0) : below > 0 ? TAIL_START * Math.exp((-below * 3.5) / tail) : 0;
        add(i, rgb, Math.min(1, t) * k);
        if (Math.abs(i + 0.5 - pos) < Math.max(0.5, head / 4)) add(i, WHITE, 0.2 * k);
      }
    }

    for (const f of flashes) {
      const t = (now - f.at) / FLASH_MS;
      if (t < 0 || t > 1) continue;
      if (f.wrong) {
        for (let i = Math.floor(zone - u); i <= Math.ceil(zone + u); i++) add(i, f.rgb, 0.5 * (1 - t));
        continue;
      }
      // A small explosion where the note was hit: a short flash, white hot on a perfect, and a few sparks
      // of the note's color flying out a little way up and down, fading as they go
      const at = zone + (f.gapMs ?? 0) * speed;
      const flash = Math.max(0, 1 - t * 3);
      for (let i = Math.floor(at - u); i <= Math.ceil(at + u); i++) {
        const core = Math.max(0, 1 - Math.abs(i + 0.5 - at) / u);
        add(i, f.grade === 'perfect' ? WHITE : f.rgb, 0.7 * flash * core);
      }
      for (const [dir, reach] of SPARKS) {
        const p = at + dir * reach * u * (1 - (1 - t) * (1 - t));
        const k = 0.6 * (1 - t);
        const i = Math.floor(p);
        add(i, f.rgb, k * (1 - (p - i)));
        add(i + 1, f.rgb, k * (p - i));
      }
    }

    for (const w of waves) {
      const t = (now - w.at) / WAVE_MS;
      if (t < 0 || t > 1) continue;
      const pos = zone - t * zone * 1.1;
      for (let i = Math.floor(pos - 3 * u); i <= Math.ceil(pos + 3 * u); i++) add(i, w.rgb, 0.8 * (1 - t) * Math.max(0, 1 - Math.abs(i - pos) / (3 * u)));
    }

    if (now >= finaleAt) {
      finale ??= finaleColor();
      // The strip fills from the bottom with the finale color, a bright front and sparkles, then fades out
      const fill = Math.min(1, (now - finaleAt) / 700) * leds;
      const fade = Math.max(0, Math.min(1, (endAt - now) / 700));
      for (let i = 0; i <= fill && i < leds; i++) {
        const front = Math.max(0, 1 - (fill - i) / (4 * u));
        add(i, finale, (0.35 + 0.65 * front) * fade);
        if (Math.random() < 0.05) add(i, WHITE, 0.6 * fade);
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
    // Autoplay (the host trying it): every note is tapped right on time
    if (m.options.autoplay && !loading) {
      while (auto < notes.length && notes[auto].at <= now) {
        for (const p of m.players) runtime.input(p.id, { color: notes[auto].color, at: notes[auto].at });
        auto += 1;
      }
    }
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
    // Held to the end (a phone letting go just before it says so a moment later, within the early margin)
    for (const [id, h] of holding) if (now >= h.until + RHYTHM_HOLD.earlyMs) letGo(id, h.until);
    while (flashes.length && now - flashes[0].at > FLASH_MS) flashes.shift();
    while (waves.length && now - waves[0].at > WAVE_MS) waves.shift();
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
    for (const [id, h] of holding) letGo(id, Math.min(Date.now(), h.until));
    const holds = notes.filter((n) => n.holdMs).length;
    const detail = (s: RhythmScore) =>
      `${s.perfect + s.good + s.ok} of ${notes.length} notes hit, ${s.perfect} perfect, ${holds ? `${s.held} of ${holds} held, ` : ''}best streak ${s.bestCombo}`;
    // Every player's score goes to the song's leaderboard, the loser's too
    const scored = Object.fromEntries(m.players.map((p) => [p.id, score(p.id)]));
    if (solo) {
      // Nobody to beat: the score is the result
      const p = m.players[0];
      const s = scores.get(p.id)!;
      m.finish({ winners: [], scores: scored, headline: `${p.name}: ${s.score} pts`, lines: [{ id: p.id, label: `${s.score} pts`, detail: detail(s) }] });
      return;
    }
    m.finish({
      // A duel's winner shoots fireworks on the light for a while
      perk: { kind: 'fireworks' },
      winners: best(m.players, score),
      scores: scored,
      lines: [...m.players]
        .sort((a, b) => score(b.id) - score(a.id))
        .map((p) => ({ id: p.id, label: `${score(p.id)} pts`, detail: detail(scores.get(p.id)!) })),
    });
  };

  let stopTicks = () => {};
  /** Next note autoplay taps */
  let auto = 0;

  const runtime: GameRuntime = {
    start() {
      stopTicks = m.every(FRAME_MS, tick);
      if (loading) {
        // The TV loads the song (usually already done) and answers; without an answer, go anyway
        m.sound('rhythmPrepare', { url: song!.url });
        m.later(TV_WAIT_MS, go);
      } else plan();
      m.publish();
    },

    tvInput(args) {
      if (args?.ready === song?.url) go();
    },

    input(id, args) {
      const color = args?.color as RhythmColor;
      if (!lanes.includes(color)) throw new HbError('Pick a color');
      const now = Date.now();
      // The phone sends when it was tapped (server clock), a little before the message got here
      const at = clamp(num(args?.at, now), now - GRACE_MS, now + 50);
      // The key of a held note let go
      if (args?.release) {
        if (holding.get(id) && notes[holding.get(id)!.note].color === color) letGo(id, at);
        return { released: true };
      }
      const window = rhythmTapWindow(notes, travelMs);
      if (over || loading || !window || at < window[0] || at > window[1]) return { grade: null };
      const s = scores.get(id)!;
      const player = m.players.findIndex((p) => p.id === id);
      const lane = lanes.indexOf(color);
      const i = rhythmTarget(notes, at, color, (n) => hits.get(id)!.has(n));
      if (i < 0) {
        s.wrong += 1;
        s.combo = 0;
        s.score = Math.max(0, s.score - RHYTHM_WRONG_PENALTY);
        judge(s, 'miss');
        flashes.push({ at: now, rgb: [255, 0, 0], wrong: true });
        if (tvSounds) m.sound('rhythm', { player, lane, grade: 'miss' });
        m.publish();
        return { grade: 'miss' };
      }
      const grade = rhythmGradeOf(at - notes[i].at);
      hits.get(id)!.add(i);
      hitCount[i] += 1;
      const before = rhythmMultiplier(s.combo);
      s.combo += 1;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.score += RHYTHM_POINTS[grade] * rhythmMultiplier(s.combo);
      s[grade as 'perfect' | 'good' | 'ok'] += 1;
      judge(s, grade);
      if (notes[i].holdMs) {
        letGo(id, at);
        holding.set(id, { note: i, until: notes[i].at + notes[i].holdMs! });
      }
      flashes.push({ at: now, rgb: LED[color], grade, gapMs: at - notes[i].at });
      if (rhythmMultiplier(s.combo) > before) waves.push({ at: now, rgb: rgbOf(m.players[player].color) });
      if (tvSounds) m.sound('rhythm', { player, lane, grade });
      m.publish();
      return { grade, note: i };
    },

    view(): RhythmView {
      return {
        notes,
        bpm,
        music,
        loading,
        chart: level.id,
        lanes,
        travelMs,
        startAt,
        endAt,
        beatAt: beatZero,
        tempo,
        tvSounds,
        scores: Object.fromEntries(scores),
        leds: strip?.leds ?? null,
      };
    },
  };
  return runtime;
};
