/**
 * Short light effects played over whatever the lights show (Crowd Race and Spy Hunt: a shot, a kill, a
 * flashbang...). They are drawn as live pixels over a copy of what each light showed just before, so they
 * fade back into it; then the light leaves live mode and carries on with its own effect, untouched.
 */

export type LightFlash = 'shot' | 'kill' | 'flashbang' | 'smoke' | 'gold' | 'win';
export interface FlashOptions {
  /** Length (flashbang, smoke) */
  ms?: number;
  /** Color (win) */
  color?: string;
}

type Rgb = [number, number, number];

/** One effect on one light: how much of its color covers each pixel at `t` ms */
interface Running {
  kind: LightFlash;
  start: number;
  ms: number;
  color: Rgb;
}

const DEFAULT_MS: Record<LightFlash, number> = { shot: 200, kill: 1150, flashbang: 2000, smoke: 8000, gold: 700, win: 1900 };

const hexRgb = (hex: string | undefined, fallback: Rgb): Rgb => {
  const n = parseInt(String(hex ?? '').replace('#', '').slice(0, 6), 16);
  return Number.isFinite(n) && String(hex ?? '').length >= 7 ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : fallback;
};
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * The cover of one effect for pixel `i` of `n` at `t` ms (0 to 1), and its color there. Each one is
 * shaped to read at a glance across a room: a shot is a quick small glint, a kill a hard red hit that
 * melts back, a flashbang a blinding white that takes its time to clear, smoke a slow grey haze.
 */
function shade(e: Running, t: number, i: number, n: number): { a: number; rgb: Rgb } {
  const p = t / e.ms;
  switch (e.kind) {
    case 'shot': {
      // A soft white glint, far from full power: a shot is frequent, it should not dazzle
      return { a: 0.3 * (1 - p) ** 2, rgb: [255, 250, 235] };
    }
    case 'kill': {
      // Red at once, held a moment, then fading back over the rest
      const a = t < 70 ? t / 70 : t < 170 ? 1 : 1 - smooth((t - 170) / (e.ms - 170));
      return { a, rgb: e.color };
    }
    case 'flashbang': {
      // A strobe: white, off, white again (held a moment), then a slow fade back over the rest
      if (t < 70) return { a: 1, rgb: [255, 255, 255] };
      if (t < 160) return { a: 0, rgb: [255, 255, 255] };
      if (t < 320) return { a: 1, rgb: [255, 255, 255] };
      const k = 1 - (t - 320) / Math.max(1, e.ms - 320);
      return { a: Math.max(0, k) ** 1.8, rgb: [255, 250, 235] };
    }
    case 'smoke': {
      // A grey haze drifting along the light, thicker in places; it rolls in and clears slowly
      const env = Math.min(1, t / 700, (e.ms - t) / 1400);
      const x = i / Math.max(1, n);
      const k = 0.5 + 0.25 * Math.sin(x * 17 + t / 900) + 0.25 * Math.sin(x * 41 - t / 1300 + 1.7);
      const g = 40 + 70 * k;
      return { a: 0.9 * Math.max(0, env), rgb: [g, g * 1.04, g * 1.18] };
    }
    case 'gold': {
      return { a: 0.45 * Math.sin(Math.PI * Math.min(1, p)), rgb: [255, 165, 25] };
    }
    case 'win': {
      // Waves of the winner's color running along the light
      const env = Math.min(1, t / 150, (e.ms - t) / 500);
      const wave = 0.5 + 0.5 * Math.sin((i / Math.max(1, n)) * Math.PI * 6 - t / 110);
      return { a: Math.max(0, env) * (0.35 + 0.6 * wave), rgb: e.color };
    }
  }
}

export interface OverlayLight {
  id: string;
  leds: number;
}

export interface OverlayDeps {
  /**
   * Lights an effect may play on right now (online, not used by a game or a live show). `all`: also the
   * lights set to use only some of their segments (the flashbang takes over every light for a moment)
   */
  lights(all?: boolean): OverlayLight[];
  /** What a light shows now, as live pixels would draw it (null: unknown, or the light is off) */
  snapshot(id: string, leds: number): Promise<Float32Array | null>;
  /** Live pixels; `exit`: leave live mode now (the light goes back to its own effect) */
  send(id: string, rgb: Uint8Array | null): void;
  frameMs: number;
}

/** Plays the effects, and keeps the copies of what the lights show fresh while a game wants them */
export class LightOverlay {
  private running = new Map<string, Running[]>();
  private bases = new Map<string, { px: Float32Array; at: number } | null>();
  private timer: NodeJS.Timeout | null = null;
  private watchTimer: NodeJS.Timeout | null = null;
  /** When each light last left live mode: its next copy waits a moment (it may still show ours) */
  private freeAt = new Map<string, number>();

  constructor(private deps: OverlayDeps) {}

  /** Keep a recent copy of each light (a game is on): every couple of seconds while nothing plays on it */
  watch(on: boolean): void {
    if (!on) {
      if (this.watchTimer) clearInterval(this.watchTimer);
      this.watchTimer = null;
      return;
    }
    if (this.watchTimer) return;
    const refresh = () => {
      for (const l of this.deps.lights(true)) void this.refresh(l);
    };
    refresh();
    this.watchTimer = setInterval(refresh, 2500);
  }

  private async refresh(l: OverlayLight): Promise<void> {
    if (this.running.get(l.id)?.length || Date.now() < (this.freeAt.get(l.id) ?? 0) + 400) return;
    try {
      const px = await this.deps.snapshot(l.id, l.leds);
      // An effect started meanwhile: the copy may hold it
      if (this.running.get(l.id)?.length) return;
      this.bases.set(l.id, px ? { px, at: Date.now() } : null);
    } catch {
      /* unknown: the effects fade to dark */
    }
  }

  play(kind: LightFlash, o: FlashOptions = {}): void {
    const now = Date.now();
    const ms = Math.max(100, o.ms ?? DEFAULT_MS[kind]);
    const color = hexRgb(o.color, kind === 'kill' ? [255, 0, 0] : [255, 255, 255]);
    const all = kind === 'flashbang';
    for (const l of this.deps.lights(all)) {
      // A light we know is off stays off, except for the flashbang: it blinds every light in the room
      if (!all && this.bases.has(l.id) && this.bases.get(l.id) === null) continue;
      const list = this.running.get(l.id) ?? [];
      // The same short effect again replaces the one playing
      const kept = kind === 'smoke' ? list : list.filter((e) => e.kind !== kind);
      kept.push({ kind, start: now, ms, color });
      this.running.set(l.id, kept);
      if (!this.bases.has(l.id)) void this.refresh(l);
    }
    if (!this.timer && this.running.size) this.timer = setInterval(() => this.tick(), this.deps.frameMs);
    this.tick();
  }

  /** Stop everything at once (the game is over) */
  clear(): void {
    for (const id of this.running.keys()) this.deps.send(id, null);
    this.running.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.watch(false);
    this.bases.clear();
  }

  private tick(): void {
    const now = Date.now();
    const leds = new Map(this.deps.lights(true).map((l) => [l.id, l.leds]));
    for (const [id, list] of [...this.running]) {
      const live = list.filter((e) => now - e.start < e.ms);
      const n = leds.get(id);
      if (!live.length || !n) {
        this.running.delete(id);
        this.freeAt.set(id, now);
        this.deps.send(id, null);
        continue;
      }
      this.running.set(id, live);
      const base = this.bases.get(id)?.px;
      const out = new Uint8Array(n * 3);
      for (let i = 0; i < n; i++) {
        let r = base?.[i * 3] ?? 0;
        let g = base?.[i * 3 + 1] ?? 0;
        let b = base?.[i * 3 + 2] ?? 0;
        // Effects in the order they started: a kill covers the shot that made it
        for (const e of live) {
          const { a, rgb } = shade(e, now - e.start, i, n);
          if (a <= 0) continue;
          r += (rgb[0] - r) * a;
          g += (rgb[1] - g) * a;
          b += (rgb[2] - b) * a;
        }
        out[i * 3] = Math.max(0, Math.min(255, Math.round(r)));
        out[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(g)));
        out[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(b)));
      }
      this.deps.send(id, out);
    }
    if (!this.running.size && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
