import type { ClientModule } from './types.ts';
import { enabled } from '$lib/client.svelte.ts';
import core from './core/index.ts';
import spotify from './spotify/index.ts';
import canvas from './canvas/index.ts';
import stickers from './stickers/index.ts';
import photos from './photos/index.ts';
import wled from './wled/index.ts';
import soundboard from './soundboard/index.ts';

/**
 * Client side of every module. Keep the ids in sync with server/modules/index.ts.
 */
export const clientModules: ClientModule[] = [core, spotify, canvas, stickers, photos, wled, soundboard];

export function activeModules(): ClientModule[] {
  return clientModules.filter((m) => m.id === 'core' || enabled(m.id));
}

export function moduleById(id: string | null | undefined): ClientModule | undefined {
  return clientModules.find((m) => m.id === id);
}
