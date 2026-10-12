// Light Party: a few mini games drawn at random, played one after the other on one upright light strip.
// Each mini game lives in its own file (count.ts, stack.ts, match.ts) and plugs in through MINIS below;
// its settings are listed with it in shared/party.ts.

import {
  PARTY_MINIS,
  PARTY_POINTS,
  PARTY_POINTS_REST,
  partyMini,
  partyOption,
  type PartyLine,
  type PartyMiniId,
  type PartyView,
} from '../../../../shared/party.ts';
import { HbError, clamp } from '../../../core/util.ts';
import { best, shuffle, type GameFactory } from '../engine.ts';
import { Frame, ramp, rgbOf, type Host, type Mini, type MiniRegistry, type Result } from './strip.ts';
import { colorCount } from './count.ts';
import { stack } from './stack.ts';
import { colorMatch } from './match.ts';

/** Every mini game, by id: add one here (and in PARTY_MINIS) */
const MINIS: MiniRegistry = { count: colorCount, stack, match: colorMatch };

const FPS = 40;
/** The lineup of mini games is shown this long */
const LINEUP_MS = 6000;
/** Once everyone pressed Got it, the mini game starts this much later */
const ALL_READY_MS = 2500;
/** Strip used to lay out a game when its light is not reachable (the game still runs on the screens) */
const FALLBACK_LEDS = 300;
/** Between mini games the strip breathes slowly in one even color, from a third of the glow setting up to it */
const BREATH_MS = 4000;
/** A new step (lineup, rules, game, results) fades in over what the strip showed */
const CROSSFADE_MS = 700;

const ordinal = (k: number) => `${k}${k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th'}`;

/** Light Party: a few mini games drawn at random, each with its rules first, points by place */
export const lightParty: GameFactory = (m) => {
  const s = m.settings;
  const general = (key: string) => partyOption(s.partyOptions, 'general', key);
  const rulesMs = general('rulesSec') * 1000;
  const resultsMs = general('resultsSec') * 1000;
  const glow = general('idleGlow') / 100;
  const pool = (s.partyMinis ?? []).filter((id) => partyMini(id));
  const all = pool.length ? pool : PARTY_MINIS.map((g) => g.id);
  const lineup: PartyMiniId[] = shuffle(all).slice(0, clamp(Math.round(s.partyRounds) || all.length, 1, all.length));
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
    m.deadline(rulesMs);
    after(rulesMs, play);
    m.publish();
  };

  const play = () => {
    if (step !== 'rules') return;
    to('play');
    m.deadline(null);
    const id = lineup[index];
    const host: Host = {
      m,
      n,
      opt: (key) => partyOption(s.partyOptions, id, key),
      after,
      next: () => (seq += 1),
      done: (results) => score(results),
    };
    mini = MINIS[id](host);
    mini.start();
    m.publish();
  };

  /** A mini game is over: points by place (ties share the place), then the next one or the end */
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
    m.deadline(resultsMs);
    after(resultsMs, () => {
      index += 1;
      if (index < lineup.length) rules();
      else finish();
    });
    m.publish();
  };

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

  // ------------------------------------------------------------ the strip

  /**
   * Rules and results: the whole strip breathes slowly in one even color, the next game's. Never very
   * dim: the lowest levels show steps and flicker on LEDs.
   */
  const idle = (now: number, f: Frame) => {
    if (glow <= 0) return;
    const g = partyMini(lineup[Math.min(index + (step === 'score' ? 1 : 0), lineup.length - 1)])!;
    const breath = 0.5 - 0.5 * Math.cos(((now - stepAt) / BREATH_MS) * 2 * Math.PI);
    f.fill(0, n, rgbOf(g.colors[0]), glow * (0.4 + 0.6 * breath));
  };
  /** The lineup: one band per mini game, lit in turn */
  const showLineup = (now: number, f: Frame) => {
    const band = n / lineup.length;
    lineup.forEach((id, i) => {
      const k = ramp(now, stepAt + 600 + i * 900, 500);
      f.fill(i * band + 2, (i + 1) * band - 2, rgbOf(partyMini(id)!.colors[0]), 0.35 * k);
    });
  };

  /** The last frame sent, and the one on the strip when the step changed: the new step fades in over it */
  let shown: Float32Array | null = null;
  let from: Float32Array | null = null;
  let fromStep: PartyView['step'] = step;
  const tick = () => {
    if (!strip || over) return;
    const now = Date.now();
    const f = new Frame(n);
    if (step === 'lineup') showLineup(now, f);
    else if (step === 'play') mini?.render(now, f);
    else idle(now, f);
    if (step !== fromStep) {
      fromStep = step;
      from = shown;
    }
    const k = ramp(now, stepAt, CROSSFADE_MS);
    if (from && k < 1) for (let i = 0; i < f.px.length; i++) f.px[i] = from[i] + (f.px[i] - from[i]) * k;
    shown = f.px;
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
