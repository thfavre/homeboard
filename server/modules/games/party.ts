import {
  PARTY_COLORS,
  PARTY_MINIS,
  PARTY_POINTS,
  PARTY_POINTS_REST,
  STACK_INPUT_SEC,
  hueSatRgb,
  hueSatScore,
  partyMini,
  type CountView,
  type HueSat,
  type MatchView,
  type PartyColor,
  type PartyLine,
  type PartyMiniId,
  type PartyMiniView,
  type PartyView,
  type StackView,
} from '../../../shared/party.ts';
import { HbError, clamp, num } from '../../core/util.ts';
import { best, shuffle, type GameFactory, type MatchApi } from './engine.ts';

const FPS = 40;
/** The lineup of mini games is shown this long */
const LINEUP_MS = 6000;
/** Time to read a mini game's rules; it starts sooner once everyone pressed Got it */
const RULES_MS = 30_000;
const ALL_READY_MS = 2500;
/** A mini game's results stay up this long */
const SCORE_MS = 9000;
/** Strip used to lay out a game when its light is not reachable (the game still runs on the screens) */
const FALLBACK_LEDS = 300;

type Rgb = readonly [number, number, number];
const rgbOf = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
};
const LED = Object.fromEntries(PARTY_COLORS.map((c) => [c.id, rgbOf(c.led)])) as Record<PartyColor, Rgb>;
const COLOR_IDS = PARTY_COLORS.map((c) => c.id) as PartyColor[];
const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** 0 to 1 over `ms` from `at` */
const ramp = (now: number, at: number, ms: number) => clamp((now - at) / ms, 0, 1);

/** Pixels of one frame, bottom first, 0 to 255 per channel */
class Frame {
  readonly px: Float32Array;
  constructor(readonly n: number) {
    this.px = new Float32Array(n * 3);
  }
  /** Add a color at a pixel (light adds up), `k` its strength */
  add(i: number, rgb: Rgb, k = 1) {
    if (i < 0 || i >= this.n || k <= 0) return;
    const o = i * 3;
    this.px[o] += rgb[0] * k;
    this.px[o + 1] += rgb[1] * k;
    this.px[o + 2] += rgb[2] * k;
  }
  fill(from: number, to: number, rgb: Rgb, k = 1) {
    for (let i = Math.max(0, Math.floor(from)); i < Math.min(this.n, Math.ceil(to)); i++) this.add(i, rgb, k);
  }
  pack(reverse: boolean): Uint8Array {
    const out = new Uint8Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      const o = (reverse ? this.n - 1 - i : i) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = Math.min(255, Math.max(0, Math.round(this.px[i * 3 + c])));
    }
    return out;
  }
}

/** A player's result in a mini game: higher `score` is better, null: did not play */
interface Result {
  id: string;
  label: string;
  score: number | null;
}

/** What a mini game gets from the party */
interface Host {
  m: MatchApi;
  /** Pixels of the strip */
  n: number;
  /** Run `fn` in `ms`, unless the party moved on by then */
  after(ms: number, fn: () => void): void;
  /** The mini game moves to its next phase: earlier `after` calls are dropped */
  next(): void;
  done(results: Result[]): void;
}

interface Mini {
  start(): void;
  input(id: string, args: any): unknown;
  view(): PartyMiniView;
  render(now: number, f: Frame): void;
}

// ------------------------------------------------------------ Color Count

/** Answers to pick from */
const COUNT_OPTIONS = 5;
const COUNT_ASK_MS = 15_000;
const COUNT_REVEAL_MS = 7000;
/** The dots pop in over this long, and fade out in FADE */
const COUNT_POP_MS = 1200;
const FADE_MS = 400;

function colorCount(h: Host): Mini {
  const { m, n } = h;
  const showMs = clamp(m.settings.partyCountSec, 3, 30) * 1000;
  const colors = shuffle(COLOR_IDS).slice(0, 3);
  // At least one dark LED between two dots: at most one dot every other LED, and far from full
  const slots = Math.floor((n + 1) / 2);
  const most = Math.max(6, Math.floor((slots * 0.7) / 3));
  const counts = Object.fromEntries(colors.map((c) => [c, randInt(Math.min(5, most), most)])) as Record<PartyColor, number>;
  const total = colors.reduce((sum, c) => sum + counts[c], 0);
  // `total` positions with a gap: draw them among n - total + 1, then push each one up by its rank
  const free = shuffle(Array.from({ length: n - total + 1 }, (_, i) => i))
    .slice(0, total)
    .sort((a, b) => a - b);
  const kinds = shuffle(colors.flatMap((c) => Array<PartyColor>(counts[c]).fill(c)));
  const dots = free.map((p, i) => ({ at: p + i, color: kinds[i], pop: Math.random() * COUNT_POP_MS }));

  let phase: CountView['phase'] = 'show';
  const ask = colors[Math.floor(Math.random() * colors.length)];
  const answer = counts[ask];
  const gap = Math.max(1, Math.round(answer * 0.12));
  const place = Math.min(Math.floor(Math.random() * COUNT_OPTIONS), Math.floor((answer - 1) / gap));
  const options = Array.from({ length: COUNT_OPTIONS }, (_, i) => answer + (i - place) * gap);
  const picks = new Map<string, { pick: number; ms: number }>();
  let showAt = 0;
  let askAt = 0;
  let revealAt = 0;

  const reveal = () => {
    if (phase !== 'ask') return;
    h.next();
    phase = 'reveal';
    revealAt = Date.now();
    m.deadline(null);
    m.publish();
    h.after(COUNT_REVEAL_MS, () =>
      h.done(
        m.players.map((p) => {
          const x = picks.get(p.id);
          if (!x) return { id: p.id, label: 'No answer', score: null };
          // Closest first, then the fastest
          return { id: p.id, label: `Picked ${x.pick}`, score: -(Math.abs(x.pick - answer) / gap) * 1e6 - x.ms };
        }),
      ),
    );
  };

  return {
    start() {
      showAt = Date.now();
      m.deadline(COUNT_POP_MS + showMs);
      h.after(COUNT_POP_MS + showMs + FADE_MS, () => {
        h.next();
        phase = 'ask';
        askAt = Date.now();
        m.deadline(COUNT_ASK_MS);
        m.publish();
        h.after(COUNT_ASK_MS, reveal);
      });
      m.publish();
    },
    input(id, args) {
      if (phase !== 'ask') throw new HbError('Not now');
      if (picks.has(id)) return { pick: picks.get(id)!.pick };
      const pick = Math.round(num(args?.pick, NaN));
      if (!options.includes(pick)) throw new HbError('Pick one of the answers');
      picks.set(id, { pick, ms: Date.now() - askAt });
      if (m.players.every((p) => picks.has(p.id))) h.after(700, reveal);
      m.publish();
      return { pick };
    },
    view(): CountView {
      return {
        kind: 'count',
        phase,
        colors,
        ...(phase !== 'show' ? { ask, options } : {}),
        answered: [...picks.keys()],
        ...(phase === 'reveal' ? { counts, picks: Object.fromEntries(m.players.map((p) => [p.id, picks.get(p.id)?.pick ?? null])) } : {}),
      };
    },
    render(now, f) {
      if (phase === 'show') {
        const out = 1 - ramp(now, showAt + COUNT_POP_MS + showMs, FADE_MS);
        for (const d of dots) {
          const t = now - showAt - d.pop;
          if (t < 0) continue;
          // A small flash as it pops in, then steady
          const k = t < 120 ? 1.6 - t / 200 : 1;
          f.add(d.at, LED[d.color], Math.min(1, k) * out);
          if (t < 120) f.add(d.at, [255, 255, 255], 0.4 * (1 - t / 120) * out);
        }
      } else if (phase === 'reveal') {
        // The dots of the color asked come back where they were, then slide down into a row: easy to count
        const asked = dots.filter((d) => d.color === ask);
        const glide = ease(ramp(now, revealAt + 900, 1600));
        asked.forEach((d, i) => {
          const at = Math.round(d.at + (i * 2 - d.at) * glide);
          f.add(at, LED[ask], ramp(now, revealAt, 500));
        });
      }
    },
  };
}

// ------------------------------------------------------------ Stack

/** A block falling the whole strip takes this long (gravity) */
const STACK_FULL_FALL_MS = 750;
const STACK_LAND_GAP_MS = 90;
const STACK_FLASH_MS = 160;
const STACK_TUMBLE_MS = 1100;
const STACK_REVEAL_MS = 7000;

function stack(h: Host): Mini {
  const { m, n } = h;
  const blocks = clamp(Math.round(m.settings.partyStackBlocks), 4, 20);
  // Same size blocks with one dark LED between them, up to the top
  const size = Math.max(1, Math.floor((n + 1) / blocks) - 1);
  const tower: PartyColor[] = [];
  while (tower.length < blocks) {
    const c = COLOR_IDS[Math.floor(Math.random() * COLOR_IDS.length)];
    // Never 3 of a color in a row
    if (tower.length >= 2 && tower[tower.length - 1] === c && tower[tower.length - 2] === c) continue;
    tower.push(c);
  }
  // Where each block rests, and when it starts falling and lands (gravity: the bottom ones fall longest)
  const g = (2 * n) / STACK_FULL_FALL_MS ** 2;
  let t = 300;
  const drops = tower.map((color, i) => {
    const rest = i * (size + 1);
    const ms = Math.sqrt((2 * (n - rest)) / g);
    const d = { color, rest, from: t, land: t + ms };
    t = d.land + STACK_LAND_GAP_MS;
    return d;
  });
  const dropMs = t + 300;
  const memoMs = Math.max(6, Math.round(blocks * 0.8)) * 1000;

  let phase: StackView['phase'] = 'drop';
  let phaseAt = 0;
  const answers = new Map<string, { list: PartyColor[]; at: number }>();
  const done = new Set<string>();
  let inputAt = 0;

  const go = (next: StackView['phase']) => {
    h.next();
    phase = next;
    phaseAt = Date.now();
    m.publish();
  };
  const right = (list: PartyColor[]) => {
    let k = 0;
    while (k < list.length && list[k] === tower[k]) k++;
    return k;
  };
  const reveal = () => {
    if (phase !== 'input') return;
    go('reveal');
    m.deadline(null);
    h.after(STACK_REVEAL_MS, () =>
      h.done(
        m.players.map((p) => {
          const a = answers.get(p.id);
          if (!a?.list.length) return { id: p.id, label: 'Nothing built', score: null };
          const k = right(a.list);
          // Most blocks right from the bottom, then the fastest
          return { id: p.id, label: `${k} of ${blocks}`, score: k * 1e6 - (a.at - inputAt) };
        }),
      ),
    );
  };

  return {
    start() {
      phaseAt = Date.now();
      m.deadline(dropMs + memoMs);
      h.after(dropMs, () => {
        go('memo');
        h.after(memoMs, () => {
          go('fall');
          h.after(STACK_TUMBLE_MS, () => {
            go('input');
            inputAt = Date.now();
            m.deadline(STACK_INPUT_SEC * 1000);
            h.after(STACK_INPUT_SEC * 1000, reveal);
          });
        });
      });
      m.publish();
    },
    input(id, args) {
      if (phase !== 'input') throw new HbError('Not now');
      if (done.has(id)) return { done: true };
      const raw: unknown[] = Array.isArray(args?.list) ? args.list.slice(0, blocks) : [];
      const list = raw.filter((c): c is PartyColor => COLOR_IDS.includes(c as PartyColor));
      answers.set(id, { list, at: Date.now() });
      if (args?.done) done.add(id);
      if (m.players.every((p) => done.has(p.id))) h.after(600, reveal);
      m.publish();
      return { done: done.has(id) };
    },
    view(): StackView {
      return {
        kind: 'stack',
        phase,
        blocks,
        colors: COLOR_IDS,
        progress: Object.fromEntries([...answers].map(([id, a]) => [id, a.list.length])),
        done: [...done],
        ...(phase === 'reveal'
          ? {
              tower,
              answers: Object.fromEntries([...answers].map(([id, a]) => [id, a.list])),
              correct: Object.fromEntries([...answers].map(([id, a]) => [id, right(a.list)])),
            }
          : {}),
      };
    },
    render(now, f) {
      const t = now - phaseAt;
      if (phase === 'drop' || phase === 'memo') {
        for (const d of drops) {
          if (phase === 'drop' && t < d.from) continue;
          const falling = phase === 'drop' ? t - d.from : Infinity;
          const y = Math.max(d.rest, n - 0.5 * g * falling ** 2);
          f.fill(y, y + size, LED[d.color]);
          // A white flash where it lands
          const since = phase === 'drop' ? t - d.land : Infinity;
          if (since >= 0 && since < STACK_FLASH_MS) f.fill(d.rest, d.rest + size, [255, 255, 255], 0.55 * (1 - since / STACK_FLASH_MS));
        }
      } else if (phase === 'fall') {
        // The whole tower drops out of the bottom
        const y = 0.5 * g * 1.4 * t ** 2;
        for (const d of drops) f.fill(d.rest - y, d.rest - y + size, LED[d.color]);
      } else if (phase === 'reveal') {
        // The tower again, block by block from the bottom
        drops.forEach((d, i) => {
          const k = ramp(now, phaseAt + 400 + i * 120, 250);
          f.fill(d.rest, d.rest + size, LED[d.color], k);
        });
      }
    },
  };
}

// ------------------------------------------------------------ Color Match

const MATCH_FADE_MS = 700;
const MATCH_HOLD_MS = 4500;
const MATCH_INPUT_SEC = 20;
/** Reveal: each guess fades in on the top half, stays, fades out */
const MATCH_IN_MS = 700;
const MATCH_STAY_MS = 2300;
const MATCH_OUT_MS = 600;
const MATCH_STEP_MS = MATCH_IN_MS + MATCH_STAY_MS + MATCH_OUT_MS + 300;
const MATCH_INTRO_MS = 1500;
const MATCH_END_MS = 3000;
/** The whole strip lit at once: not at full power */
const MATCH_LEVEL = 0.7;

function colorMatch(h: Host): Mini {
  const { m, n } = h;
  const target: HueSat = { h: Math.floor(Math.random() * 360), s: Math.round((0.45 + Math.random() * 0.55) * 100) / 100 };
  let phase: MatchView['phase'] = 'show';
  let phaseAt = 0;
  const guesses = new Map<string, HueSat>();
  const done = new Set<string>();
  let order: string[] = [];
  let showing = -1;
  let shownAt = 0;
  const scoreOf = (id: string) => (guesses.has(id) ? hueSatScore(target, guesses.get(id)!) : null);

  const reveal = () => {
    if (phase !== 'input') return;
    h.next();
    phase = 'reveal';
    phaseAt = Date.now();
    m.deadline(null);
    // Worst first: the best guess comes last
    order = m.players
      .filter((p) => guesses.has(p.id))
      .map((p) => p.id)
      .sort((a, b) => scoreOf(a)! - scoreOf(b)!);
    m.publish();
    const step = (i: number) => {
      showing = i;
      shownAt = Date.now();
      m.publish();
      if (i < order.length) h.after(MATCH_STEP_MS, () => step(i + 1));
      else
        h.after(MATCH_END_MS, () =>
          h.done(
            m.players.map((p) => {
              const sc = scoreOf(p.id);
              return { id: p.id, label: sc === null ? 'No color' : `${sc.toFixed(1)} %`, score: sc };
            }),
          ),
        );
    };
    h.after(MATCH_INTRO_MS, () => step(0));
  };

  return {
    start() {
      phaseAt = Date.now();
      m.deadline(MATCH_FADE_MS * 2 + MATCH_HOLD_MS);
      h.after(MATCH_FADE_MS * 2 + MATCH_HOLD_MS + 200, () => {
        h.next();
        phase = 'input';
        phaseAt = Date.now();
        m.deadline(MATCH_INPUT_SEC * 1000);
        m.publish();
        h.after(MATCH_INPUT_SEC * 1000, reveal);
      });
      m.publish();
    },
    input(id, args) {
      if (phase !== 'input') throw new HbError('Not now');
      if (done.has(id)) return { done: true };
      const hue = num(args?.h, NaN);
      const sat = num(args?.s, NaN);
      if (!Number.isFinite(hue) || !Number.isFinite(sat)) throw new HbError('Pick a color');
      guesses.set(id, { h: ((hue % 360) + 360) % 360, s: clamp(sat, 0, 1) });
      if (args?.done) done.add(id);
      if (m.players.every((p) => done.has(p.id))) h.after(600, reveal);
      if (args?.done) m.publish();
      return { done: done.has(id) };
    },
    view(): MatchView {
      return {
        kind: 'match',
        phase,
        done: [...done],
        ...(phase === 'reveal'
          ? {
              target,
              guesses: Object.fromEntries(m.players.map((p) => [p.id, guesses.get(p.id) ?? null])),
              scores: Object.fromEntries(m.players.map((p) => [p.id, scoreOf(p.id) ?? 0])),
              order,
              showing,
            }
          : {}),
      };
    },
    render(now, f) {
      const t = now - phaseAt;
      const rgb = hueSatRgb(target);
      if (phase === 'show') {
        const k = Math.min(ramp(now, phaseAt, MATCH_FADE_MS), 1 - ramp(now, phaseAt + MATCH_FADE_MS + MATCH_HOLD_MS, MATCH_FADE_MS));
        f.fill(0, n, rgb, k * MATCH_LEVEL);
      } else if (phase === 'reveal') {
        // The real color on the bottom half the whole time; each guess fades in and out on the top half
        const half = Math.floor(n / 2);
        f.fill(0, half - 1, rgb, Math.min(1, t / MATCH_FADE_MS) * MATCH_LEVEL);
        const id = order[showing];
        const guess = id ? guesses.get(id) : undefined;
        if (guess) {
          const s = now - shownAt;
          const k = Math.min(ramp(now, shownAt, MATCH_IN_MS), 1 - ramp(now, shownAt + MATCH_IN_MS + MATCH_STAY_MS, MATCH_OUT_MS));
          if (s >= 0) f.fill(half + 1, n, hueSatRgb(guess), k * MATCH_LEVEL);
        }
      }
    },
  };
}

const MINIS: Record<PartyMiniId, (h: Host) => Mini> = { count: colorCount, stack, match: colorMatch };

// ------------------------------------------------------------ the party

/** Light Party: a few mini games drawn at random, each with its rules first, points by place */
export const lightParty: GameFactory = (m) => {
  const s = m.settings;
  const pool = (s.partyMinis ?? []).filter((id) => partyMini(id));
  const all = pool.length ? pool : PARTY_MINIS.map((g) => g.id);
  const lineup = shuffle(all).slice(0, clamp(Math.round(s.partyRounds) || all.length, 1, all.length));
  const strip = s.partyLight ? m.strip(s.partyLight) : null;
  const n = strip?.leds ?? FALLBACK_LEDS;
  const reverse = s.partyReverse;

  let step: PartyView['step'] = 'lineup';
  let stepAt = Date.now();
  let index = 0;
  let mini: Mini | null = null;
  let ready = new Set<string>();
  const totals = new Map(m.players.map((p) => [p.id, 0]));
  /** Place of each player in each mini game played */
  const places: (Record<string, number | null> | null)[] = lineup.map(() => null);
  let lines: PartyLine[] | null = null;
  /** Bumped at each phase: a timer set before it is dropped */
  let seq = 0;
  let over = false;

  const after = (ms: number, fn: () => void) => {
    const at = seq;
    m.later(ms, () => at === seq && !over && fn());
  };
  const to = (next: PartyView['step']) => {
    seq += 1;
    step = next;
    stepAt = Date.now();
  };

  const rules = () => {
    to('rules');
    ready = new Set();
    mini = null;
    lines = null;
    m.deadline(RULES_MS);
    after(RULES_MS, play);
    m.publish();
  };

  const play = () => {
    if (step !== 'rules') return;
    to('play');
    m.deadline(null);
    const host: Host = {
      m,
      n,
      after,
      next: () => (seq += 1),
      done: (results) => score(results),
    };
    mini = MINIS[lineup[index]](host);
    mini.start();
    m.publish();
  };

  const score = (results: Result[]) => {
    if (step !== 'play') return;
    to('score');
    const scored = results.filter((r) => r.score !== null) as (Result & { score: number })[];
    const placeOf = (r: Result) => (r.score === null ? null : 1 + scored.filter((x) => x.score > r.score!).length);
    lines = results
      .map((r) => {
        const place = placeOf(r);
        const points = place === null ? 0 : (PARTY_POINTS[place - 1] ?? PARTY_POINTS_REST);
        return { id: r.id, label: r.label, place, points };
      })
      .sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
    for (const l of lines) totals.set(l.id, (totals.get(l.id) ?? 0) + l.points);
    places[index] = Object.fromEntries(lines.map((l) => [l.id, l.place]));
    m.deadline(SCORE_MS);
    after(SCORE_MS, () => {
      index += 1;
      if (index < lineup.length) rules();
      else finish();
    });
    m.publish();
  };

  const ordinal = (k: number) => `${k}${k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th'}`;
  const finish = () => {
    over = true;
    stopTicks();
    if (strip) strip.send(new Uint8Array(n * 3));
    const total = (id: string) => totals.get(id) ?? 0;
    // Most points, then the most mini games won
    const wins = (id: string) => places.filter((p) => p?.[id] === 1).length;
    const top = best(m.players, total);
    const winners = top.length > 1 ? best(m.players.filter((p) => top.includes(p.id)), wins) : top;
    m.finish({
      winners,
      lines: [...m.players]
        .sort((a, b) => total(b.id) - total(a.id) || wins(b.id) - wins(a.id))
        .map((p) => ({
          id: p.id,
          label: `${total(p.id)} pts`,
          detail: lineup.map((g, i) => `${partyMini(g)!.name} ${places[i]?.[p.id] ? ordinal(places[i]![p.id]!) : '-'}`).join(' · '),
        })),
    });
  };

  /** Waiting on the rules or the results: a soft glow of the next game's colors, rising slowly */
  const idle = (now: number, f: Frame) => {
    const g = partyMini(lineup[Math.min(index + (step === 'score' ? 1 : 0), lineup.length - 1)])!;
    const a = rgbOf(g.colors[0]);
    const b = rgbOf(g.colors[1]);
    const fade = ramp(now, stepAt, 800);
    for (let i = 0; i < n; i++) {
      const w = 0.5 + 0.5 * Math.sin((i / n) * Math.PI * 4 - now / 900);
      const mix: Rgb = [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
      f.add(i, mix, (0.06 + 0.06 * w) * fade);
    }
  };
  /** The lineup: one band per mini game, lit in turn */
  const showLineup = (now: number, f: Frame) => {
    const band = n / lineup.length;
    lineup.forEach((id, i) => {
      const g = partyMini(id)!;
      const k = ramp(now, stepAt + 600 + i * 900, 500);
      f.fill(i * band + 2, (i + 1) * band - 2, rgbOf(g.colors[0]), 0.35 * k);
    });
  };

  const tick = () => {
    if (!strip || over) return;
    const now = Date.now();
    const f = new Frame(n);
    if (step === 'lineup') showLineup(now, f);
    else if (step === 'play') mini?.render(now, f);
    else idle(now, f);
    strip.send(f.pack(reverse));
  };
  let stopTicks = () => {};

  return {
    start() {
      stopTicks = m.every(1000 / FPS, tick);
      m.deadline(LINEUP_MS);
      after(LINEUP_MS, rules);
      m.publish();
    },

    input(id, args) {
      if (args?.action === 'ready') {
        if (step !== 'rules') return true;
        ready.add(id);
        if (m.players.every((p) => ready.has(p.id))) {
          seq += 1;
          m.deadline(ALL_READY_MS);
          after(ALL_READY_MS, play);
        }
        m.publish();
        return true;
      }
      if (step !== 'play' || !mini) throw new HbError('Not now');
      return mini.input(id, args);
    },

    skip() {
      if (step === 'lineup') rules();
      else if (step === 'rules') play();
    },

    view(): PartyView {
      return {
        lineup,
        index,
        step,
        ready: [...ready],
        totals: Object.fromEntries(totals),
        mini: mini && (step === 'play' || step === 'score') ? mini.view() : null,
        lines,
        leds: strip ? n : null,
      };
    },
  };
};
