/**
 * Fake guests for trying the town: each joins the party like a phone would, makes a random avatar
 * the first time, and stays online (so it walks around the town on the TV) until the script stops.
 * Then they fall asleep and fade out like any guest who left. Run again, the same bots come back
 * with the avatars they already have. Now and then a bot buys a piece of clothing and puts it on, or
 * changes its hairstyle, with its own money like a guest (SHOP_CHANCE below).
 *
 *   npx tsx scripts/bots.ts            three bots on the server of this folder
 *   npx tsx scripts/bots.ts 5          five bots (up to 60)
 *
 * The port follows PORT (4300 by default) and the data folder HB_DATA_DIR, like the server, so the
 * bots join a test copy when pointed at one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { HAIR_STYLES, randomChoices, type AvatarChoices, type WardrobeMine } from '../shared/world.ts';
import { CATALOG, type Outfit } from '../shared/wardrobe.ts';

const NAMES = [
  'Ada', 'Bruno', 'Cleo', 'Dario', 'Elsa', 'Felix', 'Gaia', 'Hugo', 'Iris', 'Jonas', 'Kira', 'Leon', 'Mila', 'Nino', 'Olga',
  'Paco', 'Quinn', 'Rosa', 'Sven', 'Tina', 'Ugo', 'Vera', 'Willy', 'Xena', 'Yann', 'Zoe',
];
/** The bots' PIN: lets the same bot log back in on the next run */
const PIN = '7392';
/** Past the names: numbered bots */
const MAX = 60;
/** Every this often each bot may treat itself: this chance to buy a piece and put it on, or (the
 * rest of the time) go to the barber for a new hairstyle */
const SHOP_EVERY_MS = 30_000;
const SHOP_CHANCE = 0.04;
const BUY_SHARE = 0.65;

const count = Math.max(1, Math.min(MAX, Number(process.argv[2]) || 3));
const port = Number(process.env.PORT) || 4300;
const dataDir = process.env.HB_DATA_DIR || join(import.meta.dirname, '..', 'data');

const rpc = (s: Socket, module: string, method: string, args?: unknown) =>
  new Promise<any>((ok, ko) =>
    s.timeout(30_000).emit('rpc', { module, method, args }, (err: unknown, res: { ok: boolean; data?: unknown; error?: string }) =>
      err ? ko(new Error('The server did not answer')) : res.ok ? ok(res.data) : ko(new Error(res.error)),
    ),
  );

for (let b = 0; b < count; b++) {
  const name = `Bot ${NAMES[b] ?? b + 1}`;
  const s = io(`http://localhost:${port}`, { auth: { role: 'guest' }, transports: ['websocket'] });
  // Also after a server restart: the socket reconnects as a visitor (no token kept: a logged-in
  // guest cannot join) and the bot joins again with its PIN
  const enter = async () => {
    try {
      // The session code, where the server keeps it (the QR code on the TV carries it), read each
      // time: the host may have changed it
      const code = JSON.parse(readFileSync(join(dataDir, 'session.json'), 'utf8')).code;
      const joined = await rpc(s, 'core', 'join', { code, name, pin: PIN });
      if (!(await rpc(s, 'world', 'mine'))) await rpc(s, 'world', 'save', { choices: randomChoices() });
      console.log(`${name} is in town${joined.returning ? ' (back again)' : ''}`);
    } catch (e) {
      // A server still starting up, for one: try again in a moment, as a fresh visitor (the join may
      // have gone through before what failed)
      console.log(`${name}: ${(e as Error).message}, trying again`);
      s.disconnect();
      setTimeout(() => s.connect(), 3000);
    }
  };
  s.on('connect', enter);
  setTimeout(() => setInterval(() => s.connected && Math.random() < SHOP_CHANCE && treat(s, name).catch(() => {}), SHOP_EVERY_MS), Math.random() * SHOP_EVERY_MS);
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** A bot buys a piece it can afford and wears it, or gets a new hairstyle (nothing happens if the shop says no) */
async function treat(s: Socket, name: string) {
  const choices: AvatarChoices | null = await rpc(s, 'world', 'mine');
  if (!choices) return;
  if (Math.random() < BUY_SHARE) {
    // A few tries: a locked slot, a piece owned already or too dear for the wallet is refused
    for (let i = 0; i < 6; i++) {
      const item = pick(CATALOG.filter((it) => !it.bodies || it.bodies.includes(choices.body)));
      const color = pick(item.colors);
      try {
        const mine: WardrobeMine = await rpc(s, 'world', 'buy', { id: item.id, color });
        const outfit: Outfit = { ...mine.outfit, [item.slot]: { id: item.id, color } };
        // A dress takes the top and bottom's place, and the other way round
        if (item.slot === 'dress') {
          delete outfit.top;
          delete outfit.bottom;
        }
        if (item.slot === 'top' || item.slot === 'bottom') delete outfit.dress;
        await rpc(s, 'world', 'wear', { outfit });
        console.log(`${name} bought the ${item.name} (${color})`);
        return;
      } catch {
        // Next try
      }
    }
  } else {
    const hair = pick(HAIR_STYLES.filter((h) => h.id !== choices.hair)).id;
    await rpc(s, 'world', 'save', { choices: { ...choices, hair } });
    console.log(`${name} has a new hairstyle (${hair})`);
  }
}
console.log(`${count} bots on port ${port}. Ctrl-C takes them offline.`);
