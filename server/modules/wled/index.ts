import { createSocket, type Socket } from 'node:dgram';
import { join } from 'node:path';
import {
  DEFAULT_WLED_EFFECTS,
  DEFAULT_WLED_SCENES,
  LEGACY_WLED_EFFECTS,
  LEGACY_WLED_SCENES,
  WLED_LIVE,
  type WledDevice,
  type WledEffect,
  type WledJob,
  type WledLive,
  type WledLook,
  type WledState,
} from '../../../shared/wled.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { defineModule } from '../../core/module.ts';
import { HbError, clamp, cleanName, num, uid } from '../../core/util.ts';
import { Fireworks } from './fireworks.ts';

interface WledSettings {
  devices: WledDevice[];
  effects: WledEffect[];
  scenes: WledEffect[];
  /** The scene on now: it stays, across restarts, until another one is picked */
  scene: { id: string; by: string } | null;
  /** At startup: put the scene back on the lights, or start with no scene and leave the lights alone */
  sceneOnStart: boolean;
  /** Guests may change the scene (for a price) */
  guestScenes: boolean;
  durationSec: number;
  /** Brightness during effects (0 keeps the current brightness) */
  brightness: number;
  /** Brightness of scenes (0 keeps the current brightness) */
  sceneBrightness: number;
  /** Default effects this list has already been offered (empty: the ones from before this was kept) */
  knownEffects: string[];
  /** Same for scenes */
  knownScenes: string[];
}

interface Job extends WledJob {
  guestId: string | null;
  paid: number;
  /** A preview from the admin editor: this look (not saved yet), its brightness and length */
  preview?: { effect: WledEffect; bri: number; ms: number };
}

const PREVIEW_MS = 15_000;

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

/** The k-th look of an effect: its variants are dealt out in turn */
function lookAt(e: WledEffect, k: number): WledLook {
  const v = e.variants?.length ? e.variants[k % e.variants.length] : {};
  return { fx: v.fx ?? e.fx, pal: v.pal ?? e.pal, sx: v.sx ?? e.sx, ix: v.ix ?? e.ix, colors: v.colors ?? e.colors };
}

const HEX = /^#[0-9a-f]{6}$/i;
const cleanColors = (c: unknown): string[] => (Array.isArray(c) ? c : []).filter((x: unknown) => typeof x === 'string' && HEX.test(x)).slice(0, 3);
const byte = (v: unknown, fallback: number) => clamp(Math.round(num(v, fallback)), 0, 255);

/** An effect or a scene sent by the admin, checked */
function cleanEffect(e: any): WledEffect {
  const base: WledEffect = {
    id: typeof e.id === 'string' && e.id ? e.id : uid(4),
    name: cleanName(e.name, 30) || 'Effect',
    fx: byte(e.fx, 0),
    pal: byte(e.pal, 0),
    sx: byte(e.sx, 128),
    ix: byte(e.ix, 128),
    colors: cleanColors(e.colors),
  };
  const variants = (Array.isArray(e.variants) ? e.variants : []).slice(0, 8).map((v: any): Partial<WledLook> => {
    const out: Partial<WledLook> = {};
    for (const k of ['fx', 'pal', 'sx', 'ix'] as const) if (v?.[k] !== undefined) out[k] = byte(v[k], 0);
    if (Array.isArray(v?.colors)) out.colors = cleanColors(v.colors);
    return out;
  });
  if (variants.length > 1) base.variants = variants;
  if (typeof e.live === 'string' && e.live in WLED_LIVE) base.live = e.live as WledLive;
  return base;
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
    devices: [],
    effects: DEFAULT_WLED_EFFECTS,
    scenes: DEFAULT_WLED_SCENES,
    scene: null,
    sceneOnStart: true,
    guestScenes: true,
    durationSec: 30,
    brightness: 255,
    sceneBrightness: 140,
    knownEffects: [],
    knownScenes: [],
  },

  setup(ctx) {
    // Default effects added since this list was saved join it once (deleting one afterwards keeps it out),
    // and the old twinkling fireworks become the real ones
    {
      const s = ctx.settings.get();
      const known = new Set(s.knownEffects.length ? s.knownEffects : LEGACY_WLED_EFFECTS);
      const fireworks = DEFAULT_WLED_EFFECTS.find((e) => e.id === 'fireworks')!;
      const effects = s.effects.map((e) => (e.id === 'fireworks' && e.fx === 42 && !e.live ? { ...fireworks, name: e.name } : e));
      const added = DEFAULT_WLED_EFFECTS.filter((e) => !known.has(e.id) && !effects.some((x) => x.id === e.id));
      const ids = DEFAULT_WLED_EFFECTS.map((e) => e.id);
      if (added.length || effects.some((e, i) => e !== s.effects[i]) || ids.some((id) => !s.knownEffects.includes(id))) {
        ctx.settings.update({ effects: [...effects, ...added], knownEffects: ids });
      }
      // New default scenes go where they are in the defaults: after the default before them still in the list
      const knownScenes = new Set(s.knownScenes.length ? s.knownScenes : LEGACY_WLED_SCENES);
      // Default scenes that were changed since, still as they were shipped: the new version
      const lookKey = (e: Pick<WledEffect, 'fx' | 'pal' | 'sx' | 'ix' | 'colors' | 'variants'>) => JSON.stringify([e.fx, e.pal, e.sx, e.ix, e.colors, e.variants ?? null]);
      const upgrades: Record<string, Pick<WledEffect, 'fx' | 'pal' | 'sx' | 'ix' | 'colors' | 'variants'>> = {
        forest: { fx: 112, pal: 14, sx: 20, ix: 40, colors: [] },
        moodlamp: { fx: 8, pal: 0, sx: 6, ix: 230, colors: [] },
        night: { fx: 67, pal: 46, sx: 12, ix: 100, colors: [], variants: [{}, { fx: 68, sx: 35, ix: 45 }, { fx: 107, sx: 20, ix: 60 }, { fx: 74, pal: 46, sx: 16, ix: 40 }] },
      };
      const scenes = s.scenes.map((x) => {
        const was = upgrades[x.id];
        return was && lookKey(x) === lookKey(was) ? { ...DEFAULT_WLED_SCENES.find((d) => d.id === x.id)!, name: x.name } : x;
      });
      const upgraded = scenes.some((x, i) => x !== s.scenes[i]);
      DEFAULT_WLED_SCENES.forEach((e, i) => {
        if (knownScenes.has(e.id) || scenes.some((x) => x.id === e.id)) return;
        const before = DEFAULT_WLED_SCENES.slice(0, i).map((p) => scenes.findIndex((x) => x.id === p.id));
        scenes.splice(Math.max(-1, ...before) + 1, 0, e);
      });
      const sceneIds = DEFAULT_WLED_SCENES.map((e) => e.id);
      if (upgraded || scenes.length !== s.scenes.length || sceneIds.some((id) => !s.knownScenes.includes(id))) {
        ctx.settings.update({ scenes, knownScenes: sceneIds });
      }
    }

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
    // Starting with no scene: the lights stay exactly as they are now, nothing from the last run is put back
    if (!ctx.settings.get().sceneOnStart) {
      if (ctx.settings.get().scene) ctx.settings.update({ scene: null });
      if (saved.keys().length) {
        store.data.devices = {};
        store.saveNow();
      }
    }
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
    /** Live shows Homeboard draws on a light during an effect */
    const live = new Map<string, { show: Fireworks; leds: number }>();
    /** Lights on the scene now */
    const inScene = new Set<string>();
    /**
     * Bumped when something starts using a light (effect, game color, live pixels, boost), before any request:
     * a restore that was overtaken meanwhile keeps the saved state, or the light could never be put back
     */
    const uses = new Map<string, number>();
    const use = (id: string) => uses.set(id, (uses.get(id) ?? 0) + 1);

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
      // A light that went away may come back on its own preset: the scene goes on it again
      for (const d of devices()) if (!health.get(d.id)?.online) inScene.delete(d.id);
      for (const id of pending) {
        if (!health.get(id)?.online && device(id)) continue;
        pending.delete(id);
        void settle(id);
      }
      if (sceneNow()) for (const d of devices()) if (health.get(d.id)?.online && !inScene.has(d.id)) void settle(d.id);
      ctx.publish();
    };
    void poll();
    setInterval(poll, POLL_MS);

    // ------------------------------------------------------------ effects

    /**
     * An effect or a scene on a light: its k-th look on the first segment, the next ones on the others
     * (`bri` 0 keeps the brightness, `transition` in tenths of a second)
     */
    const apply = async (deviceId: string, effect: WledEffect, k: number, bri: number, transition: number) => {
      const d = device(deviceId);
      if (!d || boosted.has(d.id)) return false;
      use(d.id);
      try {
        pending.delete(d.id);
        if (!saved.has(d.id)) saved.take(d.id, await wled(d.host, '/json/state'));
        const seg = targets(d, saved.get(d.id)!.before).map((s, j) => {
          const l = lookAt(effect, k + j);
          // Colors the look leaves out are black, not what the light had (its own background would show through);
          // with none at all, the first one stays the light's (an empty slot leaves it as it is)
          const col = [0, 1, 2].map((i) => (l.colors[i] ? hexToRgb(l.colors[i]) : i === 0 && !l.colors.length ? [] : [0, 0, 0]));
          return { id: s.id, on: true, fx: l.fx, pal: l.pal, sx: l.sx, ix: l.ix, col, ...(d.group ? { grp: d.group, spc: 0 } : {}) };
        });
        // v: WLED answers with its new state
        saved.sent(d.id, await wled(d.host, '/json/state', { on: true, transition, ...(bri > 0 ? { bri } : {}), seg, v: true }));
        return true;
      } catch (err) {
        ctx.log.warn(`Could not reach ${d.name}`, (err as Error).message);
        health.set(d.id, { online: false });
        return false;
      }
    };

    // ------------------------------------------------------------ live shows

    let udp: Socket | null = null;
    ctx.onShutdown(() => {
      udp?.close();
      udp = null;
    });

    /** Pixels on a light over WLED's UDP realtime protocol; it goes back to its own state `timeoutSec` after the last one */
    const realtime = (d: WledDevice, rgb: Uint8Array, timeoutSec = REALTIME_TIMEOUT_SEC) => {
      if (!udp) {
        udp = createSocket('udp4');
        udp.on('error', (err) => ctx.log.warn('Realtime lights', err.message));
      }
      const packet = Buffer.alloc(2 + Math.min(rgb.length, 490 * 3));
      packet[0] = DRGB;
      packet[1] = timeoutSec;
      packet.set(rgb.subarray(0, packet.length - 2), 2);
      // The host may carry the HTTP port: realtime has its own
      udp.send(packet, REALTIME_PORT, d.host.replace(/:\d+$/, ''));
    };

    /** Realtime pixels cover the whole light: not for one where effects stay on some segments */
    const canLive = (d: WledDevice) => !d.segments?.length && !!health.get(d.id)?.leds;

    const startLive = async (d: WledDevice) => {
      if (boosted.has(d.id)) return false;
      use(d.id);
      try {
        pending.delete(d.id);
        if (!saved.has(d.id)) saved.take(d.id, await wled(d.host, '/json/state'));
        // WLED scales realtime pixels by its brightness
        const bri = ctx.settings.get().brightness;
        saved.sent(d.id, await wled(d.host, '/json/state', { on: true, ...(bri > 0 ? { bri } : {}), v: true }));
        stopLive(d.id);
        const leds = Math.min(490, health.get(d.id)?.leds ?? 60);
        live.set(d.id, { show: new Fireworks(leds, null, false, (rgb) => realtime(d, rgb), true), leds });
        return true;
      } catch (err) {
        ctx.log.warn(`Could not reach ${d.name}`, (err as Error).message);
        health.set(d.id, { online: false });
        return false;
      }
    };

    const stopLive = (deviceId: string) => {
      const l = live.get(deviceId);
      if (!l) return;
      live.delete(deviceId);
      l.show.stop(false);
      // Dark for a second, then the light fades back to its own state
      const d = device(deviceId);
      if (d && udp) realtime(d, new Uint8Array(l.leds * 3), 1);
    };

    // ------------------------------------------------------------ scenes

    const sceneNow = (): WledEffect | null => {
      const s = ctx.settings.get();
      return (ctx.enabled() && s.scene && s.scenes.find((x) => x.id === s.scene!.id)) || null;
    };

    /** Once nothing uses a light any more: back on the scene, or as it was without one */
    const settle = async (deviceId: string) => {
      if (held || boosted.has(deviceId) || current?.devices.includes(deviceId)) return;
      const scene = sceneNow();
      if (!scene || !device(deviceId)) {
        inScene.delete(deviceId);
        return restore(deviceId);
      }
      // Each light starts on another of the scene's looks
      const k = Math.max(0, devices().findIndex((d) => d.id === deviceId));
      if (await apply(deviceId, scene, k, ctx.settings.get().sceneBrightness, 15)) inScene.add(deviceId);
    };

    const setScene = async (id: string | null, by: string) => {
      ctx.settings.update({ scene: id ? { id, by } : null });
      inScene.clear();
      ctx.publish();
      await Promise.all(devices().filter((d) => health.get(d.id)?.online || saved.has(d.id)).map((d) => settle(d.id)));
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
      const since = uses.get(deviceId) ?? 0;
      const overtaken = () => (uses.get(deviceId) ?? 0) !== since;
      try {
        const now = snap.sent ? look(await wled(d.host, '/json/state')) : undefined;
        // Taken again while we asked: whoever has it now restores it when done
        if (overtaken()) return;
        if (now !== snap.sent) {
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
        if (!overtaken()) saved.drop(deviceId);
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
      const effect = job.preview?.effect ?? ctx.settings.get().effects.find((e) => e.id === job.effect.id);
      // Looks dealt from a random one, so the same light does not always get the same
      const k = Math.floor(Math.random() * 64);
      const bri = job.preview?.bri ?? ctx.settings.get().brightness;
      const results = effect
        ? await Promise.all(
            job.devices.map((id, i) => {
              inScene.delete(id);
              const d = device(id);
              return effect.live && d && canLive(d) ? startLive(d) : apply(id, effect, k + i, bri, 3);
            }),
          )
        : [];
      if (!results.some(Boolean)) {
        // Nothing reachable: give the money back and move on
        const guest = job.guestId ? ctx.session.guests.get(job.guestId) : undefined;
        if (guest && job.paid) {
          ctx.economy.giveBack(guest, job.paid, 'Refund: lights unreachable');
          ctx.toast(guest, { text: 'The lights did not answer, you got your money back', amount: job.paid, kind: 'error' });
        }
        return runNext();
      }
      const ms = job.preview?.ms ?? ctx.settings.get().durationSec * 1000;
      current = { ...job, until: Date.now() + ms };
      timer = setTimeout(finish, ms);
      ctx.publish();
    };

    const finish = async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      current = null;
      for (const id of [...live.keys()]) stopLive(id);
      // Devices used by the next job keep their saved state, so they do not blink back in between; the ones on the scene stay on it
      const next = new Set(queue[0]?.devices ?? []);
      await Promise.all([...saved.keys()].filter((id) => !next.has(id) && !inScene.has(id)).map(settle));
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
      else await Promise.all([...saved.keys()].filter((id) => !inScene.has(id)).map(settle));
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
          use(d.id);
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

    ctx.provide<LightsApi>('lights', {
      available: () => ctx.enabled() && devices().some((d) => health.get(d.id)?.online),
      list: () => devices().map((d) => ({ id: d.id, name: d.name, online: !!health.get(d.id)?.online, leds: health.get(d.id)?.leds ?? null })),
      // Sent as it comes: a strip shown frames faster than it can draw them queues them up and lags
      // (Rhythm Rain fell behind its music at 64 a second), so callers stay at FRAME_MS (games/engine.ts).
      // Idea: pace here instead, keeping only each light's newest frame and sending it at most as fast
      // as that light can show; then no game or effect could bring the lag back.
      frame: (deviceId, rgb) => {
        const d = device(deviceId);
        if (!ctx.enabled() || !d || !health.get(d.id)?.online) return;
        realtime(d, rgb);
      },
      claim: () => {
        if (held) return;
        held = true;
        inScene.clear();
        for (const id of [...live.keys()]) stopLive(id);
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
        use(d.id);
        inScene.delete(d.id);
        stopLive(d.id);
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
        await settle(deviceId);
      },
      release: async () => {
        if (!held) return;
        held = false;
        wanted.clear();
        // Let a color on its way land first, so it does not cover the restored state
        for (let i = 0; sending.size && i < 50; i++) await new Promise((r) => setTimeout(r, 40));
        await Promise.all([...saved.keys()].map(settle));
        await runNext();
      },
    });

    // ------------------------------------------------------------ api

    ctx.price({ key: 'wled.all', label: 'Light effect on every light', default: 1500 });
    ctx.price({ key: 'wled.one', label: 'Light effect on one light', default: 800 });
    ctx.price({ key: 'wled.scene', label: 'Change the light scene', default: 2500, active: () => ctx.settings.get().guestScenes });

    ctx.state((role): WledState => {
      const s = ctx.settings.get();
      const scene = sceneNow();
      return {
        devices: s.devices.map((d) => ({ ...d, online: health.get(d.id)?.online ?? false, leds: health.get(d.id)?.leds })),
        effects: s.effects,
        scenes: s.scenes,
        scene: scene && s.scene ? { id: scene.id, name: scene.name, by: s.scene.by } : null,
        guestScenes: s.guestScenes,
        durationSec: s.durationSec,
        current: current ? { ...pub(current), until: current.until } : null,
        queue: queue.map(pub),
        ...(role === 'admin' ? { brightness: s.brightness, sceneBrightness: s.sceneBrightness, sceneOnStart: s.sceneOnStart } : {}),
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

    ctx.onGuest('setScene', async (args, guest) => {
      const s = ctx.settings.get();
      if (!s.guestScenes) throw new HbError('Only the host can change the scene');
      const scene = s.scenes.find((x) => x.id === args.sceneId);
      if (!scene) throw new HbError('Unknown scene');
      if (s.scene?.id === scene.id) throw new HbError(`${scene.name} is already on`);
      if (!devices().some((d) => health.get(d.id)?.online)) throw new HbError('No lights are reachable right now');
      ctx.economy.charge(guest, 'wled.scene', 1, `Scene: ${scene.name}`);
      ctx.activity(`{name} set the mood: ${scene.name}`, { guest });
      await setScene(scene.id, guest.name);
    });

    ctx.onAdmin('setScene', async (args) => {
      const id = typeof args.sceneId === 'string' ? args.sceneId : null;
      if (id && !ctx.settings.get().scenes.some((x) => x.id === id)) throw new HbError('Unknown scene');
      await setScene(id, 'Host');
    });

    ctx.onAdmin('test', (args) => enqueue(makeJob(args.effectId, args.target ?? 'all', { name: 'Host', color: '#8b7cff' }, null)));
    ctx.onAdmin('stop', (args) => stopAll(args.refund !== false));

    /** The effect or scene being edited, on every light for a few seconds; a new preview replaces the last one at once */
    ctx.onAdmin('preview', async (args) => {
      const effect = cleanEffect({ ...(args.effect ?? {}), id: 'preview' });
      const s = ctx.settings.get();
      const ids = devices().filter((d) => health.get(d.id)?.online).map((d) => d.id);
      if (!ids.length) throw new HbError('No lights are reachable right now');
      const job: Job = {
        id: uid(6),
        effect: { id: effect.id, name: `Preview: ${effect.name}`, colors: effect.colors },
        devices: ids,
        guest: { name: 'Host', color: '#8b7cff' },
        guestId: null,
        paid: 0,
        preview: { effect, bri: args.kind === 'scene' ? s.sceneBrightness : s.brightness, ms: PREVIEW_MS },
      };
      queue = [job, ...queue.filter((j) => !j.preview)];
      if (current?.preview) await finish();
      else void runNext();
      ctx.publish();
      return { waiting: !!current && current.id !== job.id, held };
    });

    /** The editor closed: its preview ends (or never starts) */
    ctx.onAdmin('stopPreview', async () => {
      queue = queue.filter((j) => !j.preview);
      if (current?.preview) await finish();
      ctx.publish();
    });
    ctx.onAdmin('skip', () => finish());

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        durationSec: args.durationSec !== undefined ? clamp(num(args.durationSec, 30), 5, 600) : s.durationSec,
        brightness: args.brightness !== undefined ? clamp(num(args.brightness, 255), 0, 255) : s.brightness,
        sceneBrightness: args.sceneBrightness !== undefined ? clamp(num(args.sceneBrightness, 140), 0, 255) : s.sceneBrightness,
        guestScenes: args.guestScenes !== undefined ? args.guestScenes === true : s.guestScenes,
        sceneOnStart: args.sceneOnStart !== undefined ? args.sceneOnStart === true : s.sceneOnStart,
      });
      ctx.publish();
      // The scene on now, at its new brightness
      if (args.sceneBrightness !== undefined && s.scene) void setScene(s.scene.id, s.scene.by);
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
      const n = clamp(Math.round(num(args.group, 1)), 1, 10);
      const picked = { ...(segments ? { segments, segmentNames } : {}), ...(args.group !== undefined ? { group: n > 1 ? n : undefined } : {}) };
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

    /** Restart one light (`id`) or all of them: back on its boot preset, and on the scene again once it answers */
    const reboot = async (id?: unknown) => {
      const list = id ? devices().filter((d) => d.id === id) : devices().filter((d) => health.get(d.id)?.online);
      if (!list.length) throw new HbError(id ? 'Unknown light' : 'No lights are reachable right now');
      const done = await Promise.all(
        list.map(async (d) => {
          try {
            await wled(d.host, '/json/state', { rb: true });
            inScene.delete(d.id);
            health.set(d.id, { online: false });
            return true;
          } catch {
            return false;
          }
        }),
      );
      ctx.publish();
      // Seen again as soon as they are back (a restart takes a few seconds)
      for (const ms of [8000, 15000]) setTimeout(() => void poll(), ms);
      const failed = list.filter((_, i) => !done[i]).map((d) => d.name);
      if (failed.length === list.length) throw new HbError(`${failed.join(', ')} did not answer`);
      return { rebooted: list.length - failed.length, failed };
    };
    ctx.onAdmin('reboot', (args) => reboot(args.id));
    /** The hidden shortcut on the TV (its name tapped 5 times): every light. The TV page only opens on the Homeboard PC */
    ctx.onTv('reboot', () => reboot());

    ctx.onAdmin('removeDevice', (args) => {
      ctx.settings.update({ devices: devices().filter((d) => d.id !== args.id) });
      ctx.publish();
    });

    /** Effects and scenes are kept in two lists of the same shape */
    const listOf = (kind: unknown) => (kind === 'scene' ? 'scenes' : 'effects') as 'scenes' | 'effects';

    ctx.onAdmin('saveEffect', (args) => {
      const effect = cleanEffect(args.effect ?? {});
      const key = listOf(args.kind);
      const list = [...ctx.settings.get()[key]];
      const i = list.findIndex((x) => x.id === effect.id);
      if (i >= 0) list[i] = effect;
      else list.push(effect);
      ctx.settings.update({ [key]: list });
      ctx.publish();
      // The scene on now, as just edited
      const on = ctx.settings.get().scene;
      if (key === 'scenes' && on?.id === effect.id) void setScene(on.id, on.by);
      return effect;
    });

    ctx.onAdmin('removeEffect', async (args) => {
      const key = listOf(args.kind);
      ctx.settings.update({ [key]: ctx.settings.get()[key].filter((e) => e.id !== args.id) });
      ctx.publish();
      if (key === 'scenes' && ctx.settings.get().scene?.id === args.id) await setScene(null, 'Host');
    });

    ctx.onAdmin('resetEffects', async (args) => {
      const key = listOf(args.kind);
      ctx.settings.update(key === 'scenes' ? { scenes: DEFAULT_WLED_SCENES } : { effects: DEFAULT_WLED_EFFECTS });
      ctx.publish();
      const on = ctx.settings.get().scene;
      if (key === 'scenes' && on) await setScene(DEFAULT_WLED_SCENES.some((x) => x.id === on.id) ? on.id : null, on.by);
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
      inScene.clear();
      if (!on) void stopAll(true);
      else if (sceneNow()) for (const d of devices()) if (health.get(d.id)?.online) void settle(d.id);
    });
    ctx.onSessionReset(() => void stopAll(false));
    ctx.onShutdown(() => stopAll(true));
  },
});
