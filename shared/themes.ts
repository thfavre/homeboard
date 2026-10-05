// Theme registry. A theme is a set of CSS variables in web/src/themes/<id>.css
export const THEMES = [
  { id: 'midnight', name: 'Midnight' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'paper', name: 'Paper' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
