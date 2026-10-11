import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MiPage, MiSound } from '../../../shared/soundboard.ts';
import { HbError, cleanName } from '../../core/util.ts';

/**
 * MyInstants has no official API and its pages sit behind a Cloudflare challenge,
 * so searching goes through the community scraper https://github.com/abdipr/myinstants-api.
 * The MP3 files themselves are served directly by myinstants.com, and are downloaded
 * here so the TV always plays a local file.
 *
 * When the scraper is down, searches go to Openverse instead (no key needed), which lists
 * Freesound's sound effects. Their MP3 previews are downloaded the same way.
 */
const API = 'https://myinstants-api.vercel.app';
const MEDIA = 'https://www.myinstants.com/media/sounds/';
const OPENVERSE = 'https://api.openverse.org/v1/audio/';
const FREESOUND = 'https://cdn.freesound.org/previews/';
/** A Freesound preview "234/234555_4238641-hq.mp3" is known here as "fs--234--234555_4238641-hq.mp3" */
const FS_KEY = /^fs--(\d{1,6})--(\d{1,9}_\d{1,9}-[hl]q\.mp3)$/;
/** After the scraper failed, go straight to Openverse for a while instead of waiting on it each time */
const DOWN_MS = 10 * 60_000;
const OV_PAGE = 20;
const MAX_BYTES = 4 * 1024 * 1024;
const CACHE_FILES = 300;
const UA = 'Mozilla/5.0 (Homeboard party dashboard)';

/** File name of a sound on myinstants.com, e.g. "vine-boom.mp3", or a Freesound key (see FS_KEY) */
export function cleanMp3(input: unknown): string {
  const file = String(input ?? '');
  if (!/^[\w.%()'-]{1,160}\.mp3$/i.test(file) || file.includes('..')) throw new HbError('Unknown sound');
  return file;
}

/** Where to download a sound from */
const mediaUrl = (mp3: string) => {
  const fs = FS_KEY.exec(mp3);
  return fs ? `${FREESOUND}${fs[1]}/${fs[2]}` : MEDIA + encodeURIComponent(mp3);
};

const results = new Map<string, { at: number; page: MiPage }>();
const remember = (url: string, page: MiPage) => {
  if (results.size > 200) results.clear();
  results.set(url, { at: Date.now(), page });
  return page;
};
let downSince = 0;

/**
 * Search MyInstants (or Freesound when MyInstants is down). An empty query lists the most popular sounds.
 * With `maxSec`, sounds longer than that are left out.
 */
export async function searchMyInstants(query: unknown, page: unknown, maxSec = 0): Promise<MiPage> {
  const q = cleanName(query, 60);
  const p = Math.max(1, Math.min(50, Math.floor(Number(page) || 1)));
  if (Date.now() - downSince < DOWN_MS) return searchFreesound(q, p, maxSec);
  try {
    return await searchScraper(q, p, maxSec);
  } catch (err) {
    downSince = Date.now();
    try {
      return await searchFreesound(q, p, maxSec);
    } catch {
      throw err;
    }
  }
}

async function searchScraper(q: string, p: number, maxSec: number): Promise<MiPage> {
  const length = maxSec > 0 ? `&max_duration=${maxSec}` : '&with_duration=1';
  const url = (q ? `${API}/search?q=${encodeURIComponent(q)}&page=${p}` : `${API}/best?q=us&page=${p}`) + length;
  const hit = results.get(url);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.page;

  let body: { status?: string; has_next?: boolean | null; error?: unknown; data?: { id?: string; title?: string; mp3?: string; duration?: number }[] };
  let ok = false;
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    body = (await res.json()) as typeof body;
    // A 404 is a search without result; a 5xx is the service being down (its host paused it, answering only an error)
    ok = res.status < 500;
  } catch {
    throw new HbError('Sound search is not reachable right now');
  }
  if (!ok) throw new HbError('Sound search is down right now (the MyInstants search service is not answering)');
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
  return remember(url, { items, page: p, hasNext: body.has_next ?? items.length > 0 });
}

/** Search Freesound's sound effects through Openverse */
async function searchFreesound(q: string, p: number, maxSec: number): Promise<MiPage> {
  // No popularity list there: before anything is typed, show classic party sounds
  const url = `${OPENVERSE}?q=${encodeURIComponent(q || 'funny')}&source=freesound&length=shortest&page_size=${OV_PAGE}&page=${p}`;
  const hit = results.get(url);
  let out: MiPage;
  if (hit && Date.now() - hit.at < 30 * 60_000) out = hit.page;
  else {
    let body: { page_count?: number; results?: { id?: string; title?: string; url?: string; duration?: number | null }[] };
    let status = 0;
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
      status = res.status;
      body = (await res.json()) as typeof body;
    } catch {
      throw new HbError('Sound search is not reachable right now');
    }
    if (status === 429) throw new HbError('Too many sound searches for now. Try again in a minute.');
    if (status >= 400) throw new HbError('Sound search is down right now');
    const items: MiSound[] = [];
    for (const d of body.results ?? []) {
      const path = d.url?.startsWith(FREESOUND) ? d.url.slice(FREESOUND.length) : '';
      const mp3 = `fs--${path.replace('/', '--')}`;
      if (!FS_KEY.test(mp3)) continue;
      const duration = typeof d.duration === 'number' && d.duration > 0 ? Math.round(d.duration / 100) / 10 : undefined;
      // Freesound titles are often file names
      const title = cleanName(String(d.title ?? '').replace(/\.(wav|mp3|ogg|flac|aiff?)$/i, '').replace(/[_]+/g, ' '), 40) || 'Sound';
      items.push({ id: mp3, title, mp3, ...(duration ? { duration } : {}) });
    }
    out = remember(url, { items, page: p, hasNext: p < (body.page_count ?? 0), source: 'freesound' });
  }
  return maxSec > 0 ? { ...out, items: out.items.filter((i) => !i.duration || i.duration <= maxSec) } : out;
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
        res = await fetch(mediaUrl(mp3), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
      } catch {
        throw new HbError('Could not download this sound');
      }
      if (!res.ok) throw new HbError('This sound is not available anymore');
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
