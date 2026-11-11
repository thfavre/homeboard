import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../core/paths.ts';

/**
 * The art of the Universal LPC Spritesheet Character Generator, vendored in assets/lpc (see its
 * README.md) so every install has the same art with no download.
 */

const PACK_DIR = join(ROOT, 'assets', 'lpc');

export class LpcFiles {
  /** A file of the art pack (null: it does not exist) */
  async read(path: string): Promise<Buffer | null> {
    const file = join(PACK_DIR, path);
    return existsSync(file) ? readFileSync(file) : null;
  }
}
