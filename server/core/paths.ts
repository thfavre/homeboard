import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');
export const DATA_DIR = join(ROOT, 'data');
export const MEDIA_DIR = join(DATA_DIR, 'media');
export const WEB_DIST = join(ROOT, 'dist', 'web');

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

ensureDir(DATA_DIR);
ensureDir(MEDIA_DIR);
