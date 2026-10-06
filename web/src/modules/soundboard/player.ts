import type { Sound } from '$shared/soundboard.ts';

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
 * Play a sound file at the given volume (0-1). Resolves when it has finished.
 * It is faded out and stopped after `maxSec` seconds when given.
 */
export async function playSound(sound: Sound, volume: number, maxSec?: number): Promise<void> {
  const ac = audioContext();
  if (ac.state !== 'running') await ac.resume().catch(() => {});
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
