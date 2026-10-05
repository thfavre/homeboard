import type { WledEffect } from '$shared/wled.ts';

const NAMED: Record<string, string> = {
  rainbow: 'linear-gradient(120deg, #ff5f6d, #ffc371, #7cf29c, #4facfe, #b07cff)',
  party: 'linear-gradient(120deg, #ff3cac, #784ba0, #2b86c5)',
  fireworks: 'radial-gradient(circle at 30% 30%, #fff6b7 0 8%, transparent 9%), radial-gradient(circle at 70% 60%, #ff7eb3 0 10%, transparent 11%), linear-gradient(135deg, #1a1446, #3a1c71)',
  fire: 'linear-gradient(0deg, #ff3d00, #ff9100, #ffe57f)',
  ocean: 'linear-gradient(135deg, #00c9ff, #0a3d91)',
  twinkle: 'radial-gradient(circle at 25% 35%, #fff 0 5%, transparent 6%), radial-gradient(circle at 70% 70%, #ffe8a3 0 5%, transparent 6%), linear-gradient(135deg, #2b1055, #7597de)',
  meteor: 'linear-gradient(110deg, transparent 40%, #fff 50%, #7cf2ff 55%, transparent 70%), #0b1a3a',
  lightning: 'linear-gradient(135deg, #1e1b4b, #c7d2fe 50%, #1e1b4b)',
  aurora: 'linear-gradient(160deg, #00f5a0, #00d9f5, #9b5cff)',
  disco: 'conic-gradient(from 0deg, #ff0080, #ffcc00, #00ff88, #00b3ff, #a100ff, #ff0080)',
};

/** A CSS background that suggests what an effect looks like */
export function effectSwatch(e: Pick<WledEffect, 'id' | 'colors'>): string {
  if (NAMED[e.id]) return NAMED[e.id];
  if (e.colors.length === 1) return `radial-gradient(circle at 50% 40%, ${e.colors[0]}, color-mix(in srgb, ${e.colors[0]} 30%, #000))`;
  if (e.colors.length > 1) return `linear-gradient(135deg, ${e.colors.join(', ')})`;
  let h = 0;
  for (const c of e.id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 90% 60%), hsl(${(h + 70) % 360} 85% 50%))`;
}
