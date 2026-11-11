import { rpc } from '$lib/client.svelte.ts';

/** Send something to the game; the answer comes back (or null when it could not be sent) */
export const play = <T = unknown>(args: Record<string, unknown>): Promise<T | null> => rpc<T>('games', 'play', args).catch(() => null);

/** How often a phone repeats what is held down: the server lets go of it when it stops hearing it */
export const HOLD_REPEAT_MS = 1000;

/**
 * A stick sent to the server at most every 50 ms while it moves (the latest position wins), at once when
 * it is let go (the crosshair stops where the thumb lifted), and again every second while it is held still
 * pushed, so the server knows the phone is still there.
 */
export function stickSender(t: 'aim' | 'move') {
  let pending: { x: number; y: number } | null = null;
  let held = { x: 0, y: 0 };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let repeat: ReturnType<typeof setInterval> | null = null;
  let last = 0;
  const send = (v: { x: number; y: number }) => {
    last = Date.now();
    void play({ t, x: Math.round(v.x * 100) / 100, y: Math.round(v.y * 100) / 100 });
  };
  const flush = () => {
    timer = null;
    if (!pending) return;
    send(pending);
    pending = null;
  };
  return (x: number, y: number) => {
    pending = { x, y };
    held = { x, y };
    if (x === 0 && y === 0) {
      if (timer) clearTimeout(timer);
      if (repeat) clearInterval(repeat);
      repeat = null;
      flush();
      return;
    }
    repeat ??= setInterval(() => {
      if (Date.now() - last >= HOLD_REPEAT_MS - 50) send(held);
    }, HOLD_REPEAT_MS);
    if (!timer) timer = setTimeout(flush, Math.max(0, 50 - (Date.now() - last)));
  };
}
