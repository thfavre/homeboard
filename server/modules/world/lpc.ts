import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

/**
 * The art of the Universal LPC Spritesheet Character Generator, read from a local pack when the
 * admin downloaded it, and fetched file by file (with a cache on disk) otherwise. The pack makes
 * the world independent of GitHub; the per-file fallback lets it work without the download (about
 * 150 MB of art: the repository is much bigger, but only through its git history).
 */

const REPO = 'LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator';
const RAW = `https://raw.githubusercontent.com/${REPO}/master/`;
const TARBALL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/master`;
/** The folders of the repository the compositor needs (the rest is the generator's web app) */
const WANTED = ['spritesheets/', 'sheet_definitions/', 'palette_definitions/'];

export class LpcFiles {
  /** The full pack (data/modules/world/lpc) and the per-file cache of the fallback */
  private packDir: string;
  private cacheDir: string;
  private markerFile: string;

  constructor(dataDir: string) {
    this.packDir = join(dataDir, 'lpc');
    this.cacheDir = join(dataDir, 'lpc-cache');
    this.markerFile = join(this.packDir, 'pack-complete.json');
  }

  /** The pack is on disk, whole */
  ready(): boolean {
    return existsSync(this.markerFile);
  }

  /** Size of the pack on disk (MB), from the marker written after the download */
  packMb(): number {
    try {
      return JSON.parse(readFileSync(this.markerFile, 'utf8')).mb ?? 0;
    } catch {
      return 0;
    }
  }

  deletePack(): void {
    rmSync(this.packDir, { recursive: true, force: true });
  }

  /**
   * A file of the repository (null: it does not exist). From the pack, or the cache, or fetched
   * and kept in the cache.
   */
  async read(path: string): Promise<Buffer | null> {
    const packed = join(this.packDir, path);
    if (this.ready() && existsSync(packed)) return readFileSync(packed);
    const cached = join(this.cacheDir, path);
    const missing = `${cached}.missing`;
    if (existsSync(cached)) return readFileSync(cached);
    if (existsSync(missing)) return null;
    mkdirSync(dirname(cached), { recursive: true });
    const res = await fetch(RAW + path.split('/').map(encodeURIComponent).join('/'));
    if (res.status === 404) {
      writeFileSync(missing, '');
      return null;
    }
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(cached, buf);
    return buf;
  }

  /**
   * Download the whole repository as a tarball and keep the art folders. Reports every few MB
   * (GitHub does not say the total up front). A failed download leaves no marker: the pack counts
   * as absent and the download can be retried.
   */
  async download(onProgress: (mb: number) => void): Promise<void> {
    rmSync(this.markerFile, { force: true });
    const res = await fetch(TARBALL);
    if (!res.ok || !res.body) throw new Error(`GitHub answered ${res.status}`);
    let read = 0;
    let reported = 0;
    let written = 0;
    const counter = async function* (src: AsyncIterable<Uint8Array>) {
      for await (const chunk of src) {
        read += chunk.length;
        if (read - reported > 8 * 1024 * 1024) {
          reported = read;
          onProgress(Math.round(read / 1024 / 1024));
        }
        yield chunk;
      }
    };
    const tar = Readable.from(counter(res.body as unknown as AsyncIterable<Uint8Array>)).pipe(createGunzip());
    await this.untar(tar, (size) => (written += size));
    writeFileSync(this.markerFile, JSON.stringify({ at: Date.now(), mb: Math.round(written / 1024 / 1024) }));
  }

  /** Extract the wanted folders of a tar stream (ustar prefixes and GNU long names included) */
  private async untar(tar: AsyncIterable<Buffer>, onFile: (size: number) => void): Promise<void> {
    let buf: Buffer = Buffer.alloc(0);
    /** The name given by a GNU 'L' entry for the entry after it */
    let longName: string | null = null;
    /** Every file stream flushed to disk before the extraction counts as done */
    const flushed: Promise<void>[] = [];
    /** The entry being read: where its bytes go (file, name, or nowhere) and what is left of it */
    let entry: { file: ReturnType<typeof createWriteStream> | null; name: Buffer[] | null; pax?: boolean; left: number; pad: number } | null = null;

    const str = (b: Buffer, start: number, len: number) => b.subarray(start, start + len).toString('utf8').replace(/\0.*$/, '');
    const num = (b: Buffer, start: number, len: number) => parseInt(str(b, start, len).trim() || '0', 8);

    const finish = () => {
      entry!.file?.end();
      if (entry!.name) {
        const text = Buffer.concat(entry!.name).toString('utf8');
        if (!entry!.pax) {
          longName = text.replace(/\0.*$/, '');
        } else {
          // A pax header is "<len> key=value\n" records; only the path matters here
          for (const m of text.matchAll(/\d+ ([^=]+)=([^\n]*)\n/g)) if (m[1] === 'path') longName = m[2];
        }
      }
      entry = null;
    };

    for await (const chunk of tar) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      for (;;) {
        if (entry) {
          const body = buf.subarray(0, Math.min(entry.left, buf.length));
          if (body.length) {
            entry.file?.write(body);
            entry.name?.push(Buffer.from(body));
            entry.left -= body.length;
            buf = buf.subarray(body.length);
          }
          if (entry.left === 0) {
            const skip = Math.min(entry.pad, buf.length);
            entry.pad -= skip;
            buf = buf.subarray(skip);
            if (entry.pad === 0) {
              finish();
              continue;
            }
          }
          break;
        }
        if (buf.length < 512) break;
        const header = buf.subarray(0, 512);
        buf = buf.subarray(512);
        if (header.every((b) => b === 0)) continue;
        const size = num(header, 124, 12);
        const pad = (512 - (size % 512)) % 512;
        const type = String.fromCharCode(header[156]);
        const prefix = str(header, 345, 155);
        let name = str(header, 0, 100);
        if (prefix) name = `${prefix}/${name}`;
        if (longName) {
          name = longName;
          longName = null;
        }
        if (type === 'L' || type === 'x') {
          entry = { file: null, name: [], pax: type === 'x', left: size, pad };
          continue;
        }
        // Drop the repository's top folder ("Universal-LPC-...-master/")
        const path = name.split('/').slice(1).join('/');
        if (type === '0' && WANTED.some((w) => path.startsWith(w)) && !path.includes('..')) {
          const file = join(this.packDir, path);
          mkdirSync(dirname(file), { recursive: true });
          onFile(size);
          const stream = createWriteStream(file);
          flushed.push(new Promise((resolve, reject) => stream.on('close', resolve).on('error', reject)));
          entry = { file: stream, name: null, left: size, pad };
        } else {
          entry = { file: null, name: null, left: size, pad };
        }
      }
    }
    if (entry) finish();
    await Promise.all(flushed);
  }

  /** Size of the pack folder on disk (MB), for the admin page when the marker is missing */
  dirMb(): number {
    let total = 0;
    const walk = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const e of entries) {
        const p = join(dir, e);
        const s = statSync(p);
        if (s.isDirectory()) walk(p);
        else total += s.size;
      }
    };
    walk(this.packDir);
    return Math.round(total / 1024 / 1024);
  }
}
