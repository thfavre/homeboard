import type { TtsEvent, TtsSettings, TtsState } from '../../../shared/tts.ts';
import { defineModule } from '../../core/module.ts';
import { HbError, clamp, num, uid } from '../../core/util.ts';

export default defineModule<TtsSettings>({
  id: 'tts',
  name: 'Text-to-Speech',
  description: 'Guests speak text through the TV speakers and show it scrolling on screen',
  settings: {
    volume: 0.8,
    pricingMode: 'flat',
    maxLength: 150,
    cooldownSec: 4,
  },

  setup(ctx) {
    let cooldownUntil = 0;

    // Register prices in economy
    ctx.price({ key: 'tts.message', label: 'TTS message', default: 200 });
    ctx.price({ key: 'tts.char', label: 'TTS (per character)', unit: 'character', default: 5 });

    ctx.state((): TtsState => {
      const s = ctx.settings.get();
      return {
        volume: s.volume,
        pricingMode: s.pricingMode,
        flatPrice: ctx.economy.price('tts.message'),
        pricePerChar: ctx.economy.price('tts.char'),
        maxLength: s.maxLength,
        cooldownSec: s.cooldownSec,
        cooldownUntil,
      };
    });

    const triggerTts = (
      text: string,
      guest?: { id: string; name: string; color: string; avatar?: string },
      anonymous = false,
    ) => {
      const s = ctx.settings.get();
      // Estimated duration: ~12 chars per second + padding
      const durationMs = Math.max(5000, Math.round((text.length / 12) * 1000) + 1500);
      const event: TtsEvent = {
        id: uid(6),
        text,
        volume: s.volume,
        by: anonymous ? 'Anonymous' : (guest?.name ?? 'Guest'),
        anonymous,
        guest: anonymous ? undefined : guest,
        durationMs,
      };

      // Lower Spotify background music while TTS is active
      ctx.bus.emit('soundboard:play', { id: event.id });
      ctx.emit('tv', 'tts', event);
      return event;
    };

    ctx.onTv('ended', (args) => {
      ctx.bus.emit('soundboard:ended', { id: String(args.id) });
    });

    ctx.onGuest('say', (args, guest) => {
      const s = ctx.settings.get();
      const rawText = String(args?.text ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim();
      if (!rawText) throw new HbError('Write something to say');
      if (rawText.length > s.maxLength) {
        throw new HbError(`Message too long (max ${s.maxLength} characters)`);
      }

      const wait = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (wait > 0) {
        throw new HbError(`Another message was just played. Try again in ${wait}s.`);
      }

      const snippet = rawText.length > 30 ? `${rawText.slice(0, 30)}...` : rawText;
      const anonymous = !!args?.anonymous;

      // Charge guest according to current pricingMode
      if (s.pricingMode === 'per_char') {
        ctx.economy.charge(guest, 'tts.char', rawText.length, `TTS (${rawText.length} chars)`);
      } else {
        ctx.economy.charge(guest, 'tts.message', 1, `TTS: "${snippet}"`);
      }

      cooldownUntil = Date.now() + s.cooldownSec * 1000;
      triggerTts(
        rawText,
        {
          id: guest.id,
          name: guest.name,
          color: guest.color,
          avatar: guest.avatar?.url,
        },
        anonymous,
      );

      if (anonymous) {
        ctx.activity(`Someone said: "${snippet}"`);
      } else {
        ctx.activity(`{name} said: "${snippet}"`, { guest });
      }
      ctx.publish();
      return true;
    });

    ctx.onAdmin('test', (args) => {
      const text = String(args?.text ?? 'Testing text to speech on the TV! Homeboard party sound is working great.').trim();
      const anonymous = !!args?.anonymous;
      triggerTts(
        text,
        {
          id: 'host',
          name: 'Host',
          color: '#ffaa00',
        },
        anonymous,
      );
      return true;
    });

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      const patch: Partial<TtsSettings> = {};
      if (args.volume !== undefined) {
        patch.volume = clamp(num(args.volume, 0.8), 0, 1);
      }
      if (args.pricingMode === 'flat' || args.pricingMode === 'per_char') {
        patch.pricingMode = args.pricingMode;
      }
      if (args.maxLength !== undefined) {
        patch.maxLength = clamp(Math.round(num(args.maxLength, 150)), 10, 1000);
      }
      if (args.cooldownSec !== undefined) {
        patch.cooldownSec = clamp(Math.round(num(args.cooldownSec, 4)), 0, 120);
      }
      ctx.settings.update(patch);
      ctx.publish();
      return true;
    });
  },
});
