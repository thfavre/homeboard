import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MiPage, MiSound } from '../../../shared/soundboard.ts';
import { HbError, cleanName } from '../../core/util.ts';

/**
 * MyInstants has no official API and its pages sit behind a Cloudflare challenge,
 * so searching goes through the community scraper https://github.com/abdipr/myinstants-api.
 * The MP3 files themselves are served directly by myinstants.com, and are downloaded
 * here so the TV always plays a local file.
 */
const API = 'https://myinstants-api.vercel.app';
const MEDIA = 'https://www.myinstants.com/media/sounds/';
const MAX_BYTES = 4 * 1024 * 1024;
const CACHE_FILES = 300;
const UA = 'Mozilla/5.0 (Homeboard party dashboard)';

/** File name of a sound on myinstants.com, e.g. "vine-boom.mp3" */
export function cleanMp3(input: unknown): string {
  const file = String(input ?? '');
  if (!/^[\w.%()'-]{1,160}\.mp3$/i.test(file) || file.includes('..')) throw new HbError('Unknown MyInstants sound');
  return file;
}

const results = new Map<string, { at: number; page: MiPage }>();

/**
 * Search MyInstants. An empty query lists the most popular sounds.
 * With `maxSec`, sounds longer than that are left out (the scraper measures them).
 */
export async function searchMyInstants(query: unknown, page: unknown, maxSec = 0): Promise<MiPage> {
  const q = cleanName(query, 60);
  const p = Math.max(1, Math.min(50, Math.floor(Number(page) || 1)));
  const length = maxSec > 0 ? `&max_duration=${maxSec}` : '&with_duration=1';
  const url = (q ? `${API}/search?q=${encodeURIComponent(q)}&page=${p}` : `${API}/best?q=us&page=${p}`) + length;
  const hit = results.get(url);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.page;

  let body: { status?: string; has_next?: boolean | null; data?: { id?: string; title?: string; mp3?: string; duration?: number }[] };
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    body = (await res.json()) as typeof body;
  } catch {
    throw new HbError('MyInstants search is not reachable right now');
  }
  // The scraper answers "404" when a search has no result
  const items: MiSound[] = [];
  for (const d of body.data ?? []) {
    const mp3 = d.mp3?.startsWith(MEDIA) ? decodeURIComponent(d.mp3.slice(MEDIA.length)) : '';
    try {
      const duration = typeof d.duration === 'number' && d.duration > 0 ? Math.round(d.duration * 10) / 10 : undefined;
      items.push({ id: String(d.id ?? mp3), title: cleanName(d.title, 40) || 'Sound', mp3: cleanMp3(mp3), ...(duration ? { duration } : {}) });
    } catch {
      // not a plain MyInstants file
    }
  }
  // The first page never says whether more follow, and filtering by length shortens pages
  const out: MiPage = { items, page: p, hasNext: body.has_next ?? items.length > 0 };
  if (results.size > 200) results.clear();
  results.set(url, { at: Date.now(), page: out });
  return out;
}

const pending = new Map<string, Promise<void>>();

/** Make sure a MyInstants MP3 is in `dir`, downloading it if needed. Returns the local file name. */
export async function downloadMp3(mp3: string, dir: string, as = mp3): Promise<string> {
  const path = join(dir, as);
  if (existsSync(path)) return as;
  let job = pending.get(path);
  if (!job) {
    job = (async () => {
      let res: Response;
      try {
        res = await fetch(MEDIA + encodeURIComponent(mp3), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
      } catch {
        throw new HbError('Could not download the sound from MyInstants');
      }
      if (!res.ok) throw new HbError('MyInstants does not have this sound anymore');
      if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new HbError('This sound is too long');
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length > MAX_BYTES) throw new HbError('This sound is too long');
      writeFileSync(path, data);
    })().finally(() => pending.delete(path));
    pending.set(path, job);
  }
  await job;
  return as;
}

/** Keep the cache folder small: delete the oldest files */
export function pruneCache(dir: string): void {
  const files = readdirSync(dir).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }));
  if (files.length <= CACHE_FILES) return;
  files.sort((a, b) => a.t - b.t);
  for (const { f } of files.slice(0, files.length - CACHE_FILES)) {
    try {
      unlinkSync(join(dir, f));
    } catch {
      // in use or already gone
    }
  }
}
