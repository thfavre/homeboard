import type { CoinView, GamePlayer } from '$shared/games.ts';

const TICKS = 13;
const SLOWDOWN = 1.22;
/** Time the roulette stays on the thrower before the draw step ends */
const HOLD_MS = 1100;

/**
 * The roulette that picks who throws the coin: the highlight jumps between the players,
 * slowing down, and stops on the thrower. Computed from the server time so the TV and
 * the phones show the same player at the same moment.
 */
export function coinDraw(v: CoinView, players: GamePlayer[], now: number): { highlighted: string | null; settled: boolean } {
  if (v.step !== 'draw') return { highlighted: v.flipper, settled: true };
  if (!v.drawAt) return { highlighted: null, settled: false };
  const spin = v.drawMs - HOLD_MS;
  // Intervals grow by SLOWDOWN each tick and add up to `spin`
  const base = (spin * (SLOWDOWN - 1)) / (SLOWDOWN ** TICKS - 1);
  let t = now - v.drawAt;
  let tick = 0;
  while (tick < TICKS && t >= base * SLOWDOWN ** tick) {
    t -= base * SLOWDOWN ** tick;
    tick++;
  }
  const flipperIndex = Math.max(0, players.findIndex((p) => p.id === v.flipper));
  const index = (flipperIndex + TICKS - tick) % players.length;
  return { highlighted: players[index]?.id ?? null, settled: tick >= TICKS };
}
