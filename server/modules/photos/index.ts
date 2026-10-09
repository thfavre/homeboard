import { readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { Photo, PhotosState } from '../../../shared/photos.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { defineModule } from '../../core/module.ts';
import { HbError, clamp, cleanName, num, uid } from '../../core/util.ts';

interface PhotoSettings {
  displaySec: number;
  /** 0 = no limit */
  maxQueue: number;
}

interface StoredPhoto extends Photo {
  file: string;
  guestId: string;
  paid: number;
}

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Guests send photos that are shown one after the other on the TV */
export default defineModule<PhotoSettings>({
  id: 'photos',
  name: 'Photos',
  description: 'Guests send photos that pop up on the TV',
  settings: { displaySec: 12, maxQueue: 20 },

  setup(ctx) {
    const media = ctx.mediaDir();
    const store = new JsonFile<{ gallery: StoredPhoto[] }>(join(ctx.dataDir, 'photos.json'), { gallery: [] });
    let queue: StoredPhoto[] = [];
    let current: (StoredPhoto & { until: number }) | null = null;
    let timer: NodeJS.Timeout | null = null;

    const pub = (p: StoredPhoto): Photo => ({ id: p.id, url: p.url, caption: p.caption, guest: p.guest, at: p.at });

    const showNext = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const next = queue.shift();
      if (!next) {
        current = null;
      } else {
        const ms = ctx.settings.get().displaySec * 1000;
        current = { ...next, until: Date.now() + ms };
        timer = setTimeout(showNext, ms);
      }
      ctx.publish();
    };

    const enqueue = (p: StoredPhoto, front = false) => {
      queue = front ? [p, ...queue] : [...queue, p];
      if (!current) showNext();
      else ctx.publish();
    };

    const deleteFile = (file: string) => {
      try {
        unlinkSync(join(media, file));
      } catch {
        // already gone
      }
    };

    const clearAll = () => {
      queue = [];
      for (const p of store.data.gallery) deleteFile(p.file);
      // Also remove files left behind by a crash
      for (const f of readdirSync(media)) deleteFile(f);
      store.data.gallery = [];
      store.save();
      showNext();
    };

    ctx.price({ key: 'photos.photo', label: 'Photo on the TV', default: 2000 });

    ctx.state((role): PhotosState => {
      const s = ctx.settings.get();
      return {
        current: current ? { ...pub(current), until: current.until } : null,
        queued: queue.length,
        upcoming: queue.slice(0, 3).map(pub),
        displaySec: s.displaySec,
        maxQueue: s.maxQueue,
        ...(role === 'admin' ? { queue: queue.map(pub), gallery: store.data.gallery.map(pub) } : {}),
      };
    });

    ctx.http.post('/upload', express.raw({ type: Object.keys(TYPES), limit: '10mb' }), (req, res) => {
      const guest = ctx.guestFromRequest(req);
      try {
        if (!guest) throw new HbError('Please join the session first');
        if (!ctx.enabled()) throw new HbError('Photos are turned off right now');
        const ext = TYPES[req.get('content-type') ?? ''];
        if (!ext || !Buffer.isBuffer(req.body) || req.body.length < 100) throw new HbError('Send a JPG, PNG or WebP image');
        const max = ctx.settings.get().maxQueue;
        if (max > 0 && queue.length >= max) throw new HbError('Lots of photos are waiting already. Try again in a minute.');
        const caption = cleanName(req.query.caption, 80);
        const charge = ctx.economy.charge(guest, 'photos.photo', 1, 'Photo on the TV');
        const id = uid(8);
        const file = `${id}.${ext}`;
        try {
          writeFileSync(join(media, file), req.body);
        } catch (err) {
          ctx.economy.refund(charge);
          throw err;
        }
        const photo: StoredPhoto = {
          id,
          file,
          url: ctx.mediaUrl(file),
          caption,
          guest: { id: guest.id, name: guest.name, color: guest.color },
          guestId: guest.id,
          at: Date.now(),
          paid: charge.amount,
        };
        store.data.gallery.push(photo);
        store.save();
        enqueue(photo);
        ctx.session.count(guest, 'photos');
        ctx.activity('{name} shared a photo', { guest });
        res.json({ id, position: queue.length });
      } catch (err) {
        if (err instanceof HbError) res.status(400).json({ error: err.message });
        else {
          ctx.log.error(err);
          res.status(500).json({ error: 'Upload failed' });
        }
      }
    });

    ctx.onAdmin('skip', () => showNext());

    ctx.onAdmin('showAgain', (args) => {
      const p = store.data.gallery.find((x) => x.id === args.id);
      if (!p) throw new HbError('Photo not found');
      enqueue(p, true);
    });

    ctx.onAdmin('remove', (args) => {
      const p = store.data.gallery.find((x) => x.id === args.id);
      if (!p) return;
      const guest = ctx.session.guests.get(p.guestId);
      // Only a photo of this party counts on the leaderboard
      if (guest && p.at >= ctx.session.startedAt) ctx.session.uncount(guest, 'photos');
      if (args.refund && p.paid > 0) {
        if (guest) {
          ctx.economy.giveBack(guest, p.paid, 'Refund: photo removed');
          ctx.toast(guest, { text: 'Your photo was removed and refunded', amount: p.paid });
        }
      }
      queue = queue.filter((x) => x.id !== p.id);
      store.data.gallery = store.data.gallery.filter((x) => x.id !== p.id);
      store.save();
      deleteFile(p.file);
      if (current?.id === p.id) showNext();
      else ctx.publish();
    });

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        displaySec: args.displaySec !== undefined ? clamp(num(args.displaySec, 12), 3, 120) : s.displaySec,
        maxQueue: args.maxQueue !== undefined ? clamp(Math.round(num(args.maxQueue, 20)), 0, 1000) : s.maxQueue,
      });
      ctx.publish();
    });

    ctx.onToggle((on) => {
      if (!on) {
        queue = [];
        showNext();
      }
    });
    ctx.onSessionReset(clearAll);
  },
});
