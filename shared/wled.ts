export interface WledDevice {
  id: string;
  host: string;
  name: string;
  /** WLED segment ids effects and games play on, the others are left as they are (empty: every segment) */
  segments?: number[];
  /** Their names when picked, shown in the admin */
  segmentNames?: string[];
}

export interface WledEffect {
  id: string;
  name: string;
  /** WLED effect id */
  fx: number;
  /** WLED palette id */
  pal: number;
  /** Speed 0-255 */
  sx: number;
  /** Intensity 0-255 */
  ix: number;
  /** Up to 3 colors as hex, used by effects that use the segment colors */
  colors: string[];
}

export interface WledJob {
  id: string;
  effect: { id: string; name: string; colors: string[] };
  devices: string[];
  guest: { name: string; color: string };
}

export interface WledState {
  devices: (WledDevice & { online: boolean; leds?: number })[];
  effects: WledEffect[];
  durationSec: number;
  current: (WledJob & { until: number }) | null;
  queue: WledJob[];
  /** Admin only */
  brightness?: number;
}

export const DEFAULT_WLED_EFFECTS: WledEffect[] = [
  { id: 'rainbow', name: 'Rainbow', fx: 9, pal: 0, sx: 170, ix: 128, colors: [] },
  { id: 'party', name: 'Party waves', fx: 67, pal: 6, sx: 160, ix: 160, colors: [] },
  { id: 'fireworks', name: 'Fireworks', fx: 42, pal: 11, sx: 128, ix: 200, colors: [] },
  { id: 'fire', name: 'Fire', fx: 66, pal: 35, sx: 128, ix: 160, colors: [] },
  { id: 'ocean', name: 'Ocean', fx: 101, pal: 0, sx: 128, ix: 128, colors: [] },
  { id: 'twinkle', name: 'Twinkle', fx: 74, pal: 6, sx: 128, ix: 200, colors: [] },
  { id: 'meteor', name: 'Meteor', fx: 76, pal: 11, sx: 200, ix: 128, colors: [] },
  { id: 'lightning', name: 'Lightning', fx: 57, pal: 0, sx: 200, ix: 160, colors: ['#e0e7ff'] },
  { id: 'heartbeat', name: 'Heartbeat', fx: 100, pal: 0, sx: 160, ix: 128, colors: ['#ff1744'] },
  { id: 'aurora', name: 'Aurora', fx: 38, pal: 50, sx: 100, ix: 128, colors: [] },
  { id: 'disco', name: 'Disco strobe', fx: 24, pal: 0, sx: 200, ix: 128, colors: [] },
];
