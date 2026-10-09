import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  charts: Partial<Record<BsDifficulty, BsNote[]>>;
}

const API = 'https://api.beatsaver.com';
const json = (b: Buffer | undefined) => (b ? JSON.parse(b.toString('utf8').replace(/^﻿/, '')) : null);

/** A map key from what the host pasted: "747", or a link like https://beatsaver.com/maps/747 */
export function songKey(raw: string): string {
  const m = /([0-9a-f]{1,8})\/?$/i.exec(raw.trim());
  return m ? m[1].toLowerCase() : '';
}

/** Notes of a difficulty file, any map version (2, 3 or 4). Bombs are left out. */
function notesOf(map: any, bpm: number, offsetMs: number): BsNote[] {
  const ms = (beat: number) => Math.round(offsetMs + (beat * 60_000) / bpm);
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
  for (const l of levels) {
    if (!BS_DIFFICULTIES.includes(l.difficulty as BsDifficulty)) continue;
    const notes = notesOf(json(files.get(find(l.file) ?? '')), bpm, offsetMs);
    if (notes.length >= 20) charts[l.difficulty as BsDifficulty] = notes;
  }
  if (!Object.keys(charts).length) throw new Error('This map has no playable chart');
  return {
    info: {
      title: String((v4 ? info.song?.title : info._songName) ?? 'Song'),
      artist: String((v4 ? info.song?.author : info._songAuthorName) ?? ''),
      bpm,
      previewMs: Math.round((Number(v4 ? info.audio.previewStartTime : info._previewStartTime) || 0) * 1000),
      charts,
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

async function download(key: string, dir: string, byKey: string): Promise<Song> {
  const res = await fetch(`${API}/maps/id/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) throw new Error(`No BeatSaver map "${key}"`);
  if (!res.ok) throw new Error(`BeatSaver answered ${res.status}`);
  const meta = await res.json();
  const version = meta.versions?.[0];
  if (!version?.hash || !version.downloadURL) throw new Error('This map has no download');
  const hash = String(version.hash).toLowerCase();
  const cached = join(dir, `${hash}.json`);
  if (existsSync(cached)) {
    const song: Song = { ...JSON.parse(readFileSync(cached, 'utf8')), key };
    writeFileSync(byKey, JSON.stringify(song));
    return song;
  }
  const zip = await fetch(version.downloadURL, { signal: AbortSignal.timeout(60_000) });
  if (!zip.ok) throw new Error(`Download failed (${zip.status})`);
  const { info, audio } = parseMap(unzip(Buffer.from(await zip.arrayBuffer())));
  const song: Song = { ...info, key, hash, audio: `${hash}.ogg` };
  writeFileSync(join(dir, song.audio), audio);
  writeFileSync(cached, JSON.stringify(song));
  writeFileSync(byKey, JSON.stringify(song));
  return song;
}
