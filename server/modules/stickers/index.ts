import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { BUILTIN_STICKERS, type ActiveSticker, type StickerDef, type StickersState } from '../../../shared/stickers.ts';
import { defineModule } from '../../core/module.ts';
import { HbError, clamp, cleanName, num, uid } from '../../core/util.ts';

interface CustomSticker {
  id: string;
  name: string;
  file: string;
}

interface StickerSettings {
  durationSec: number;
  /** 0 = no limit */
  maxActive: number;
  allowText: boolean;
  custom: CustomSticker[];
}

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/** Stickers that bounce around the TV for a few minutes, DVD-logo style */
export default defineModule<StickerSettings>({
  id: 'stickers',
  name: 'Stickers',
  description: 'Guests send stickers or short texts that bounce around the TV',
  settings: { durationSec: 120, maxActive: 10, allowText: true, custom: [] },

  setup(ctx) {
    let active: ActiveSticker[] = [];
    const timers = new Map<string, NodeJS.Timeout>();
    const media = ctx.mediaDir();

    const catalog = (): StickerDef[] => [
      ...BUILTIN_STICKERS.map((s) => ({ id: s.id, name: s.name, kind: 'builtin' as const })),
      ...ctx.settings.get().custom.map((c) => ({ id: c.id, name: c.name, kind: 'image' as const, src: ctx.mediaUrl(c.file) })),
    ];

    const remove = (id: string) => {
      clearTimeout(timers.get(id));
      timers.delete(id);
      active = active.filter((a) => a.id !== id);
      ctx.publish();
    };

    ctx.price({ key: 'stickers.sticker', label: 'Bouncing sticker', default: 1000 });

    ctx.state((): StickersState => {
      const s = ctx.settings.get();
      return { catalog: catalog(), active, durationSec: s.durationSec, maxActive: s.maxActive, allowText: s.allowText };
    });

    ctx.onGuest('place', (args, guest) => {
      const s = ctx.settings.get();
      if (s.maxActive > 0 && active.length >= s.maxActive) throw new HbError('The screen is full of stickers. Try again in a moment.');
      let sticker: StickerDef | null = null;
      let text: string | undefined;
      if (args.text !== undefined) {
        if (!s.allowText) throw new HbError('Text stickers are turned off');
        text = cleanName(args.text, 24);
        if (!text) throw new HbError('Write something first');
      } else {
        sticker = catalog().find((c) => c.id === args.id) ?? null;
        if (!sticker) throw new HbError('Unknown sticker');
      }
      ctx.economy.charge(guest, 'stickers.sticker', 1, text ? `Text sticker "${text}"` : `Sticker: ${sticker!.name}`);
      const item: ActiveSticker = {
        id: uid(6),
        sticker,
        text,
        guest: { name: guest.name, color: guest.color },
        until: Date.now() + s.durationSec * 1000,
      };
      active = [...active, item];
      timers.set(item.id, setTimeout(() => remove(item.id), s.durationSec * 1000));
      ctx.activity(text ? `{name} wrote "${text}" on the TV` : `{name} dropped a ${sticker!.name.toLowerCase()} sticker`, { guest });
      ctx.publish();
      return true;
    });

    ctx.onAdmin('remove', (args) => remove(String(args.id)));
    ctx.onAdmin('clear', () => {
      for (const id of [...timers.keys()]) remove(id);
    });

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        durationSec: args.durationSec !== undefined ? clamp(num(args.durationSec, 120), 10, 3600) : s.durationSec,
        maxActive: args.maxActive !== undefined ? clamp(Math.round(num(args.maxActive, 10)), 0, 100) : s.maxActive,
        allowText: args.allowText !== undefined ? !!args.allowText : s.allowText,
      });
      ctx.publish();
    });

    ctx.onAdmin('deleteCustom', (args) => {
      const s = ctx.settings.get();
      const c = s.custom.find((x) => x.id === args.id);
      if (!c) return;
      try {
        unlinkSync(join(media, c.file));
      } catch {
        // already gone
      }
      ctx.settings.update({ custom: s.custom.filter((x) => x.id !== c.id) });
      ctx.publish();
    });

    ctx.http.post('/upload', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '4mb' }), (req, res) => {
      if (!ctx.isAdminRequest(req)) {
        res.status(403).json({ error: 'Host only' });
        return;
      }
      const ext = IMAGE_TYPES[req.get('content-type') ?? ''];
      if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) {
        res.status(400).json({ error: 'Send a PNG, JPG, GIF, WebP or SVG image' });
        return;
      }
      const id = uid(6);
      const file = `${id}.${ext}`;
      writeFileSync(join(media, file), req.body);
      const name = cleanName(req.query.name, 30) || 'Custom';
      ctx.settings.update({ custom: [...ctx.settings.get().custom, { id, name, file }] });
      ctx.publish();
      res.json({ id });
    });

    ctx.onToggle((on) => {
      if (!on) for (const id of [...timers.keys()]) remove(id);
    });
    ctx.onSessionReset(() => {
      for (const id of [...timers.keys()]) remove(id);
    });
  },
});
