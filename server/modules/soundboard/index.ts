import { copyFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { type MiSound, type PlayEvent, type Sound, type SoundboardState } from '../../../shared/soundboard.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import { HbError, clamp, cleanName, num, uid } from '../../core/util.ts';
import { cleanMp3, downloadMp3, pruneCache, searchMyInstants } from './myinstants.ts';

interface SoundboardSettings {
  volume: number;
  cooldownSec: number;
  custom: CustomSound[];
  guestSearch: boolean;
  searchMaxSec: number;
  /** Default sounds already put on the board (by file name), so one the host deletes stays deleted */
  defaultsAdded: string[];
}

interface CustomSound {
  id: string;
  name: string;
  file: string;
  myinstants?: boolean;
  /** Length in seconds, when known */
  duration?: number;
}

/** A length sent by a page, rounded to 0.1s (undefined when missing or silly) */
const cleanDuration = (input: unknown) => {
  const n = Number(input);
  return n > 0 && n < 3600 ? Math.round(n * 10) / 10 : undefined;
};

/** Sounds shipped with Homeboard (in ./defaults), put on the board once like uploaded ones */
const DEFAULTS_DIR = join(import.meta.dirname, 'defaults');
const DEFAULT_SOUNDS: [file: string, name: string][] = [
  ['1-billion-iq.mp3', '1,000,000,000 IQ'],
  ['a-few-moments-later.mp3', 'A few moments later'],
  ['ad.mp3', 'This is the end'],
  ['anime-girl.mp3', 'Anime girl'],
  ['arabic-nokia.mp3', 'Arabic Nokia'],
  ['audience-awww.mp3', 'Audience awww'],
  ['bark-fart.mp3', 'Bark fart'],
  ['branlette-collective.mp3', 'Branlette collective'],
  ['cooler-wecker.mp3', 'Cooler Wecker'],
  ['digi-digi-hey.mp3', 'Digi digi digi hey'],
  ['end-credits.mp3', 'End credits'],
  ['error.mp3', 'Error'],
  ['gong.mp3', 'Gong'],
  ['hee-hee.mp3', 'Hee hee'],
  ['hello-mf.mp3', 'Hello m-f-er'],
  ['helicopter.mp3', 'Helicopter helicopter'],
  ['ich-muss-scheissen.mp3', 'Ich muss scheissen'],
  ['italian-brainrot.mp3', 'Italian brainrot'],
  ['mac-quack.mp3', 'Mac quack'],
  ['mario-jump.mp3', 'Mario jump'],
  ['meow.mp3', 'M-e-o-w'],
  ['metal-pipe.mp3', 'Metal pipe'],
  ['mystery.mp3', 'Mystery sound'],
  ['oiia-oiia.mp3', 'OIIA OIIA'],
  ['petit-poney.mp3', 'Petit poney'],
  ['photo.mp3', 'Photo'],
  ['punch.mp3', 'Punch'],
  ['rizzbot-laugh.mp3', 'Rizzbot laugh'],
  ['slap.mp3', 'Slap'],
  ['social-credit-siren.mp3', 'Social credit siren'],
  ['tu-veux-voir-ma.mp3', 'Tu veux voir ma...'],
  ['yeah-boiii.mp3', 'Yeah boiii'],
  ['you-are-an-idiot.mp3', 'You are an idiot'],
  ['youtube-2017-music.mp3', 'YouTube music 2017'],
];

/** Sounds a guest can keep on their own board */
const MAX_MINE = 30;

const AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
};

/** Guests play short sounds through the TV speakers */
export default defineModule<SoundboardSettings>({
  id: 'soundboard',
  name: 'Soundboard',
  description: 'Guests play sound effects through the TV speakers',
  settings: { volume: 0.8, cooldownSec: 4, custom: [], guestSearch: false, searchMaxSec: 10, defaultsAdded: [] },

  setup(ctx) {
    const media = ctx.mediaDir();
    // Sounds guests found on MyInstants, downloaded on demand
    const cache = ctx.mediaDir('myinstants');
    // Each guest's own board ("My sounds"), by guest id. Cleared with the session, like the guests.
    const personal = new JsonFile<{ guests: Record<string, MiSound[]> }>(join(ctx.dataDir, 'personal.json'), { guests: {} });
    const mine = (guest: Guest) => personal.data.guests[guest.id] ?? [];
    const setMine = (guest: Guest, list: MiSound[]) => {
      personal.data.guests[guest.id] = list;
      personal.save();
      // Other phones logged in as the same guest
      ctx.emit({ guest: guest.id }, 'mine', list);
      return list;
    };
    ctx.onSessionReset(() => {
      personal.data.guests = {};
      personal.save();
    });
    let cooldownUntil = 0;

    // Put new default sounds on the board (the admin page measures their length)
    const added = ctx.settings.get().defaultsAdded;
    const fresh = DEFAULT_SOUNDS.filter(([file]) => !added.includes(file) && existsSync(join(DEFAULTS_DIR, file)));
    if (fresh.length) {
      const custom = fresh.map(([file, name]) => {
        const id = uid(6);
        copyFileSync(join(DEFAULTS_DIR, file), join(media, `${id}.mp3`));
        return { id, name, file: `${id}.mp3` };
      });
      ctx.settings.update({ custom: [...ctx.settings.get().custom, ...custom], defaultsAdded: [...added, ...fresh.map(([file]) => file)] });
    }

    const sounds = (admin = false): Sound[] => {
      const s = ctx.settings.get();
      return [
        ...s.custom.map((c) => ({ id: c.id, name: c.name, src: ctx.mediaUrl(c.file), ...(c.duration ? { duration: c.duration } : {}), ...(admin && c.myinstants ? { myinstants: true } : {}) })),
      ];
    };

    const play = (sound: Sound, by: string, maxSec?: number) => {
      const event: PlayEvent = { id: uid(6), sound, volume: ctx.settings.get().volume, by, ...(maxSec ? { maxSec } : {}) };
      // Lets other modules (Spotify) lower the music until the TV reports the end
      ctx.bus.emit('soundboard:play', { id: event.id, source: 'soundboard' });
      ctx.emit('tv-audio', 'play', event);
    };

    ctx.onTv('ended', (args) => {
      ctx.bus.emit('soundboard:ended', { id: String(args.id) });
    });

    ctx.price({ key: 'soundboard.sound', label: 'Play a party sound', default: 500 });
    ctx.price({ key: 'soundboard.search', label: 'Play a searched sound', default: 1000, active: () => ctx.settings.get().guestSearch });

    ctx.state((role): SoundboardState => {
      const s = ctx.settings.get();
      return {
        sounds: sounds(role === 'admin'),
        volume: s.volume,
        cooldownUntil,
        cooldownSec: s.cooldownSec,
        guestSearch: s.guestSearch,
        searchMaxSec: s.searchMaxSec,
      };
    });

    const checkCooldown = () => {
      const wait = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (wait > 0) throw new HbError(`Another sound just played. Try again in ${wait}s.`);
    };

    /** `priceKey`: party sounds and searched ones (incl. My sounds) can cost different amounts */
    const guestPlays = (sound: Sound, guest: Guest, priceKey: 'soundboard.sound' | 'soundboard.search', maxSec?: number) => {
      checkCooldown();
      ctx.economy.charge(guest, priceKey, 1, `Sound: ${sound.name}`);
      // No pause: leave it at 0, so phones never show a "wait" for a moment
      const cooldownSec = ctx.settings.get().cooldownSec;
      cooldownUntil = cooldownSec > 0 ? Date.now() + cooldownSec * 1000 : 0;
      play(sound, guest.name, maxSec);
      ctx.session.count(guest, 'sounds');
      ctx.activity(`{name} played ${sound.name}`, { guest });
      ctx.publish();
    };

    ctx.onGuest('play', (args, guest) => {
      const sound = sounds().find((x) => x.id === args.id);
      if (!sound) throw new HbError('Unknown sound');
      guestPlays(sound, guest, 'soundboard.sound');
      return true;
    });

    // ---------------------------------------------------------------- MyInstants

    const guestSearchOn = () => {
      if (!ctx.settings.get().guestSearch) throw new HbError('The host turned off sound search');
    };

    /** Download a MyInstants sound into the cache and return its local URL */
    const cached = async (mp3: unknown) => {
      const file = await downloadMp3(cleanMp3(mp3), cache);
      pruneCache(cache);
      return ctx.mediaUrl(`myinstants/${encodeURIComponent(file)}`);
    };

    ctx.onGuest('search', (args) => {
      guestSearchOn();
      return searchMyInstants(args.q, args.page, ctx.settings.get().searchMaxSec);
    });
    ctx.onAdmin('search', (args) => searchMyInstants(args.q, args.page));

    // Listen on the phone before playing it on the TV
    ctx.onGuest('preview', (args) => {
      guestSearchOn();
      return cached(args.mp3);
    });
    ctx.onAdmin('preview', (args) => cached(args.mp3));

    ctx.onGuest('playSearch', async (args, guest) => {
      guestSearchOn();
      checkCooldown();
      const src = await cached(args.mp3);
      const sound: Sound = { id: `mi:${cleanMp3(args.mp3)}`, name: cleanName(args.title, 30) || 'Sound', src };
      guestPlays(sound, guest, 'soundboard.search', ctx.settings.get().searchMaxSec || undefined);
      return true;
    });

    ctx.onGuest('mine', (_args, guest) => (ctx.settings.get().guestSearch ? mine(guest) : []));

    ctx.onGuest('saveMine', async (args, guest) => {
      guestSearchOn();
      const mp3 = cleanMp3(args.mp3);
      const list = mine(guest);
      if (list.some((x) => x.mp3 === mp3)) return list;
      if (list.length >= MAX_MINE) throw new HbError(`Your board is full (${MAX_MINE} sounds). Remove one first.`);
      // Download now: checks the sound exists, and playing it later is instant
      await cached(mp3);
      const now = mine(guest);
      if (now.some((x) => x.mp3 === mp3)) return now;
      const duration = cleanDuration(args.duration);
      return setMine(guest, [...now, { id: String(args.id ?? mp3).slice(0, 120), title: cleanName(args.title, 40) || 'Sound', mp3, ...(duration ? { duration } : {}) }]);
    });

    ctx.onGuest('removeMine', (args, guest) => setMine(guest, mine(guest).filter((x) => x.mp3 !== args.mp3)));

    ctx.onAdmin('playSearch', async (args) => {
      const src = await cached(args.mp3);
      play({ id: `mi:${cleanMp3(args.mp3)}`, name: cleanName(args.title, 30) || 'Sound', src }, 'Host');
    });

    /** Put a MyInstants sound on the board for everyone (kept on disk, works offline) */
    ctx.onAdmin('addFromSearch', async (args) => {
      const mp3 = cleanMp3(args.mp3);
      const id = uid(6);
      const file = await downloadMp3(mp3, media, `${id}.mp3`);
      const name = cleanName(args.title, 30) || 'Sound';
      const duration = cleanDuration(args.duration);
      ctx.settings.update({ custom: [...ctx.settings.get().custom, { id, name, file, myinstants: true, ...(duration ? { duration } : {}) }] });
      ctx.publish();
      return id;
    });

    ctx.onAdmin('test', (args) => {
      const sound = sounds().find((x) => x.id === args.id);
      if (!sound) throw new HbError('Unknown sound');
      play(sound, 'Host');
    });

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        volume: args.volume !== undefined ? clamp(num(args.volume, 0.8), 0, 1) : s.volume,
        cooldownSec: args.cooldownSec !== undefined ? clamp(num(args.cooldownSec, 4), 0, 120) : s.cooldownSec,
        guestSearch: args.guestSearch !== undefined ? !!args.guestSearch : s.guestSearch,
        searchMaxSec: args.searchMaxSec !== undefined ? clamp(Math.round(num(args.searchMaxSec, 10)), 0, 60) : s.searchMaxSec,
      });
      ctx.publish();
    });

    /** The admin page measures board sounds whose length is not known yet (uploaded before lengths were kept) */
    ctx.onAdmin('setDurations', (args) => {
      const lengths = (args.durations ?? {}) as Record<string, unknown>;
      let changed = false;
      const custom = ctx.settings.get().custom.map((c) => {
        const duration = cleanDuration(lengths[c.id]);
        if (!duration || c.duration) return c;
        changed = true;
        return { ...c, duration };
      });
      if (!changed) return;
      ctx.settings.update({ custom });
      ctx.publish();
    });

    ctx.onAdmin('renameCustom', (args) => {
      const name = cleanName(args.name, 30);
      if (!name) throw new HbError('Give the sound a name');
      const s = ctx.settings.get();
      if (!s.custom.some((x) => x.id === args.id)) throw new HbError('Unknown sound');
      ctx.settings.update({ custom: s.custom.map((c) => (c.id === args.id ? { ...c, name } : c)) });
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

    ctx.http.post('/upload', express.raw({ type: Object.keys(AUDIO_TYPES), limit: '6mb' }), (req, res) => {
      if (!ctx.isAdminRequest(req)) {
        res.status(403).json({ error: 'Host only' });
        return;
      }
      const ext = AUDIO_TYPES[req.get('content-type') ?? ''];
      if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) {
        res.status(400).json({ error: 'Send an MP3, WAV, OGG or M4A file' });
        return;
      }
      const id = uid(6);
      const file = `${id}.${ext}`;
      writeFileSync(join(media, file), req.body);
      const name = cleanName(req.query.name, 30) || 'Sound';
      const duration = cleanDuration(req.query.duration);
      ctx.settings.update({ custom: [...ctx.settings.get().custom, { id, name, file, ...(duration ? { duration } : {}) }] });
      ctx.publish();
      res.json({ id });
    });
  },
});
