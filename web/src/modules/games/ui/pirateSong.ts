import { audioContext } from '../../soundboard/player.ts';
import { loadPirateSound } from './pirateSound.ts';

/** The song fades in over this long from its start */
const FADE_IN_SEC = 9;
/** And out over this long when the race ends */
export const FADE_OUT_SEC = 3;

/**
 * A race song played once, from its very start, in step with the drum: its beat 0 falls on drum beat
 * `first`, and song beat k on drum beat first + k. Between two drum beats the song plays at the speed that
 * brings its next beat exactly onto the next drum beat, so when the drum speeds up or slows down the
 * singing follows (a little higher or lower, like a record). It fades in, and ends with its file.
 */
export class SongOnBeats {
  private src: AudioBufferSourceNode | null = null;
  private out: GainNode | null = null;
  private lastBeat = -1;
  private stopped = false;

  constructor(
    readonly url: string,
    private readonly song: number[],
    private readonly volume: number,
    readonly first: number,
  ) {
    void loadPirateSound(url);
  }

  private gap(k: number): number {
    return this.song[k + 1] - this.song[k];
  }

  /**
   * Called with the drum's beats as they become known (`time`: audio clock). Starts the song from its
   * beginning so that its beat 0 lands on its drum beat (or, when that is already past, from the next
   * beat to come), then sets its speed for each beat.
   */
  async beats(list: { i: number; time: number }[]): Promise<void> {
    if (this.stopped) return;
    const buffer = await loadPirateSound(this.url);
    if (!buffer || this.stopped) return;
    const ac = audioContext();
    const target = Math.max(0, Math.min(1, this.volume / 100));
    for (let n = 0; n + 1 < list.length; n++) {
      const b = list[n];
      const next = list[n + 1];
      const k = b.i - this.first;
      if (b.i <= this.lastBeat || next.i !== b.i + 1 || k < 0 || k + 1 >= this.song.length) continue;
      const rate = Math.min(2, Math.max(0.5, this.gap(k) / Math.max(0.05, next.time - b.time)));
      if (!this.src) {
        // From the very start of the file when there is time, else from this beat on
        const fromStart = k === 0 ? b.time - this.song[0] / rate : -1;
        const late = fromStart < ac.currentTime + 0.05;
        if (late && b.time < ac.currentTime + 0.05) continue;
        const when = late ? b.time : fromStart;
        const out = ac.createGain();
        out.gain.setValueAtTime(0.0001, when);
        out.gain.linearRampToValueAtTime(target, when + (late ? 0.8 : FADE_IN_SEC));
        out.connect(ac.destination);
        const src = ac.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.setValueAtTime(rate, when);
        src.connect(out);
        src.start(when, late ? this.song[k] : 0);
        src.onended = () => out.disconnect();
        this.src = src;
        this.out = out;
      }
      this.src.playbackRate.setValueAtTime(rate, b.time);
      this.lastBeat = b.i;
    }
  }

  /** The song's own timing, all its beats, beat 0 at `t0`: to try it at its own pace */
  ownBeats(t0: number): { i: number; time: number }[] {
    return this.song.map((s, k) => ({ i: this.first + k, time: t0 + s - this.song[0] }));
  }

  /** Fades out and stops */
  stop(fadeSec = FADE_OUT_SEC): void {
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
    try {
      src.stop(now + fadeSec + 0.05);
    } catch {
      // already over
    }
  }
}
