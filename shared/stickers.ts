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
}
