import { Hub } from './core/hub.ts';
import { openTvKiosk } from './core/kiosk.ts';
import { RESTART_CODE, log } from './core/util.ts';
import { modules } from './modules/index.ts';

const PORT = Number(process.env.PORT ?? 4300);

const hub = new Hub(PORT);
await hub.load(modules);
hub.serveWeb();
await hub.listen();

log.info('hub', `TV:    http://localhost:${PORT}/tv`);
log.info('hub', `Admin: http://localhost:${PORT}/admin  (password: ${hub.core.adminPassword})`);

if (hub.core.tunnel && process.env.HB_TUNNEL !== '0') void hub.startTunnel();
// A TV window left open from a previous run reconnects within a few seconds:
// only open a new one if none came back, so there are never two TVs playing sounds
if (process.argv.includes('--kiosk')) {
  setTimeout(() => {
    if (hub.tvCount > 0) log.info('kiosk', 'A TV window is already open, not opening another one');
    else openTvKiosk(`http://localhost:${PORT}/tv`);
  }, 4000);
}

let stopping = false;
const shutdown = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  log.info('hub', code === RESTART_CODE ? 'Restarting...' : 'Shutting down...');
  await hub.stop();
  process.exit(code);
};
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
// The hidden menu on the TV: server/run.ts builds and starts everything again
hub.bus.on('restart', () => shutdown(RESTART_CODE));
