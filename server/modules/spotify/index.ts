import { createHash, randomBytes } from 'node:crypto';
import type { NowPlaying, SpotifyState, Track } from '../../../shared/spotify.ts';
import { defineModule } from '../../core/module.ts';
import { HbError, num } from '../../core/util.ts';

interface SpotifySettings {
  clientId: string;
  refreshToken: string;
  account: string | null;
  allowExplicit: boolean;
  allowSkip: boolean;
  /** Lower the music while a soundboard sound plays */
  duck: boolean;
  /** Music volume during a sound, in % of the normal volume */
  duckPercent: number;
}

const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
/** Development mode apps may not ask for more than 10 search results (since March 2026) */
const SEARCH_LIMIT = 10;
/** Safety net: the music comes back even if the TV never reports the end of a sound */
const DUCK_MAX_MS = 30_000;
const POLL_MS = 3000;
const QUEUE_POLL_MS = 12_000;
const TRACK_URI = /^spotify:track:[A-Za-z0-9]{22}$/;

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
  settings: { clientId: '', refreshToken: '', account: null, allowExplicit: true, allowSkip: true, duck: true, duckPercent: 30 },

  setup(ctx) {
    const { hub } = ctx;
    const redirectUri = `http://127.0.0.1:${hub.port}/api/m/spotify/callback`;
    let accessToken = '';
    let expiresAt = 0;
    let now: NowPlaying | null = null;
    let queue: Track[] = [];
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
      const res = await fetch('https://accounts.spotify.com/api/token', {
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
      queue = (q?.queue ?? [])
        .filter((i: any) => i?.type === 'track')
        .slice(0, 6)
        .map((i: any) => ({ ...toTrack(i), requestedBy: requests.get(i.uri) }));
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
        volume = p?.device?.volume_percent ?? null;
        if (restoreTo !== null) await restore();
        if (now?.uri !== before || Date.now() - lastQueuePoll > QUEUE_POLL_MS) await pollQueue();
        error = null;
      } catch (err) {
        error = (err as Error).message;
      }
      ctx.publish();
    };

    // ------------------------------------------------------------ ducking
    //
    // While soundboard sounds play, the music is lowered. The TV reports when each
    // sound ends; the volume goes back up once none is playing. Restoring is retried
    // until Spotify confirms it, because the volume API sometimes fails silently.

    let duck: { original: number; plays: Set<string>; failsafe: NodeJS.Timeout } | null = null;
    let restoreTo: number | null = null;
    let restoreTries = 0;

    const setVolume = (v: number) => api('PUT', `/me/player/volume?volume_percent=${v}`);

    const restore = async () => {
      if (restoreTo === null || duck) return;
      if (volume === restoreTo || restoreTries >= 6) {
        if (volume !== restoreTo) ctx.log.warn(`Could not put the volume back to ${restoreTo}%`);
        restoreTo = null;
        return;
      }
      restoreTries += 1;
      await setVolume(restoreTo).catch(() => {});
    };

    const endDuck = () => {
      if (!duck) return;
      clearTimeout(duck.failsafe);
      restoreTo = duck.original;
      restoreTries = 0;
      duck = null;
      void restore().then(() => setTimeout(poll, 700));
    };

    ctx.bus.on('soundboard:play', async ({ id }: { id: string }) => {
      const s = ctx.settings.get();
      if (!duck) {
        const original = restoreTo ?? volume;
        if (!s.duck || !connected() || !now?.isPlaying || original === null) return;
        duck = { original, plays: new Set(), failsafe: setTimeout(endDuck, DUCK_MAX_MS) };
        restoreTo = null;
        setVolume(Math.round((original * s.duckPercent) / 100)).catch(() => {});
      }
      duck.plays.add(id);
      clearTimeout(duck.failsafe);
      duck.failsafe = setTimeout(endDuck, DUCK_MAX_MS);
    });

    ctx.bus.on('soundboard:ended', ({ id }: { id: string }) => {
      if (!duck) return;
      duck.plays.delete(id);
      // A short pause so back-to-back sounds do not make the music pump
      if (!duck.plays.size) setTimeout(() => duck && !duck.plays.size && endDuck(), 400);
    });

    // ------------------------------------------------------------ state

    ctx.price({ key: 'spotify.queue', label: 'Add a song', default: 1000 });
    ctx.price({ key: 'spotify.skip', label: 'Skip the current song', default: 3000 });

    ctx.state((role): SpotifyState => {
      const s = ctx.settings.get();
      return {
        connected: connected(),
        now,
        queue,
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
                duck: s.duck,
                duckPercent: s.duckPercent,
                error,
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
      if (queue.some((t) => t.uri === uri) || now?.uri === uri) throw new HbError('This song is already playing or queued');
      const charge = ctx.economy.charge(guest, 'spotify.queue', 1, `Song: ${track.title}`);
      try {
        await api('POST', `/me/player/queue?uri=${encodeURIComponent(uri)}`);
      } catch (err) {
        ctx.economy.refund(charge);
        throw err;
      }
      requests.set(uri, { name: guest.name, color: guest.color });
      ctx.activity(`${guest.name} queued ${track.title} by ${track.artists}`, { guest });
      await pollQueue().catch(() => {});
      ctx.publish();
      return true;
    });

    ctx.onGuest('skip', async (_args, guest) => {
      if (!ctx.settings.get().allowSkip) throw new HbError('Skipping is turned off');
      if (!now) throw new HbError('Nothing is playing');
      const title = now.title;
      const charge = ctx.economy.charge(guest, 'spotify.skip', 1, `Skipped ${title}`);
      try {
        await api('POST', '/me/player/next');
      } catch (err) {
        ctx.economy.refund(charge);
        throw err;
      }
      ctx.activity(`${guest.name} skipped ${title}`, { guest });
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
      return `https://accounts.spotify.com/authorize?${params}`;
    });

    ctx.onAdmin('disconnect', () => {
      ctx.settings.update({ refreshToken: '', account: null });
      accessToken = '';
      now = null;
      queue = [];
      ctx.publish();
    });

    const control = async (method: string, path: string) => {
      await api(method, path);
      setTimeout(poll, 400);
    };
    ctx.onAdmin('play', () => control('PUT', '/me/player/play'));
    ctx.onAdmin('pause', () => control('PUT', '/me/player/pause'));
    ctx.onAdmin('next', () => control('POST', '/me/player/next'));
    ctx.onAdmin('previous', () => control('POST', '/me/player/previous'));
    ctx.onAdmin('volume', async (args) => {
      const v = Math.round(Math.min(100, Math.max(0, num(args.volume, 50))));
      if (duck) duck.original = v;
      else restoreTo = null;
      volume = v;
      await control('PUT', `/me/player/volume?volume_percent=${v}`);
    });

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        allowExplicit: args.allowExplicit !== undefined ? !!args.allowExplicit : s.allowExplicit,
        allowSkip: args.allowSkip !== undefined ? !!args.allowSkip : s.allowSkip,
        duck: args.duck !== undefined ? !!args.duck : s.duck,
        duckPercent: args.duckPercent !== undefined ? Math.round(Math.min(90, Math.max(0, num(args.duckPercent, 30)))) : s.duckPercent,
      });
      ctx.publish();
    });

    ctx.onSessionReset(() => requests.clear());

    setInterval(poll, POLL_MS);
    void poll();
  },
});
