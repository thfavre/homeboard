import { hb, storageGet, storageSet } from '$lib/client.svelte.ts';
import { isLockedSlot, isSecretSlot, type Slot } from '$shared/wardrobe.ts';

/**
 * The slots that open by buying (the locked ones, the secret costumes) are marked "New" in the
 * shop and the wardrobe from the moment they open until the guest first opens them. What was seen
 * is kept on the phone, per guest.
 */
const KEY = 'hb.world.seenSlots';

function read(): { id: string; seen: Slot[] } | null {
  try {
    const v = JSON.parse(storageGet(KEY) ?? 'null');
    return v && Array.isArray(v.seen) ? v : null;
  } catch {
    return null;
  }
}

const saved = read();
let seen = $state<{ id: string; seen: Slot[] }>(saved ?? { id: '', seen: [] });

/** Seen by this guest (another guest on the same phone starts over) */
function seenNow(): Slot[] {
  return seen.id === hb.me?.id ? seen.seen : [];
}

/** An open slot that opened by buying and was never opened since */
export function isNewSlot(slot: Slot, open: readonly Slot[]): boolean {
  return (isLockedSlot(slot) || isSecretSlot(slot)) && open.includes(slot) && !seenNow().includes(slot);
}

/** The guest opened this slot: no longer new */
export function markSlotSeen(slot: Slot): void {
  if (!isLockedSlot(slot) && !isSecretSlot(slot)) return;
  const id = hb.me?.id ?? '';
  const list = seenNow();
  if (list.includes(slot)) return;
  seen = { id, seen: [...list, slot] };
  storageSet(KEY, JSON.stringify(seen));
}
