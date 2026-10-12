// What every Light Party mini game shares: drawing on the strip, and how it plugs into the party.

import { PARTY_COLORS, type PartyColor, type PartyMiniId, type PartyMiniView } from '../../../../shared/party.ts';
import { clamp } from '../../../core/util.ts';
import type { MatchApi } from '../engine.ts';

export type Rgb = readonly [number, number, number];

export const rgbOf = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
};
export const WHITE: Rgb = [255, 255, 255];
/** What the strip shows for each color of the dots and blocks */
export const LED = Object.fromEntries(PARTY_COLORS.map((c) => [c.id, rgbOf(c.led)])) as Record<PartyColor, Rgb>;
/** The first `k` colors (they are listed in the order they are used) */
export const colorsIn = (k: number) => PARTY_COLORS.slice(0, clamp(k, 1, PARTY_COLORS.length)).map((c) => c.id) as PartyColor[];

export const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** 0 to 1 over `ms` from `at` */
export const ramp = (now: number, at: number, ms: number) => clamp((now - at) / ms, 0, 1);
/** Fades in over `inMs` from `at`, stays, and fades out over `outMs` before `end` */
export const envelope = (now: number, at: number, end: number, inMs: number, outMs: number) => Math.min(ramp(now, at, inMs), 1 - ramp(now, end - outMs, outMs));

/** Pixels of one frame, bottom first, 0 to 255 per channel */
export class Frame {
  readonly px: Float32Array;
  constructor(readonly n: number) {
    this.px = new Float32Array(n * 3);
  }
  /** Add a color at a pixel (light adds up), `k` its strength */
  add(i: number, rgb: Rgb, k = 1) {
    if (i < 0 || i >= this.n || k <= 0) return;
    const o = i * 3;
    this.px[o] += rgb[0] * k;
    this.px[o + 1] += rgb[1] * k;
    this.px[o + 2] += rgb[2] * k;
  }
  /** Pixels `from` (included) to `to` (excluded) */
  fill(from: number, to: number, rgb: Rgb, k = 1) {
    for (let i = Math.max(0, Math.floor(from)); i < Math.min(this.n, Math.ceil(to)); i++) this.add(i, rgb, k);
  }
  pack(reverse: boolean): Uint8Array {
    const out = new Uint8Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      const o = (reverse ? this.n - 1 - i : i) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = Math.min(255, Math.max(0, Math.round(this.px[i * 3 + c])));
    }
    return out;
  }
}

/** A player's result in a mini game: higher `score` is better (ties share a place), null: did not play */
export interface Result {
  id: string;
  label: string;
  score: number | null;
}

/** What a mini game gets from the party */
export interface Host {
  m: MatchApi;
  /** Pixels of the strip */
  n: number;
  /** One of its settings (see its options in shared/party.ts), in range */
  opt(key: string): number;
  /** Run `fn` in `ms`, unless the game moved on to another phase by then */
  after(ms: number, fn: () => void): void;
  /** The mini game moves to its next phase: earlier `after` calls are dropped */
  next(): void;
  /** Over: the party gives points by place */
  done(results: Result[]): void;
}

/** A mini game, made fresh each time it is played */
export interface Mini {
  start(): void;
  /** A player acts. Throw HbError to refuse. */
  input(id: string, args: any): unknown;
  /** What the screens see (nothing secret before its reveal) */
  view(): PartyMiniView;
  /** Draw the strip now */
  render(now: number, f: Frame): void;
}

export type MiniFactory = (h: Host) => Mini;
export type MiniRegistry = Record<PartyMiniId, MiniFactory>;
