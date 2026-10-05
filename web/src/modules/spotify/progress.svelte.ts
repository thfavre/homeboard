import type { NowPlaying } from '$shared/spotify.ts';

/** A clock that ticks while mounted, to animate progress bars between server updates */
export function ticker(ms = 500) {
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), ms);
    return () => clearInterval(t);
  });
  return {
    get now() {
      return now;
    },
  };
}

export function progressOf(track: NowPlaying, now: number): number {
  const ms = track.isPlaying ? track.progressMs + (now - track.at) : track.progressMs;
  return Math.min(track.durationMs, Math.max(0, ms));
}
