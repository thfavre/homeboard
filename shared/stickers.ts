export interface StickerDef {
  id: string;
  name: string;
  /** 'face': the guest's own selfie */
  kind: 'image' | 'face';
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
