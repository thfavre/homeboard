/** Built-in vector stickers, drawn by web/src/modules/stickers/BuiltinSticker.svelte */
export const BUILTIN_STICKERS = [
  { id: 'star', name: 'Star' },
  { id: 'heart', name: 'Heart' },
  { id: 'bolt', name: 'Bolt' },
  { id: 'crown', name: 'Crown' },
  { id: 'flame', name: 'Flame' },
  { id: 'note', name: 'Music' },
  { id: 'disco', name: 'Disco ball' },
  { id: 'sparkle', name: 'Sparkle' },
  { id: 'smile', name: 'Smile' },
  { id: 'wow', name: 'Wow' },
  { id: 'gg', name: 'GG' },
  { id: 'cheers', name: 'Cheers' },
] as const;

export interface StickerDef {
  id: string;
  name: string;
  /** 'face': the guest's own selfie */
  kind: 'builtin' | 'image' | 'face';
  /** Image URL for uploaded stickers */
  src?: string;
  /** Made by the guest who sent it (the host can delete it from their collection) */
  guestMade?: boolean;
}

export interface ActiveSticker {
  id: string;
  /** Catalog sticker, or null for a text sticker */
  sticker: StickerDef | null;
  text?: string;
  guest: { id?: string; name: string; color: string };
  until: number;
}

export interface StickersState {
  catalog: StickerDef[];
  active: ActiveSticker[];
  durationSec: number;
  /** 0 = no limit */
  maxActive: number;
  allowText: boolean;
  /** Guests can make their own stickers (from an image, a photo or a drawing) */
  allowCustom: boolean;
}

/** A sticker a guest made, kept in their own collection ("My stickers") */
export interface GuestSticker {
  id: string;
  name: string;
  src: string;
}

/** How many stickers a guest can keep */
export const MAX_GUEST_STICKERS = 24;
