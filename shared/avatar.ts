/** Head effects a guest can apply to their selfie (rendered on the phone, see web/src/lib/avatar/render.ts) */
export const AVATAR_EFFECTS = [
  { id: 'none', name: 'Normal' },
  { id: 'bulge', name: 'Big head' },
  { id: 'pinch', name: 'Tiny head' },
  { id: 'swirl', name: 'Swirl' },
  { id: 'tall', name: 'Long face' },
  { id: 'wide', name: 'Wide face' },
  { id: 'wave', name: 'Wavy' },
  { id: 'pixel', name: 'Pixel' },
  { id: 'mirror', name: 'Mirror' },
] as const;

export type AvatarEffect = (typeof AVATAR_EFFECTS)[number]['id'];

/**
 * Emoji a guest can put on their picture. They are drawn into the image on the phone,
 * so the result looks the same on every screen.
 */
export const AVATAR_EMOJI = [
  '🥸', '🤪', '🤯', '🥳', '😎',
  '👑', '🎩', '🧢', '🎓', '🪖', '👒', '⛑️', '🍄', '🎧',
  '🕶️', '👓', '🥽', '🤿', '🎭', '🧿', '👁️', '👀',
  '👃', '👂', '👄', '👅', '🫦', '🦷', '🥨', '🔴', '🍓', '🥕',
  '💧', '💦', '💢', '💤', '💫', '💨', '🩹',
  '🎀', '👔', '🧣', '💍', '💎', '🌹', '🌸', '🌻', '🪶', '🦋', '🐝', '🍒', '🍭',
  '👽', '👾', '🤖', '👻', '💀', '🎃', '🤡', '💩',
  '🦄', '🐸', '🐙', '🦖', '🐧', '🦩', '🐼', '🦊', '🙈', '🦜', '🦀',
  '🍕', '🌮', '🍩', '🍉', '🥑', '🍦', '🌶️',
  '🎉', '🎈', '🪩', '🎸', '🎤', '🚀', '🛸', '🌈', '⚡', '🔥', '💥', '💯', '❤️', '💋',
];

/** Everything needed to re-render a selfie from the original photo */
export interface AvatarParams {
  effect: AvatarEffect;
  /** 0..1 */
  strength: number;
  /** Effect center, 0..1 of the picture */
  cx: number;
  cy: number;
  emoji: string | null;
  /** Emoji center, 0..1 */
  ex: number;
  ey: number;
  /** Emoji size, fraction of the picture width */
  esize: number;
  /** Emoji rotation, radians */
  erot: number;
}

export const DEFAULT_AVATAR_PARAMS: AvatarParams = {
  effect: 'none',
  strength: 0.6,
  cx: 0.5,
  cy: 0.45,
  emoji: null,
  ex: 0.72,
  ey: 0.25,
  esize: 0.3,
  erot: 0,
};
