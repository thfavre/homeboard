import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { SYNTH_SOUNDS, type MiSound, type PlayEvent, type Sound, type SoundboardState } from '../../../shared/soundboard.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import { HbError, clamp, cleanName, num, uid } from '../../core/util.ts';
import { cleanMp3, downloadMp3, pruneCache, searchMyInstants } from './myinstants.ts';

interface SoundboardSettings {
  volume: number;
  cooldownSec: number;
  disabledBuiltins: string[];
  /** Built-ins the host deleted: hidden everywhere until restored */
  deletedBuiltins: string[];
  custom: { id: string; name: string; file: string; myinstants?: boolean }[];
  guestSearch: boolean;
  searchMaxSec: number;
}

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
  settings: { volume: 0.8, cooldownSec: 4, disabledBuiltins: [], deletedBuiltins: [], custom: [], guestSearch: false, searchMaxSec: 10 },

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

    /** Built-ins the host has not deleted */
    const builtins = () => SYNTH_SOUNDS.filter((b) => !ctx.settings.get().deletedBuiltins.includes(b.id));

    const sounds = (admin = false): Sound[] => {
      const s = ctx.settings.get();
      return [
        ...builtins().filter((b) => !s.disabledBuiltins.includes(b.id)).map((b) => ({ id: b.id, name: b.name, kind: 'synth' as const })),
        ...s.custom.map((c) => ({ id: c.id, name: c.name, kind: 'file' as const, src: ctx.mediaUrl(c.file), ...(admin && c.myinstants ? { myinstants: true } : {}) })),
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

    ctx.price({ key: 'soundboard.sound', label: 'Play a sound', default: 500 });

    ctx.state((role): SoundboardState => {
      const s = ctx.settings.get();
      return {
        sounds: sounds(role === 'admin'),
        volume: s.volume,
        cooldownUntil,
        cooldownSec: s.cooldownSec,
        guestSearch: s.guestSearch,
        searchMaxSec: s.searchMaxSec,
        ...(role === 'admin' ? { builtins: builtins().map((b) => ({ id: b.id, name: b.name, enabled: !s.disabledBuiltins.includes(b.id) })), deletedBuiltins: s.deletedBuiltins.length } : {}),
      };
    });

    const checkCooldown = () => {
      const wait = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (wait > 0) throw new HbError(`Another sound just played. Try again in ${wait}s.`);
    };

    const guestPlays = (sound: Sound, guest: Guest, maxSec?: number) => {
      checkCooldown();
      ctx.economy.charge(guest, 'soundboard.sound', 1, `Sound: ${sound.name}`);
      cooldownUntil = Date.now() + ctx.settings.get().cooldownSec * 1000;
      play(sound, guest.name, maxSec);
      ctx.activity(`{name} played ${sound.name}`, { guest });
      ctx.publish();
    };

    ctx.onGuest('play', (args, guest) => {
      const sound = sounds().find((x) => x.id === args.id);
      if (!sound) throw new HbError('Unknown sound');
      guestPlays(sound, guest);
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

    ctx.onGuest('preview', (args) => {
      guestSearchOn();
      return cached(args.mp3);
    });
    ctx.onAdmin('preview', (args) => cached(args.mp3));

    ctx.onGuest('playSearch', async (args, guest) => {
      guestSearchOn();
      checkCooldown();
      const src = await cached(args.mp3);
      const sound: Sound = { id: `mi:${cleanMp3(args.mp3)}`, name: cleanName(args.title, 30) || 'Sound', kind: 'file', src };
      guestPlays(sound, guest, ctx.settings.get().searchMaxSec || undefined);
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
      const duration = Number(args.duration) > 0 ? Math.round(Number(args.duration) * 10) / 10 : undefined;
      return setMine(guest, [...now, { id: String(args.id ?? mp3).slice(0, 120), title: cleanName(args.title, 40) || 'Sound', mp3, ...(duration ? { duration } : {}) }]);
    });

    ctx.onGuest('removeMine', (args, guest) => setMine(guest, mine(guest).filter((x) => x.mp3 !== args.mp3)));

    ctx.onAdmin('playSearch', async (args) => {
      const src = await cached(args.mp3);
      play({ id: `mi:${cleanMp3(args.mp3)}`, name: cleanName(args.title, 30) || 'Sound', kind: 'file', src }, 'Host');
    });

    /** Put a MyInstants sound on the board for everyone (kept on disk, works offline) */
    ctx.onAdmin('addFromSearch', async (args) => {
      const mp3 = cleanMp3(args.mp3);
      const id = uid(6);
      const file = await downloadMp3(mp3, media, `${id}.mp3`);
      const name = cleanName(args.title, 30) || 'Sound';
      ctx.settings.update({ custom: [...ctx.settings.get().custom, { id, name, file, myinstants: true }] });
      ctx.publish();
      return id;
    });

    ctx.onAdmin('test', (args) => {
      const sound = sounds().find((x) => x.id === args.id) ?? builtins().map((b) => ({ ...b, kind: 'synth' as const })).find((b) => b.id === args.id);
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

    ctx.onAdmin('setBuiltin', (args) => {
      const s = ctx.settings.get();
      const rest = s.disabledBuiltins.filter((id) => id !== args.id);
      ctx.settings.update({ disabledBuiltins: args.enabled ? rest : [...rest, String(args.id)] });
      ctx.publish();
    });

    ctx.onAdmin('deleteBuiltin', (args) => {
      const id = String(args.id);
      const s = ctx.settings.get();
      if (!SYNTH_SOUNDS.some((b) => b.id === id) || s.deletedBuiltins.includes(id)) return;
      ctx.settings.update({ deletedBuiltins: [...s.deletedBuiltins, id] });
      ctx.publish();
    });

    ctx.onAdmin('restoreBuiltins', () => {
      ctx.settings.update({ deletedBuiltins: [] });
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
      ctx.settings.update({ custom: [...ctx.settings.get().custom, { id, name, file }] });
      ctx.publish();
      res.json({ id });
    });
  },
});
