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

/** Play a sound (synthesized or file) at the given volume (0-1) */
export async function playSound(sound: Sound, volume: number): Promise<void> {
  const ac = audioContext();
  if (ac.state !== 'running') await ac.resume().catch(() => {});
  if (sound.kind === 'synth') {
    const synth = SYNTHS[sound.id];
    if (!synth) return;
    const gain = ac.createGain();
    gain.gain.value = volume;
    gain.connect(ac.destination);
    const len = synth(ac, gain, ac.currentTime + 0.02);
    setTimeout(() => gain.disconnect(), (len + 1) * 1000);
    return;
  }
  if (!sound.src) return;
  const audio = new Audio(sound.src);
  audio.volume = volume;
  await audio.play().catch(() => {});
}
