export type TtsPricingMode = 'flat' | 'per_char';

export interface TtsSettings {
  volume: number;
  pricingMode: TtsPricingMode;
  maxLength: number;
  cooldownSec: number;
}

export interface TtsState {
  volume: number;
  pricingMode: TtsPricingMode;
  flatPrice: number;
  pricePerChar: number;
  maxLength: number;
  cooldownSec: number;
  cooldownUntil: number;
}

export interface TtsEvent {
  id: string;
  text: string;
  volume: number;
  by: string;
  guest: {
    id: string;
    name: string;
    color: string;
    avatar?: string;
  };
  durationMs: number;
}
