import type { CircleDrawing, CircleView } from '../../../shared/games.ts';
import { HbError, num } from '../../core/util.ts';
import { best, type GameFactory } from './engine.ts';

/** Time to draw every circle */
const DRAW_MS = 60_000;
const MAX_POINTS = 600;
/** Points kept per drawing for the TV */
const SHOWN_POINTS = 160;
/**
 * Reveal, crown included: 5 s plus 0.4 s per circle, 15 s at most (about 7 s for 2 players, 15 s for 10),
 * a moment before the first circle and one on the final totals
 */
const REVEAL_BASE_MS = 5000;
const REVEAL_PER_CIRCLE_MS = 400;
const REVEAL_MAX_MS = 15_000;
const REVEAL_LEAD_MS = 1000;
const REVEAL_HOLD_MS = 1500;

type Pt = [number, number];

/** Points the stroke is resampled to, evenly spaced along it (the drawing speed does not count) */
const SAMPLES = 160;

function resample(points: Pt[], n: number): Pt[] {
  const len = [0];
  for (let i = 1; i < points.length; i++) len.push(len[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = len[len.length - 1];
  if (!(total > 0)) return [];
  const out: Pt[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const at = (k / (n - 1)) * total;
    while (j < len.length - 1 && len[j] < at) j++;
    const t = (at - len[j - 1]) / (len[j] - len[j - 1] || 1);
    out.push([points[j - 1][0] + (points[j][0] - points[j - 1][0]) * t, points[j - 1][1] + (points[j][1] - points[j - 1][1]) * t]);
  }
  return out;
}

function solve3(m: number[][], b: number[]): number[] | null {
  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-14) return null;
  return [0, 1, 2].map((c) => det(m.map((row, i) => row.map((v, j) => (j === c ? b[i] : v)))) / d);
}

/** The circle closest to the points: algebraic fit (Kasa), then refined on the real distances (Gauss-Newton) */
function fitCircle(pts: Pt[]): { cx: number; cy: number; r: number } {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of pts) {
    const u = x - mx;
    const v = y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  let cx = mx;
  let cy = my;
  const det = suu * svv - suv * suv;
  if (Math.abs(det) > 1e-12) {
    const b1 = 0.5 * (suuu + suvv);
    const b2 = 0.5 * (svvv + svuu);
    cx = mx + (b1 * svv - b2 * suv) / det;
    cy = my + (b2 * suu - b1 * suv) / det;
  }
  let r = pts.reduce((s, [x, y]) => s + Math.hypot(x - cx, y - cy), 0) / n;
  for (let it = 0; it < 20; it++) {
    let a11 = 0, a12 = 0, a13 = 0, a22 = 0, a23 = 0, a33 = 0, g1 = 0, g2 = 0, g3 = 0;
    for (const [x, y] of pts) {
      const d = Math.hypot(x - cx, y - cy) || 1e-9;
      const jx = -(x - cx) / d;
      const jy = -(y - cy) / d;
      const res = d - r;
      a11 += jx * jx;
      a12 += jx * jy;
      a13 -= jx;
      a22 += jy * jy;
      a23 -= jy;
      a33 += 1;
      g1 += jx * res;
      g2 += jy * res;
      g3 -= res;
    }
    const step = solve3(
      [
        [a11, a12, a13],
        [a12, a22, a23],
        [a13, a23, a33],
      ],
      [-g1, -g2, -g3],
    );
    if (!step || !step.every(Number.isFinite)) break;
    cx += step[0];
    cy += step[1];
    r += step[2];
    if (Math.abs(step[0]) + Math.abs(step[1]) + Math.abs(step[2]) < 1e-9) break;
  }
  return { cx, cy, r };
}

const wrap = (d: number) => (d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d);

/**
 * Roundness of a stroke, 0 to 100. The stroke is spaced evenly, the closest circle is fitted to it,
 * then four things count: how far it strays from that circle (on average and at the worst spot),
 * corners (a sharper turn than a circle makes), and a loop left open or drawn round too far.
 * Calibrated on shapes: a neat hand circle gets 85+, an ellipse 1.3 about 38, a square about 5.
 */
export function circleScore(raw: Pt[]): { score: number; note?: string } {
  if (raw.length < 12) return { score: 0, note: 'Too short' };
  let pts = resample(raw, SAMPLES);
  if (pts.length < 12) return { score: 0, note: 'Too short' };
  let { cx, cy, r } = fitCircle(pts);
  if (!Number.isFinite(r) || r < 0.06) return { score: 0, note: 'Too small' };

  // Angle swept around the center; past one full turn the overlap is cut off (a little overlap is normal)
  let swept = 0;
  let cut = pts.length;
  for (let i = 1; i < pts.length; i++) {
    swept += wrap(Math.atan2(pts[i][1] - cy, pts[i][0] - cx) - Math.atan2(pts[i - 1][1] - cy, pts[i - 1][0] - cx));
    if (Math.abs(swept) >= 2 * Math.PI && cut === pts.length) cut = i + 1;
  }
  const turns = Math.abs(swept) / (2 * Math.PI);
  if (turns < 0.75) return { score: 0, note: 'Not a full circle' };
  if (cut < pts.length) {
    pts = pts.slice(0, cut);
    ({ cx, cy, r } = fitCircle(pts));
  }

  const dev = pts.map(([x, y]) => (Math.hypot(x - cx, y - cy) - r) / r);
  const rms = Math.sqrt(dev.reduce((s, d) => s + d * d, 0) / dev.length);
  const worst = Math.max(...dev.map(Math.abs));
  const gap = turns < 1 ? Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) / r : 0;

  // Corners: the turn between the chords just before and after each point (a few points long, so the
  // hand's jitter averages out), against the turn a circle makes there
  const S = 5;
  let sharp = 0;
  for (let i = S; i + S < pts.length; i++) {
    const a1 = Math.atan2(pts[i][1] - pts[i - S][1], pts[i][0] - pts[i - S][0]);
    const a2 = Math.atan2(pts[i + S][1] - pts[i][1], pts[i + S][0] - pts[i][0]);
    sharp = Math.max(sharp, Math.abs(wrap(a2 - a1)));
  }
  const corner = Math.max(0, sharp / ((S * 2 * Math.PI) / (pts.length - 1) / Math.min(1, turns)) - 2);

  const error = rms + 0.25 * worst + 0.03 * corner + 0.25 * Math.max(0, gap - 0.08) + 0.15 * Math.max(0, turns - 1.25);
  const score = 100 * Math.exp(-((error / 0.13) ** 1.15));
  let note: string | undefined;
  if (gap > 0.35) note = 'Not quite closed';
  else if (turns > 1.25) note = 'Went round too far';
  else if (corner > 2.5) note = 'Has corners';
  return { score: Math.round(score * 10) / 10, note };
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
    const total = Math.min(REVEAL_MAX_MS, REVEAL_BASE_MS + REVEAL_PER_CIRCLE_MS * steps);
    stepMs = Math.round((total - REVEAL_LEAD_MS - REVEAL_HOLD_MS) / steps);
    revealAt = Date.now() + REVEAL_LEAD_MS;
    m.deadline(null);
    m.publish();
    m.later(REVEAL_LEAD_MS + steps * stepMs + REVEAL_HOLD_MS, end);
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
