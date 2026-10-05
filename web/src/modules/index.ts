import type { ClientModule } from './types.ts';
import { enabled } from '$lib/client.svelte.ts';
import core from './core/index.ts';
import canvas from './canvas/index.ts';
import stickers from './stickers/index.ts';
import photos from './photos/index.ts';

/**
 * Client side of every module. Keep the ids in sync with server/modules/index.ts.
 */
export const clientModules: ClientModule[] = [core, canvas, stickers, photos];

export function activeModules(): ClientModule[] {
  return clientModules.filter((m) => m.id === 'core' || enabled(m.id));
}

export function moduleById(id: string | null | undefined): ClientModule | undefined {
  return clientModules.find((m) => m.id === id);
}
