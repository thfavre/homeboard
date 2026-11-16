import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { WALLRUSH_ENGINE, WALLRUSH_MODELS, wallRushModel, type AddonFile, type AddonStatus, type WallRushModel } from '../../../../shared/wallrush.ts';
import { HbError } from '../../../core/util.ts';

/**
 * The Wall Rush body tracking (MediaPipe and a pose model, 15 to 40 MB) is downloaded on demand into
 * the data folder, never shipped with Homeboard. Only the files missing or damaged are fetched.
 */
export class WallRushAddon {
  private progress: number | null = null;
  private error = '';

  constructor(
    readonly dir: string,
    private changed: () => void,
  ) {}

  private has(f: AddonFile): boolean {
    const p = join(this.dir, f.path);
    return existsSync(p) && statSync(p).size === f.bytes;
  }

  models(): WallRushModel[] {
    if (!WALLRUSH_ENGINE.every((f) => this.has(f))) return [];
    return WALLRUSH_MODELS.filter((m) => this.has(m.file)).map((m) => m.id);
  }

  installed(model?: WallRushModel): boolean {
    const list = this.models();
    return model ? list.includes(model) : list.length > 0;
  }

  status(): AddonStatus {
    const files = [...WALLRUSH_ENGINE, ...WALLRUSH_MODELS.map((m) => m.file)].filter((f) => this.has(f));
    return { models: this.models(), progress: this.progress, error: this.error, bytes: files.reduce((s, f) => s + f.bytes, 0) };
  }

  /** Download the engine and one model (resolves when done; progress shows meanwhile) */
  async install(model: WallRushModel): Promise<void> {
    if (this.progress !== null) throw new HbError('The download is already running');
    const todo = [...WALLRUSH_ENGINE, wallRushModel(model).file].filter((f) => !this.has(f));
    const total = todo.reduce((s, f) => s + f.bytes, 0);
    let done = 0;
    this.error = '';
    this.progress = 0;
    this.changed();
    try {
      for (const f of todo) {
        await this.download(f, (n) => {
          this.progress = total ? Math.min(1, (done + n) / total) : 1;
          this.changed();
        });
        done += f.bytes;
      }
    } catch (err) {
      this.error = (err as Error).message || 'The download failed';
      throw new HbError(this.error);
    } finally {
      this.progress = null;
      this.changed();
    }
  }

  private async download(f: AddonFile, onBytes: (n: number) => void): Promise<void> {
    const target = join(this.dir, f.path);
    mkdirSync(dirname(target), { recursive: true });
    const part = `${target}.part`;
    const res = await fetch(f.url, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!res.ok || !res.body) throw new Error(`Could not download ${f.path} (${res.status})`);
    const hash = createHash('sha256');
    let n = 0;
    let last = 0;
    const count = new Transform({
      transform(chunk: Buffer, _enc, next) {
        hash.update(chunk);
        n += chunk.length;
        // A progress update every 256 kB is plenty
        if (n - last > 256 * 1024) {
          last = n;
          onBytes(n);
        }
        next(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(res.body as any), count, createWriteStream(part));
      if (hash.digest('hex') !== f.sha256) throw new Error(`${f.path} arrived damaged, try again`);
      renameSync(part, target);
    } catch (err) {
      if (existsSync(part)) unlinkSync(part);
      throw err;
    }
  }

  /** Delete the files (a model only, or everything) */
  remove(model?: WallRushModel): void {
    if (this.progress !== null) throw new HbError('Wait for the download to finish');
    if (model) rmSync(join(this.dir, wallRushModel(model).file.path), { force: true });
    else rmSync(this.dir, { recursive: true, force: true });
    this.error = '';
    this.changed();
  }
}
