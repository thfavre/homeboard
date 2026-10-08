import { createHash, randomBytes } from 'node:crypto';
import type { DuckSetting, DuckSource, NowPlaying, SpotifyState, Track } from '../../../shared/spotify.ts';
import type { Charge } from '../../core/economy.ts';
import { defineModule } from '../../core/module.ts';
import { HbError, num } from '../../core/util.ts';

interface SpotifySettings {
  clientId: string;
  refreshToken: string;
  account: string | null;
  allowExplicit: boolean;
  allowSkip: boolean;
  /** Lower the music while a soundboard sound plays */
  /** Old single setting, read once to fill `ducking` */
  duck?: boolean;
  /** Music volume during a sound, in % of the normal volume */
  duckPercent?: number;
  /** Lower the music while soundboard sounds or shoutouts play */
  ducking: Record<DuckSource, DuckSetting>;
}

// Overridable so tests can run against a fake Spotify
const API = process.env.HB_SPOTIFY_API ?? 'https://api.spotify.com/v1';
const ACCOUNTS = process.env.HB_SPOTIFY_ACCOUNTS ?? 'https://accounts.spotify.com';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
/** Development mode apps may not ask for more than 10 search results (since March 2026) */
const SEARCH_LIMIT = 10;
/** Safety net: the music comes back even if the TV never reports the end of a sound */
const DUCK_MAX_MS = 30_000;
/** How long Spotify may keep reporting the previous volume after a change */
const VOLUME_SETTLE_MS = 3500;
const POLL_MS = 3000;
const QUEUE_POLL_MS = 12_000;
const TRACK_URI = /^spotify:track:[A-Za-z0-9]{22}$/;
/** Hand the next held song to Spotify this long before the current one ends */
const HAND_OVER_MS = 20_000;
/** Songs in the queue sent to guests and the TV */
const PUBLIC_QUEUE = 6;

/** A song Homeboard holds until it is time to hand it to Spotify */
interface HeldTrack extends Track {
  qid: string;
  /** What the guest paid, refunded if the admin removes the song */
  charge?: Charge;
}

function toTrack(item: any): Track {
  const images: any[] = item?.album?.images ?? [];
  // Images come largest first: pick the smallest one that is still sharp on the TV
  const image = [...images].reverse().find((i) => (i.width ?? 0) >= 300) ?? images[0];
  return {
    uri: item.uri,
    title: item.name,
    artists: (item.artists ?? []).map((a: any) => a.name).join(', '),
    album: item.album?.name ?? '',
    image: image?.url ?? null,
    durationMs: item.duration_ms ?? 0,
    explicit: !!item.explicit,
  };
}

/**
 * Spotify Web API integration (needs a Premium account): guests search and queue
 * songs, the TV shows what is playing and what comes next.
 */
export default defineModule<SpotifySettings>({
  id: 'spotify',
  name: 'Music',
  description: 'Guests add songs to your Spotify queue; the TV shows what is playing',
  settings: { clientId: '', refreshToken: '', account: null, allowExplicit: true, allowSkip: true, ducking: { soundboard: { on: true, percent: 30 }, tts: { on: true, percent: 30 } } },

  setup(ctx) {
    const { hub } = ctx;
    const redirectUri = `http://127.0.0.1:${hub.port}/api/m/spotify/callback`;
    let accessToken = '';
    let expiresAt = 0;
    let now: NowPlaying | null = null;
    /** Spotify's own queue: songs handed over and the rest of the playlist. Cannot be changed. */
    let spotifyQueue: Track[] = [];
    /**
     * Guest songs not handed to Spotify yet. Spotify cannot move or remove queued songs,
     * so they are given to it one at a time, shortly before the current song ends.
     */
    let held: HeldTrack[] = [];
    /** Songs handed over that are still waiting in Spotify's queue */
    const handedOver = new Set<string>();
    /** The song during which the next one was handed over (one per song) */
    let handedDuring: string | null = null;
    let device: string | null = null;
    let volume: number | null = null;
    let error: string | null = null;
    let lastQueuePoll = 0;
    let pendingAuth: { state: string; verifier: string } | null = null;
    /** Who asked for which song, so the TV can say it */
    const requests = new Map<string, { name: string; color: string }>();

    const connected = () => !!ctx.settings.get().refreshToken;

    // ------------------------------------------------------------ auth

    const tokenRequest = async (params: Record<string, string>) => {
      const res = await fetch(`${ACCOUNTS}/api/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: ctx.settings.get().clientId, ...params }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error_description ?? data.error ?? `Spotify answered ${res.status}`);
      accessToken = data.access_token;
      expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      if (data.refresh_token) ctx.settings.update({ refreshToken: data.refresh_token });
    };

    const token = async () => {
      if (!connected()) throw new HbError('Spotify is not connected');
      if (!accessToken || Date.now() > expiresAt - 60_000) {
        try {
          await tokenRequest({ grant_type: 'refresh_token', refresh_token: ctx.settings.get().refreshToken });
        } catch (err) {
          error = `Login expired, connect Spotify again (${(err as Error).message})`;
          ctx.settings.update({ refreshToken: '' });
          ctx.publish();
          throw new HbError('Spotify is not connected');
        }
      }
      return accessToken;
    };

    /** Call the Web API. Returns null for empty answers. */
    const api = async (method: string, path: string, retry = true): Promise<any> => {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: { authorization: `Bearer ${await token()}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401 && retry) {
        accessToken = '';
        return api(method, path, false);
      }
      if (res.status === 429) throw new HbError('Spotify is busy, try again in a few seconds');
      if (res.status === 204 || res.headers.get('content-length') === '0') return null;
      const text = await res.text();
      // Some player endpoints answer success with a body that is not JSON
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        const reason = data?.error?.reason;
        if (reason === 'NO_ACTIVE_DEVICE' || res.status === 404) throw new HbError('Spotify is not playing on any device right now');
        if (reason === 'PREMIUM_REQUIRED') throw new HbError('Spotify Premium is needed for this');
        throw new HbError(data?.error?.message ?? `Spotify error ${res.status}`);
      }
      return data;
    };

    ctx.http.get('/callback', async (req, res) => {
      const back = `${hub.tunnelTarget.replace('localhost', '127.0.0.1')}/admin#s=spotify`;
      try {
        if (!pendingAuth || req.query.state !== pendingAuth.state) throw new Error('This login link expired, try again');
        if (req.query.error) throw new Error(String(req.query.error));
        await tokenRequest({
          grant_type: 'authorization_code',
          code: String(req.query.code),
          redirect_uri: redirectUri,
          code_verifier: pendingAuth.verifier,
        });
        pendingAuth = null;
        const me = await api('GET', '/me');
        ctx.settings.update({ account: me?.display_name ?? me?.id ?? 'Spotify' });
        error = null;
        ctx.publish();
        void poll();
        res.redirect(back);
      } catch (err) {
        error = (err as Error).message;
        ctx.publish();
        res.redirect(back);
      }
    });

    // ------------------------------------------------------------ polling

    const pollQueue = async () => {
      lastQueuePoll = Date.now();
      const q = await api('GET', '/me/player/queue');
      spotifyQueue = (q?.queue ?? [])
        .filter((i: any) => i?.type === 'track')
        .map((i: any) => ({ ...toTrack(i), requestedBy: requests.get(i.uri) }));
      for (const uri of handedOver) if (!spotifyQueue.some((t) => t.uri === uri)) handedOver.delete(uri);
    };

    /** Play order: songs already handed over, then the held ones, then the playlist */
    const fullQueue = (): Track[] => {
      let last = -1;
      spotifyQueue.forEach((t, i) => handedOver.has(t.uri) && (last = i));
      const mine = held.map(({ charge: _, ...t }) => t);
      return [...spotifyQueue.slice(0, last + 1), ...mine, ...spotifyQueue.slice(last + 1)];
    };

    /** Give the first held song to Spotify, which plays it after the current one */
    const handOver = async () => {
      const t = held[0];
      if (!t) return;
      await api('POST', `/me/player/queue?uri=${encodeURIComponent(t.uri)}`);
      held = held.filter((h) => h !== t);
      handedOver.add(t.uri);
      handedDuring = now?.uri ?? null;
      await pollQueue().catch(() => {});
    };

    /** Near the end of a song, hand the next held one over (once per song) */
    const feed = async () => {
      if (!held.length || !now || handedDuring === now.uri) return;
      if (now.durationMs - now.progressMs > HAND_OVER_MS) return;
      await handOver().catch((err) => ctx.log.warn('Could not hand the next song to Spotify:', (err as Error).message));
    };

    /** Before a skip, so the next held song plays instead of the playlist */
    const handOverNow = async () => {
      if (held.length && handedDuring !== now?.uri) await handOver();
    };

    const poll = async () => {
      if (!connected() || !ctx.enabled()) return;
      try {
        const p = await api('GET', '/me/player?additional_types=track');
        const before = now?.uri;
        if (p?.item?.type === 'track') {
          now = { ...toTrack(p.item), progressMs: p.progress_ms ?? 0, isPlaying: !!p.is_playing, at: Date.now(), requestedBy: requests.get(p.item.uri) };
        } else {
          now = null;
        }
        device = p?.device?.name ?? null;
        // Right after we change the volume, Spotify still reports the old value for a moment
        if (Date.now() >= volumeSettleAt) volume = p?.device?.volume_percent ?? null;
        if (restoreTo !== null) await restore();
        if (now?.uri !== before || Date.now() - lastQueuePoll > QUEUE_POLL_MS) await pollQueue();
        await feed();
        error = null;
      } catch (err) {
        error = (err as Error).message;
      }
      ctx.publish();
    };

    // ------------------------------------------------------------ ducking
    //
    // While soundboard sounds play, the music is lowered. The TV reports when each
    // sound ends; the volume goes back up once none is playing. The restore is always
    // sent, then checked against what Spotify reports and sent again until it matches.

    /**
     * While sounds play: the normal volume to come back to, and each playing sound with
     * the volume it asks for. The music follows the lowest one.
     */
    let duck: { original: number; plays: Map<string, number>; applied: number; failsafe: NodeJS.Timeout } | null = null;

    // Settings saved before there was one setting per source
    {
      const s = ctx.settings.get();
      if (s.duck !== undefined || s.duckPercent !== undefined) {
        ctx.settings.update({
          ducking: { ...s.ducking, soundboard: { on: s.duck ?? true, percent: s.duckPercent ?? 30 } },
          duck: undefined,
          duckPercent: undefined,
        });
      }
    }
    let restoreTo: number | null = null;
    let restoreTries = 0;
    /** Until then, the volume reported by Spotify may be out of date */
    let volumeSettleAt = 0;

    /** Change the volume and remember it, without waiting for Spotify to report it */
    const setVolume = async (v: number) => {
      volume = v;
      volumeSettleAt = Date.now() + VOLUME_SETTLE_MS;
      await api('PUT', `/me/player/volume?volume_percent=${v}`);
    };

    const restore = async () => {
      if (restoreTo === null || duck) return;
      if (restoreTries > 0) {
        // Wait until Spotify reports the result of the last attempt
        if (Date.now() < volumeSettleAt) return;
        if (volume === restoreTo) {
          restoreTo = null;
          return;
        }
        if (restoreTries >= 6) {
          ctx.log.warn(`Could not put the volume back to ${restoreTo}% (Spotify reports ${volume}%)`);
          restoreTo = null;
          return;
        }
      }
      restoreTries += 1;
      await setVolume(restoreTo).catch((err) => ctx.log.warn('Volume restore failed:', (err as Error).message));
    };

    const endDuck = () => {
      if (!duck) return;
      clearTimeout(duck.failsafe);
      restoreTo = duck.original;
      restoreTries = 0;
      duck = null;
      void restore().then(() => setTimeout(poll, VOLUME_SETTLE_MS + 200));
    };

    /** Lower the music to the lowest level asked by the sounds playing */
    const applyDuck = () => {
      if (!duck || !duck.plays.size) return;
      const percent = Math.min(...duck.plays.values());
      if (percent === duck.applied) return;
      duck.applied = percent;
      setVolume(Math.round((duck.original * percent) / 100)).catch((err) => ctx.log.warn('Could not lower the music:', (err as Error).message));
    };

    ctx.bus.on('soundboard:play', ({ id, source }: { id: string; source?: DuckSource }) => {
      const setting = ctx.settings.get().ducking[source ?? 'soundboard'];
      if (!setting?.on) return;
      if (!duck) {
        // If the previous restore is still on its way, that is the real normal volume
        const original = restoreTo ?? volume;
        if (!connected() || !now?.isPlaying || original === null) return;
        duck = { original, plays: new Map(), applied: 100, failsafe: setTimeout(endDuck, DUCK_MAX_MS) };
        restoreTo = null;
      }
      duck.plays.set(id, setting.percent);
      clearTimeout(duck.failsafe);
      duck.failsafe = setTimeout(endDuck, DUCK_MAX_MS);
      applyDuck();
    });

    ctx.bus.on('soundboard:ended', ({ id }: { id: string }) => {
      if (!duck || !duck.plays.delete(id)) return;
      // A short pause so back-to-back sounds do not make the music pump
      if (!duck.plays.size) setTimeout(() => duck && !duck.plays.size && endDuck(), 400);
      // Another sound is still playing: follow its level
      else applyDuck();
    });

    // ------------------------------------------------------------ state

    ctx.price({ key: 'spotify.queue', label: 'Add a song', default: 1000 });
    ctx.price({ key: 'spotify.skip', label: 'Skip the current song', default: 3000 });

    ctx.state((role): SpotifyState => {
      const s = ctx.settings.get();
      return {
        connected: connected(),
        now,
        queue: fullQueue().slice(0, PUBLIC_QUEUE),
        guestQueued: spotifyQueue.filter((t) => handedOver.has(t.uri)).length + held.length,
        allowSkip: s.allowSkip,
        ...(role === 'admin'
          ? {
              admin: {
                clientId: s.clientId,
                redirectUri,
                account: s.account,
                device,
                // While the music is lowered, show the volume it goes back to
                volume: duck?.original ?? restoreTo ?? volume,
                allowExplicit: s.allowExplicit,
                ducking: s.ducking,
                error,
                queue: fullQueue(),
              },
            }
          : {}),
      };
    });

    // ------------------------------------------------------------ guests

    const searchCache = new Map<string, { at: number; tracks: Track[] }>();

    ctx.onGuest('search', async (args) => {
      const q = String(args.q ?? '').trim().slice(0, 80);
      if (q.length < 2) return [];
      const key = q.toLowerCase();
      const cached = searchCache.get(key);
      if (cached && Date.now() - cached.at < 60_000) return cached.tracks;
      const r = await api('GET', `/search?type=track&limit=${SEARCH_LIMIT}&market=from_token&q=${encodeURIComponent(q)}`);
      let tracks: Track[] = (r?.tracks?.items ?? []).filter(Boolean).map(toTrack);
      if (!ctx.settings.get().allowExplicit) tracks = tracks.filter((t) => !t.explicit);
      searchCache.set(key, { at: Date.now(), tracks });
      if (searchCache.size > 200) searchCache.delete(searchCache.keys().next().value!);
      return tracks;
    });

    ctx.onGuest('queue', async (args, guest) => {
      const uri = String(args.uri ?? '');
      if (!TRACK_URI.test(uri)) throw new HbError('Unknown song');
      const track = toTrack(await api('GET', `/tracks/${uri.split(':')[2]}?market=from_token`));
      if (track.explicit && !ctx.settings.get().allowExplicit) throw new HbError('Explicit songs are turned off');
      if (held.some((t) => t.uri === uri) || spotifyQueue.some((t) => t.uri === uri) || now?.uri === uri) throw new HbError('This song is already playing or queued');
      if (!device) throw new HbError('Spotify is not playing on any device right now');
      const charge = ctx.economy.charge(guest, 'spotify.queue', 1, `Song: ${track.title}`);
      const requestedBy = { name: guest.name, color: guest.color };
      requests.set(uri, requestedBy);
      held.push({ ...track, requestedBy, qid: randomBytes(6).toString('base64url'), charge });
      ctx.activity(`{name} queued ${track.title} by ${track.artists}`, { guest });
      // The current song may already be about to end
      await feed();
      ctx.publish();
      return true;
    });

    ctx.onGuest('skip', async (_args, guest) => {
      if (!ctx.settings.get().allowSkip) throw new HbError('Skipping is turned off');
      if (!now) throw new HbError('Nothing is playing');
      const title = now.title;
      const charge = ctx.economy.charge(guest, 'spotify.skip', 1, `Skipped ${title}`);
      try {
        await handOverNow();
        await api('POST', '/me/player/next');
      } catch (err) {
        ctx.economy.refund(charge);
        throw err;
      }
      ctx.activity(`{name} skipped ${title}`, { guest });
      setTimeout(poll, 600);
      return true;
    });

    // ------------------------------------------------------------ admin

    ctx.onAdmin('setClientId', (args) => {
      const clientId = String(args.clientId ?? '').trim();
      if (!/^[0-9a-f]{32}$/i.test(clientId)) throw new HbError('A Client ID is 32 letters and numbers');
      ctx.settings.update({ clientId, refreshToken: '' });
      accessToken = '';
      ctx.publish();
    });

    ctx.onAdmin('authUrl', (_args, caller) => {
      if (!caller.local) throw new HbError('Connect Spotify from the admin screen on the PC');
      const clientId = ctx.settings.get().clientId;
      if (!clientId) throw new HbError('Enter your Client ID first');
      const verifier = randomBytes(48).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      pendingAuth = { state: randomBytes(12).toString('base64url'), verifier };
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: SCOPES,
        state: pendingAuth.state,
        code_challenge_method: 'S256',
        code_challenge: challenge,
      });
      return `${ACCOUNTS}/authorize?${params}`;
    });

    ctx.onAdmin('disconnect', () => {
      ctx.settings.update({ refreshToken: '', account: null });
      accessToken = '';
      now = null;
      spotifyQueue = [];
      for (const t of held) if (t.charge) ctx.economy.refund(t.charge);
      held = [];
      handedOver.clear();
      ctx.publish();
    });

    const control = async (method: string, path: string) => {
      await api(method, path);
      setTimeout(poll, 400);
    };
    ctx.onAdmin('play', () => control('PUT', '/me/player/play'));
    ctx.onAdmin('pause', () => control('PUT', '/me/player/pause'));
    ctx.onAdmin('next', async () => {
      await handOverNow();
      await control('POST', '/me/player/next');
    });
    ctx.onAdmin('previous', () => control('POST', '/me/player/previous'));
    ctx.onAdmin('volume', async (args) => {
      const v = Math.round(Math.min(100, Math.max(0, num(args.volume, 50))));
      // During a sound, the new volume is applied when the music comes back up
      if (duck) {
        duck.original = v;
        return;
      }
      restoreTo = null;
      await setVolume(v);
      setTimeout(poll, VOLUME_SETTLE_MS + 200);
    });

    const heldIndex = (qid: unknown) => {
      const i = held.findIndex((t) => t.qid === qid);
      if (i < 0) throw new HbError('This song is no longer waiting, Spotify already has it');
      return i;
    };

    /** Move a held song to another place among the held songs */
    ctx.onAdmin('queueMove', (args) => {
      const from = heldIndex(args.qid);
      const to = Math.round(Math.min(held.length - 1, Math.max(0, num(args.to, from))));
      const [t] = held.splice(from, 1);
      held.splice(to, 0, t);
      ctx.publish();
      return true;
    });

    /** Remove a held song and give the guest their money back */
    ctx.onAdmin('queueRemove', (args) => {
      const [t] = held.splice(heldIndex(args.qid), 1);
      if (t.charge) ctx.economy.refund(t.charge);
      requests.delete(t.uri);
      ctx.publish();
      return t.charge?.amount ? `${t.title} removed, ${t.requestedBy?.name ?? 'the guest'} got refunded` : `${t.title} removed`;
    });

    /** Music level while soundboard sounds or shoutouts play */
    ctx.onAdmin('setDucking', (args) => {
      const source: DuckSource = args.source === 'tts' ? 'tts' : 'soundboard';
      const current = ctx.settings.get().ducking[source];
      const next: DuckSetting = {
        on: args.on !== undefined ? !!args.on : current.on,
        percent: args.percent !== undefined ? Math.round(Math.min(95, Math.max(0, num(args.percent, 30)))) : current.percent,
      };
      ctx.settings.update({ ducking: { ...ctx.settings.get().ducking, [source]: next } });
      ctx.publish();
      return true;
    });

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        allowExplicit: args.allowExplicit !== undefined ? !!args.allowExplicit : s.allowExplicit,
        allowSkip: args.allowSkip !== undefined ? !!args.allowSkip : s.allowSkip,
      });
      ctx.publish();
    });

    ctx.onSessionReset(() => {
      requests.clear();
      // The songs stay queued, but the guests who paid for them are gone
      held = held.map(({ charge: _, requestedBy: __, ...t }) => t);
    });

    setInterval(poll, POLL_MS);
    void poll();
  },
});
