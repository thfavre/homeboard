import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/*
 * Loads the .env file at the project root (see .env.example), before any other module reads
 * process.env. Imported first by server/index.ts. Variables already set in the shell win.
 */
const file = resolve(import.meta.dirname, '../../.env');
if (existsSync(file)) process.loadEnvFile(file);
