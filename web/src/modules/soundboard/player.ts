import type { Sound } from '$shared/soundboard.ts';
import { SYNTHS } from './synth.ts';

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

export const audioBlocked = () => audioContext().state !== 'running';

export function unlockAudio(): Promise<void> {
  return audioContext().resume();
}

/**
 * Play a sound (synthesized or file) at the given volume (0-1). Resolves when it has finished.
 * A file is faded out and stopped after `maxSec` seconds when given.
 */
export async function playSound(sound: Sound, volume: number, maxSec?: number): Promise<void> {
  const ac = audioContext();
  if (ac.state !== 'running') await ac.resume().catch(() => {});
  if (sound.kind === 'synth') {
    const synth = SYNTHS[sound.id];
    if (!synth) return;
    const gain = ac.createGain();
    gain.gain.value = volume;
    gain.connect(ac.destination);
    const len = synth(ac, gain, ac.currentTime + 0.02);
    await new Promise((r) => setTimeout(r, len * 1000 + 50));
    setTimeout(() => gain.disconnect(), 1000);
    return;
  }
  if (!sound.src) return;
  const audio = new Audio(sound.src);
  audio.volume = volume;
  await new Promise<void>((resolve) => {
    let fade: ReturnType<typeof setInterval> | undefined;
    const limit = maxSec
      ? setTimeout(() => {
          fade = setInterval(() => {
            audio.volume = Math.max(0, audio.volume - volume / 10);
            if (audio.volume > 0) return;
            audio.pause();
            done();
          }, 50);
        }, maxSec * 1000)
      : undefined;
    const done = () => {
      clearTimeout(limit);
      clearInterval(fade);
      resolve();
    };
    audio.addEventListener('ended', done);
    audio.addEventListener('error', done);
    audio.play().catch(done);
  });
}
