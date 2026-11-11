import { existsSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineModule } from '../../core/module.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { HbError, num } from '../../core/util.ts';
import { validChoices, type AvatarChoices, type PackStatus, type SheetInfo, type WorldState } from '../../../shared/world.ts';
import { Composer, choicesHash } from './compose.ts';
import { LpcFiles } from './lpc.ts';
import { TownSim } from './sim.ts';

interface WorldSettings {
  /** A guest with no open page for this long lies down to sleep at the edge of the town */
  sleepAfterMin: number;
  /** A sleeping character fades out after this much longer */
  fadeAfterMin: number;
}

interface StoredAvatar {
  choices: AvatarChoices;
  hash: string;
}

interface WorldData {
  avatars: Record<string, StoredAvatar>;
  sheet: SheetInfo | null;
  credits: Record<string, { authors: string[]; license: string; urls: string[]; notes?: string }>;
}

/** Frames to the TV per second (the TV interpolates between them) */
const FRAME_HZ = 10;

/**
 * The avatar world: a living pixel town as the TV home screen. Guests design an LPC-style
 * character on their phone (composited on the server, see compose.ts); the characters wander the
 * town, sit on benches, pet the cat, and go to sleep when their guest leaves.
 */
export default defineModule<WorldSettings>({
  id: 'world',
  name: 'Avatar world',
  description: 'A pixel town on the TV where every guest lives as their own avatar',
  settings: { sleepAfterMin: 10, fadeAfterMin: 20 },

  setup(ctx) {
    const store = new JsonFile<WorldData>(join(ctx.dataDir, 'world.json'), { avatars: {}, sheet: null, credits: {} });
    const lpc = new LpcFiles(ctx.dataDir);
    const composer = new Composer(lpc);
    for (const [file, cr] of Object.entries(store.data.credits)) composer.credits.set(file, cr);
    const sheetsDir = ctx.mediaDir('sheets');
    const sim = new TownSim();

    let pack: PackStatus = lpc.ready() ? { kind: 'ready', mb: lpc.packMb() } : { kind: 'none' };

    /** Builds by hash, so the same look is composited once even when asked twice at once */
    const building = new Map<string, Promise<SheetInfo>>();

    /** Make sure the sheet of these choices is on disk; returns its info */
    const composite = (choices: AvatarChoices): Promise<SheetInfo> => {
      const hash = choicesHash(choices);
      let p = building.get(hash);
      if (!p) {
        p = (async () => {
          const file = join(sheetsDir, `${hash}.png`);
          if (existsSync(file) && store.data.sheet) return store.data.sheet;
          const built = await composer.build(choices);
          writeFileSync(file, built.png);
          store.data.sheet = built.info;
          store.data.credits = Object.fromEntries(composer.credits);
          store.save();
          writeFileSync(join(sheetsDir, 'CREDITS.txt'), composer.creditsText());
          return built.info;
        })();
        building.set(hash, p);
        // Done either way: the file (or its absence) is the truth from here on
        p.then(
          () => building.delete(hash),
          () => building.delete(hash),
        );
      }
      return p;
    };

    /** Delete sheets no avatar uses anymore (previews pile up while a guest plays with the editor) */
    const cleanSheets = () => {
      const used = new Set(Object.values(store.data.avatars).map((a) => `${a.hash}.png`));
      for (const f of readdirSync(sheetsDir)) {
        if (f.endsWith('.png') && !used.has(f) && !building.has(f.replace(/\.png$/, ''))) unlinkSync(join(sheetsDir, f));
      }
    };
    setInterval(cleanSheets, 10 * 60_000);

    ctx.state((role): WorldState | undefined => {
      const characters = Object.entries(store.data.avatars)
        .map(([id, a]) => {
          const guest = ctx.session.guests.get(id);
          return guest ? { id, name: guest.name, color: guest.color, url: ctx.mediaUrl(`sheets/${a.hash}.png`) } : null;
        })
        .filter((c): c is NonNullable<typeof c> => !!c);
      const base: WorldState = { characters, sheet: store.data.sheet };
      if (role === 'admin') {
        const s = ctx.settings.get();
        return { ...base, pack, sleepAfterMin: s.sleepAfterMin, fadeAfterMin: s.fadeAfterMin };
      }
      return base;
    });

    // The guest's own choices ride along their state via a per-guest rpc instead: the state is
    // shared per role, so "mine" is fetched by the editor when it opens.
    ctx.onGuest('mine', (_args, guest) => store.data.avatars[guest.id]?.choices ?? null);

    ctx.onGuest('preview', async (args) => {
      const choices = validChoices(args?.choices);
      if (!choices) throw new HbError('That look does not exist');
      const hash = choicesHash(choices);
      await composite(choices);
      return { url: ctx.mediaUrl(`sheets/${hash}.png`), sheet: store.data.sheet };
    });

    ctx.onGuest('save', async (args, guest) => {
      const choices = validChoices(args?.choices);
      if (!choices) throw new HbError('That look does not exist');
      const hash = choicesHash(choices);
      await composite(choices);
      const had = !!store.data.avatars[guest.id];
      store.data.avatars[guest.id] = { choices, hash };
      store.save();
      ctx.publish();
      if (!had) ctx.activity('{name} moved into the town', { guest });
      return { url: ctx.mediaUrl(`sheets/${hash}.png`) };
    });

    // ------------------------------------------------------------ the town

    setInterval(() => {
      if (!ctx.enabled()) return;
      const s = ctx.settings.get();
      const now = Date.now();
      const roster = Object.keys(store.data.avatars)
        .map((id) => ctx.session.guests.get(id))
        .filter((g): g is NonNullable<typeof g> => !!g)
        .map((g) => ({ id: g.id, online: g.sockets > 0, awayMs: g.sockets > 0 ? 0 : Math.max(0, now - g.lastSeen) }));
      ctx.emit('tv', 'frame', sim.tick(roster, s.sleepAfterMin * 60_000, s.fadeAfterMin * 60_000));
    }, 1000 / FRAME_HZ);

    // Other modules can make a character celebrate (a win, a big purchase)
    ctx.provide('world', { cheer: (guestId: string) => sim.cheer(guestId) });

    // ------------------------------------------------------------ admin

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      ctx.settings.update({
        sleepAfterMin: Math.max(1, Math.min(240, num(args.sleepAfterMin, s.sleepAfterMin))),
        fadeAfterMin: Math.max(1, Math.min(480, num(args.fadeAfterMin, s.fadeAfterMin))),
      });
      ctx.publish();
    });

    ctx.onAdmin('downloadPack', () => {
      if (pack.kind === 'downloading') throw new HbError('Already downloading');
      pack = { kind: 'downloading', mb: 0 };
      ctx.publish();
      void lpc
        .download((mb) => {
          pack = { kind: 'downloading', mb };
          ctx.publish();
        })
        .then(() => {
          pack = { kind: 'ready', mb: lpc.packMb() };
          ctx.log.info('LPC pack downloaded');
          ctx.publish();
        })
        .catch((err) => {
          ctx.log.error('LPC pack download failed', err);
          pack = { kind: 'error', message: (err as Error).message };
          ctx.publish();
        });
      return { started: true };
    });

    ctx.onAdmin('deletePack', () => {
      if (pack.kind === 'downloading') throw new HbError('Wait for the download to finish');
      lpc.deletePack();
      pack = { kind: 'none' };
      ctx.publish();
    });

    ctx.onSessionReset(() => {
      store.data.avatars = {};
      store.save();
      rmSync(sheetsDir, { recursive: true, force: true });
      ctx.mediaDir('sheets');
      ctx.publish();
    });
  },
});
