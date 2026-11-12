import { createHash } from 'node:crypto';
import { existsSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineModule } from '../../core/module.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { HbError, num } from '../../core/util.ts';
import { LOOK_PARTS, lookCost, validChoices, type AvatarChoices, type LookPart, type PlaceId, type SheetInfo, type WardrobeMine, type WorldState } from '../../../shared/world.ts';
import { CATALOG, TIERS, itemById, piecesOf, validOutfit, validWorn, type Outfit, type Slot, type Tier, type WardrobeItem, type WornItem } from '../../../shared/wardrobe.ts';
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
  /** A look changed on the phone shows in the town after a trip to the clothes shop or the barber (off: at once) */
  shopVisits: boolean;
  /** Time spent inside a shop (seconds, a random time in the range) */
  visitMinSec: number;
  visitMaxSec: number;
  /** What a character is doing is finished first if it ends within this (seconds) */
  finishWithinSec: number;
  /** Otherwise it is wrapped up within this range (seconds), unless it cannot be cut short */
  wrapMinSec: number;
  wrapMaxSec: number;
  /** Wandering or a bench is dropped within this range (seconds) when a shop calls */
  quickMinSec: number;
  quickMaxSec: number;
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
  /**
   * What the town shows, when it differs from the look above: the phone has the new look at once,
   * the town character only once it has been to the shop for it. Absent: the same.
   */
  town?: TownLook;
}

interface TownLook {
  choices: AvatarChoices;
  outfit: Outfit;
  hash: string;
}

/** What the town shows of a guest */
const townOf = (a: StoredAvatar): TownLook => a.town ?? { choices: a.choices, outfit: a.outfit ?? {}, hash: a.hash };
/** What a visit to the clothes shop changes */
const outfitKey = (o: Outfit) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
/**
 * What a visit to the barber changes. The eye color is not in it: it shows in the town at once, as
 * a barber does not change eyes and a trip for two pixels on the TV would look pointless.
 */
const hairKey = (c: AvatarChoices) => `${c.hair}|${c.hairColor}|${c.beard}`;

interface WorldData {
  avatars: Record<string, StoredAvatar>;
  /** The measurements of the last sheet built: only a fallback for a sheet not measured yet */
  sheet: SheetInfo | null;
  /** The measurements of every sheet on disk, by its hash: looks differ (a tall hat, a dress without sit art) */
  sheets?: Record<string, SheetInfo>;
  credits: Record<string, { authors: string[]; license: string; urls: string[]; notes?: string }>;
  /** The town's own money per guest */
  wallets?: Record<string, number>;
  /** Bought pieces per guest, each an item in one color, kept forever */
  owned?: Record<string, WornItem[]>;
  /** Saved outfits per guest, one per slot (null: an empty slot), put back on in one tap */
  saved?: Record<string, (Outfit | null)[]>;
}

/** How many outfits a guest can save */
const SAVED_SLOTS = 3;

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
    shopVisits: true,
    visitMinSec: 2,
    visitMaxSec: 5,
    finishWithinSec: 20,
    wrapMinSec: 2,
    wrapMaxSec: 10,
    quickMinSec: 1,
    quickMaxSec: 3,
  },

  setup(ctx) {
    const store = new JsonFile<WorldData>(join(ctx.dataDir, 'world.json'), { avatars: {}, sheet: null, credits: {} });
    // Fields that came with the shop (a world.json from before has none)
    const wallets = (store.data.wallets ??= {});
    const owned = (store.data.owned ??= {});
    const saved = (store.data.saved ??= {});
    const composer = new Composer(new LpcFiles());
    for (const [file, cr] of Object.entries(store.data.credits)) composer.credits.set(file, cr);
    const sheetsDir = ctx.mediaDir('sheets');
    const sim = new TownSim({ dress: (id, place) => dress(id, place) });

    /** Builds by hash, so the same look is composited once even when asked twice at once */
    const building = new Map<string, Promise<SheetInfo>>();
    const sheetInfos = (store.data.sheets ??= {});

    /** Make sure the sheet of this look (choices plus outfit) is on disk; returns its info */
    const composite = (choices: AvatarChoices, outfit: Outfit): Promise<SheetInfo> => {
      const hash = choicesHash(choices, outfit);
      let p = building.get(hash);
      if (!p) {
        p = (async () => {
          const file = join(sheetsDir, `${hash}.png`);
          const known = sheetInfos[hash];
          if (existsSync(file) && known) return known;
          const built = await composer.build(choices, outfit);
          writeFileSync(file, built.png);
          sheetInfos[hash] = built.info;
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
      const used = new Set<string>();
      for (const a of Object.values(store.data.avatars)) used.add(`${a.hash}.png`).add(`${townOf(a).hash}.png`);
      for (const d of dressing.values()) used.add(`${d.hash}.png`);
      for (const f of readdirSync(sheetsDir)) {
        if (f.endsWith('.png') && !used.has(f) && !building.has(f.replace(/\.png$/, ''))) unlinkSync(join(sheetsDir, f));
      }
      for (const hash of Object.keys(sheetInfos)) if (!used.has(`${hash}.png`) && !building.has(hash)) delete sheetInfos[hash];
      store.save();
    };
    setInterval(cleanSheets, 10 * 60_000);

    // Sheets made before they were measured one by one, or named another way (a look saved before
    // the shop, a catalog change in the layers of a piece): draw them again under today's name
    void (async () => {
      let changed = false;
      for (const a of Object.values(store.data.avatars)) {
        for (const look of [a, a.town]) {
          if (!look) continue;
          const hash = choicesHash(look.choices, look.outfit ?? {});
          if (look.hash === hash && sheetInfos[hash]) continue;
          const built = await composite(look.choices, look.outfit ?? {}).then(() => true, () => false);
          // Unless the look changed meanwhile (a save or a wear writes its own name)
          if (built && choicesHash(look.choices, look.outfit ?? {}) === hash) {
            look.hash = hash;
            changed = true;
          }
        }
      }
      if (changed) {
        store.save();
        ctx.publish();
      }
    })();

    // ------------------------------------------------------------ the town look

    /** Town looks being composited, by guest (the newest wins when several overlap) */
    const dressing = new Map<string, { look: Omit<TownLook, 'hash'>; hash: string }>();

    /** What the town shows of a guest, or is about to once its sheet is built */
    const townSoon = (id: string, a: StoredAvatar): Omit<TownLook, 'hash'> => dressing.get(id)?.look ?? townOf(a);

    /** Keep what the town shows before the phone look changes (absent means "the same as the phone") */
    const pinTown = (a: StoredAvatar) => {
      a.town ??= { choices: a.choices, outfit: a.outfit ?? {}, hash: a.hash };
    };

    /** Show this look in the town once its sheet is built (the sheet must exist before the TV asks for it) */
    const setTown = (id: string, look: Omit<TownLook, 'hash'>) => {
      const a = store.data.avatars[id];
      if (!a) return;
      const hash = choicesHash(look.choices, look.outfit);
      if (hash === (dressing.get(id)?.hash ?? townOf(a).hash)) return;
      dressing.set(id, { look, hash });
      composite(look.choices, look.outfit).then(
        () => {
          const cur = store.data.avatars[id];
          if (dressing.get(id)?.hash !== hash || !cur) return; // A newer look came meanwhile
          dressing.delete(id);
          // Back to the phone look: nothing to keep apart anymore
          cur.town = hash === cur.hash ? undefined : { ...look, hash };
          store.save();
          ctx.publish();
        },
        (err) => {
          // Cannot be built: the phone look then (its sheet exists), so no trip is made again for nothing
          ctx.log.warn(`Town look of ${id} failed:`, err);
          if (dressing.get(id)?.hash !== hash) return;
          dressing.delete(id);
          const cur = store.data.avatars[id];
          if (cur) cur.town = undefined;
          store.save();
          ctx.publish();
        },
      );
    };

    /** A character has been to a shop: the town now shows that shop's part of the phone look */
    const dress = (id: string, place: PlaceId) => {
      const a = store.data.avatars[id];
      if (!a) return;
      const t = townSoon(id, a);
      if (place === 'clothes') setTown(id, { choices: t.choices, outfit: a.outfit ?? {} });
      else setTown(id, { choices: { ...t.choices, hair: a.choices.hair, hairColor: a.choices.hairColor, beard: a.choices.beard }, outfit: t.outfit });
    };

    /** The shops a character must visit to look like on the phone (one trip each, whatever the number of changes) */
    const errandsOf = (id: string, a: StoredAvatar): PlaceId[] => {
      const t = townSoon(id, a);
      const out: PlaceId[] = [];
      if (outfitKey(t.outfit) !== outfitKey(a.outfit ?? {})) out.push('clothes');
      if (hairKey(t.choices) !== hairKey(a.choices)) out.push('barber');
      return out;
    };

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
          const hash = townOf(a).hash;
          return guest ? { id, name: guest.name, color: guest.color, url: ctx.mediaUrl(`sheets/${hash}.png`), sheet: sheetInfos[hash] ?? store.data.sheet ?? undefined } : null;
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
          shopVisits: s.shopVisits,
          visitMinSec: s.visitMinSec,
          visitMaxSec: s.visitMaxSec,
          finishWithinSec: s.finishWithinSec,
          wrapMinSec: s.wrapMinSec,
          wrapMaxSec: s.wrapMaxSec,
          quickMinSec: s.quickMinSec,
          quickMaxSec: s.quickMaxSec,
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

    /**
     * Changes to one guest's look run one after the other: a save (hair) and a wear (clothes) sent
     * at once would otherwise each write back what they read before the other one finished
     */
    const lookQueue = new Map<string, Promise<unknown>>();
    const oneAtATime = <T>(guestId: string, fn: () => Promise<T>): Promise<T> => {
      const run = (lookQueue.get(guestId) ?? Promise.resolve()).then(fn, fn);
      const tail = run.catch(() => {});
      lookQueue.set(guestId, tail);
      void tail.then(() => {
        if (lookQueue.get(guestId) === tail) lookQueue.delete(guestId);
      });
      return run;
    };

    ctx.onGuest('save', (args, guest) =>
      oneAtATime(guest.id, async () => {
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
        if (before) pinTown(before);
        store.data.avatars[guest.id] = { choices, hash, outfit, town: before?.town };
        // The eyes show in the town at once (see hairKey); hair and beard after a trip to the barber
        if (before) {
          const t = townSoon(guest.id, before);
          if (t.choices.eyes !== choices.eyes) setTown(guest.id, { choices: { ...t.choices, eyes: choices.eyes }, outfit: t.outfit });
        }
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
      }),
    );

    // ------------------------------------------------------------ the shop

    /**
     * The part of an outfit this guest can wear now: a saved outfit may hold a piece the catalog
     * dropped or changed, or one that no longer fits; such pieces fall off instead of failing it all
     */
    const wearable = (guestId: string, outfit: Outfit): Outfit => {
      const body = store.data.avatars[guestId]?.choices.body;
      if (!body) return {};
      const mineOwned = owned[guestId] ?? [];
      const out: Outfit = {};
      for (const [slot, w] of Object.entries(outfit)) {
        const worn = validWorn(w, body);
        if (!worn || worn.item.slot !== slot) continue;
        if (!mineOwned.some((o) => o.id === worn.id && o.color === worn.color)) continue;
        out[slot as Slot] = { id: worn.id, color: worn.color };
      }
      if (out.dress) {
        delete out.top;
        delete out.bottom;
      }
      return out;
    };

    // Only pieces the catalog still has: the phone sends the outfit back with one slot changed, and
    // a piece gone from the catalog would get every change refused
    const mine = (guestId: string): WardrobeMine => {
      const a = store.data.avatars[guestId];
      return {
        balance: wallets[guestId] ?? 0,
        owned: (owned[guestId] ?? []).filter((o) => validWorn(o)),
        outfit: a ? outfitFor(guestId, a.choices.body) : {},
        saved: Array.from({ length: SAVED_SLOTS }, (_, i) => {
          const o = saved[guestId]?.[i];
          return o ? wearable(guestId, o) : null;
        }),
      };
    };

    /** Tell this guest's open pages their new balance */
    const sendWallet = (guestId: string) => ctx.emit({ guest: guestId }, 'wallet', { balance: wallets[guestId] ?? 0 });

    ctx.onGuest('wardrobe', (_args, guest) => mine(guest.id));

    // Item pictures: the item alone, drawn once per item and color. The shop's grid shows each
    // item in its own (first) color; the wardrobe shows the owned pieces in their colors.
    const iconsDir = ctx.mediaDir('icons');
    const drawingIcons = new Map<string, Promise<void>>();
    async function iconUrl(item: WardrobeItem, color = item.colors[0]): Promise<string> {
      // Named by item, color and the layers drawn, so a catalog change (a new first color, an
      // added trim) draws a new picture
      const pieces = piecesOf(item, color);
      const layers = createHash('sha1').update(JSON.stringify(pieces)).digest('hex').slice(0, 8);
      const name = `${item.id}--${color.replace('+', '-')}--${layers}`;
      const file = join(iconsDir, `${name}.png`);
      if (!existsSync(file)) {
        let p = drawingIcons.get(name);
        if (!p) {
          p = composer.icon(pieces, item.bodies?.[0] ?? 'male').then((png) => writeFileSync(file, png));
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

    /** Put on a whole outfit; the town character changes at the clothes shop */
    async function wearOutfit(guestId: string, outfit: Outfit) {
      const stored = store.data.avatars[guestId];
      if (!stored) throw new HbError('Make your look first');
      const mineOwned = owned[guestId] ?? [];
      for (const w of Object.values(outfit)) {
        if (!mineOwned.some((o) => o.id === w.id && o.color === w.color)) throw new HbError('You do not own that yet');
      }
      const hash = choicesHash(stored.choices, outfit);
      await composite(stored.choices, outfit);
      // The town character keeps its clothes until it has been to the clothes shop
      pinTown(stored);
      stored.outfit = outfit;
      stored.hash = hash;
      store.save();
      ctx.publish();
      return { ...mine(guestId), url: ctx.mediaUrl(`sheets/${hash}.png`) };
    }

    ctx.onGuest('wear', (args, guest) =>
      oneAtATime(guest.id, async () => {
        const stored = store.data.avatars[guest.id];
        if (!stored) throw new HbError('Make your look first');
        const outfit = validOutfit(args?.outfit, stored.choices.body);
        if (!outfit) throw new HbError('That outfit does not exist');
        return wearOutfit(guest.id, outfit);
      }),
    );

    /** The saved-outfit slot an RPC names */
    const savedSlot = (v: unknown): number => {
      const i = Number(v);
      if (!Number.isInteger(i) || i < 0 || i >= SAVED_SLOTS) throw new HbError('No such outfit slot');
      return i;
    };

    // Saved outfits: the worn outfit into a slot (over what was there), a saved outfit put back on
    ctx.onGuest('saveOutfit', (args, guest) =>
      oneAtATime(guest.id, async () => {
        const stored = store.data.avatars[guest.id];
        if (!stored) throw new HbError('Make your look first');
        const i = savedSlot(args?.slot);
        const list = (saved[guest.id] ??= []);
        while (list.length < SAVED_SLOTS) list.push(null);
        list[i] = { ...stored.outfit };
        store.save();
        return mine(guest.id);
      }),
    );

    ctx.onGuest('applyOutfit', (args, guest) =>
      oneAtATime(guest.id, async () => {
        const o = saved[guest.id]?.[savedSlot(args?.slot)];
        if (!o) throw new HbError('Nothing saved there');
        return wearOutfit(guest.id, wearable(guest.id, o));
      }),
    );

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

    /** Worn art without sit or cheer sheets keeps the character out of those poses (what the town character wears) */
    const wornLimits = (guestId: string): { noSit: boolean; noCheer: boolean } => {
      const a = store.data.avatars[guestId];
      const items = Object.values(a ? townOf(a).outfit : {}).map((w) => itemById(w.id));
      return { noSit: items.some((i) => i?.noSit), noCheer: items.some((i) => i?.noCheer) };
    };

    setInterval(() => {
      if (!ctx.enabled()) return;
      const s = ctx.settings.get();
      const now = Date.now();
      const roster = Object.entries(store.data.avatars)
        .map(([id, a]) => ({ a, g: ctx.session.guests.get(id) }))
        .filter((r): r is { a: StoredAvatar; g: NonNullable<typeof r.g> } => !!r.g)
        .map(({ a, g }) => {
          let errands = errandsOf(g.id, a);
          if (!s.shopVisits && errands.length) {
            // Visits off: the town follows the phone at once
            setTown(g.id, { choices: a.choices, outfit: a.outfit ?? {} });
            errands = [];
          }
          return { id: g.id, online: g.sockets > 0, awayMs: g.sockets > 0 ? 0 : Math.max(0, now - g.lastSeen), noSit: wornLimits(g.id).noSit, errands };
        });
      const sec = (a: number, b: number): [number, number] => [Math.min(a, b) * 1000, Math.max(a, b) * 1000];
      const frame = sim.tick(roster, {
        sleepAfterMs: s.sleepAfterMin * 60_000,
        fadeAfterMs: s.fadeAfterMin * 60_000,
        insideMs: sec(s.visitMinSec, s.visitMaxSec),
        finishWithinMs: s.finishWithinSec * 1000,
        wrapUpMs: sec(s.wrapMinSec, s.wrapMaxSec),
        quickStopMs: sec(s.quickMinSec, s.quickMaxSec),
      });
      ctx.emit('tv', 'frame', frame);
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
      const secs = (v: unknown, old: number, max: number) => Math.max(0, Math.min(max, Math.round(num(v, old) * 10) / 10));
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
        shopVisits: typeof args.shopVisits === 'boolean' ? args.shopVisits : s.shopVisits,
        visitMinSec: secs(args.visitMinSec, s.visitMinSec, 60),
        visitMaxSec: secs(args.visitMaxSec, s.visitMaxSec, 60),
        finishWithinSec: secs(args.finishWithinSec, s.finishWithinSec, 300),
        wrapMinSec: secs(args.wrapMinSec, s.wrapMinSec, 120),
        wrapMaxSec: secs(args.wrapMaxSec, s.wrapMaxSec, 120),
        quickMinSec: secs(args.quickMinSec, s.quickMinSec, 30),
        quickMaxSec: secs(args.quickMaxSec, s.quickMaxSec, 30),
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
      dressing.clear();
      // In place: wallets, owned and saved alias these objects
      for (const k of Object.keys(wallets)) delete wallets[k];
      for (const k of Object.keys(owned)) delete owned[k];
      for (const k of Object.keys(saved)) delete saved[k];
      for (const k of Object.keys(sheetInfos)) delete sheetInfos[k];
      store.save();
      // Open pages (the header, the shop) show the emptied wallet at once instead of the old balance
      ctx.emit('guest', 'wallet', { balance: 0 });
      rmSync(sheetsDir, { recursive: true, force: true });
      ctx.mediaDir('sheets');
      ctx.publish();
    });
  },
});
