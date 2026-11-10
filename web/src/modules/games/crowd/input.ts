import { rpc } from '$lib/client.svelte.ts';

/** Send something to the game; the answer comes back (or null when it could not be sent) */
export const play = <T = unknown>(args: Record<string, unknown>): Promise<T | null> => rpc<T>('games', 'play', args).catch(() => null);

/**
 * A stick sent to the server at most every 50 ms while it moves (the latest position wins), and at once
 * when it is let go, so the crosshair stops where the thumb lifted.
 */
export function stickSender(t: 'aim' | 'move') {
  let pending: { x: number; y: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = 0;
  const flush = () => {
    timer = null;
    if (!pending) return;
    last = Date.now();
    void play({ t, x: Math.round(pending.x * 100) / 100, y: Math.round(pending.y * 100) / 100 });
    pending = null;
  };
  return (x: number, y: number) => {
    pending = { x, y };
    if (x === 0 && y === 0) {
      if (timer) clearTimeout(timer);
      flush();
      return;
    }
    if (!timer) timer = setTimeout(flush, Math.max(0, 50 - (Date.now() - last)));
  };
}
