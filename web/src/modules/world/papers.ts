import type { PaperId } from '$shared/worldActions.ts';

/**
 * The look of each letter paper, as CSS variables for a style attribute: the paper, its darker
 * edge, the ink, a pattern over it, and the envelope's three tones. Drawn art, like the TV's town,
 * so fixed colors rather than the theme's.
 */
// ------------------------------------------------------------ the fancier papers' art

/** A drawing as a CSS image (an inline SVG; viewBox w x h) */
const svg = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

/** A rose seen from above: petals in rings, darker to the heart, with a curl of shade */
const rose = (x: number, y: number, r: number) =>
  `<circle cx='${x}' cy='${y}' r='${r}' fill='#ef8ea2'/><circle cx='${x - r * 0.12}' cy='${y - r * 0.1}' r='${r * 0.72}' fill='#e86f8a'/>` +
  `<circle cx='${x + r * 0.08}' cy='${y - r * 0.05}' r='${r * 0.46}' fill='#d9506f'/>` +
  `<path d='M${x - r * 0.5} ${y + r * 0.1} q${r * 0.5} ${r * 0.55} ${r} 0' stroke='#c23d5d' stroke-width='${r * 0.12}' fill='none' stroke-linecap='round'/>` +
  `<path d='M${x - r * 0.25} ${y - r * 0.3} q${r * 0.3} -${r * 0.3} ${r * 0.55} ${r * 0.05}' stroke='#f7b6c4' stroke-width='${r * 0.1}' fill='none' stroke-linecap='round'/>`;
const leaf = (x: number, y: number, a: number, s: number) =>
  `<ellipse cx='${x}' cy='${y}' rx='${s}' ry='${s * 0.42}' fill='#7fae7a' transform='rotate(${a} ${x} ${y})'/><path d='M${x - s * 0.8} ${y} h${s * 1.6}' stroke='#5e8f5a' stroke-width='0.8' transform='rotate(${a} ${x} ${y})'/>`;
const ROSES = svg(
  120,
  120,
  leaf(62, 40, -30, 13) +
    leaf(98, 78, 70, 12) +
    leaf(40, 16, 10, 10) +
    rose(88, 32, 17) +
    rose(106, 62, 11) +
    rose(60, 14, 10) +
    `<circle cx='76' cy='60' r='3' fill='#f6b3c1'/><circle cx='44' cy='34' r='2.4' fill='#f6b3c1'/>`,
);
const ROSES_LOW = svg(
  120,
  120,
  leaf(58, 82, 200, 12) + leaf(22, 46, 110, 11) + rose(32, 88, 15) + rose(14, 64, 9) + `<circle cx='54' cy='104' r='2.6' fill='#f6b3c1'/>`,
);

/** A sprig of lavender: a stem with buds up its top half, and a leaf */
const sprig = (x: number, lean: number) => {
  let buds = '';
  for (let i = 0; i < 9; i++) {
    const y = 18 + i * 9;
    const bx = x + lean * (1 - y / 160) * 20;
    buds += `<ellipse cx='${bx - 3}' cy='${y}' rx='3.2' ry='5' fill='${i % 2 ? '#9a7fd6' : '#b39ae6'}' transform='rotate(-25 ${bx - 3} ${y})'/><ellipse cx='${bx + 3}' cy='${y + 3}' rx='3.2' ry='5' fill='${i % 2 ? '#b39ae6' : '#8c6fcc'}' transform='rotate(25 ${bx + 3} ${y + 3})'/>`;
  }
  return (
    `<path d='M${x + lean * 20} 10 Q${x + lean * 8} 90 ${x} 158' stroke='#7c9c6a' stroke-width='2.2' fill='none'/>` +
    buds +
    `<path d='M${x + 1} 130 q12 -18 22 -10' stroke='#7c9c6a' stroke-width='2' fill='#93b47f'/>`
  );
};
const LAVENDER = svg(
  80,
  160,
  sprig(22, 0.6) +
    sprig(40, -0.2) +
    sprig(58, 0.9) +
    `<path d='M18 128 q22 10 44 0 l-4 10 q-18 6 -36 0z' fill='#c9b6ef'/><circle cx='40' cy='131' r='4' fill='#a88ddd'/>`,
);

/** Confetti: streamers curling out of a corner, and bits scattered all over */
const STREAMERS = svg(
  120,
  120,
  [
    ['#ff6f91', 'M120 6 C90 10 96 34 70 30 S44 52 22 46'],
    ['#4fb3ff', 'M120 26 C100 32 104 58 82 56 S60 80 40 78'],
    ['#ffc93c', 'M114 0 C108 22 82 18 80 40 S60 62 64 84'],
    ['#5ccf7c', 'M120 46 C106 56 112 76 96 82 S84 104 70 108'],
  ]
    .map(([c, d]) => `<path d='${d}' stroke='${c}' stroke-width='3.4' fill='none' stroke-linecap='round'/>`)
    .join(''),
);
const BITS = svg(
  70,
  70,
  [
    [8, 10, 25, '#ff6f91'],
    [38, 6, -40, '#4fb3ff'],
    [58, 22, 10, '#ffc93c'],
    [22, 34, 60, '#5ccf7c'],
    [48, 46, -15, '#b07cff'],
    [10, 56, 35, '#ffc93c'],
    [34, 62, -50, '#ff6f91'],
    [62, 60, 20, '#4fb3ff'],
  ]
    .map(([x, y, a, c]) => `<rect x='${x}' y='${y}' width='6' height='3' rx='1' fill='${c}' opacity='0.75' transform='rotate(${a} ${x} ${y})'/>`)
    .join('') +
    `<circle cx='28' cy='18' r='1.8' fill='#ff6f91' opacity='0.7'/><circle cx='54' cy='34' r='1.6' fill='#5ccf7c' opacity='0.7'/><circle cx='16' cy='44' r='1.6' fill='#4fb3ff' opacity='0.7'/>`,
);

/** The night: a crescent moon, and stars (four-pointed sparkles and dots) */
const sparkle = (x: number, y: number, s: number, c: string) =>
  `<path d='M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}z' fill='${c}'/>`;
const MOON = svg(
  100,
  100,
  `<circle cx='50' cy='50' r='40' fill='#fff3c4' opacity='0.08'/><circle cx='50' cy='50' r='28' fill='#f8e7a8'/><circle cx='62' cy='42' r='26' fill='#1e2346'/><circle cx='38' cy='60' r='3' fill='#e3cd86'/><circle cx='30' cy='44' r='2' fill='#e3cd86'/>`,
);
const STARS = svg(
  90,
  90,
  sparkle(14, 18, 5, '#fff7de') +
    sparkle(66, 52, 4, '#ffe39a') +
    sparkle(40, 80, 3, '#fff') +
    `<circle cx='48' cy='12' r='1' fill='#fff'/><circle cx='80' cy='22' r='1.2' fill='#fff'/><circle cx='22' cy='58' r='0.9' fill='#ffe9a8'/><circle cx='74' cy='84' r='1' fill='#fff'/><circle cx='6' cy='84' r='0.8' fill='#fff'/>`,
);

/** Gold: a flourish for a frame's corner (drawn for the top left, turned for the others) */
const flourish = (t: string) =>
  svg(
    60,
    60,
    `<g transform='${t}' fill='none' stroke='#b8862a' stroke-width='2.6' stroke-linecap='round'>` +
      `<path d='M6 54 V12 Q6 6 12 6 H54'/><path d='M14 46 V20 Q14 14 20 14 H46' stroke-width='1.2'/>` +
      `<path d='M6 26 q14 -2 12 -14 q-2 -8 -10 -4 q-4 4 2 8'/><path d='M26 6 q-2 14 -14 12' />` +
      `<circle cx='20' cy='20' r='2.6' fill='#d7aa45' stroke='none'/></g>`,
  );
const CORNER_TL = flourish('');
const CORNER_TR = flourish('translate(60 0) scale(-1 1)');
const CORNER_BL = flourish('translate(0 60) scale(1 -1)');
const CORNER_BR = flourish('translate(60 60) scale(-1 -1)');

/** Royal: a gold damask on velvet, and a crown */
const DAMASK = svg(
  44,
  52,
  `<g fill='#e9c877' opacity='0.09'><path d='M22 6 C30 14 30 22 22 26 C14 22 14 14 22 6z'/><path d='M22 26 C32 28 34 38 22 46 C10 38 12 28 22 26z'/><circle cx='0' cy='0' r='4'/><circle cx='44' cy='0' r='4'/><circle cx='0' cy='52' r='4'/><circle cx='44' cy='52' r='4'/><path d='M4 26 q6 -4 10 0 q-4 4 -10 0z'/><path d='M40 26 q-6 -4 -10 0 q4 4 10 0z'/></g>`,
);
const CROWN = svg(
  80,
  52,
  `<path d='M8 42 L4 12 L22 26 L40 4 L58 26 L76 12 L72 42z' fill='#e2bb5c' stroke='#f6dc96' stroke-width='2' stroke-linejoin='round'/><rect x='8' y='42' width='64' height='7' rx='2' fill='#c99a36'/><circle cx='40' cy='4' r='4' fill='#f6dc96'/><circle cx='4' cy='12' r='3.4' fill='#f6dc96'/><circle cx='76' cy='12' r='3.4' fill='#f6dc96'/><circle cx='40' cy='32' r='4.4' fill='#b7243d'/><circle cx='22' cy='34' r='3' fill='#2e5fb3'/><circle cx='58' cy='34' r='3' fill='#2e5fb3'/>`,
);

const frame = (inset: string, w: string, c: string) =>
  [
    `linear-gradient(${c}, ${c}) ${inset} ${inset} / calc(100% - 2 * ${inset}) ${w} no-repeat`,
    `linear-gradient(${c}, ${c}) ${inset} calc(100% - ${inset}) / calc(100% - 2 * ${inset}) ${w} no-repeat`,
    `linear-gradient(${c}, ${c}) ${inset} ${inset} / ${w} calc(100% - 2 * ${inset}) no-repeat`,
    `linear-gradient(${c}, ${c}) calc(100% - ${inset}) ${inset} / ${w} calc(100% - 2 * ${inset}) no-repeat`,
  ].join(', ');

const PAPER: Record<PaperId, Record<string, string>> = {
  parchment: {
    paper: '#f3e5c4',
    edge: 'rgba(150, 105, 45, 0.45)',
    ink: '#3b2814',
    env: '#e6d2a6',
    'env-2': '#efdfb9',
    'env-shade': '#d4bb88',
  },
  rose: {
    paper: '#fbe7e9',
    edge: 'rgba(200, 110, 130, 0.38)',
    ink: '#5b1f36',
    lines: `${ROSES} right -3% top -4% / 36% auto no-repeat, ${ROSES_LOW} left -3% bottom -4% / 30% auto no-repeat, radial-gradient(circle at 20px 20px, rgba(220, 120, 150, 0.12) 2px, transparent 2.5px) 0 0 / 34px 34px`,
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
    lines: `${MOON} right 4% top 4% / 22% auto no-repeat, ${STARS} 0 0 / 90px 90px`,
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
    lines: `${LAVENDER} left 2% bottom 0 / 17% auto no-repeat, radial-gradient(circle at 10px 10px, rgba(140, 100, 210, 0.12) 1.6px, transparent 2px) 0 0 / 22px 22px`,
    env: '#d8cbef',
    'env-2': '#e5dcf5',
    'env-shade': '#c2b0e3',
  },
  confetti: {
    paper: '#fffaf2',
    edge: 'rgba(200, 160, 120, 0.3)',
    ink: '#3b2b40',
    lines: `${STREAMERS} right 0 top 0 / 34% auto no-repeat, ${BITS} 0 0 / 70px 70px`,
    env: '#f6e7d4',
    'env-2': '#fbf1e3',
    'env-shade': '#e8d2b6',
  },
  gilded: {
    paper: '#fbf3dc',
    edge: 'rgba(190, 140, 40, 0.55)',
    ink: '#3d2a08',
    lines: [
      `${CORNER_TL} 6px 6px / 21% auto no-repeat`,
      `${CORNER_TR} calc(100% - 6px) 6px / 21% auto no-repeat`,
      `${CORNER_BL} 6px calc(100% - 6px) / 21% auto no-repeat`,
      `${CORNER_BR} calc(100% - 6px) calc(100% - 6px) / 21% auto no-repeat`,
      frame('9px', '2px', '#c99a2e'),
      frame('14px', '1px', 'rgba(201, 154, 46, 0.6)'),
    ].join(', '),
    env: '#efdcaa',
    'env-2': '#f6e8c3',
    'env-shade': '#d9bd77',
  },
  royal: {
    paper: '#4a1626',
    edge: 'rgba(0, 0, 0, 0.5)',
    ink: '#f2d99a',
    lines: [
      `${CROWN} right 18px top 16px / 13% auto no-repeat`,
      frame('9px', '2px', 'rgba(233, 200, 119, 0.85)'),
      frame('14px', '1px', 'rgba(233, 200, 119, 0.45)'),
      `${DAMASK} 0 0 / 44px 52px`,
    ].join(', '),
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
