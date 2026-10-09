import { createSocket, type Socket } from 'node:dgram';
import { join } from 'node:path';
import { DEFAULT_WLED_EFFECTS, type WledDevice, type WledEffect, type WledJob, type WledState } from '../../../shared/wled.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { defineModule } from '../../core/module.ts';
import { HbError, clamp, cleanName, num, uid } from '../../core/util.ts';

interface WledSettings {
  devices: WledDevice[];
  effects: WledEffect[];
  durationSec: number;
  /** Brightness during effects (0 keeps the current brightness) */
  brightness: number;
}

interface Job extends WledJob {
  guestId: string | null;
  paid: number;
}

/** A device Homeboard took over */
interface Snapshot {
  /** Its state before (GET /json/state), put back when the effects end */
  before: any;
  /** How it looked after Homeboard's last change: anything else at the end means someone changed it by hand */
  sent?: string;
}

interface Health {
  online: boolean;
  name?: string;
  leds?: number;
}

/** Used by games: solid colors on every reachable light, the effect queue waits meanwhile */
export interface LightsApi {
  available(): boolean;
  /** Pause the effect queue and keep the lights for a game */
  claim(): void;
  /** Solid color on every light (null: dark). Latest call wins, never queued up. `fadeMs`: fade to it (default: at once). */
  color(hex: string | null, fadeMs?: number): void;
  /** Give the lights back: previous state restored, queued effects resume */
  release(): Promise<void>;
  /** The configured lights */
  list(): { id: string; name: string; online: boolean; leds: number | null }[];
  /**
   * Live pixels on one light (RGB bytes, one triplet per LED), over WLED's UDP realtime protocol.
   * Nothing to give back: the light goes back to what it was doing 2 s after the last frame.
   */
  frame(deviceId: string, rgb: Uint8Array): void;
  /**
   * Full brightness on one light, for live pixels: WLED scales them by its brightness. Its state is
   * saved first and put back by `unboost`; effects leave the light alone meanwhile.
   */
  boost(deviceId: string): Promise<void>;
  unboost(deviceId: string): Promise<void>;
}

/** WLED's UDP realtime port, and the DRGB protocol (up to 490 LEDs) */
const REALTIME_PORT = 21324;
const DRGB = 2;
const REALTIME_TIMEOUT_SEC = 2;

const POLL_MS = 20_000;
const TIMEOUT_MS = 3000;
// Look and layout of a segment (start/stop, grouping, mirroring, 2D...), restored when no preset was active
const SEGMENT_KEYS = ['id', 'start', 'stop', 'startY', 'stopY', 'grp', 'spc', 'of', 'rev', 'mi', 'rY', 'mY', 'tp', 'n', 'on', 'frz', 'bri', 'cct', 'set', 'col', 'fx', 'sx', 'ix', 'pal', 'c1', 'c2', 'c3', 'o1', 'o2', 'o3', 'si', 'm12', 'sel'];

/** What a person would notice changing on a light: compared to tell a hand change from Homeboard's own */
function look(state: any): string | undefined {
  if (!state || typeof state.on !== 'boolean') return undefined;
  const seg = (state.seg ?? []).map((g: any) => [g.id, g.start, g.stop, g.on, g.fx, g.pal, g.sx, g.ix, g.col]);
  return JSON.stringify([state.on, state.bri, state.ps, state.pl, seg]);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function wled(host: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`http://${host}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`WLED ${host} answered ${res.status}`);
  return res.json();
}

/**
 * Guests trigger light effects on the WLED devices. Effects play one at a time
 * from a queue; each device goes back to what it was doing afterwards.
 */
export default defineModule<WledSettings>({
  id: 'wled',
  name: 'Lights',
  description: 'Guests trigger effects on your WLED lights',
  settings: {
    devices: [
      { id: 'tv', host: '192.168.1.130', name: 'TV' },
      { id: 'window', host: '192.168.1.236', name: 'Windowsill' },
      { id: 'chill', host: '192.168.1.200', name: 'Chill Guy' },
      { id: 'light4', host: '192.168.1.121', name: 'Light 4' },
    ],
    effects: DEFAULT_WLED_EFFECTS,
    durationSec: 30,
    brightness: 255,
  },

  setup(ctx) {
    const health = new Map<string, Health>();
    // Kept on disk at once, so lights left on an effect by a crash or a power cut are put back at the next start
    const store = new JsonFile<{ devices: Record<string, Snapshot> }>(join(ctx.dataDir, 'snapshots.json'), { devices: {} });
    const saved = {
      has: (id: string) => id in store.data.devices,
      get: (id: string): Snapshot | undefined => store.data.devices[id],
      keys: () => Object.keys(store.data.devices),
      take(id: string, before: any) {
        store.data.devices[id] = { before };
        store.saveNow();
      },
      /** Remember how the light looks after our change (the state WLED answers with) */
      sent(id: string, after: any) {
        const snap = store.data.devices[id];
        if (!snap) return;
        snap.sent = look(after);
        store.saveNow();
      },
      drop(id: string) {
        delete store.data.devices[id];
        store.saveNow();
      },
    };
    /** Snapshots from a previous run, or whose restore failed: put back once the light answers */
    const pending = new Set(saved.keys());
    let queue: Job[] = [];
    let current: (Job & { until: number }) | null = null;
    let timer: NodeJS.Timeout | null = null;
    let catalog: { effects: string[]; palettes: string[] } | null = null;
    /** A game holds the lights: no effect starts meanwhile */
    let held = false;
    /** Lights at full brightness for live pixels (a game prize): effects and restores leave them alone */
    const boosted = new Set<string>();

    const devices = () => ctx.settings.get().devices;
    const device = (id: string) => devices().find((d) => d.id === id);
    /** The saved segments Homeboard may change on a device: the picked ones, or all when none of them exists */
    const targets = (d: WledDevice, before: any): any[] => {
      const all: any[] = before.seg ?? [{ id: 0 }];
      const picked = all.filter((s) => d.segments?.includes(s.id));
      return picked.length ? picked : all;
    };
    const pub = (j: Job): WledJob => ({ id: j.id, effect: j.effect, devices: j.devices, guest: j.guest });

    // ------------------------------------------------------------ health

    const poll = async () => {
      await Promise.all(
        devices().map(async (d) => {
          try {
            const info = await wled(d.host, '/json/info');
            health.set(d.id, { online: true, name: info.name, leds: info.leds?.count });
          } catch {
            health.set(d.id, { online: false });
          }
        }),
      );
      for (const id of pending) {
        if (!health.get(id)?.online && device(id)) continue;
        pending.delete(id);
        void restore(id);
      }
      ctx.publish();
    };
    void poll();
    setInterval(poll, POLL_MS);

    // ------------------------------------------------------------ effects

    const apply = async (deviceId: string, effect: WledEffect) => {
      const d = device(deviceId);
      if (!d || boosted.has(d.id)) return false;
      try {
        pending.delete(d.id);
        if (!saved.has(d.id)) saved.take(d.id, await wled(d.host, '/json/state'));
        const col = effect.colors.length ? effect.colors.map(hexToRgb) : undefined;
        const seg = targets(d, saved.get(d.id)!.before).map((s) => ({ id: s.id, on: true, fx: effect.fx, pal: effect.pal, sx: effect.sx, ix: effect.ix, ...(col ? { col } : {}) }));
        const bri = ctx.settings.get().brightness;
        // v: WLED answers with its new state
        saved.sent(d.id, await wled(d.host, '/json/state', { on: true, transition: 3, ...(bri > 0 ? { bri } : {}), seg, v: true }));
        return true;
      } catch (err) {
        ctx.log.warn(`Could not reach ${d.name}`, (err as Error).message);
        health.set(d.id, { online: false });
        return false;
      }
    };

    const restore = async (deviceId: string) => {
      // In use again (a retry can come in while an effect or a game holds the light)
      if (held || boosted.has(deviceId) || current?.devices.includes(deviceId)) return;
      const snap = saved.get(deviceId);
      const d = device(deviceId);
      if (!snap || !d) {
        if (snap) saved.drop(deviceId);
        return;
      }
      const { before } = snap;
      try {
        if (snap.sent && look(await wled(d.host, '/json/state')) !== snap.sent) {
          // Someone picked something else on the light meanwhile: theirs wins
          ctx.log.info(`${d.name} was changed by hand, left as it is`);
        } else if (before.on && before.pl > 0) {
          // A playlist was running: start it again rather than freezing on its current preset
          await wled(d.host, '/json/state', { ps: before.pl });
        } else if (before.on && before.ps > 0) {
          await wled(d.host, '/json/state', { ps: before.ps });
        } else {
          // No preset, or the light was off (a preset would switch it on)
          const seg = (before.seg ?? []).map((s: any) => Object.fromEntries(SEGMENT_KEYS.filter((k) => k in s).map((k) => [k, s[k]])));
          await wled(d.host, '/json/state', { on: before.on, bri: before.bri, transition: 7, seg });
        }
        saved.drop(deviceId);
      } catch (err) {
        // Kept, and tried again once the light answers
        ctx.log.warn(`Could not restore ${d.name}`, (err as Error).message);
        health.set(d.id, { online: false });
        pending.add(deviceId);
      }
    };

    const runNext = async () => {
      if (current || held) return;
      const job = queue.shift();
      if (!job) {
        ctx.publish();
        return;
      }
      const effect = ctx.settings.get().effects.find((e) => e.id === job.effect.id);
      const results = effect ? await Promise.all(job.devices.map((id) => apply(id, effect))) : [];
      if (!results.some(Boolean)) {
        // Nothing reachable: give the money back and move on
        const guest = job.guestId ? ctx.session.guests.get(job.guestId) : undefined;
        if (guest && job.paid) {
          ctx.economy.giveBack(guest, job.paid, 'Refund: lights unreachable');
          ctx.toast(guest, { text: 'The lights did not answer, you got your money back', amount: job.paid, kind: 'error' });
        }
        return runNext();
      }
      const ms = ctx.settings.get().durationSec * 1000;
      current = { ...job, until: Date.now() + ms };
      timer = setTimeout(finish, ms);
      ctx.publish();
    };

    const finish = async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      current = null;
      // Devices used by the next job keep their saved state, so they do not blink back in between
      const next = new Set(queue[0]?.devices ?? []);
      await Promise.all([...saved.keys()].filter((id) => !next.has(id)).map(restore));
      await runNext();
    };

    const stopAll = async (refund: boolean) => {
      const dropped = queue;
      queue = [];
      if (refund) {
        for (const j of dropped) {
          const guest = j.guestId ? ctx.session.guests.get(j.guestId) : undefined;
          if (guest && j.paid) ctx.economy.giveBack(guest, j.paid, 'Refund: light effect cancelled');
        }
      }
      if (current) await finish();
      else await Promise.all([...saved.keys()].map(restore));
      ctx.publish();
    };

    const enqueue = (job: Job) => {
      queue = [...queue, job];
      ctx.publish();
      void runNext();
      return { position: current ? queue.indexOf(job) + 1 : 0 };
    };

    // ------------------------------------------------------------ games

    /** Color each device should show next (null: dark); one request in flight per device */
    const wanted = new Map<string, { hex: string | null; fadeMs: number }>();
    const sending = new Set<string>();

    const sendSolid = async (deviceId: string) => {
      if (sending.has(deviceId)) return;
      const d = device(deviceId);
      if (!d) return;
      sending.add(deviceId);
      try {
        while (wanted.has(deviceId) && held) {
          const { hex, fadeMs } = wanted.get(deviceId)!;
          wanted.delete(deviceId);
          try {
            pending.delete(d.id);
            if (!saved.has(d.id)) saved.take(d.id, await wled(d.host, '/json/state'));
            const col = [hex ? hexToRgb(hex) : [0, 0, 0], [0, 0, 0], [0, 0, 0]];
            const seg = targets(d, saved.get(d.id)!.before).map((s) => ({ id: s.id, on: true, fx: 0, col }));
            const bri = ctx.settings.get().brightness;
            saved.sent(d.id, await wled(d.host, '/json/state', { on: true, transition: Math.round(fadeMs / 100), ...(bri > 0 ? { bri } : {}), seg, v: true }));
          } catch (err) {
            ctx.log.warn(`Could not reach ${d.name}`, (err as Error).message);
          }
        }
      } finally {
        sending.delete(deviceId);
      }
    };

    let udp: Socket | null = null;
    ctx.onShutdown(() => {
      udp?.close();
    });

    ctx.provide<LightsApi>('lights', {
      available: () => ctx.enabled() && devices().some((d) => health.get(d.id)?.online),
      list: () => devices().map((d) => ({ id: d.id, name: d.name, online: !!health.get(d.id)?.online, leds: health.get(d.id)?.leds ?? null })),
      frame: (deviceId, rgb) => {
        const d = device(deviceId);
        if (!ctx.enabled() || !d || !health.get(d.id)?.online) return;
        if (!udp) {
          udp = createSocket('udp4');
          udp.on('error', (err) => ctx.log.warn('Realtime lights', err.message));
        }
        const packet = Buffer.alloc(2 + Math.min(rgb.length, 490 * 3));
        packet[0] = DRGB;
        packet[1] = REALTIME_TIMEOUT_SEC;
        packet.set(rgb.subarray(0, packet.length - 2), 2);
        // The host may carry the HTTP port: realtime has its own
        udp.send(packet, REALTIME_PORT, d.host.replace(/:\d+$/, ''));
      },
      claim: () => {
        if (held) return;
        held = true;
        if (current) {
          // The effect on now plays again (in full) after the game
          if (timer) clearTimeout(timer);
          timer = null;
          queue = [current, ...queue];
          current = null;
          ctx.publish();
        }
      },
      color: (hex, fadeMs = 0) => {
        if (!held) return;
        for (const d of devices()) {
          if (!health.get(d.id)?.online) continue;
          wanted.set(d.id, { hex, fadeMs });
          void sendSolid(d.id);
        }
      },
      boost: async (deviceId) => {
        const d = device(deviceId);
        if (!d || !ctx.enabled() || !health.get(d.id)?.online) return;
        boosted.add(d.id);
        try {
          if (!saved.has(d.id)) saved.take(d.id, await wled(d.host, '/json/state'));
          if (!boosted.has(d.id)) return;
          saved.sent(d.id, await wled(d.host, '/json/state', { on: true, bri: 255, v: true }));
        } catch (err) {
          ctx.log.warn(`Could not reach ${d.name}`, (err as Error).message);
        }
      },
      unboost: async (deviceId) => {
        if (!boosted.delete(deviceId)) return;
        await restore(deviceId);
      },
      release: async () => {
        if (!held) return;
        held = false;
        wanted.clear();
        // Let a color on its way land first, so it does not cover the restored state
        for (let i = 0; sending.size && i < 50; i++) await new Promise((r) => setTimeout(r, 40));
        await Promise.all([...saved.keys()].map(restore));
        await runNext();
      },
    });

    // ------------------------------------------------------------ api

    ctx.price({ key: 'wled.all', label: 'Light effect on every light', default: 1500 });
    ctx.price({ key: 'wled.one', label: 'Light effect on one light', default: 800 });

    ctx.state((role): WledState => {
      const s = ctx.settings.get();
      return {
        devices: s.devices.map((d) => ({ ...d, online: health.get(d.id)?.online ?? false, leds: health.get(d.id)?.leds })),
        effects: s.effects,
        durationSec: s.durationSec,
        current: current ? { ...pub(current), until: current.until } : null,
        queue: queue.map(pub),
        ...(role === 'admin' ? { brightness: s.brightness } : {}),
      };
    });

    const makeJob = (effectId: unknown, target: unknown, guest: Job['guest'], guestId: string | null): Job => {
      const effect = ctx.settings.get().effects.find((e) => e.id === effectId);
      if (!effect) throw new HbError('Unknown effect');
      const online = devices().filter((d) => health.get(d.id)?.online);
      const ids = target === 'all' ? online.map((d) => d.id) : online.filter((d) => d.id === target).map((d) => d.id);
      if (!ids.length) throw new HbError(target === 'all' ? 'No lights are reachable right now' : 'This light is offline');
      return { id: uid(6), effect: { id: effect.id, name: effect.name, colors: effect.colors }, devices: ids, guest, guestId, paid: 0 };
    };

    ctx.onGuest('trigger', (args, guest) => {
      if (queue.length >= 10) throw new HbError('Lots of effects are waiting. Try again in a moment.');
      const job = makeJob(args.effectId, args.target, { name: guest.name, color: guest.color }, guest.id);
      const charge = ctx.economy.charge(guest, args.target === 'all' ? 'wled.all' : 'wled.one', 1, `Lights: ${job.effect.name}`);
      job.paid = charge.amount;
      const where = args.target === 'all' ? 'every light' : device(job.devices[0])?.name;
      ctx.activity(`{name} lit up ${where} with ${job.effect.name}`, { guest });
      return enqueue(job);
    });

    ctx.onAdmin('test', (args) => enqueue(makeJob(args.effectId, args.target ?? 'all', { name: 'Host', color: '#8b7cff' }, null)));
    ctx.onAdmin('stop', (args) => stopAll(args.refund !== false));
    ctx.onAdmin('skip', () => finish());

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        durationSec: args.durationSec !== undefined ? clamp(num(args.durationSec, 30), 5, 600) : s.durationSec,
        brightness: args.brightness !== undefined ? clamp(num(args.brightness, 255), 0, 255) : s.brightness,
      });
      ctx.publish();
    });

    ctx.onAdmin('saveDevice', async (args) => {
      const host = String(args.host ?? '').trim().replace(/^https?:\/\//, '').replace(/[/#].*$/, '');
      if (!/^[\w.-]+(:\d+)?$/.test(host)) throw new HbError('Enter an IP address like 192.168.1.50');
      const list = [...devices()];
      const existing = list.find((d) => d.id === args.id);
      const segments = Array.isArray(args.segments) ? [...new Set(args.segments.map((n: unknown) => Math.round(num(n, -1))).filter((n: number) => n >= 0 && n < 32))] as number[] : undefined;
      const segmentNames = segments && Array.isArray(args.segmentNames) ? args.segmentNames.slice(0, segments.length).map((n: unknown) => cleanName(n, 30)) : undefined;
      let name = cleanName(args.name, 30);
      if (!name) name = await wled(host, '/json/info').then((i) => cleanName(i.name, 30)).catch(() => '');
      const picked = segments ? { segments, segmentNames } : {};
      if (existing) Object.assign(existing, { host, name: name || existing.name, ...picked });
      else list.push({ id: uid(4), host, name: name || host, ...picked });
      ctx.settings.update({ devices: list });
      await poll();
    });

    /** The segments a light has now, to pick where effects play */
    ctx.onAdmin('segments', async (args) => {
      const host = device(args.id)?.host;
      if (!host) throw new HbError('Unknown light');
      const state = await wled(host, '/json/state').catch(() => {
        throw new HbError('This light is not answering');
      });
      return (state.seg ?? []).map((s: any) => ({ id: s.id, name: typeof s.n === 'string' && s.n ? s.n : `Segment ${s.id}`, leds: s.len ?? s.stop - s.start }));
    });

    ctx.onAdmin('removeDevice', (args) => {
      ctx.settings.update({ devices: devices().filter((d) => d.id !== args.id) });
      ctx.publish();
    });

    ctx.onAdmin('saveEffect', (args) => {
      const e = args.effect ?? {};
      const effect: WledEffect = {
        id: typeof e.id === 'string' && e.id ? e.id : uid(4),
        name: cleanName(e.name, 30) || 'Effect',
        fx: clamp(Math.round(num(e.fx)), 0, 255),
        pal: clamp(Math.round(num(e.pal)), 0, 255),
        sx: clamp(Math.round(num(e.sx, 128)), 0, 255),
        ix: clamp(Math.round(num(e.ix, 128)), 0, 255),
        colors: (Array.isArray(e.colors) ? e.colors : []).filter((c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).slice(0, 3),
      };
      const list = [...ctx.settings.get().effects];
      const i = list.findIndex((x) => x.id === effect.id);
      if (i >= 0) list[i] = effect;
      else list.push(effect);
      ctx.settings.update({ effects: list });
      ctx.publish();
      return effect;
    });

    ctx.onAdmin('removeEffect', (args) => {
      ctx.settings.update({ effects: ctx.settings.get().effects.filter((e) => e.id !== args.id) });
      ctx.publish();
    });

    ctx.onAdmin('resetEffects', () => {
      ctx.settings.update({ effects: DEFAULT_WLED_EFFECTS });
      ctx.publish();
    });

    /** WLED effect and palette names, read from the first reachable device */
    ctx.onAdmin('catalog', async () => {
      if (catalog) return catalog;
      for (const d of devices()) {
        try {
          const [effects, palettes] = await Promise.all([wled(d.host, '/json/effects'), wled(d.host, '/json/palettes')]);
          catalog = { effects, palettes };
          return catalog;
        } catch {
          // try the next one
        }
      }
      throw new HbError('No WLED device is reachable');
    });

    ctx.onToggle((on) => {
      if (!on) void stopAll(true);
    });
    ctx.onSessionReset(() => void stopAll(false));
    ctx.onShutdown(() => stopAll(true));
  },
});
