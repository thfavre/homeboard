import type { CanvasSnapshot } from '$shared/canvas.ts';
import { onEvent, rpc } from '$lib/client.svelte.ts';

function parseColor(hex: string): [number, number, number, number] {
  if (!hex.startsWith('#')) return [0, 0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/**
 * Client copy of the shared canvas. Keeps the pixels in sync with the server
 * and draws them into a <canvas> element at 1 device pixel per canvas pixel
 * (the element is scaled up with CSS and `image-rendering: pixelated`).
 */
export class PixelBoard {
  width = 0;
  height = 0;
  version = -1;
  pixels = new Uint8Array(0);

  private el: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private image: ImageData | null = null;
  private colors: [number, number, number, number][] = [];
  private frame = 0;
  private off: () => void;
  private loading: Promise<void> | null = null;

  constructor(palette: string[]) {
    this.setPalette(palette);
    this.off = onEvent<number[]>('canvas', 'px', (flat) => {
      for (let i = 0; i + 2 < flat.length; i += 3) this.set(flat[i], flat[i + 1], flat[i + 2]);
    });
  }

  setPalette(palette: string[]): void {
    this.colors = palette.map(parseColor);
  }

  /** Load the full canvas when the server version changed */
  sync(version: number): Promise<void> {
    if (version === this.version) return Promise.resolve();
    return this.reload();
  }

  reload(): Promise<void> {
    this.loading ??= rpc<CanvasSnapshot>('canvas', 'snapshot')
      .then((s) => {
        this.version = s.version;
        this.width = s.width;
        this.height = s.height;
        const bin = atob(s.data);
        this.pixels = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) this.pixels[i] = bin.charCodeAt(i);
        this.setup();
      })
      .finally(() => (this.loading = null));
    return this.loading;
  }

  attach(el: HTMLCanvasElement): void {
    this.el = el;
    this.setup();
  }

  get(x: number, y: number): number {
    return this.pixels[y * this.width + x] ?? 0;
  }

  set(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels[y * this.width + x] = c;
    if (!this.image) return;
    const [r, g, b, a] = this.colors[c] ?? [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    const d = this.image.data;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = a;
    this.schedule();
  }

  /** Whether something is painted outside a w x h canvas centered on this one (what a resize would cut off) */
  paintedOutside(w: number, h: number): boolean {
    const dx = Math.floor((this.width - w) / 2);
    const dy = Math.floor((this.height - h) / 2);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.pixels[y * this.width + x] && (x < dx || y < dy || x >= dx + w || y >= dy + h)) return true;
      }
    }
    return false;
  }

  destroy(): void {
    this.off();
    cancelAnimationFrame(this.frame);
  }

  private setup(): void {
    if (!this.el || !this.width) return;
    this.el.width = this.width;
    this.el.height = this.height;
    this.ctx = this.el.getContext('2d');
    if (!this.ctx) return;
    this.image = this.ctx.createImageData(this.width, this.height);
    const d = this.image.data;
    for (let p = 0; p < this.pixels.length; p++) {
      const [r, g, b, a] = this.colors[this.pixels[p]] ?? [0, 0, 0, 0];
      d[p * 4] = r;
      d[p * 4 + 1] = g;
      d[p * 4 + 2] = b;
      d[p * 4 + 3] = a;
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.ctx && this.image) this.ctx.putImageData(this.image, 0, 0);
    });
  }
}
