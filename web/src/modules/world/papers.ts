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
  kraft: {
    paper: '#d6b88b',
    edge: 'rgba(110, 70, 30, 0.45)',
    ink: '#33210f',
    lines: 'repeating-linear-gradient(115deg, rgba(120, 80, 40, 0.06) 0 2px, transparent 2px 7px)',
    env: '#c9a571',
    'env-2': '#d6b688',
    'env-shade': '#b38c58',
  },
  mint: {
    paper: '#e2f4e8',
    edge: 'rgba(60, 140, 100, 0.3)',
    ink: '#1d4631',
    lines: 'repeating-linear-gradient(transparent 0 2rem, rgba(60, 150, 100, 0.18) 2rem calc(2rem + 1px))',
    env: '#c2e6cf',
    'env-2': '#d5efdf',
    'env-shade': '#a6d7b8',
  },
  lavender: {
    paper: '#ece5f8',
    edge: 'rgba(120, 90, 180, 0.32)',
    ink: '#3a2858',
    lines: 'radial-gradient(circle at 10px 10px, rgba(140, 100, 210, 0.16) 1.6px, transparent 2px) 0 0 / 22px 22px',
    env: '#d8cbef',
    'env-2': '#e5dcf5',
    'env-shade': '#c2b0e3',
  },
  confetti: {
    paper: '#fffaf2',
    edge: 'rgba(200, 160, 120, 0.3)',
    ink: '#3b2b40',
    lines: [
      'radial-gradient(circle at 8px 12px, rgba(255, 90, 120, 0.45) 2px, transparent 2.5px) 0 0 / 46px 40px',
      'radial-gradient(circle at 30px 6px, rgba(60, 170, 255, 0.45) 2px, transparent 2.5px) 0 0 / 46px 40px',
      'radial-gradient(circle at 22px 30px, rgba(255, 200, 40, 0.55) 2px, transparent 2.5px) 0 0 / 46px 40px',
      'radial-gradient(circle at 40px 24px, rgba(90, 200, 120, 0.45) 2px, transparent 2.5px) 0 0 / 46px 40px',
    ].join(', '),
    env: '#f6e7d4',
    'env-2': '#fbf1e3',
    'env-shade': '#e8d2b6',
  },
  gilded: {
    paper: '#fbf3dc',
    edge: 'rgba(190, 140, 40, 0.55)',
    ink: '#3d2a08',
    lines:
      'linear-gradient(#c99a2e, #c99a2e) 10px 10px / calc(100% - 20px) 2px no-repeat, linear-gradient(#c99a2e, #c99a2e) 10px calc(100% - 12px) / calc(100% - 20px) 2px no-repeat, linear-gradient(#c99a2e, #c99a2e) 10px 10px / 2px calc(100% - 20px) no-repeat, linear-gradient(#c99a2e, #c99a2e) calc(100% - 12px) 10px / 2px calc(100% - 20px) no-repeat',
    env: '#efdcaa',
    'env-2': '#f6e8c3',
    'env-shade': '#d9bd77',
  },
  royal: {
    paper: '#4a1626',
    edge: 'rgba(0, 0, 0, 0.5)',
    ink: '#f2d99a',
    lines:
      'linear-gradient(rgba(242, 217, 154, 0.7), rgba(242, 217, 154, 0.7)) 10px 10px / calc(100% - 20px) 1px no-repeat, linear-gradient(rgba(242, 217, 154, 0.7), rgba(242, 217, 154, 0.7)) 10px calc(100% - 11px) / calc(100% - 20px) 1px no-repeat',
    env: '#5c1d31',
    'env-2': '#6e2840',
    'env-shade': '#421222',
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
