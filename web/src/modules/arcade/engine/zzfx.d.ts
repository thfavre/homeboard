// ZzFX ships without types: the little the Arcade uses of it
declare module 'zzfx' {
  export const ZZFX: { audioContext: AudioContext; volume: number };
  export function zzfx(...parameters: number[]): AudioBufferSourceNode;
}
