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
  blackout: 'radial-gradient(circle at 50% 120%, #1c1c24, #000 60%)',
  police: 'linear-gradient(90deg, #ff1a1a 0 45%, #0b0b14 45% 55%, #1a3dff 55%)',
  'fire-ice': 'linear-gradient(120deg, #ff3d00, #ffb300 45%, #7fe7ff 55%, #1565ff)',
  storm: 'linear-gradient(160deg, transparent 45%, #e0e7ff 48%, transparent 52%), linear-gradient(180deg, #111a3a, #2d3f7a)',
  glitch: 'repeating-linear-gradient(90deg, #ff00c8 0 12%, #00f0ff 12% 22%, #ffe600 22% 30%, #120024 30% 38%)',
  // Scenes
  'flow-orange': 'linear-gradient(120deg, #961e00, #ff6a00 40%, #ff8000 60%, #961e00)',
  'flow-ocean': 'linear-gradient(120deg, #031a40, #0077b6 40%, #2fd3c8 60%, #031a40)',
  'flow-lavender': 'linear-gradient(120deg, #2a0a5e, #9b5cff 40%, #ff4fa3 60%, #2a0a5e)',
  pastel: 'linear-gradient(90deg, #ffb3c6, #ffe5a8, #b8f2c9, #a8d8ff, #d6b8ff)',
  moodlamp: 'radial-gradient(circle at 50% 50%, #ff7ad9, #7a5cff 70%)',
  lagoon: 'linear-gradient(90deg, #00233a, #00c2b8 50%, #00233a)',
  lava: 'radial-gradient(circle at 30% 65%, #ff2d55 0 22%, transparent 40%), radial-gradient(circle at 72% 30%, #c2185b 0 18%, transparent 36%), #2a0010',
  forest: 'linear-gradient(120deg, #1b5e20, #43a047 35%, #9ccc65 60%, #2e7d32)',
  waves: 'repeating-linear-gradient(90deg, #ff9a3c 0 25%, #3a0a5a 50%, #ff9a3c 75%)',
  crossing: 'linear-gradient(90deg, #ff6f61, #0b1d3a 50%, #2ec4b6)',
  tide: 'linear-gradient(120deg, #ff6b6b, #feca57, #48dbfb, #ff9ff3)',
  embers: 'radial-gradient(circle at 30% 70%, #ffb347, transparent 55%), linear-gradient(135deg, #ff6500, #550d00)',
  northern: 'linear-gradient(170deg, #0b1d3a 10%, #05ffb2 45%, #66ccff 65%, #7b3fe4)',
  night: 'radial-gradient(circle at 25% 30%, #fff 0 3%, transparent 4%), radial-gradient(circle at 70% 55%, #c7d2fe 0 3%, transparent 4%), linear-gradient(135deg, #0b1033, #3b2a7a)',
  sea: 'linear-gradient(180deg, #2fd3ff, #0a5aa8 50%, #031a40)',
  sunset: 'linear-gradient(180deg, #ffcf6b, #ff6a3d 45%, #b3245f 75%, #3a1650)',
  vapor: 'linear-gradient(135deg, #ff9de2, #b18cff 50%, #6ae4ff)',
  cyber: 'linear-gradient(135deg, #ff6a00, #3a0ca3 55%, #00c2c7)',
  candles: 'radial-gradient(circle at 50% 60%, #ffd27a, #ff8a1c 30%, #2b0c00 75%)',
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
