export type TtsPricingMode = 'flat' | 'per_char';

export type TtsLang = 'en' | 'fr';

export const TTS_LANGS: { id: TtsLang; label: string; bcp47: string }[] = [
  { id: 'en', label: 'English', bcp47: 'en-US' },
  { id: 'fr', label: 'Français', bcp47: 'fr-FR' },
];

export type TtsStyle = 'normal' | 'chipmunk' | 'giant' | 'speedy' | 'sleepy';

/** Fun voices: the browser speech engine only lets us change pitch (0-2) and rate */
export const TTS_STYLES: { id: TtsStyle; label: string; hint: string; pitch: number; rate: number }[] = [
  { id: 'normal', label: 'Normal', hint: 'Plain voice', pitch: 1, rate: 1 },
  { id: 'chipmunk', label: 'Chipmunk', hint: 'Very high and fast', pitch: 2, rate: 1.45 },
  { id: 'giant', label: 'Giant', hint: 'Very low and slow', pitch: 0.1, rate: 0.75 },
  { id: 'speedy', label: 'Speedy', hint: 'Fast', pitch: 1.1, rate: 1.9 },
  { id: 'sleepy', label: 'Sleepy', hint: 'Slow and low', pitch: 0.55, rate: 0.6 },
];

export const ttsStyle = (id: unknown) => TTS_STYLES.find((s) => s.id === id) ?? TTS_STYLES[0];
export const ttsLang = (id: unknown) => TTS_LANGS.find((l) => l.id === id);

/** Rough speaking time of a text, at about 12 characters per second at normal speed */
export const ttsSpeechMs = (text: string, rate: number) => Math.round(((text.length / 12) * 1000) / rate);

export interface TtsSettings {
  volume: number;
  pricingMode: TtsPricingMode;
  maxLength: number;
  cooldownSec: number;
  /** Language used when the guest does not pick one */
  defaultLang: TtsLang;
  /** Guests can pick a fun voice */
  funnyVoices: boolean;
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
  funnyVoices: boolean;
  /** Languages the TV can speak, as reported by the TV (null: no TV has reported yet) */
  tvLangs: TtsLang[] | null;
}

export interface TtsEvent {
  id: string;
  text: string;
  volume: number;
  lang: TtsLang;
  style: TtsStyle;
  by: string;
  anonymous?: boolean;
  guest?: {
    id: string;
    name: string;
    color: string;
    avatar?: string;
  };
  durationMs: number;
}
