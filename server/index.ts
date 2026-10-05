import { Hub } from './core/hub.ts';
import { log } from './core/util.ts';
import { modules } from './modules/index.ts';

const PORT = Number(process.env.PORT ?? 4300);

const hub = new Hub(PORT);
await hub.load(modules);
hub.serveWeb();
await hub.listen();

log.info('hub', `TV:    http://localhost:${PORT}/tv`);
log.info('hub', `Admin: http://localhost:${PORT}/admin  (password: ${hub.core.adminPassword})`);

if (hub.core.tunnel && process.env.HB_TUNNEL !== '0') void hub.tunnel.start(hub.tunnelTarget);

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  log.info('hub', 'Shutting down...');
  await hub.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
