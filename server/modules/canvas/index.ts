import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import { HbError, debounce, num } from '../../core/util.ts';
import { CANVAS_PALETTE, CANVAS_SIZES, type CanvasState } from '../../../shared/canvas.ts';

interface CanvasSettings {
  width: number;
  height: number;
  clearOnNewSession: boolean;
}

const MAX_PIXELS_PER_CALL = 400;
const FLUSH_MS = 50;
const ACTIVITY_MS = 20_000;

/**
 * Shared pixel canvas (r/place style). Guests paint pixels from their phone,
 * the TV shows the whole canvas. Pixels are palette indexes; 0 is "empty".
 */
export default defineModule<CanvasSettings>({
  id: 'canvas',
  name: 'Pixel canvas',
  description: 'A shared pixel canvas on the TV that guests paint from their phone',
  settings: { width: 160, height: 90, clearOnNewSession: true },

  setup(ctx) {
    const file = join(ctx.dataDir, 'pixels.bin');
    let { width, height } = ctx.settings.get();
    let pixels = new Uint8Array(width * height);
    let version = Date.now();

    if (existsSync(file)) {
      const buf = readFileSync(file);
      if (buf.length === pixels.length) pixels.set(buf);
    }
    const save = debounce(() => writeFileSync(file, pixels), 2000);

    // Pending updates sent to everyone in small batches: [x, y, color, x, y, color, ...]
    let pending: number[] = [];
    let flushTimer: NodeJS.Timeout | null = null;
    const queue = (x: number, y: number, c: number) => {
      pending.push(x, y, c);
      flushTimer ??= setTimeout(() => {
        flushTimer = null;
        ctx.emit('all', 'px', pending);
        pending = [];
      }, FLUSH_MS);
    };

    // Activity lines are grouped per guest so the feed is not flooded
    const painted = new Map<string, { guest: Guest; count: number }>();
    setInterval(() => {
      for (const { guest, count } of painted.values()) {
        ctx.activity(`{name} painted ${count} ${count === 1 ? 'pixel' : 'pixels'}`, { guest });
      }
      painted.clear();
    }, ACTIVITY_MS);

    const reset = (w: number, h: number) => {
      width = w;
      height = h;
      pixels = new Uint8Array(w * h);
      version = Date.now();
      save();
      ctx.publish();
    };

    ctx.price({ key: 'canvas.pixel', label: 'Painting', unit: 'pixel', default: 10 });

    ctx.state((role): CanvasState & { clearOnNewSession?: boolean } => ({
      width,
      height,
      palette: CANVAS_PALETTE,
      version,
      ...(role === 'admin' ? { clearOnNewSession: ctx.settings.get().clearOnNewSession } : {}),
    }));

    const snapshot = () => ({ version, width, height, data: Buffer.from(pixels).toString('base64') });
    ctx.onGuest('snapshot', snapshot);
    ctx.onTv('snapshot', snapshot);
    ctx.onAdmin('snapshot', snapshot);

    ctx.onGuest('paint', (args, guest) => {
      const list = Array.isArray(args.pixels) ? args.pixels : [];
      if (list.length > MAX_PIXELS_PER_CALL) throw new HbError('Too many pixels at once');
      const changes: [number, number, number][] = [];
      for (const p of list) {
        const [x, y, c] = [num(p?.[0], -1), num(p?.[1], -1), num(p?.[2], -1)];
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) continue;
        if (!Number.isInteger(c) || c < 0 || c >= CANVAS_PALETTE.length) continue;
        if (pixels[y * width + x] === c) continue;
        changes.push([x, y, c]);
      }
      if (!changes.length) return { painted: 0 };
      ctx.economy.charge(guest, 'canvas.pixel', changes.length, `Painted ${changes.length} pixels`);
      for (const [x, y, c] of changes) {
        pixels[y * width + x] = c;
        queue(x, y, c);
      }
      save();
      const entry = painted.get(guest.id) ?? { guest, count: 0 };
      entry.count += changes.length;
      painted.set(guest.id, entry);
      return { painted: changes.length };
    });

    ctx.onAdmin('clear', () => {
      reset(width, height);
      ctx.activity('The canvas was wiped clean');
    });

    ctx.onAdmin('setSize', (args) => {
      const size = CANVAS_SIZES.find((s) => s.width === num(args.width) && s.height === num(args.height));
      if (!size) throw new HbError('Unsupported size');
      ctx.settings.update({ width: size.width, height: size.height });
      reset(size.width, size.height);
    });

    ctx.onAdmin('setOptions', (args) => {
      ctx.settings.update({ clearOnNewSession: !!args.clearOnNewSession });
      ctx.publish();
    });

    ctx.onSessionReset(() => {
      painted.clear();
      if (ctx.settings.get().clearOnNewSession) reset(width, height);
    });
  },
});
