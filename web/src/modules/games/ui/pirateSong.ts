import { songLoop } from '$shared/games.ts';
import { audioContext } from '../../soundboard/player.ts';
import { loadPirateSound } from './pirateSound.ts';

/**
 * A race song played in step with the drum. Drum beat i is song beat i (song beats loop on whole
 * phrases). Between two drum beats the song plays at the speed that brings its next beat exactly onto the
 * next drum beat, so when the drum speeds up or slows down the singing follows (a little higher or lower,
 * like a record).
 */
export class SongOnBeats {
  private src: AudioBufferSourceNode | null = null;
  private out: GainNode | null = null;
  private lastBeat = -1;
  private stopped = false;
  private readonly loop: number;

  constructor(
    readonly url: string,
    private readonly song: number[],
    private readonly volume: number,
  ) {
    this.loop = songLoop(song);
    void loadPirateSound(url);
  }

  /** Where song beat i is in the file, and how long until the next one (seconds) */
  private pos(i: number): number {
    return this.song[((i % this.loop) + this.loop) % this.loop];
  }
  private gap(i: number): number {
    const k = ((i % this.loop) + this.loop) % this.loop;
    return this.song[k + 1] - this.song[k];
  }

  /**
   * Called with the drum's beats as they become known (`time`: audio clock). Starts the song on the next
   * beat it can, then sets its speed for each beat.
   */
  async beats(list: { i: number; time: number }[]): Promise<void> {
    if (this.stopped) return;
    const buffer = await loadPirateSound(this.url);
    if (!buffer || this.stopped) return;
    const ac = audioContext();
    for (let k = 0; k + 1 < list.length; k++) {
      const b = list[k];
      const next = list[k + 1];
      if (b.i <= this.lastBeat || next.i !== b.i + 1 || b.i < 0) continue;
      const rate = Math.min(2, Math.max(0.5, this.gap(b.i) / Math.max(0.05, next.time - b.time)));
      if (!this.src) {
        // Starts on a beat still to come
        if (b.time < ac.currentTime + 0.05) continue;
        const out = ac.createGain();
        out.gain.value = Math.max(0, Math.min(1, this.volume / 100));
        out.connect(ac.destination);
        const src = ac.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.loopStart = this.song[0];
        src.loopEnd = this.song[this.loop];
        src.playbackRate.setValueAtTime(rate, b.time);
        src.connect(out);
        src.start(b.time, this.pos(b.i));
        this.src = src;
        this.out = out;
      } else {
        this.src.playbackRate.setValueAtTime(rate, b.time);
      }
      this.lastBeat = b.i;
    }
  }

  /** The song's own timing from beat 0, `count` beats: for trying it at its own pace */
  ownBeats(t0: number, count: number): { i: number; time: number }[] {
    const out = [{ i: 0, time: t0 }];
    for (let i = 1; i <= count; i++) out.push({ i, time: out[i - 1].time + this.gap(i - 1) });
    return out;
  }

  /** Fades out and stops */
  stop(fadeSec = 1.5): void {
    this.stopped = true;
    const { src, out } = this;
    this.src = null;
    this.out = null;
    if (!src || !out) return;
    const ac = audioContext();
    const now = ac.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    src.stop(now + fadeSec + 0.05);
    src.onended = () => out.disconnect();
  }
}
