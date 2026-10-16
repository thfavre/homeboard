function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Each guest sees the list in their own order, the same every time: each item is ranked by a
 * hash of the guest's name and the item id, so adding an item keeps the rest in place
 */
export function guestOrder<T extends { id: string }>(items: T[], guestName: string | undefined): T[] {
  const key = (guestName ?? '').trim().toLowerCase();
  return items
    .map((item) => ({ item, rank: hash(`${key}|${item.id}`) }))
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.item);
}
