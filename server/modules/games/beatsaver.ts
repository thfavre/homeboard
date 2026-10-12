import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { songMsAt, type RhythmTempo } from '../../../shared/games.ts';
import { unzip } from '../../core/unzip.ts';

/** Beat Saber difficulties, easiest first */
export const BS_DIFFICULTIES = ['Easy', 'Normal', 'Hard', 'Expert', 'ExpertPlus'] as const;
export type BsDifficulty = (typeof BS_DIFFICULTIES)[number];

/** One note of a Beat Saber chart: time in the song, column 0 to 3, saber 0 (left) or 1 (right) */
export interface BsNote {
  ms: number;
  x: number;
  c: number;
}

export interface Song {
  key: string;
  hash: string;
  title: string;
  artist: string;
  bpm: number;
  /** The chart's own "best part" (ms), where a short game starts */
  previewMs: number;
  /** Audio file name in the media folder */
  audio: string;
  /** BeatSaver's cover picture and 10 second MP3 preview (online) */
  cover?: string;
  preview?: string;
  durationSec?: number;
  /** BeatSaver votes when it was last loaded: likes, and the share of positive votes (0 to 1) */
  upvotes?: number;
  rating?: number;
  charts: Partial<Record<BsDifficulty, BsNote[]>>;
  /** Charts timed on tempo changes: those changes (a chart left out has one tempo, `bpm`) */
  tempos?: Partial<Record<BsDifficulty, RhythmTempo[]>>;
  /** Read since tempo changes are handled: an older copy may lack the charts that have them */
  tempoAware?: boolean;
}

const API = 'https://api.beatsaver.com';
const json = (b: Buffer | undefined) => (b ? JSON.parse(b.toString('utf8').replace(/^﻿/, '')) : null);

/** A map key from what the host pasted: "747", or a link like https://beatsaver.com/maps/747 */
export function songKey(raw: string): string {
  const m = /([0-9a-f]{1,8})\/?$/i.exec(raw.trim());
  return m ? m[1].toLowerCase() : '';
}

/** True when a version 2 chart changes tempo along the way (not handled: its notes would drift from the song) */
function changesTempo(map: any, bpm: number): boolean {
  const changes = [...(map?._BPMChanges ?? []), ...(map?._events ?? []).filter((e: any) => e._type === 100)];
  return changes.some((c: any) => Math.abs(Number(c._BPM ?? c._floatValue) - bpm) > 0.01);
}

/**
 * The tempo changes of a version 3 chart (`bpmEvents`: from beat `b`, `m` beats a minute; before the first one,
 * the song's tempo), in ms of the song. Beat Saber times the notes by them, beat after beat (checked against
 * the music of map 3b7b0). Null when the tempo never changes.
 */
function tempoOf(map: any, bpm: number, offsetMs: number): RhythmTempo[] | null {
  const events = (Array.isArray(map?.bpmEvents) ? map.bpmEvents : [])
    .map((e: any) => ({ b: Number(e.b) || 0, m: Number(e.m) }))
    .filter((e: { b: number; m: number }) => e.b >= 0 && e.m > 0 && Number.isFinite(e.b) && Number.isFinite(e.m))
    .sort((x: { b: number }, y: { b: number }) => x.b - y.b);
  if (!events.some((e: { m: number }) => Math.abs(e.m - bpm) > 0.01)) return null;
  const tempo: RhythmTempo[] = [{ ms: offsetMs, beat: 0, bpm }];
  for (const e of events) {
    const last = tempo[tempo.length - 1];
    if (e.b === last.beat) last.bpm = e.m;
    else tempo.push({ ms: last.ms + ((e.b - last.beat) * 60_000) / last.bpm, beat: e.b, bpm: e.m });
  }
  return tempo;
}

/** Notes of a difficulty file, any map version (2, 3 or 4), on one tempo or on `tempo`. Bombs are left out. */
function notesOf(map: any, bpm: number, offsetMs: number, tempo: RhythmTempo[] | null): BsNote[] {
  const ms = (beat: number) => Math.round(tempo ? songMsAt(beat, bpm, tempo) : offsetMs + (beat * 60_000) / bpm);
  let notes: BsNote[] = [];
  if (Array.isArray(map?._notes)) {
    notes = map._notes.filter((n: any) => n._type === 0 || n._type === 1).map((n: any) => ({ ms: ms(n._time), x: n._lineIndex, c: n._type }));
  } else if (Array.isArray(map?.colorNotes) && map.colorNotes[0]?.i !== undefined) {
    const data = map.colorNotesData ?? [];
    notes = map.colorNotes.map((n: any) => ({ ms: ms(n.b), x: data[n.i]?.x ?? 0, c: data[n.i]?.c ?? 0 }));
  } else if (Array.isArray(map?.colorNotes)) {
    notes = map.colorNotes.map((n: any) => ({ ms: ms(n.b), x: n.x, c: n.c }));
  }
  return notes
    .filter((n) => Number.isFinite(n.ms) && n.ms >= 0)
    .map((n) => ({ ms: n.ms, x: Math.min(3, Math.max(0, Math.round(n.x) || 0)), c: n.c === 1 ? 1 : 0 }))
    .sort((a, b) => a.ms - b.ms);
}

/** Read a downloaded map: its info, the audio and the Standard charts */
function parseMap(files: Map<string, Buffer>): { info: Omit<Song, 'key' | 'hash' | 'audio'>; audio: Buffer } {
  const find = (name: string) => [...files.keys()].find((n) => n.toLowerCase() === name.toLowerCase());
  const info = json(files.get(find('info.dat') ?? ''));
  if (!info) throw new Error('This map has no Info.dat');
  const v4 = !!info.audio;
  const bpm = Number(v4 ? info.audio.bpm : info._beatsPerMinute);
  if (!(bpm > 0)) throw new Error('This map has no tempo');
  const offsetMs = (Number(info._songTimeOffset) || 0) * 1000;
  const audio = files.get(find(v4 ? info.audio.songFilename : info._songFilename) ?? '');
  if (!audio) throw new Error('This map has no song file');
  const levels: { difficulty: string; file: string }[] = v4
    ? (info.difficultyBeatmaps ?? []).filter((d: any) => d.characteristic === 'Standard').map((d: any) => ({ difficulty: d.difficulty, file: d.beatmapDataFilename }))
    : ((info._difficultyBeatmapSets ?? []).find((s: any) => s._beatmapCharacteristicName === 'Standard')?._difficultyBeatmaps ?? []).map((d: any) => ({
        difficulty: d._difficulty,
        file: d._beatmapFilename,
      }));
  const charts: Song['charts'] = {};
  const tempos: NonNullable<Song['tempos']> = {};
  let tempoChanges = false;
  for (const l of levels) {
    if (!BS_DIFFICULTIES.includes(l.difficulty as BsDifficulty)) continue;
    const map = json(files.get(find(l.file) ?? ''));
    if (changesTempo(map, bpm)) {
      tempoChanges = true;
      continue;
    }
    const tempo = tempoOf(map, bpm, offsetMs);
    const notes = notesOf(map, bpm, offsetMs, tempo);
    if (notes.length < 20) continue;
    charts[l.difficulty as BsDifficulty] = notes;
    if (tempo) tempos[l.difficulty as BsDifficulty] = tempo;
  }
  if (!Object.keys(charts).length) {
    throw new Error(tempoChanges ? 'This map changes tempo along the song: pick another one' : 'This map has no playable chart');
  }
  return {
    info: {
      title: String((v4 ? info.song?.title : info._songName) ?? 'Song'),
      artist: String((v4 ? info.song?.author : info._songAuthorName) ?? ''),
      bpm,
      previewMs: Math.round((Number(v4 ? info.audio.previewStartTime : info._previewStartTime) || 0) * 1000),
      charts,
      ...(Object.keys(tempos).length ? { tempos } : {}),
      tempoAware: true,
    },
    audio,
  };
}

/**
 * Get a Beat Saber map from BeatSaver (free API, no key) and keep it in `dir`: the song as an
 * audio file the TV plays, and the charts as JSON. Later loads read the copy.
 */
export async function loadSong(key: string, dir: string): Promise<Song> {
  // The last copy of this key, used when BeatSaver cannot be reached (no internet at the party)
  const byKey = join(dir, `key-${key}.json`);
  try {
    return await download(key, dir, byKey);
  } catch (err) {
    if (existsSync(byKey)) return JSON.parse(readFileSync(byKey, 'utf8'));
    throw err;
  }
}

const votes = (meta: any) => ({ upvotes: Number(meta.stats?.upvotes) || 0, rating: Number(meta.stats?.score) || 0 });

async function download(key: string, dir: string, byKey: string): Promise<Song> {
  const res = await fetch(`${API}/maps/id/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) throw new Error(`No BeatSaver map "${key}"`);
  if (!res.ok) throw new Error(`BeatSaver answered ${res.status}`);
  const meta = await res.json();
  const version = meta.versions?.[0];
  if (!version?.hash || !version.downloadURL) throw new Error('This map has no download');
  const hash = String(version.hash).toLowerCase();
  const cached = join(dir, `${hash}.json`);
  const old: Song | null = existsSync(cached) ? JSON.parse(readFileSync(cached, 'utf8')) : null;
  // A copy from before tempo changes were handled, missing a difficulty BeatSaver lists: read the map again
  const listed: string[] = (version.diffs ?? []).filter((d: any) => d.characteristic === 'Standard').map((d: any) => String(d.difficulty));
  const stale = !!old && !old.tempoAware && listed.some((d) => BS_DIFFICULTIES.includes(d as BsDifficulty) && !old.charts?.[d as BsDifficulty]);
  if (old && !stale) {
    const song: Song = {
      ...old,
      key,
      cover: version.coverURL,
      preview: version.previewURL,
      durationSec: Number(meta.metadata?.duration) || undefined,
      ...votes(meta),
    };
    writeFileSync(byKey, JSON.stringify(song));
    return song;
  }
  const zip = await fetch(version.downloadURL, { signal: AbortSignal.timeout(60_000) });
  if (!zip.ok) throw new Error(`Download failed (${zip.status})`);
  const { info, audio } = parseMap(unzip(Buffer.from(await zip.arrayBuffer())));
  const song: Song = {
    ...info,
    key,
    hash,
    audio: `${hash}.ogg`,
    cover: version.coverURL,
    preview: version.previewURL,
    durationSec: Number(meta.metadata?.duration) || undefined,
    ...votes(meta),
  };
  writeFileSync(join(dir, song.audio), audio);
  writeFileSync(cached, JSON.stringify(song));
  writeFileSync(byKey, JSON.stringify(song));
  return song;
}

export interface SongSearchHit {
  key: string;
  title: string;
  artist: string;
  mapper: string;
  bpm: number;
  durationSec: number;
  upvotes: number;
  /** 0 to 1 */
  rating: number;
  difficulties: string[];
  cover: string;
  preview: string;
}

/** Search BeatSaver's maps that can be played (Standard charts), best rated first when there is no text */
export async function searchSongs(q: string, page: number): Promise<{ hits: SongSearchHit[]; more: boolean }> {
  const params = new URLSearchParams({ q, sortOrder: q ? 'Relevance' : 'Rating' });
  const res = await fetch(`${API}/search/text/${page}?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`BeatSaver answered ${res.status}`);
  const data = await res.json();
  const docs: any[] = data.docs ?? [];
  const hits = docs
    .map((m): SongSearchHit | null => {
      const v = m.versions?.[0];
      const diffs = (v?.diffs ?? []).filter((d: any) => d.characteristic === 'Standard').map((d: any) => String(d.difficulty));
      if (!v || !diffs.length) return null;
      return {
        key: String(m.id),
        title: String(m.metadata?.songName ?? m.name ?? ''),
        artist: String(m.metadata?.songAuthorName ?? ''),
        mapper: String(m.metadata?.levelAuthorName ?? m.uploader?.name ?? ''),
        bpm: Math.round(Number(m.metadata?.bpm) || 0),
        durationSec: Number(m.metadata?.duration) || 0,
        upvotes: Number(m.stats?.upvotes) || 0,
        rating: Number(m.stats?.score) || 0,
        difficulties: BS_DIFFICULTIES.filter((d) => diffs.includes(d)),
        cover: String(v.coverURL ?? ''),
        preview: String(v.previewURL ?? ''),
      };
    })
    .filter((h): h is SongSearchHit => !!h);
  return { hits, more: docs.length >= 20 };
}
