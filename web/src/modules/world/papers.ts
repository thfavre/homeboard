import type { PaperId } from '$shared/worldActions.ts';

/**
 * The look of each letter paper, as CSS variables for a style attribute: the paper, its darker
 * edge, the ink, a pattern over it, and the envelope's three tones. Drawn art, like the TV's town,
 * so fixed colors rather than the theme's.
 */
const PAPER: Record<PaperId, Record<string, string>> = {
  parchment: { paper: '#f3e5c4', edge: 'rgba(150, 105, 45, 0.45)', ink: '#3b2814', env: '#e6d2a6', 'env-2': '#efdfb9', 'env-shade': '#d4bb88' },
  rose: {
    paper: '#fbe7e9',
    edge: 'rgba(200, 110, 130, 0.38)',
    ink: '#5b1f36',
    lines: 'radial-gradient(circle at 20px 20px, rgba(220, 120, 150, 0.16) 2px, transparent 2.5px) 0 0 / 34px 34px',
    env: '#f2c9d0',
    'env-2': '#f7d9de',
    'env-shade': '#e2aab5',
  },
  sky: {
    paper: '#e6f0fb',
    edge: 'rgba(80, 120, 180, 0.32)',
    ink: '#1c3354',
    lines: 'repeating-linear-gradient(transparent 0 2rem, rgba(70, 120, 200, 0.2) 2rem calc(2rem + 1px))',
    env: '#c9dcf3',
    'env-2': '#dae7f7',
    'env-shade': '#aec8ea',
  },
  night: {
    paper: '#1e2346',
    edge: 'rgba(0, 0, 0, 0.55)',
    ink: '#f2e3b8',
    lines: [
      'radial-gradient(circle at 12% 18%, #fff 1px, transparent 1.6px)',
      'radial-gradient(circle at 78% 9%, #fff 1px, transparent 1.6px)',
      'radial-gradient(circle at 64% 84%, #fff 0.8px, transparent 1.4px)',
      'radial-gradient(circle at 30% 70%, #ffe9a8 1px, transparent 1.6px)',
      'radial-gradient(circle at 90% 55%, #fff 0.8px, transparent 1.4px)',
    ].join(', '),
    env: '#2a3060',
    'env-2': '#343b72',
    'env-shade': '#20254d',
  },
};

/** The style attribute of something drawn in this paper */
export function paperStyle(id: PaperId): string {
  return Object.entries(PAPER[id] ?? PAPER.parchment)
    .map(([k, v]) => `--${k}: ${v}`)
    .join('; ');
}

/** Handwriting, from what the phone has (each system has a script font of its own) */
export const HAND = "'Segoe Print', 'Bradley Hand', 'Snell Roundhand', 'Dancing Script', 'Comic Sans MS', cursive";
