/**
 * A fake Arcade opponent for trying the games on a test copy: a guest that accepts every challenge,
 * presses Ready, then plays its run like a so-so player (its score goes up now and then, it loses
 * its lives one by one) and sends a ghost the game can draw (a made-up one: the bird's height in
 * Flap, the runner's place in Street Dash...).
 *
 *   PORT=4395 HB_DATA_DIR=/tmp/hb-test npx tsx scripts/arcade-bot.ts [game]
 *
 * With a game (knife, stack, flap...), the host's settings of the test copy are changed so the draw
 * only picks that game, and the challenge fee is set to 0. Never run it against a live party.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { ARCADE_GAMES, arcadeGame, type ArcadeMatch, type ArcadeState } from '../shared/arcade.ts';
import { randomChoices } from '../shared/world.ts';

const port = Number(process.env.PORT) || 4300;
const dataDir = process.env.HB_DATA_DIR || join(import.meta.dirname, '..', 'data');
const only = process.argv[2];
if (port === 4300) {
  console.log('Not on the live party (port 4300): set PORT to a test copy');
  process.exit(1);
}

const rpc = (s: Socket, module: string, method: string, args?: unknown) =>
  new Promise<any>((ok, ko) =>
    s.timeout(30_000).emit('rpc', { module, method, args }, (err: unknown, res: { ok: boolean; data?: unknown; error?: string }) =>
      err ? ko(new Error('The server did not answer')) : res.ok ? ok(res.data) : ko(new Error(res.error)),
    ),
  );

const admin = io(`http://localhost:${port}`, { auth: { role: 'admin' }, transports: ['websocket'] });
admin.on('connect', async () => {
  await rpc(admin, 'core', 'setPrice', { key: 'arcade.challenge', amount: 0 });
  if (only) await rpc(admin, 'arcade', 'setSettings', { off: ARCADE_GAMES.map((g) => g.id).filter((id) => id !== only) });
  console.log(only ? `The draw only picks ${only}` : 'The draw picks every game');
});

const s = io(`http://localhost:${port}`, { auth: { role: 'guest' }, transports: ['websocket'] });
let me = '';
let state: ArcadeState | null = null;
s.on('connect', async () => {
  const code = JSON.parse(readFileSync(join(dataDir, 'session.json'), 'utf8')).code;
  const joined = await rpc(s, 'core', 'join', { code, name: 'Bot Ada', pin: '7392' });
  me = joined.me.id;
  if (!(await rpc(s, 'world', 'mine'))) await rpc(s, 'world', 'save', { choices: randomChoices() });
  console.log('Bot Ada is waiting for a challenge');
  void react();
});
s.on('me', (m: { id: string }) => (me = m.id));
s.on('state', (msg: { module: string; data: unknown }) => {
  if (msg.module !== 'arcade') return;
  state = msg.data as ArcadeState;
  void react();
});

const playing = new Set<string>();
async function react() {
  if (!state || !me) return;
  for (const inv of state.invites) {
    if (inv.to.id === me) {
      console.log(`Challenged by ${inv.from.name}: accepting`);
      await rpc(s, 'arcade', 'respond', { id: inv.id, accept: true }).catch((e) => console.log(e.message));
    }
  }
  const m = state.matches.find((x) => x.players.some((p) => p.id === me) && x.phase !== 'result');
  if (!m) return;
  if (m.phase === 'ready' && !m.ready.includes(me)) await rpc(s, 'arcade', 'ready', { match: m.id }).catch(() => {});
  const key = `${m.id}:${m.rounds.length}`;
  if (m.phase === 'play' && m.startsAt && !playing.has(key)) {
    playing.add(key);
    play(m).catch((e) => console.log(e.message));
  }
}

/** One run, made up: points now and then, lives lost now and then, a ghost 10 times a second */
async function play(m: ArcadeMatch) {
  const round = m.rounds.length - 1;
  const info = arcadeGame(m.rounds[round].game)!;
  await new Promise((r) => setTimeout(r, Math.max(0, m.startsAt! - Date.now())));
  console.log(`Playing ${info.name}`);
  const start = Date.now();
  let score = 0;
  let lives = info.lives;
  let fever = false;
  let x = 200;
  const ghost = setInterval(() => {
    const t = (Date.now() - start) / 1000;
    let d: number[] = [];
    switch (info.id) {
      case 'flap':
        d = [330 + Math.sin(t * 2.2) * 120, Math.cos(t * 2.2) * 300];
        break;
      case 'dodge':
        x += (Math.random() - 0.5) * 60;
        x = Math.max(90, Math.min(310, x));
        d = [x];
        break;
      case 'stack':
        d = [4 + score, 180];
        break;
      case 'knife':
        d = [Math.floor(score / 7), score % 7];
        break;
      case 'plank':
        d = [Math.floor(score / 1.5), 120 + score * 140, 0];
        break;
      case 'whack':
        d = [score, score + 1];
        break;
      case 'zig':
        d = [t * 1.5, t * 1.5, 0];
        break;
    }
    if (d.length) void rpc(s, 'arcade', 'ghost', { match: m.id, round, d }).catch(() => {});
  }, 100);
  const send = (over = false) => rpc(s, 'arcade', 'score', { match: m.id, round, score, lives, fever, over }).catch(() => {});
  while (Date.now() - start < info.seconds * 1000) {
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 900));
    score += Math.random() < 0.85 ? 1 + (fever ? 1 : 0) : 0;
    fever = !fever && Math.random() < 0.05 ? true : fever && Math.random() < 0.15 ? false : fever;
    if (info.lives && Math.random() < 0.06) lives--;
    await send(info.lives > 0 && lives <= 0);
    if (info.lives > 0 && lives <= 0) break;
  }
  clearInterval(ghost);
  await send(true);
  console.log(`Done: ${score}`);
}
