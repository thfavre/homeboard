import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { SYNTH_SOUNDS, type PlayEvent, type Sound, type SoundboardState } from '../../../shared/soundboard.ts';
import { defineModule } from '../../core/module.ts';
import { HbError, clamp, cleanName, num, uid } from '../../core/util.ts';

interface SoundboardSettings {
  volume: number;
  cooldownSec: number;
  disabledBuiltins: string[];
  custom: { id: string; name: string; file: string }[];
}

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
  settings: { volume: 0.8, cooldownSec: 4, disabledBuiltins: [], custom: [] },

  setup(ctx) {
    const media = ctx.mediaDir();
    let cooldownUntil = 0;

    const sounds = (): Sound[] => {
      const s = ctx.settings.get();
      return [
        ...SYNTH_SOUNDS.filter((b) => !s.disabledBuiltins.includes(b.id)).map((b) => ({ id: b.id, name: b.name, kind: 'synth' as const })),
        ...s.custom.map((c) => ({ id: c.id, name: c.name, kind: 'file' as const, src: ctx.mediaUrl(c.file) })),
      ];
    };

    const play = (sound: Sound, by: string) => {
      const event: PlayEvent = { sound, volume: ctx.settings.get().volume, by };
      ctx.emit('tv', 'play', event);
      // Lets other modules (Spotify) lower the music for a moment
      ctx.bus.emit('soundboard:play', { durationMs: 4000 });
    };

    ctx.price({ key: 'soundboard.sound', label: 'Play a sound', default: 500 });

    ctx.state((role): SoundboardState => {
      const s = ctx.settings.get();
      return {
        sounds: sounds(),
        volume: s.volume,
        cooldownUntil,
        cooldownSec: s.cooldownSec,
        ...(role === 'admin' ? { builtins: SYNTH_SOUNDS.map((b) => ({ id: b.id, name: b.name, enabled: !s.disabledBuiltins.includes(b.id) })) } : {}),
      };
    });

    ctx.onGuest('play', (args, guest) => {
      const sound = sounds().find((x) => x.id === args.id);
      if (!sound) throw new HbError('Unknown sound');
      const wait = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (wait > 0) throw new HbError(`Another sound just played. Try again in ${wait}s.`);
      ctx.economy.charge(guest, 'soundboard.sound', 1, `Sound: ${sound.name}`);
      cooldownUntil = Date.now() + ctx.settings.get().cooldownSec * 1000;
      play(sound, guest.name);
      ctx.activity(`${guest.name} played ${sound.name}`, { guest });
      ctx.publish();
      return true;
    });

    ctx.onAdmin('test', (args) => {
      const sound = sounds().find((x) => x.id === args.id) ?? SYNTH_SOUNDS.map((b) => ({ ...b, kind: 'synth' as const })).find((b) => b.id === args.id);
      if (!sound) throw new HbError('Unknown sound');
      play(sound, 'Host');
    });

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        volume: args.volume !== undefined ? clamp(num(args.volume, 0.8), 0, 1) : s.volume,
        cooldownSec: args.cooldownSec !== undefined ? clamp(num(args.cooldownSec, 4), 0, 120) : s.cooldownSec,
      });
      ctx.publish();
    });

    ctx.onAdmin('setBuiltin', (args) => {
      const s = ctx.settings.get();
      const rest = s.disabledBuiltins.filter((id) => id !== args.id);
      ctx.settings.update({ disabledBuiltins: args.enabled ? rest : [...rest, String(args.id)] });
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
