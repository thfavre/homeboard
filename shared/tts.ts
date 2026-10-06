export type TtsPricingMode = 'flat' | 'per_char';

export type TtsLang = 'en' | 'fr';

export const TTS_LANGS: { id: TtsLang; label: string; bcp47: string }[] = [
  { id: 'en', label: 'English', bcp47: 'en-US' },
  { id: 'fr', label: 'Français', bcp47: 'fr-FR' },
];

export const ttsLang = (id: unknown) => TTS_LANGS.find((l) => l.id === id);

/** Rough speaking time of a text, at about 12 characters per second */
export const ttsSpeechMs = (text: string) => Math.round((text.length / 12) * 1000);

export interface TtsSettings {
  volume: number;
  pricingMode: TtsPricingMode;
  maxLength: number;
  cooldownSec: number;
  /** Language used when the guest does not pick one */
  defaultLang: TtsLang;
}

export interface TtsState {
  volume: number;
  pricingMode: TtsPricingMode;
  flatPrice: number;
  pricePerChar: number;
  maxLength: number;
  /** Pause between two shoutouts, in seconds */
  cooldownSec: number;
  /** Shoutouts playing or waiting in line */
  waiting: number;
  defaultLang: TtsLang;
  /** Languages the TV can speak, as reported by the TV (null: no TV has reported yet) */
  tvLangs: TtsLang[] | null;
}

export interface TtsGuestRef {
  id: string;
  name: string;
  color: string;
  avatar?: string;
}

export interface TtsEvent {
  id: string;
  text: string;
  volume: number;
  lang: TtsLang;
  by: string;
  anonymous?: boolean;
  guest?: TtsGuestRef;
  /** Guests named in the text: their pictures hop at the end of the banner */
  mentions?: TtsGuestRef[];
  durationMs: number;
}
