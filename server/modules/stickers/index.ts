import { copyFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { MAX_GUEST_STICKERS, type ActiveSticker, type GuestSticker, type StickerDef, type StickersState } from '../../../shared/stickers.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
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
  allowCustom: boolean;
  custom: CustomSticker[];
  /** Default stickers already put in the collection (by file name), so one the host deletes stays deleted */
  defaultsAdded: string[];
}

/** Stickers shipped with Homeboard (in ./defaults), put in the collection once like uploaded ones */
const DEFAULTS_DIR = join(import.meta.dirname, 'defaults');
const DEFAULT_STICKERS: [file: string, name: string][] = [
  ['arrow.png', 'Arrow'],
  ['bagel.png', 'Bagel'],
  ['belt.png', 'Belt'],
  ['butter.png', 'Butter'],
  ['crying-meme.png', 'Crying meme'],
  ['dvd-drive.png', 'DVD drive'],
  ['dvd-logo.png', 'DVD logo'],
  ['egg.png', 'Egg'],
  ['eggplant.png', 'Eggplant'],
  ['fish.png', 'Fish'],
  ['goofy-smiley.png', 'Goofy smiley'],
  ['gumball.png', 'Gumball'],
  ['oil-lamp.png', 'Oil lamp'],
  ['party-cups.png', 'Party cups'],
  ['pawns.png', 'Pawns'],
  ['rainbow.png', 'Rainbow'],
  ['roast-chicken.png', 'Roast chicken'],
  ['rubber-band-ball.png', 'Rubber band ball'],
  ['sphynx-cat.png', 'Sphynx cat'],
  ['stew.png', 'Stew'],
  ['strainer.png', 'Strainer'],
  ['tartan-beret.png', 'Tartan beret'],
  ['tennis-ball.png', 'Tennis ball'],
  ['thinking.png', 'Thinking'],
  ['thumbs-up.png', 'Thumbs up'],
  ['tire.png', 'Tire'],
  ['vanilla.png', 'Vanilla'],
  ['wig.png', 'Wig'],
  ['zucchini.png', 'Zucchini'],
];

interface StoredGuestSticker {
  id: string;
  name: string;
  file: string;
}

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/** What guests may upload for their own stickers (no SVG: it could carry scripts) */
const GUEST_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
};

/** Checks the first bytes, so a guest cannot pass something else off as an image */
function looksLike(ext: string, b: Buffer): boolean {
  if (ext === 'png') return b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (ext === 'jpg') return b[0] === 0xff && b[1] === 0xd8;
  if (ext === 'gif') return b.subarray(0, 4).toString('latin1') === 'GIF8';
  if (ext === 'webp') return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

/** Stickers that bounce around the TV for a few minutes, DVD-logo style */
export default defineModule<StickerSettings>({
  id: 'stickers',
  name: 'Stickers',
  description: 'Guests send stickers or short texts that bounce around the TV',
  settings: { durationSec: 120, maxActive: 10, allowText: true, allowCustom: true, custom: [], defaultsAdded: [] },

  setup(ctx) {
    let active: ActiveSticker[] = [];
    const timers = new Map<string, NodeJS.Timeout>();
    const media = ctx.mediaDir();
    const guestMedia = ctx.mediaDir('guests');

    // Each guest's own stickers ("My stickers"), by guest id. Cleared with the session, like the guests.
    const personal = new JsonFile<{ guests: Record<string, StoredGuestSticker[]> }>(join(ctx.dataDir, 'personal.json'), { guests: {} });
    const mineStored = (guest: Guest) => personal.data.guests[guest.id] ?? [];
    const mine = (guest: Guest): GuestSticker[] =>
      mineStored(guest).map((m) => ({ id: m.id, name: m.name, src: ctx.mediaUrl(`guests/${m.file}`) }));
    const setMine = (guest: Guest, list: StoredGuestSticker[]) => {
      personal.data.guests[guest.id] = list;
      personal.save();
      // Other phones logged in as the same guest
      const pub = mine(guest);
      ctx.emit({ guest: guest.id }, 'mine', pub);
      return pub;
    };
    const unlinkGuestFile = (file: string) => {
      try {
        unlinkSync(join(guestMedia, file));
      } catch {
        // already gone
      }
    };

    // Put new default stickers in the collection
    const added = ctx.settings.get().defaultsAdded;
    const fresh = DEFAULT_STICKERS.filter(([file]) => !added.includes(file) && existsSync(join(DEFAULTS_DIR, file)));
    if (fresh.length) {
      const custom = fresh.map(([file, name]) => {
        const id = uid(6);
        copyFileSync(join(DEFAULTS_DIR, file), join(media, `${id}.png`));
        return { id, name, file: `${id}.png` };
      });
      ctx.settings.update({ custom: [...ctx.settings.get().custom, ...custom], defaultsAdded: [...added, ...fresh.map(([file]) => file)] });
    }

    const catalog = (): StickerDef[] =>
      ctx.settings.get().custom.map((c) => ({ id: c.id, name: c.name, kind: 'image' as const, src: ctx.mediaUrl(c.file) }));

    const remove = (id: string) => {
      clearTimeout(timers.get(id));
      timers.delete(id);
      active = active.filter((a) => a.id !== id);
      ctx.publish();
    };

    ctx.price({ key: 'stickers.sticker', label: 'Bouncing sticker', default: 1000 });

    ctx.state((): StickersState => {
      const s = ctx.settings.get();
      return { catalog: catalog(), active, durationSec: s.durationSec, maxActive: s.maxActive, allowText: s.allowText, allowCustom: s.allowCustom };
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
      } else if (args.face) {
        // The guest's own selfie, when they made one
        if (!guest.avatar) throw new HbError('Take a selfie first (in your profile)');
        sticker = { id: 'face', name: 'Face', kind: 'face', src: guest.avatar.url };
      } else if (args.mine !== undefined) {
        // One of the guest's own stickers
        if (!s.allowCustom) throw new HbError('Your own stickers are turned off');
        const own = mine(guest).find((m) => m.id === args.mine);
        if (!own) throw new HbError('This sticker is gone');
        sticker = { id: own.id, name: own.name, kind: 'image', src: own.src, guestMade: true };
      } else {
        sticker = catalog().find((c) => c.id === args.id) ?? null;
        if (!sticker) throw new HbError('Unknown sticker');
      }
      ctx.economy.charge(guest, 'stickers.sticker', 1, text ? `Text sticker "${text}"` : `Sticker: ${sticker!.name}`);
      ctx.session.count(guest, 'stickers');
      const item: ActiveSticker = {
        id: uid(6),
        sticker,
        text,
        guest: { id: guest.id, name: guest.name, color: guest.color },
        until: Date.now() + s.durationSec * 1000,
      };
      active = [...active, item];
      timers.set(item.id, setTimeout(() => remove(item.id), s.durationSec * 1000));
      ctx.activity(
        text
          ? `{name} wrote "${text}" on the TV`
          : sticker!.kind === 'face'
            ? '{name} sent their face bouncing'
            : args.mine !== undefined
              ? '{name} sent a sticker they made'
              : `{name} dropped ${/^[aeiou]/i.test(sticker!.name) ? 'an' : 'a'} ${sticker!.name.toLowerCase()} sticker`,
        { guest },
      );
      ctx.publish();
      return true;
    });

    ctx.onAdmin('remove', (args) => remove(String(args.id)));
    // A guest-made sticker that should not be on the TV: off the screen and out of their collection
    ctx.onAdmin('deleteGuestSticker', (args) => {
      const sticker = String(args.sticker);
      for (const a of active.filter((x) => x.sticker?.id === sticker)) remove(a.id);
      const guest = ctx.session.guests.get(String(args.guest));
      const list = personal.data.guests[String(args.guest)] ?? [];
      const gone = list.find((m) => m.id === sticker);
      if (!gone) return;
      unlinkGuestFile(gone.file);
      if (guest) setMine(guest, list.filter((m) => m.id !== sticker));
      else {
        personal.data.guests[String(args.guest)] = list.filter((m) => m.id !== sticker);
        personal.save();
      }
    });
    ctx.onAdmin('clear', () => {
      for (const id of [...timers.keys()]) remove(id);
    });

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        durationSec: args.durationSec !== undefined ? clamp(num(args.durationSec, 120), 10, 3600) : s.durationSec,
        maxActive: args.maxActive !== undefined ? clamp(Math.round(num(args.maxActive, 10)), 0, 100) : s.maxActive,
        allowText: args.allowText !== undefined ? !!args.allowText : s.allowText,
        allowCustom: args.allowCustom !== undefined ? !!args.allowCustom : s.allowCustom,
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

    ctx.onGuest('mine', (_args, guest) => mine(guest));
    ctx.onGuest('removeMine', (args, guest) => {
      const list = mineStored(guest);
      const gone = list.find((m) => m.id === args.id);
      if (!gone) return mine(guest);
      unlinkGuestFile(gone.file);
      return setMine(guest, list.filter((m) => m.id !== gone.id));
    });

    // A guest saves a sticker they made (the phone already cut it out and added the white border)
    ctx.http.post('/mine', express.raw({ type: Object.keys(GUEST_TYPES), limit: '3mb' }), (req, res) => {
      const guest = ctx.guestFromRequest(req);
      try {
        if (!guest) throw new HbError('Please join the session first');
        if (!ctx.enabled() || !ctx.settings.get().allowCustom) throw new HbError('Your own stickers are turned off');
        const ext = GUEST_TYPES[req.get('content-type') ?? ''];
        if (!ext || !Buffer.isBuffer(req.body) || !looksLike(ext, req.body)) throw new HbError('Send a PNG, WebP, GIF or JPG image');
        const list = mineStored(guest);
        if (list.length >= MAX_GUEST_STICKERS) throw new HbError(`You can keep ${MAX_GUEST_STICKERS} stickers. Delete one first.`);
        const id = `g${uid(7)}`;
        const file = `${id}.${ext}`;
        writeFileSync(join(guestMedia, file), req.body);
        const name = cleanName(req.query.name, 24) || 'My sticker';
        const pub = setMine(guest, [...list, { id, name, file }]);
        res.json({ id, mine: pub });
      } catch (err) {
        if (err instanceof HbError) res.status(400).json({ error: err.message });
        else {
          ctx.log.error(err);
          res.status(500).json({ error: 'Upload failed' });
        }
      }
    });

    ctx.onToggle((on) => {
      if (!on) for (const id of [...timers.keys()]) remove(id);
    });
    ctx.onSessionReset(() => {
      for (const id of [...timers.keys()]) remove(id);
      for (const list of Object.values(personal.data.guests)) for (const m of list) unlinkGuestFile(m.file);
      personal.data.guests = {};
      personal.save();
    });
  },
});
