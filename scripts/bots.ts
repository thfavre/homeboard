/**
 * Fake guests for trying the town: each joins the party like a phone would, makes a random avatar
 * the first time, and stays online (so it walks around the town on the TV) until the script stops.
 * Then they fall asleep and fade out like any guest who left. Run again, the same bots come back
 * with the avatars they already have.
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
import { randomChoices } from '../shared/world.ts';

const NAMES = [
  'Ada', 'Bruno', 'Cleo', 'Dario', 'Elsa', 'Felix', 'Gaia', 'Hugo', 'Iris', 'Jonas', 'Kira', 'Leon', 'Mila', 'Nino', 'Olga',
  'Paco', 'Quinn', 'Rosa', 'Sven', 'Tina', 'Ugo', 'Vera', 'Willy', 'Xena', 'Yann', 'Zoe',
];
/** The bots' PIN: lets the same bot log back in on the next run */
const PIN = '7392';
/** Past the names: numbered bots */
const MAX = 60;

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
  // Also after a server restart: the socket reconnects and the bot joins again
  const enter = async () => {
    try {
      // The session code, where the server keeps it (the QR code on the TV carries it), read each
      // time: the host may have changed it
      const code = JSON.parse(readFileSync(join(dataDir, 'session.json'), 'utf8')).code;
      const joined = await rpc(s, 'core', 'join', { code, name, pin: PIN });
      s.auth = { role: 'guest', token: joined.token };
      if (!(await rpc(s, 'world', 'mine'))) await rpc(s, 'world', 'save', { choices: randomChoices() });
      console.log(`${name} is in town${joined.returning ? ' (back again)' : ''}`);
    } catch (e) {
      // A server that is still starting does not know its modules yet: try again in a moment
      console.log(`${name}: ${(e as Error).message}, trying again`);
      setTimeout(() => s.connected && enter(), 3000);
    }
  };
  s.on('connect', enter);
}
console.log(`${count} bots on port ${port}. Ctrl-C takes them offline.`);
