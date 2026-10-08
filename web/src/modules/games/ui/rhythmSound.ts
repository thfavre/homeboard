import type { RhythmGrade } from '$shared/games.ts';
import { audioContext } from '../../soundboard/player.ts';

/** One note of a pentatonic scale per fret (C5 D5 E5 G5): any run of hits sounds like a tune */
const LANE_HZ = [523.25, 587.33, 659.25, 783.99];

/**
 * Rhythm Rain feedback, made on the fly (no file to load, nothing to allow: the tap itself unlocks
 * the sound on a phone). Hits pluck the fret's note, brighter the better; a miss is a low dull thud.
 * `pan`: -1 left to 1 right, so each player of a duel has a side on the TV.
 */
export function rhythmSound(grade: RhythmGrade, lane: number, pan = 0, volume = 0.5): void {
  const ac = audioContext();
  if (ac.state !== 'running') void ac.resume().catch(() => {});
  const t = ac.currentTime + 0.005;
  const out = ac.createGain();
  out.gain.value = volume;
  const panner = ac.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  out.connect(panner).connect(ac.destination);

  const tone = (type: OscillatorType, hz: number, start: number, length: number, level: number, slideTo?: number) => {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + length);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(level, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(env).connect(out);
    osc.start(start);
    osc.stop(start + length + 0.02);
  };

  const hz = LANE_HZ[lane] ?? LANE_HZ[0];
  if (grade === 'perfect') {
    tone('triangle', hz, t, 0.32, 0.9);
    tone('sine', hz * 2, t, 0.22, 0.35);
    // A little sparkle on top
    tone('sine', hz * 3, t + 0.05, 0.16, 0.25);
  } else if (grade === 'good') {
    tone('triangle', hz, t, 0.26, 0.75);
    tone('sine', hz * 2, t, 0.12, 0.15);
  } else if (grade === 'ok') {
    // Same note, an octave lower and a bit sour
    tone('triangle', hz / 2, t, 0.2, 0.6);
    tone('sawtooth', (hz / 2) * 1.03, t, 0.12, 0.08);
  } else {
    tone('square', 140, t, 0.16, 0.25, 70);
    tone('sine', 90, t, 0.18, 0.5, 50);
  }
  setTimeout(() => panner.disconnect(), 800);
}
