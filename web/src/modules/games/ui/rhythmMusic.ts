import { serverNow } from '$lib/client.svelte.ts';
import { audioContext } from '../../soundboard/player.ts';

/** Songs decoded ahead (the rules screen gives the time): a few seconds of decoding would delay the start */
const decoded = new Map<string, Promise<AudioBuffer>>();

export function preloadMusic(url: string): Promise<AudioBuffer> {
  let p = decoded.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Song not found (${r.status})`);
        return r.arrayBuffer();
      })
      .then((b) => audioContext().decodeAudioData(b));
    p.catch(() => decoded.delete(url));
    decoded.set(url, p);
  }
  return p;
}

export interface MusicCue {
  url: string;
  /** Server time when the song must be at `offsetMs` */
  at: number;
  offsetMs: number;
  durationMs: number;
  /** Start this much earlier (the host's correction for a TV that plays its sound late) */
  earlyMs?: number;
}

const VOLUME = 0.9;
let playing: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

/**
 * Play the song in time with the notes on the light: at server time `at` it is at `offsetMs`.
 * Started late (still decoding), it jumps ahead to where the song should be.
 */
export async function playMusic(cue: MusicCue): Promise<void> {
  stopMusic(0);
  const buffer = await preloadMusic(cue.url);
  const ac = audioContext();
  if (ac.state !== 'running') await ac.resume().catch(() => {});
  // What leaves the speakers now was scheduled this long ago
  const latencyMs = ((ac as AudioContext & { outputLatency?: number }).outputLatency || ac.baseLatency || 0) * 1000;
  const inMs = cue.at - serverNow() - latencyMs - (cue.earlyMs ?? 0);
  const late = Math.max(0, -inMs);
  const left = cue.durationMs - late;
  if (left <= 300) return;
  const when = ac.currentTime + Math.max(0, inMs) / 1000;
  const end = when + left / 1000;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(VOLUME, when + 0.25);
  gain.gain.setValueAtTime(VOLUME, Math.max(when + 0.25, end - 1.5));
  gain.gain.linearRampToValueAtTime(0, end);
  src.connect(gain).connect(ac.destination);
  src.start(when, (cue.offsetMs + late) / 1000);
  src.stop(end + 0.05);
  playing = { src, gain };
  src.onended = () => {
    if (playing?.src === src) playing = null;
  };
}

/** Fade the song out (the game was stopped or ended early) */
export function stopMusic(fadeMs = 800): void {
  const p = playing;
  if (!p) return;
  playing = null;
  const ac = audioContext();
  const t = ac.currentTime;
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setValueAtTime(p.gain.gain.value, t);
  p.gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
  try {
    p.src.stop(t + fadeMs / 1000 + 0.05);
  } catch {
    // already stopped
  }
}
