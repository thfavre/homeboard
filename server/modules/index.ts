import type { ModuleDef } from '../core/module.ts';
import core from './core/index.ts';
import spotify from './spotify/index.ts';
import canvas from './canvas/index.ts';
import stickers from './stickers/index.ts';
import photos from './photos/index.ts';
import wled from './wled/index.ts';
import soundboard from './soundboard/index.ts';
import quiz from './quiz/index.ts';
import tts from './tts/index.ts';

/**
 * All modules, in load order. To add a feature: create server/modules/<id>/index.ts
 * with defineModule(), add it here, and register its UI in web/src/modules/index.ts.
 */
export const modules: ModuleDef<any>[] = [core, spotify, canvas, stickers, photos, wled, soundboard, quiz, tts];

