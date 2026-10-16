export interface StickerDef {
  id: string;
  name: string;
  /** 'face': the guest's own selfie */
  kind: 'image' | 'face';
  src?: string;
  /** Catalog stickers only. Most have no name and go by their category. */
  category?: string;
  /** Made by the guest who sent it (the host can delete it from their collection) */
  guestMade?: boolean;
}

export interface ActiveSticker {
  id: string;
  /** Catalog sticker, or null for a text sticker */
  sticker: StickerDef | null;
  text?: string;
  /** How a text sticker looks */
  textStyle?: TextStyle;
  guest: { id?: string; name: string; color: string };
  until: number;
}

export interface StickersState {
  /** Every catalog sticker, including the ones in hidden categories (for the host) */
  catalog: StickerDef[];
  /** Categories guests do not see */
  hiddenCategories: string[];
  active: ActiveSticker[];
  durationSec: number;
  /** 0 = no limit */
  maxActive: number;
  allowText: boolean;
  /** Guests can make their own stickers (from an image, a photo or a drawing) */
  allowCustom: boolean;
  /** How many stickers each guest can keep */
  maxPerGuest: number;
}

/** A sticker a guest made, kept in their own collection ("My stickers") */
export interface GuestSticker {
  id: string;
  name: string;
  src: string;
}

/** How many stickers a guest can keep, unless the host changes it */
export const DEFAULT_GUEST_STICKERS = 24;

/** What to call a sticker when it has no name of its own: "Pokemon sticker" */
export function stickerLabel(s: StickerDef): string {
  return s.name || (s.category ? `${s.category} sticker` : 'Sticker');
}

/** Catalog categories in collection order (the order the stickers were added) */
export function stickerCategories(catalog: StickerDef[]): string[] {
  return [...new Set(catalog.map((s) => s.category ?? ''))].filter(Boolean);
}

/** Looks a guest picks for a text sticker. The ids are stored; the web app draws them. */
export const TEXT_COLORS = [
  { id: 'party', label: 'Party', bg: 'var(--gradient)', fg: '#fff' },
  { id: 'fire', label: 'Fire', bg: 'linear-gradient(135deg, #ff3d3d, #ff9a1f)', fg: '#fff' },
  { id: 'ocean', label: 'Ocean', bg: 'linear-gradient(135deg, #1565ff, #2ed3ff)', fg: '#fff' },
  { id: 'mint', label: 'Mint', bg: 'linear-gradient(135deg, #0aa37f, #5cf2a0)', fg: '#fff' },
  { id: 'candy', label: 'Candy', bg: 'linear-gradient(135deg, #ff4fa3, #ffb3d9)', fg: '#fff' },
  { id: 'gold', label: 'Gold', bg: 'linear-gradient(135deg, #f7b500, #ffe066)', fg: '#3b2600' },
  { id: 'night', label: 'Night', bg: '#15151c', fg: '#fff' },
  { id: 'paper', label: 'Paper', bg: '#fff', fg: '#15151c', edge: '#15151c' },
] as const;

export const TEXT_FONTS = [
  { id: 'bold', label: 'Bold', family: 'var(--font-display)' },
  { id: 'marker', label: 'Marker', family: "'Permanent Marker', cursive" },
  { id: 'script', label: 'Script', family: "'Pacifico', cursive" },
  { id: 'block', label: 'Block', family: "'Bungee', sans-serif" },
  { id: 'pixel', label: 'Pixel', family: "'Press Start 2P', monospace" },
] as const;

export const TEXT_EFFECTS = [
  { id: 'none', label: 'None' },
  { id: 'spin', label: 'Spin' },
  { id: 'wobble', label: 'Wobble' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'shake', label: 'Shake' },
  { id: 'flip', label: 'Flip' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'glow', label: 'Glow' },
] as const;

export interface TextStyle {
  color: (typeof TEXT_COLORS)[number]['id'];
  font: (typeof TEXT_FONTS)[number]['id'];
  effect: (typeof TEXT_EFFECTS)[number]['id'];
}

export const DEFAULT_TEXT_STYLE: TextStyle = { color: 'party', font: 'bold', effect: 'none' };

/** Anything sent by a phone, made into a valid style */
export function cleanTextStyle(input: unknown): TextStyle {
  const s = (input ?? {}) as Record<string, unknown>;
  const pick = <T extends { id: string }>(list: readonly T[], v: unknown, d: string) => (list.find((x) => x.id === v) ?? list.find((x) => x.id === d)!).id;
  return {
    color: pick(TEXT_COLORS, s.color, DEFAULT_TEXT_STYLE.color) as TextStyle['color'],
    font: pick(TEXT_FONTS, s.font, DEFAULT_TEXT_STYLE.font) as TextStyle['font'],
    effect: pick(TEXT_EFFECTS, s.effect, DEFAULT_TEXT_STYLE.effect) as TextStyle['effect'],
  };
}
