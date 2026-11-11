import { existsSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineModule } from '../../core/module.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { HbError, num } from '../../core/util.ts';
import { LOOK_PARTS, lookCost, validChoices, type AvatarChoices, type LookPart, type SheetInfo, type WardrobeMine, type WorldState } from '../../../shared/world.ts';
import { CATALOG, TIERS, itemById, validOutfit, validWorn, type Outfit, type Tier, type WardrobeItem, type WornItem } from '../../../shared/wardrobe.ts';
import { Composer, choicesHash } from './compose.ts';
import { LpcFiles } from './lpc.ts';
import { TownSim } from './sim.ts';

interface WorldSettings {
  /** A guest with no open page for this long lies down to sleep at the edge of the town */
  sleepAfterMin: number;
  /** A sleeping character fades out after this much longer */
  fadeAfterMin: number;
  /** What the town's own money is called (separate from the party currency) */
  currencyName: string;
  /** Earned per minute spent in the town (online with an avatar) */
  earnPerMin: number;
  /** Pocket money a newly created character starts with */
  startMoney: number;
  /** Shop prices by tier */
  priceCheap: number;
  priceCommon: number;
  priceFancy: number;
  priceEpic: number;
  priceLegendary: number;
  /** What changing each part of an existing look costs (the hair style, its color...) */
  lookHair: number;
  lookHairColor: number;
  lookBeard: number;
  lookEyes: number;
}

const LOOK_KEY: Record<LookPart, 'lookHair' | 'lookHairColor' | 'lookBeard' | 'lookEyes'> = {
  hair: 'lookHair',
  hairColor: 'lookHairColor',
  beard: 'lookBeard',
  eyes: 'lookEyes',
};

const PRICE_KEY: Record<Tier, 'priceCheap' | 'priceCommon' | 'priceFancy' | 'priceEpic' | 'priceLegendary'> = {
  cheap: 'priceCheap',
  common: 'priceCommon',
  fancy: 'priceFancy',
  epic: 'priceEpic',
  legendary: 'priceLegendary',
};

interface StoredAvatar {
  choices: AvatarChoices;
  hash: string;
  outfit?: Outfit;
}

interface WorldData {
  avatars: Record<string, StoredAvatar>;
  sheet: SheetInfo | null;
  credits: Record<string, { authors: string[]; license: string; urls: string[]; notes?: string }>;
  /** The town's own money per guest */
  wallets?: Record<string, number>;
  /** Bought pieces per guest, each an item in one color, kept forever */
  owned?: Record<string, WornItem[]>;
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
  settings: {
    sleepAfterMin: 10,
    fadeAfterMin: 20,
    currencyName: 'Acorns',
    earnPerMin: 3,
    startMoney: 50,
    priceCheap: 10,
    priceCommon: 25,
    priceFancy: 60,
    priceEpic: 150,
    priceLegendary: 400,
    lookHair: 30,
    lookHairColor: 20,
    lookBeard: 15,
    lookEyes: 10,
  },

  setup(ctx) {
    const store = new JsonFile<WorldData>(join(ctx.dataDir, 'world.json'), { avatars: {}, sheet: null, credits: {} });
    // Fields that came with the shop (a world.json from before has none)
    const wallets = (store.data.wallets ??= {});
    const owned = (store.data.owned ??= {});
    const composer = new Composer(new LpcFiles());
    for (const [file, cr] of Object.entries(store.data.credits)) composer.credits.set(file, cr);
    const sheetsDir = ctx.mediaDir('sheets');
    const sim = new TownSim();

    /** Builds by hash, so the same look is composited once even when asked twice at once */
    const building = new Map<string, Promise<SheetInfo>>();

    /** Make sure the sheet of this look (choices plus outfit) is on disk; returns its info */
    const composite = (choices: AvatarChoices, outfit: Outfit): Promise<SheetInfo> => {
      const hash = choicesHash(choices, outfit);
      let p = building.get(hash);
      if (!p) {
        p = (async () => {
          const file = join(sheetsDir, `${hash}.png`);
          if (existsSync(file) && store.data.sheet) return store.data.sheet;
          const built = await composer.build(choices, outfit);
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

    const tierPrices = (): Record<Tier, number> => {
      const s = ctx.settings.get();
      return Object.fromEntries(TIERS.map((t) => [t, s[PRICE_KEY[t]]])) as Record<Tier, number>;
    };

    const lookPrices = (): Record<LookPart, number> => {
      const s = ctx.settings.get();
      return Object.fromEntries(LOOK_PARTS.map((p) => [p, s[LOOK_KEY[p]]])) as Record<LookPart, number>;
    };

    ctx.state((role): WorldState | undefined => {
      const characters = Object.entries(store.data.avatars)
        .map(([id, a]) => {
          const guest = ctx.session.guests.get(id);
          return guest ? { id, name: guest.name, color: guest.color, url: ctx.mediaUrl(`sheets/${a.hash}.png`) } : null;
        })
        .filter((c): c is NonNullable<typeof c> => !!c);
      const s = ctx.settings.get();
      const base: WorldState = { characters, sheet: store.data.sheet, shop: { currencyName: s.currencyName, prices: tierPrices(), look: lookPrices() } };
      if (role === 'admin') {
        const guests = [...ctx.session.guests.values()];
        return {
          ...base,
          sleepAfterMin: s.sleepAfterMin,
          fadeAfterMin: s.fadeAfterMin,
          earnPerMin: s.earnPerMin,
          startMoney: s.startMoney,
          wallets: guests.map((g) => ({ id: g.id, name: g.name, color: g.color, balance: wallets[g.id] ?? 0 })),
        };
      }
      return base;
    });

    // ------------------------------------------------------------ the look

    // The guest's own choices ride along their state via a per-guest rpc instead: the state is
    // shared per role, so "mine" is fetched by the editor when it opens.
    ctx.onGuest('mine', (_args, guest) => store.data.avatars[guest.id]?.choices ?? null);

    /** The saved outfit, dropping pieces that do not fit this body (after a body change) */
    const outfitFor = (guestId: string, body: 'male' | 'female'): Outfit => {
      const entries = Object.entries(store.data.avatars[guestId]?.outfit ?? {}).filter(([, w]) => validWorn(w, body));
      return Object.fromEntries(entries);
    };

    ctx.onGuest('preview', async (args, guest) => {
      const stored = store.data.avatars[guest.id];
      const choices = args?.choices ? validChoices(args.choices) : (stored?.choices ?? null);
      if (!choices) throw new HbError('That look does not exist');
      // The shop sends a candidate outfit (owning it is not needed to try it on); the editor none
      const outfit = args?.outfit !== undefined ? validOutfit(args.outfit, choices.body) : outfitFor(guest.id, choices.body);
      if (!outfit) throw new HbError('That outfit does not exist');
      const hash = choicesHash(choices, outfit);
      const sheet = await composite(choices, outfit);
      return { url: ctx.mediaUrl(`sheets/${hash}.png`), sheet };
    });

    ctx.onGuest('save', async (args, guest) => {
      const choices = validChoices(args?.choices);
      if (!choices) throw new HbError('That look does not exist');
      const before = store.data.avatars[guest.id];
      // Who you are is set at creation; only hair, face and clothes change later
      if (before && (before.choices.body !== choices.body || before.choices.skin !== choices.skin)) {
        throw new HbError('Your body and skin are set: only hair, face and clothes can change');
      }
      // Creating the avatar is free; changing it afterwards costs per changed part
      const cost = before ? lookCost(before.choices, choices, lookPrices()) : 0;
      const name = ctx.settings.get().currencyName;
      const afford = () => {
        const balance = wallets[guest.id] ?? 0;
        if (balance < cost) throw new HbError(`Not enough ${name}: this costs ${cost}, you have ${balance}`, 'NO_MONEY');
      };
      afford();
      const outfit = outfitFor(guest.id, choices.body);
      const hash = choicesHash(choices, outfit);
      await composite(choices, outfit);
      // Checked again: money may have moved while the sheet was drawn
      afford();
      if (cost) {
        wallets[guest.id] = (wallets[guest.id] ?? 0) - cost;
        sendWallet(guest.id);
      }
      const had = !!before;
      store.data.avatars[guest.id] = { choices, hash, outfit };
      if (!had) {
        // Pocket money to get the first clothes with
        const start = Math.max(0, Math.round(ctx.settings.get().startMoney));
        if (start) {
          wallets[guest.id] = (wallets[guest.id] ?? 0) + start;
          sendWallet(guest.id);
        }
      }
      store.save();
      ctx.publish();
      if (!had) ctx.activity('{name} moved into the town', { guest });
      return { url: ctx.mediaUrl(`sheets/${hash}.png`) };
    });

    // ------------------------------------------------------------ the shop

    const mine = (guestId: string): WardrobeMine => ({
      balance: wallets[guestId] ?? 0,
      owned: owned[guestId] ?? [],
      outfit: store.data.avatars[guestId]?.outfit ?? {},
    });

    /** Tell this guest's open pages their new balance */
    const sendWallet = (guestId: string) => ctx.emit({ guest: guestId }, 'wallet', { balance: wallets[guestId] ?? 0 });

    ctx.onGuest('wardrobe', (_args, guest) => mine(guest.id));

    // Item pictures: the item alone, drawn once per item and color. The shop's grid shows each
    // item in its own (first) color; the wardrobe shows the owned pieces in their colors.
    const iconsDir = ctx.mediaDir('icons');
    const drawingIcons = new Map<string, Promise<void>>();
    async function iconUrl(item: WardrobeItem, color = item.colors[0]): Promise<string> {
      // Named by item and color, so a catalog change of the first color draws a new picture
      const name = `${item.id}--${color}`;
      const file = join(iconsDir, `${name}.png`);
      if (!existsSync(file)) {
        let p = drawingIcons.get(name);
        if (!p) {
          p = composer.icon(item.def, color, item.bodies?.[0] ?? 'male').then((png) => writeFileSync(file, png));
          drawingIcons.set(name, p);
          p.catch(() => drawingIcons.delete(name));
        }
        await p;
      }
      return ctx.mediaUrl(`icons/${name}.png`);
    }

    ctx.onGuest('icons', async (args) => {
      const items = CATALOG.filter((i) => i.slot === args?.slot);
      const urls: Record<string, string> = {};
      await Promise.all(
        items.map(async (item) => {
          try {
            urls[item.id] = await iconUrl(item);
          } catch (err) {
            // An item whose picture cannot be drawn shows its name instead
            ctx.log.warn(`No icon for ${item.id}:`, err);
          }
        }),
      );
      return urls;
    });

    /** The pictures of the guest's own pieces, each in its color, keyed "id:color" */
    ctx.onGuest('ownedIcons', async (_args, guest) => {
      const urls: Record<string, string> = {};
      await Promise.all(
        (owned[guest.id] ?? []).map(async (o) => {
          const worn = validWorn(o);
          if (!worn) return;
          try {
            urls[`${o.id}:${o.color}`] = await iconUrl(worn.item, o.color);
          } catch (err) {
            ctx.log.warn(`No icon for ${o.id} in ${o.color}:`, err);
          }
        }),
      );
      return urls;
    });

    ctx.onGuest('buy', async (args, guest) => {
      const stored = store.data.avatars[guest.id];
      if (!stored) throw new HbError('Make your look first');
      const worn = validWorn({ id: args?.id, color: args?.color });
      if (!worn) throw new HbError('The shop does not have that');
      if (worn.item.bodies && !worn.item.bodies.includes(stored.choices.body)) throw new HbError('That does not fit your body');
      if ((owned[guest.id] ?? []).some((o) => o.id === worn.id && o.color === worn.color)) throw new HbError('You own that already');
      const s = ctx.settings.get();
      const price = s[PRICE_KEY[worn.item.tier]];
      const balance = wallets[guest.id] ?? 0;
      if (balance < price) throw new HbError(`Not enough ${s.currencyName}: this costs ${price}, you have ${balance}`, 'NO_MONEY');
      wallets[guest.id] = balance - price;
      (owned[guest.id] ??= []).push({ id: worn.id, color: worn.color });
      store.save();
      sendWallet(guest.id);
      ctx.publish();
      if (worn.item.tier === 'epic' || worn.item.tier === 'legendary') {
        ctx.activity(`{name} bought the ${worn.item.name}`, { guest });
        cheer(guest.id);
      }
      return mine(guest.id);
    });

    ctx.onGuest('wear', async (args, guest) => {
      const stored = store.data.avatars[guest.id];
      if (!stored) throw new HbError('Make your look first');
      const outfit = validOutfit(args?.outfit, stored.choices.body);
      if (!outfit) throw new HbError('That outfit does not exist');
      const mineOwned = owned[guest.id] ?? [];
      for (const w of Object.values(outfit)) {
        if (!mineOwned.some((o) => o.id === w.id && o.color === w.color)) throw new HbError('You do not own that yet');
      }
      const hash = choicesHash(stored.choices, outfit);
      await composite(stored.choices, outfit);
      stored.outfit = outfit;
      stored.hash = hash;
      store.save();
      ctx.publish();
      return { ...mine(guest.id), url: ctx.mediaUrl(`sheets/${hash}.png`) };
    });

    // Time in the town pays a small wage: the shop needs money moving without any bookkeeping
    setInterval(() => {
      if (!ctx.enabled()) return;
      const amount = Math.max(0, Math.round(ctx.settings.get().earnPerMin));
      if (!amount) return;
      for (const id of Object.keys(store.data.avatars)) {
        const guest = ctx.session.guests.get(id);
        if (!guest || guest.sockets === 0) continue;
        wallets[id] = (wallets[id] ?? 0) + amount;
        sendWallet(id);
      }
      store.save();
      ctx.publish();
    }, 60_000);

    // ------------------------------------------------------------ the town

    /** Worn art without sit or cheer sheets keeps the character out of those poses */
    const wornLimits = (guestId: string): { noSit: boolean; noCheer: boolean } => {
      const items = Object.values(store.data.avatars[guestId]?.outfit ?? {}).map((w) => itemById(w.id));
      return { noSit: items.some((i) => i?.noSit), noCheer: items.some((i) => i?.noCheer) };
    };

    setInterval(() => {
      if (!ctx.enabled()) return;
      const s = ctx.settings.get();
      const now = Date.now();
      const roster = Object.keys(store.data.avatars)
        .map((id) => ctx.session.guests.get(id))
        .filter((g): g is NonNullable<typeof g> => !!g)
        .map((g) => ({ id: g.id, online: g.sockets > 0, awayMs: g.sockets > 0 ? 0 : Math.max(0, now - g.lastSeen), noSit: wornLimits(g.id).noSit }));
      ctx.emit('tv', 'frame', sim.tick(roster, s.sleepAfterMin * 60_000, s.fadeAfterMin * 60_000));
    }, 1000 / FRAME_HZ);

    /** A character celebrates, unless the worn art has no cheer sheets (the dress would vanish) */
    const cheer = (guestId: string) => {
      if (!wornLimits(guestId).noCheer) sim.cheer(guestId);
    };

    // Other modules can make a character celebrate (a win, a big purchase)
    ctx.provide('world', { cheer });

    // ------------------------------------------------------------ admin

    ctx.onAdmin('setOptions', (args) => {
      const s = ctx.settings.get();
      const price = (v: unknown, old: number) => Math.max(0, Math.min(1_000_000, Math.round(num(v, old))));
      ctx.settings.update({
        sleepAfterMin: Math.max(1, Math.min(240, num(args.sleepAfterMin, s.sleepAfterMin))),
        fadeAfterMin: Math.max(1, Math.min(480, num(args.fadeAfterMin, s.fadeAfterMin))),
        currencyName: typeof args.currencyName === 'string' && args.currencyName.trim() ? args.currencyName.trim().slice(0, 24) : s.currencyName,
        earnPerMin: price(args.earnPerMin, s.earnPerMin),
        startMoney: price(args.startMoney, s.startMoney),
        priceCheap: price(args.priceCheap, s.priceCheap),
        priceCommon: price(args.priceCommon, s.priceCommon),
        priceFancy: price(args.priceFancy, s.priceFancy),
        priceEpic: price(args.priceEpic, s.priceEpic),
        priceLegendary: price(args.priceLegendary, s.priceLegendary),
        lookHair: price(args.lookHair, s.lookHair),
        lookHairColor: price(args.lookHairColor, s.lookHairColor),
        lookBeard: price(args.lookBeard, s.lookBeard),
        lookEyes: price(args.lookEyes, s.lookEyes),
      });
      ctx.publish();
    });

    // Host gift (or fine): the only other way money enters the town for now
    ctx.onAdmin('grant', (args) => {
      const guest = ctx.session.guests.get(String(args?.guestId ?? ''));
      if (!guest) throw new HbError('No such guest');
      const amount = Math.round(num(args?.amount, 0));
      if (!amount) throw new HbError('Give or take an amount');
      wallets[guest.id] = Math.max(0, (wallets[guest.id] ?? 0) + amount);
      store.save();
      sendWallet(guest.id);
      ctx.publish();
      const name = ctx.settings.get().currencyName;
      ctx.toast(guest, amount > 0 ? { text: `The host gave you ${amount} ${name}`, kind: 'success' } : { text: `The host took ${-amount} ${name}`, kind: 'info' });
    });

    ctx.onSessionReset(() => {
      store.data.avatars = {};
      // In place: wallets and owned alias these objects
      for (const k of Object.keys(wallets)) delete wallets[k];
      for (const k of Object.keys(owned)) delete owned[k];
      store.save();
      rmSync(sheetsDir, { recursive: true, force: true });
      ctx.mediaDir('sheets');
      ctx.publish();
    });
  },
});
