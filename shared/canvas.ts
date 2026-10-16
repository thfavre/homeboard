/** Index 0 is "empty" (shows the background); the rest are paint colors. */
export const CANVAS_PALETTE = [
  'transparent',
  '#ffffff',
  '#c4c7d4',
  '#7a7f93',
  '#2b2d38',
  '#0b0c10',
  '#ff4757',
  '#ff8a3d',
  '#ffd23f',
  '#a3e635',
  '#2ecc71',
  '#14b8a6',
  '#38bdf8',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#fda4af',
  '#fdba74',
  '#e7c79b',
  '#8b5a2b',
  '#166534',
  '#1e3a8a',
  '#7f1d1d',
];

export const CANVAS_SIZES = [
  { width: 96, height: 54, label: 'Small (96 x 54)' },
  { width: 128, height: 72, label: 'Medium (128 x 72)' },
  { width: 160, height: 90, label: 'Large (160 x 90)' },
  { width: 192, height: 108, label: 'Huge (192 x 108)' },
  { width: 256, height: 144, label: 'Giant (256 x 144)' },
  { width: 320, height: 180, label: 'Massive (320 x 180)' },
  { width: 384, height: 216, label: 'Enormous (384 x 216)' },
  { width: 480, height: 270, label: 'Colossal (480 x 270)' },
  { width: 640, height: 360, label: 'Gigantic (640 x 360)' },
];

export interface CanvasState {
  width: number;
  height: number;
  palette: string[];
  /** Changes when the canvas is cleared or resized: clients reload the snapshot */
  version: number;
}

export interface CanvasSnapshot {
  version: number;
  width: number;
  height: number;
  /** base64 of one byte per pixel */
  data: string;
}
