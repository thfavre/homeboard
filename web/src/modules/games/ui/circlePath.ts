/** SVG path of a drawn circle, centered in a 100x100 box (its widest side spans `span`) */
export function circlePath(points: [number, number][], span = 84): string {
  if (points.length < 2) return '';
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.01);
  const k = span / size;
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${(50 + (x - cx) * k).toFixed(1)} ${(50 + (y - cy) * k).toFixed(1)}`).join(' ');
}
