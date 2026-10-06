import { ttsLang, ttsSpeechMs, type TtsEvent, type TtsLang, type TtsSettings, type TtsState } from '../../../shared/tts.ts';
import type { Charge } from '../../core/economy.ts';
import { defineModule } from '../../core/module.ts';
import { HbError, clamp, num, uid } from '../../core/util.ts';

interface Queued {
  event: TtsEvent;
  /** What the guest paid, refunded if the shoutout is dropped */
  charge: Charge | null;
}

const MAX_QUEUE = 20;
/** Extra time the TV gets to report the end before the next shoutout starts anyway */
const FAILSAFE_MS = 5000;

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cleanText = (raw: unknown) =>
  String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Shoutouts: guests type a message, the TV reads it out loud and scrolls it.
 * Messages wait in a queue and play one after the other, with the configured pause between them.
 */
export default defineModule<TtsSettings>({
  id: 'tts',
  name: 'Text-to-Speech',
  description: 'Guests speak text through the TV speakers and show it scrolling on screen',
  settings: {
    volume: 0.8,
    pricingMode: 'flat',
    maxLength: 150,
    cooldownSec: 4,
    defaultLang: 'en',
  },

  setup(ctx) {
    let queue: Queued[] = [];
    let playing: Queued | null = null;
    let failsafe: NodeJS.Timeout | null = null;
    let pauseTimer: NodeJS.Timeout | null = null;
    /** Languages the TV has voices for (the last TV to report wins: it is the one that plays sound) */
    let tvLangs: TtsLang[] | null = null;

    // Only one of the two prices is used, depending on the pricing mode
    ctx.price({ key: 'tts.message', label: 'Shoutout', default: 200, active: () => ctx.settings.get().pricingMode === 'flat' });
    ctx.price({ key: 'tts.char', label: 'Shoutout', unit: 'character', default: 5, active: () => ctx.settings.get().pricingMode === 'per_char' });

    ctx.state((): TtsState => {
      const s = ctx.settings.get();
      return {
        volume: s.volume,
        pricingMode: s.pricingMode,
        flatPrice: ctx.economy.price('tts.message'),
        pricePerChar: ctx.economy.price('tts.char'),
        maxLength: s.maxLength,
        cooldownSec: s.cooldownSec,
        waiting: queue.length + (playing ? 1 : 0),
        defaultLang: s.defaultLang,
        tvLangs,
      };
    });

    // ------------------------------------------------------------ queue

    /** Language asked by the caller, or the host's default */
    const langOf = (args: any): TtsLang => ttsLang(args?.lang)?.id ?? ctx.settings.get().defaultLang;

    /** Other guests named in the text, by full name or first name (3 letters or more) */
    const mentionsIn = (text: string, senderId?: string) => {
      const t = fold(text);
      const found: NonNullable<TtsEvent['mentions']> = [];
      for (const g of ctx.session.guests.values()) {
        if (g.id === senderId || found.length >= 3) continue;
        const full = fold(g.name).trim();
        const names = [full, full.split(/\s+/)[0]].filter((n) => n.length >= 3);
        const named = names.some((n) => new RegExp(`(?<![\\p{L}\\d])${escapeRe(n).replace(/\s+/g, '\\s+')}(?![\\p{L}\\d])`, 'u').test(t));
        if (named) found.push({ id: g.id, name: g.name, color: g.color, avatar: g.avatar?.url });
      }
      return found;
    };

    const makeEvent = (text: string, guest: TtsEvent['guest'], anonymous: boolean, lang: TtsLang): TtsEvent => ({
      id: uid(6),
      text,
      volume: ctx.settings.get().volume,
      lang,
      by: anonymous ? 'Anonymous' : (guest?.name ?? 'Guest'),
      anonymous,
      guest: anonymous ? undefined : guest,
      mentions: mentionsIn(text, guest?.id),
      // Speaking time, plus time to read and scroll
      durationMs: Math.max(5000, ttsSpeechMs(text) + 2000),
    });

    /** Play the next shoutout, unless one is playing or the pause is running */
    const pump = () => {
      if (playing || pauseTimer || !queue.length) return;
      playing = queue.shift()!;
      const id = playing.event.id;
      // Lower the music while it speaks (same as soundboard sounds)
      ctx.bus.emit('soundboard:play', { id, source: 'tts' });
      ctx.emit('tv-audio', 'tts', playing.event);
      // If no TV reports the end (closed, disconnected), move on anyway
      failsafe = setTimeout(() => finished(id), playing.event.durationMs + FAILSAFE_MS);
      ctx.publish();
    };

    const finished = (id: string) => {
      if (playing?.event.id !== id) return;
      if (failsafe) clearTimeout(failsafe);
      failsafe = null;
      playing = null;
      ctx.bus.emit('soundboard:ended', { id });
      // The pause between two announcements
      pauseTimer = setTimeout(() => {
        pauseTimer = null;
        pump();
      }, ctx.settings.get().cooldownSec * 1000);
      ctx.publish();
    };

    /** Returns how many shoutouts play before this one (0: right away) */
    const enqueue = (item: Queued): number => {
      const ahead = queue.length + (playing ? 1 : 0);
      queue.push(item);
      pump();
      ctx.publish();
      return ahead;
    };

    /** Drop everything waiting (refunded) and stop listening for the current one */
    const clear = () => {
      for (const q of queue) if (q.charge) ctx.economy.refund(q.charge);
      queue = [];
      if (playing) finished(playing.event.id);
      if (pauseTimer) clearTimeout(pauseTimer);
      pauseTimer = null;
      ctx.publish();
    };

    /** The TV tells which languages its speech engine has voices for */
    ctx.onTv('voices', (args) => {
      const langs = Array.isArray(args?.langs) ? args.langs.map((l: unknown) => ttsLang(l)?.id).filter(Boolean) : [];
      tvLangs = [...new Set(langs as TtsLang[])];
      ctx.publish();
    });

    /** The voice stopped: the music comes back up, even if the banner is still scrolling */
    ctx.onTv('spoken', (args) => {
      ctx.bus.emit('soundboard:ended', { id: String(args.id) });
    });
    /** The banner is gone: next shoutout after the pause */
    ctx.onTv('ended', (args) => finished(String(args.id)));

    // ------------------------------------------------------------ guests

    ctx.onGuest('say', (args, guest) => {
      const s = ctx.settings.get();
      const text = cleanText(args?.text);
      if (!text) throw new HbError('Write something to say');
      if (text.length > s.maxLength) throw new HbError(`Message too long (max ${s.maxLength} characters)`);
      if (queue.length >= MAX_QUEUE) throw new HbError('Lots of shoutouts are waiting. Try again in a minute.');

      const anonymous = !!args?.anonymous;
      const snippet = text.length > 30 ? `${text.slice(0, 30)}...` : text;
      const charge =
        s.pricingMode === 'per_char'
          ? ctx.economy.charge(guest, 'tts.char', text.length, `Shoutout (${text.length} characters)`)
          : ctx.economy.charge(guest, 'tts.message', 1, `Shoutout: "${snippet}"`);

      const position = enqueue({
        event: makeEvent(text, { id: guest.id, name: guest.name, color: guest.color, avatar: guest.avatar?.url }, anonymous, langOf(args)),
        charge,
      });
      // The feed never repeats the message; {name} becomes "Someone" when the host hides names
      if (anonymous) ctx.activity('Someone spoke');
      else ctx.activity('{name} spoke', { guest });
      return { position };
    });

    // ------------------------------------------------------------ host

    ctx.onAdmin('test', (args) => {
      const text = cleanText(args?.text) || 'Hello, this is a test';
      enqueue({ event: makeEvent(text, { id: 'host', name: 'Host', color: '#ffaa00' }, !!args?.anonymous, langOf(args)), charge: null });
      return true;
    });

    ctx.onAdmin('clear', () => clear());

    ctx.onAdmin('setOptions', (args) => {
      const patch: Partial<TtsSettings> = {};
      if (args.volume !== undefined) patch.volume = clamp(num(args.volume, 0.8), 0, 1);
      if (args.pricingMode === 'flat' || args.pricingMode === 'per_char') patch.pricingMode = args.pricingMode;
      if (args.maxLength !== undefined) patch.maxLength = clamp(Math.round(num(args.maxLength, 150)), 10, 1000);
      if (args.cooldownSec !== undefined) patch.cooldownSec = clamp(Math.round(num(args.cooldownSec, 4)), 0, 120);
      const lang = ttsLang(args.defaultLang);
      if (lang) patch.defaultLang = lang.id;
      ctx.settings.update(patch);
      // The active price may have changed: refresh the price lists of the host screens
      ctx.hub.publish('core');
      ctx.publish();
      return true;
    });

    ctx.onToggle((on) => {
      if (!on) clear();
    });
    ctx.onSessionReset(() => clear());
  },
});
