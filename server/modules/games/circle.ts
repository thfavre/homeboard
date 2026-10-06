import type { CircleView } from '../../../shared/games.ts';
import { HbError, num } from '../../core/util.ts';
import { best, type GameFactory } from './engine.ts';

const DRAW_MS = 30_000;
const MAX_POINTS = 600;
/** Points kept per drawing for the TV */
const SHOWN_POINTS = 160;

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

/** Perfect Circle: one stroke, the roundest wins */
export const perfectCircle: GameFactory = (m) => {
  const drawings = new Map<string, { points: Pt[]; score: number; note?: string }>();
  let over = false;

  const end = () => {
    if (over) return;
    over = true;
    const score = (id: string) => drawings.get(id)?.score ?? null;
    m.finish({
      winners: best(m.players, (id) => score(id) || null),
      lines: [...m.players]
        .sort((a, b) => (score(b.id) ?? -1) - (score(a.id) ?? -1))
        .map((p) => {
          const d = drawings.get(p.id);
          return { id: p.id, label: d ? `${d.score.toFixed(1)} %` : 'No drawing', detail: d?.note };
        }),
    });
  };

  return {
    start() {
      m.deadline(DRAW_MS);
      m.later(DRAW_MS + 1000, end);
    },

    input(id, args) {
      if (over) throw new HbError('Too late');
      if (drawings.has(id)) throw new HbError('You already drew');
      // Points come normalised by the phone (the shorter side of the pad is 1)
      const raw: unknown[] = Array.isArray(args?.points) ? args.points.slice(0, MAX_POINTS) : [];
      const points: Pt[] = raw
        .filter((p): p is unknown[] => Array.isArray(p))
        .map((p) => [num(p[0]), num(p[1])] as Pt)
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 3 && Math.abs(y) < 3);
      const result = circleScore(points);
      const step = Math.max(1, points.length / SHOWN_POINTS);
      const shown: Pt[] = [];
      for (let i = 0; i < points.length; i += step) {
        const p = points[Math.floor(i)];
        shown.push([Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]);
      }
      drawings.set(id, { points: shown, ...result });
      if (drawings.size >= m.players.length) m.later(800, end);
      else m.publish();
      return result;
    },

    view(): CircleView {
      return {
        done: [...drawings.keys()],
        ...(over ? { drawings: Object.fromEntries(drawings) } : {}),
      };
    },
  };
};
