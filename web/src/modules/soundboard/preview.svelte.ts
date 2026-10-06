import type { MiSound } from '$shared/soundboard.ts';
import { rpc, attempt } from '$lib/client.svelte.ts';

/** Listen to a search result on this device. One sound at a time, shared by every ListenButton. */
export const preview = $state({ playing: null as string | null, fetching: null as string | null });

let audio: HTMLAudioElement | null = null;

export function stopPreview() {
  audio?.pause();
  audio = null;
  preview.playing = null;
}

export async function togglePreview(s: MiSound) {
  if (preview.playing === s.mp3) return stopPreview();
  stopPreview();
  preview.fetching = s.mp3;
  const url = await attempt(() => rpc<string>('soundboard', 'preview', { mp3: s.mp3 }));
  if (preview.fetching !== s.mp3) return;
  preview.fetching = null;
  if (!url) return;
  const self = (audio = new Audio(url));
  preview.playing = s.mp3;
  self.addEventListener('ended', () => audio === self && stopPreview());
  self.play().catch(() => audio === self && stopPreview());
}
