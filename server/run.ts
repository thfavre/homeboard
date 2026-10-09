import { spawn } from 'node:child_process';
import { RESTART_CODE } from './core/util.ts';

/*
 * Runs the party (build the web app, then the server) and runs it again when the
 * server asks for a restart (the hidden menu on the TV). Ctrl+C stops everything as before.
 */
const args = process.argv.slice(2).join(' ');

const run = (command: string) =>
  new Promise<number>((resolve) => {
    const child = spawn(command, { stdio: 'inherit', shell: true, env: { ...process.env, HB_SUPERVISED: '1' } });
    child.on('exit', (code) => resolve(code ?? 1));
  });

// Ctrl+C reaches the server too: wait for it to shut down cleanly instead of dying first
process.on('SIGINT', () => {});
process.on('SIGTERM', () => {});

for (;;) {
  const built = await run('vite build');
  if (built !== 0) process.exit(built);
  const code = await run(`tsx server/index.ts ${args}`);
  if (code !== RESTART_CODE) process.exit(code);
  console.log('\nRestarting Homeboard...\n');
}
