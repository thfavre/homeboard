import { DEFAULT_WLED_EFFECTS, type WledDevice, type WledEffect, type WledJob, type WledState } from '../../../shared/wled.ts';
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

interface Health {
  online: boolean;
  name?: string;
  leds?: number;
}

const POLL_MS = 20_000;
const TIMEOUT_MS = 3000;
const SEGMENT_KEYS = ['id', 'on', 'bri', 'col', 'fx', 'sx', 'ix', 'pal', 'c1', 'c2', 'c3', 'o1', 'o2', 'o3', 'sel'];

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
    /** State of each device before Homeboard took over, restored when the effects end */
    const saved = new Map<string, any>();
    let queue: Job[] = [];
    let current: (Job & { until: number }) | null = null;
    let timer: NodeJS.Timeout | null = null;
    let catalog: { effects: string[]; palettes: string[] } | null = null;

    const devices = () => ctx.settings.get().devices;
    const device = (id: string) => devices().find((d) => d.id === id);
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
      ctx.publish();
    };
    void poll();
    setInterval(poll, POLL_MS);

    // ------------------------------------------------------------ effects

    const apply = async (deviceId: string, effect: WledEffect) => {
      const d = device(deviceId);
      if (!d) return false;
      try {
        if (!saved.has(d.id)) saved.set(d.id, await wled(d.host, '/json/state'));
        const before = saved.get(d.id);
        const col = effect.colors.length ? effect.colors.map(hexToRgb) : undefined;
        const seg = (before.seg ?? [{ id: 0 }]).map((s: any) => ({ id: s.id, on: true, fx: effect.fx, pal: effect.pal, sx: effect.sx, ix: effect.ix, ...(col ? { col } : {}) }));
        const bri = ctx.settings.get().brightness;
        await wled(d.host, '/json/state', { on: true, transition: 3, ...(bri > 0 ? { bri } : {}), seg });
        return true;
      } catch (err) {
        ctx.log.warn(`Could not reach ${d.name}`, (err as Error).message);
        health.set(d.id, { online: false });
        return false;
      }
    };

    const restore = async (deviceId: string) => {
      const before = saved.get(deviceId);
      saved.delete(deviceId);
      const d = device(deviceId);
      if (!before || !d) return;
      try {
        if (before.ps > 0) {
          await wled(d.host, '/json/state', { ps: before.ps });
        } else {
          const seg = (before.seg ?? []).map((s: any) => Object.fromEntries(SEGMENT_KEYS.filter((k) => k in s).map((k) => [k, s[k]])));
          await wled(d.host, '/json/state', { on: before.on, bri: before.bri, transition: 7, seg });
        }
      } catch (err) {
        ctx.log.warn(`Could not restore ${d.name}`, (err as Error).message);
      }
    };

    const runNext = async () => {
      if (current) return;
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
          ctx.economy.credit(guest, job.paid, 'Refund: lights unreachable');
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
          if (guest && j.paid) ctx.economy.credit(guest, j.paid, 'Refund: light effect cancelled');
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
      ctx.activity(`${guest.name} lit up ${where} with ${job.effect.name}`, { guest });
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
      let name = cleanName(args.name, 30);
      if (!name) name = await wled(host, '/json/info').then((i) => cleanName(i.name, 30)).catch(() => '');
      if (existing) Object.assign(existing, { host, name: name || existing.name });
      else list.push({ id: uid(4), host, name: name || host });
      ctx.settings.update({ devices: list });
      await poll();
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
