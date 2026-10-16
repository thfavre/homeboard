import { copyFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import express from 'express';
import { DEFAULT_GUEST_STICKERS, cleanTextStyle, stickerLabel, type ActiveSticker, type GuestSticker, type StickerDef, type StickersState } from '../../../shared/stickers.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import { HbError, clamp, cleanName, num, uid } from '../../core/util.ts';

interface CustomSticker {
  id: string;
  /** Empty for most default stickers: they go by their category */
  name: string;
  file: string;
  category?: string;
}

interface StickerSettings {
  durationSec: number;
  /** 0 = no limit */
  maxActive: number;
  allowText: boolean;
  allowCustom: boolean;
  /** How many stickers each guest can keep */
  maxPerGuest: number;
  custom: CustomSticker[];
  /** Default stickers already put in the collection ("folder/file"), so one the host deletes stays deleted */
  defaultsAdded: string[];
  /** Categories guests do not see */
  hiddenCategories: string[];
}

/**
 * Stickers shipped with Homeboard, one folder per category in ./defaults, put in the
 * collection once like uploaded ones. Folders not listed here are not added.
 */
const DEFAULTS_DIR = join(import.meta.dirname, 'defaults');
const DEFAULT_CATEGORIES: [folder: string, category: string][] = [
  ['random', 'Random'],
  ['emoji', 'Emoji'],
  ['kitties', 'Kitties'],
  ['gatos', 'Gatos'],
  ['pokemon', 'Pokemon'],
  ['peppe', 'Peppe'],
  ['stickthing', 'Stickthing'],
];
/** The only default stickers with their own name */
const DEFAULT_NAMES: Record<string, string> = {
  'random/arrow.png': 'Arrow',
  'random/bagel.png': 'Bagel',
  'random/belt.png': 'Belt',
  'random/butter.png': 'Butter',
  'random/crying-meme.png': 'Crying meme',
  'random/dvd-drive.png': 'DVD drive',
  'random/dvd-logo.png': 'DVD logo',
  'random/egg.png': 'Egg',
  'random/eggplant.png': 'Eggplant',
  'random/fish.png': 'Fish',
  'random/goofy-smiley.png': 'Goofy smiley',
  'random/gumball.png': 'Gumball',
  'random/oil-lamp.png': 'Oil lamp',
  'random/party-cups.png': 'Party cups',
  'random/pawns.png': 'Pawns',
  'random/rainbow.png': 'Rainbow',
  'random/roast-chicken.png': 'Roast chicken',
  'random/rubber-band-ball.png': 'Rubber band ball',
  'random/sphynx-cat.png': 'Sphynx cat',
  'random/stew.png': 'Stew',
  'random/strainer.png': 'Strainer',
  'random/tartan-beret.png': 'Tartan beret',
  'random/tennis-ball.png': 'Tennis ball',
  'random/thinking.png': 'Thinking',
  'random/thumbs-up.png': 'Thumbs up',
  'random/tire.png': 'Tire',
  'random/vanilla.png': 'Vanilla',
  'random/wig.png': 'Wig',
  'random/zucchini.png': 'Zucchini',
};

/** Category of the host's uploads made before categories */
const OTHER = 'Other';

/** "a bagel sticker", "an emoji sticker" */
function aSticker(s: StickerDef): string {
  const what = s.name ? s.name.toLowerCase() : (s.category ?? '');
  return `${/^[aeiou]/i.test(what) ? 'an' : 'a'} ${what ? `${what} ` : ''}sticker`;
}

/** Every default sticker as "folder/file", in category order then file number order */
function defaultStickers(): { key: string; category: string }[] {
  const out: { key: string; category: string }[] = [];
  for (const [folder, category] of DEFAULT_CATEGORIES) {
    let files: string[];
    try {
      files = readdirSync(join(DEFAULTS_DIR, folder));
    } catch {
      continue;
    }
    files = files.filter((f) => /\.(png|webp|gif|jpe?g)$/i.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const f of files) out.push({ key: `${folder}/${f}`, category });
  }
  return out;
}

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
  settings: { durationSec: 120, maxActive: 10, allowText: true, allowCustom: true, maxPerGuest: DEFAULT_GUEST_STICKERS, custom: [], defaultsAdded: [], hiddenCategories: [] },

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
    {
      const st = ctx.settings.get();
      let custom = st.custom;
      // Before categories, the random stickers were added by bare file name and had no category
      const legacy = new Set(st.defaultsAdded.filter((k) => !k.includes('/')).map((k) => `random/${k}`));
      if (legacy.size) {
        const legacyNames = new Set([...legacy].map((k) => DEFAULT_NAMES[k]).filter(Boolean));
        custom = custom.map((c) => (!c.category && legacyNames.has(c.name) ? { ...c, category: 'Random' } : c));
      }
      const added = new Set([...st.defaultsAdded.filter((k) => k.includes('/')), ...legacy]);
      const fresh = defaultStickers().filter((d) => !added.has(d.key));
      if (fresh.length || legacy.size) {
        const copies = fresh.map((d) => {
          const id = uid(6);
          const file = `${id}${extname(d.key).toLowerCase()}`;
          copyFileSync(join(DEFAULTS_DIR, d.key), join(media, file));
          return { id, name: DEFAULT_NAMES[d.key] ?? '', file, category: d.category };
        });
        ctx.settings.update({ custom: [...custom, ...copies], defaultsAdded: [...added, ...fresh.map((d) => d.key)] });
      }
    }

    const catalog = (): StickerDef[] =>
      ctx.settings.get().custom.map((c) => ({ id: c.id, name: c.name, kind: 'image' as const, src: ctx.mediaUrl(c.file), category: c.category || OTHER }));

    const remove = (id: string) => {
      clearTimeout(timers.get(id));
      timers.delete(id);
      active = active.filter((a) => a.id !== id);
      ctx.publish();
    };

    ctx.price({ key: 'stickers.sticker', label: 'Bouncing sticker', default: 1000 });

    ctx.state((): StickersState => {
      const s = ctx.settings.get();
      return {
        catalog: catalog(),
        hiddenCategories: s.hiddenCategories,
        active,
        durationSec: s.durationSec,
        maxActive: s.maxActive,
        allowText: s.allowText,
        allowCustom: s.allowCustom,
        maxPerGuest: s.maxPerGuest,
      };
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
        sticker = catalog().find((c) => c.id === args.id && !s.hiddenCategories.includes(c.category!)) ?? null;
        if (!sticker) throw new HbError('This sticker is not available anymore');
      }
      ctx.economy.charge(guest, 'stickers.sticker', 1, text ? `Text sticker "${text}"` : `Sticker: ${stickerLabel(sticker!)}`);
      ctx.session.count(guest, 'stickers');
      const item: ActiveSticker = {
        id: uid(6),
        sticker,
        text,
        ...(text ? { textStyle: cleanTextStyle(args.style) } : {}),
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
              : `{name} dropped ${aSticker(sticker!)}`,
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
        maxPerGuest: args.maxPerGuest !== undefined ? clamp(Math.round(num(args.maxPerGuest, DEFAULT_GUEST_STICKERS)), 1, 200) : s.maxPerGuest,
      });
      ctx.publish();
    });

    // A category guests do not see (its stickers stay in the collection)
    ctx.onAdmin('setCategoryHidden', (args) => {
      const category = String(args.category);
      const hidden = ctx.settings.get().hiddenCategories.filter((c) => c !== category);
      ctx.settings.update({ hiddenCategories: args.hidden ? [...hidden, category] : hidden });
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

    ctx.http.post('/upload', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '10mb' }), (req, res) => {
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
      const name = cleanName(req.query.name, 30);
      const category = cleanName(req.query.category, 24) || OTHER;
      ctx.settings.update({ custom: [...ctx.settings.get().custom, { id, name, file, category }] });
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
    ctx.http.post('/mine', express.raw({ type: Object.keys(GUEST_TYPES), limit: '8mb' }), (req, res) => {
      const guest = ctx.guestFromRequest(req);
      try {
        if (!guest) throw new HbError('Please join the session first');
        if (!ctx.enabled() || !ctx.settings.get().allowCustom) throw new HbError('Your own stickers are turned off');
        const ext = GUEST_TYPES[req.get('content-type') ?? ''];
        if (!ext || !Buffer.isBuffer(req.body) || !looksLike(ext, req.body)) throw new HbError('Send a PNG, WebP, GIF or JPG image');
        const list = mineStored(guest);
        const max = ctx.settings.get().maxPerGuest;
        if (list.length >= max) throw new HbError(`You can keep ${max} sticker${max === 1 ? '' : 's'}. Delete one first.`);
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
