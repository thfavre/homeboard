import { hb, serverNow } from '$lib/client.svelte.ts';

const clock = $state({ now: serverNow() });
setInterval(() => (clock.now = serverNow()), 1000);

/** Passive income timer: how far the guest is towards the next payout (null when it is off) */
export function passiveTimer(): { progress: number; remainingMs: number } | null {
  const ms = hb.core?.passiveMs ?? 0;
  if (!ms || !hb.me || !hb.core?.economyEnabled) return null;
  const elapsed = Math.min(ms, Math.max(0, clock.now - hb.me.passiveSince));
  return { progress: elapsed / ms, remainingMs: ms - elapsed };
}
