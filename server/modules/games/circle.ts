import type { CircleDrawing, CircleView } from '../../../shared/games.ts';
import { HbError, num } from '../../core/util.ts';
import { best, type GameFactory } from './engine.ts';

/** Time to draw every circle */
const DRAW_MS = 60_000;
const MAX_POINTS = 600;
/** Points kept per drawing for the TV */
const SHOWN_POINTS = 160;
/** Reveal: one circle every STEP_MS at most, the whole reveal within REVEAL_MAX_MS, then the totals */
const STEP_MS = 1300;
const REVEAL_MAX_MS = 16_000;
const REVEAL_HOLD_MS = 1500;

type Pt = [number, number];

/**
 * Roundness of a stroke, 0 to 100. Based on how far each point is from the average
 * radius around the center, with penalties when the loop is not closed.
 */
export function circleScore(points: Pt[]): { score: number; note?: string } {
  if (points.length < 12) return { score: 0, note: 'Too short' };
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const radii = points.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const r = radii.reduce((s, d) => s + d, 0) / radii.length;
  if (r < 0.06) return { score: 0, note: 'Too small' };

  // Total angle swept around the center: a full circle is 360 degrees
  let swept = 0;
  for (let i = 1; i < points.length; i++) {
    const a = Math.atan2(points[i - 1][1] - cy, points[i - 1][0] - cx);
    const b = Math.atan2(points[i][1] - cy, points[i][0] - cx);
    let d = b - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    swept += d;
  }
  const turns = Math.abs(swept) / (2 * Math.PI);
  if (turns < 0.8) return { score: 0, note: 'Not a full circle' };

  const deviation = radii.reduce((s, d) => s + Math.abs(d - r), 0) / radii.length / r;
  let score = 100 * (1 - deviation * 3.2);
  const first = points[0];
  const last = points[points.length - 1];
  const gap = Math.hypot(first[0] - last[0], first[1] - last[1]) / r;
  let note: string | undefined;
  if (turns < 0.97 && gap > 0.25) {
    score -= Math.min(30, (gap - 0.25) * 40);
    note = 'Not quite closed';
  }
  if (turns > 1.35) {
    score -= Math.min(30, (turns - 1.35) * 40);
    note = 'Went round too far';
  }
  return { score: Math.max(0, Math.round(score * 10) / 10), note };
}

/**
 * Perfect Circle: everyone draws their circles within one minute, at their own pace.
 * The TV then reveals them one by one with their scores; the best total wins.
 */
export const perfectCircle: GameFactory = (m) => {
  const count = Math.max(1, m.settings.circleCount);
  let step: CircleView['step'] = 'draw';
  const drawings = new Map<string, CircleDrawing[]>(m.players.map((p) => [p.id, []]));
  const total = (id: string) => drawings.get(id)!.reduce((s, d) => s + d.score, 0);
  let revealAt = 0;
  let stepMs = 0;

  const reveal = () => {
    if (step === 'reveal') return;
    step = 'reveal';
    // One circle at a time, faster when there are many, then a moment on the final totals
    const steps = m.players.length * count;
    stepMs = Math.round(Math.min(STEP_MS, REVEAL_MAX_MS / steps));
    revealAt = Date.now() + 1500;
    m.deadline(null);
    m.publish();
    m.later(1500 + steps * stepMs + REVEAL_HOLD_MS, end);
  };

  const end = () => {
    const winners = best(m.players, (id) => total(id) || null);
    const top = winners.length === 1 ? [...drawings.get(winners[0])!].sort((a, b) => b.score - a.score)[0] : undefined;
    m.finish({
      winners,
      ...(top ? { perk: { kind: 'scratch' as const, drawing: top } } : {}),
      lines: [...m.players]
        .sort((a, b) => total(b.id) - total(a.id))
        .map((p) => {
          const n = drawings.get(p.id)!.length;
          return {
            id: p.id,
            label: `${total(p.id).toFixed(1)} pts`,
            detail: count > 1 ? `${n} of ${count} circles, average ${(total(p.id) / count).toFixed(1)} %` : drawings.get(p.id)![0]?.note,
          };
        }),
    });
  };

  return {
    start() {
      m.deadline(DRAW_MS);
      m.later(DRAW_MS + 500, reveal);
      m.publish();
    },

    input(id, args) {
      if (step !== 'draw') throw new HbError('Time is up');
      const mine = drawings.get(id)!;
      if (mine.length >= count) throw new HbError('You drew all your circles');
      // Points come normalised by the phone (the shorter side of the pad is 1)
      const raw: unknown[] = Array.isArray(args?.points) ? args.points.slice(0, MAX_POINTS) : [];
      const points: Pt[] = raw
        .filter((p): p is unknown[] => Array.isArray(p))
        .map((p) => [num(p[0]), num(p[1])] as Pt)
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 3 && Math.abs(y) < 3);
      const result = circleScore(points);
      const every = Math.max(1, points.length / SHOWN_POINTS);
      const shown: Pt[] = [];
      for (let i = 0; i < points.length; i += every) {
        const p = points[Math.floor(i)];
        shown.push([Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]);
      }
      mine.push({ points: shown, ...result });
      if (m.players.every((p) => drawings.get(p.id)!.length >= count)) m.later(800, reveal);
      m.publish();
      // The score stays secret until the reveal
      return { sent: mine.length };
    },

    view(): CircleView {
      return {
        count,
        step,
        progress: Object.fromEntries(m.players.map((p) => [p.id, drawings.get(p.id)!.length])),
        ...(step === 'reveal'
          ? {
              drawings: Object.fromEntries(drawings),
              totals: Object.fromEntries(m.players.map((p) => [p.id, total(p.id)])),
              revealAt,
              stepMs,
            }
          : {}),
      };
    },
  };
};
