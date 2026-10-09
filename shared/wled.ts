export interface WledDevice {
  id: string;
  host: string;
  name: string;
  /** WLED segment ids effects and games play on, the others are left as they are (empty: every segment) */
  segments?: number[];
  /** Their names when picked, shown in the admin */
  segmentNames?: string[];
}

/** What a WLED segment shows */
export interface WledLook {
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

/** Effects Homeboard draws itself, live, each light with its own show */
export const WLED_LIVE = { fireworks: 'Fireworks' } as const;
export type WledLive = keyof typeof WLED_LIVE;

export interface WledEffect extends WledLook {
  id: string;
  name: string;
  /**
   * Other looks dealt out in turn to every light (and to every segment of a light), so they do not all
   * show the same thing. The look above is the first of them.
   */
  variants?: Partial<WledLook>[];
  /** Drawn live by Homeboard instead; the WLED look above is kept for lights where only some segments are picked */
  live?: WledLive;
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
  /** Calm looks that stay on until another one is picked (effects play over them) */
  scenes: WledEffect[];
  /** The scene on now (null: the lights do their usual thing) */
  scene: { id: string; name: string; by: string } | null;
  /** Guests may change the scene */
  guestScenes: boolean;
  durationSec: number;
  current: (WledJob & { until: number }) | null;
  queue: WledJob[];
  /** Admin only */
  brightness?: number;
  sceneBrightness?: number;
}

export const DEFAULT_WLED_EFFECTS: WledEffect[] = [
  { id: 'rainbow', name: 'Rainbow', fx: 9, pal: 0, sx: 170, ix: 128, colors: [] },
  { id: 'party', name: 'Party waves', fx: 67, pal: 6, sx: 160, ix: 160, colors: [] },
  // Fireworks 1D where Homeboard cannot draw (only some segments picked)
  { id: 'fireworks', name: 'Fireworks', fx: 90, pal: 11, sx: 128, ix: 128, colors: [], live: 'fireworks' },
  { id: 'fire', name: 'Fire', fx: 66, pal: 35, sx: 128, ix: 160, colors: [] },
  { id: 'ocean', name: 'Ocean', fx: 101, pal: 0, sx: 128, ix: 128, colors: [] },
  { id: 'twinkle', name: 'Twinkle', fx: 74, pal: 6, sx: 128, ix: 200, colors: [] },
  { id: 'meteor', name: 'Meteor', fx: 76, pal: 11, sx: 200, ix: 128, colors: [] },
  { id: 'lightning', name: 'Lightning', fx: 57, pal: 0, sx: 200, ix: 160, colors: ['#e0e7ff'] },
  { id: 'heartbeat', name: 'Heartbeat', fx: 100, pal: 0, sx: 160, ix: 128, colors: ['#ff1744'] },
  { id: 'aurora', name: 'Aurora', fx: 38, pal: 50, sx: 100, ix: 128, colors: [] },
  { id: 'disco', name: 'Disco strobe', fx: 24, pal: 0, sx: 200, ix: 128, colors: [] },
  { id: 'blackout', name: 'Blackout', fx: 0, pal: 0, sx: 128, ix: 128, colors: ['#000000'] },
  {
    id: 'police',
    name: 'Police',
    fx: 50,
    pal: 3,
    sx: 182,
    ix: 98,
    colors: ['#ff0000', '#0000ff'],
    variants: [
      {},
      { fx: 60, pal: 0, sx: 242, ix: 183 },
      { fx: 31, pal: 3, sx: 197, ix: 128 },
      { fx: 2, pal: 3, sx: 210, ix: 128 },
    ],
  },
  {
    id: 'fire-ice',
    name: 'Fire and ice',
    fx: 66,
    pal: 35,
    sx: 95,
    ix: 180,
    colors: [],
    variants: [{}, { fx: 67, pal: 9, sx: 35, ix: 63 }, { fx: 67, pal: 36, sx: 24, ix: 93 }],
  },
  {
    id: 'storm',
    name: 'Thunderstorm',
    fx: 57,
    pal: 0,
    sx: 190,
    ix: 170,
    colors: ['#dbe4ff'],
    variants: [{}, { fx: 43, pal: 9, sx: 160, ix: 150, colors: [] }, { fx: 57, sx: 120, ix: 120, colors: ['#a5b4fc'] }],
  },
  {
    id: 'glitch',
    name: 'Glitch party',
    fx: 39,
    pal: 57,
    sx: 140,
    ix: 90,
    colors: [],
    variants: [{}, { fx: 32, pal: 5, sx: 190, ix: 150, colors: ['#ff00c8', '#00f0ff', '#ffe600'] }, { fx: 85, pal: 6, sx: 228, ix: 244 }, { fx: 27, pal: 57, sx: 200, ix: 100 }],
  },
];

/** Calm looks, from the presets on the lights: they stay until another scene is picked */
export const DEFAULT_WLED_SCENES: WledEffect[] = [
  {
    id: 'embers',
    name: 'Warm embers',
    fx: 110,
    pal: 4,
    sx: 12,
    ix: 18,
    colors: ['#f68500', '#ff6500', '#550d00'],
    variants: [{}, { fx: 113, sx: 11, ix: 89, colors: ['#cc6402', '#ff0000', '#cf8e02'] }, { fx: 102, pal: 47, sx: 96, ix: 200, colors: [] }],
  },
  {
    id: 'northern',
    name: 'Northern lights',
    fx: 38,
    pal: 50,
    sx: 24,
    ix: 128,
    colors: [],
    variants: [{}, { fx: 67, pal: 50, sx: 12, ix: 200, colors: ['#66ccff', '#05ffb2', '#ffffff'] }, { pal: 55 }],
  },
  {
    id: 'night',
    name: 'Starry night',
    fx: 67,
    pal: 46,
    sx: 12,
    ix: 100,
    colors: [],
    variants: [{}, { fx: 68, sx: 35, ix: 45 }, { fx: 107, sx: 20, ix: 60 }, { fx: 74, pal: 46, sx: 16, ix: 40 }],
  },
  {
    id: 'sea',
    name: 'Deep sea',
    fx: 101,
    pal: 51,
    sx: 60,
    ix: 128,
    colors: [],
    variants: [{}, { fx: 67, pal: 9, sx: 20, ix: 60 }, { fx: 75, pal: 9, sx: 40, ix: 128 }],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    fx: 67,
    pal: 68,
    sx: 10,
    ix: 90,
    colors: [],
    variants: [{}, { pal: 13 }, { pal: 21, ix: 80 }],
  },
  {
    id: 'vapor',
    name: 'Vaporwave',
    fx: 115,
    pal: 57,
    sx: 15,
    ix: 40,
    colors: [],
    variants: [{}, { fx: 69, pal: 9, sx: 10, ix: 50 }, { fx: 67, pal: 61, sx: 10, ix: 60 }],
  },
  {
    id: 'cyber',
    name: 'Cyberpunk dusk',
    fx: 67,
    pal: 44,
    sx: 8,
    ix: 30,
    colors: [],
    variants: [{}, { fx: 74, pal: 4, sx: 45, ix: 25, colors: ['#ff6a00', '#00c2c7', '#3a0ca3'] }],
  },
  {
    id: 'candles',
    name: 'Candlelight',
    fx: 102,
    pal: 0,
    sx: 96,
    ix: 224,
    colors: ['#ff8a1c', '#2b0c00'],
    variants: [{}, { fx: 88, sx: 80, ix: 200 }],
  },
];

/** The default effects shipped before ones were added: any other default missing from a saved list is new to it */
export const LEGACY_WLED_EFFECTS = ['rainbow', 'party', 'fireworks', 'fire', 'ocean', 'twinkle', 'meteor', 'lightning', 'heartbeat', 'aurora', 'disco'];
