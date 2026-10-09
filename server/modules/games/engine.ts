import type { Role } from '../../../shared/protocol.ts';
import type { Song } from './beatsaver.ts';
import type { CircleDrawing, GameColor, GameMode, GamePlayer, GamesSettings, MatchResultLine, PirateCrewDeal, RhythmDifficulty } from '../../../shared/games.ts';

/** How a game ended. The match pays out from it. */
export interface Outcome {
  /** Winners (several = tie, the pot is split). Empty: nobody won, stakes go back. */
  winners: string[];
  /** Every player, best first */
  lines: MatchResultLine[];
  headline?: string;
  /** A prize for the winner when there is only one (see Perk) */
  perk?: { kind: 'lights' } | { kind: 'scratch'; drawing: CircleDrawing } | { kind: 'fireworks' };
  /**
   * Custom payout instead of "winners share the pot" (amounts credited per guest id).
   * Room rewards are not added then.
   */
  payouts?: Record<string, number>;
  /** Points per player, kept as their best on the game's leaderboard (Rhythm Rain on a song) */
  scores?: Record<string, number>;
}

/** Rhythm Rain: number of colors, difficulty (a chart name) and song key */
export interface MatchOptions {
  /** Pirate Race: crews dealt on the rules screen */
  crews?: PirateCrewDeal[];
  colors?: number;
  chart?: RhythmDifficulty;
  song?: string;
}

/** What a game gets from the match it runs in */
export interface MatchApi {
  readonly players: GamePlayer[];
  readonly mode: GameMode;
  readonly stake: number;
  readonly pot: number;
  /** Host settings when the game started */
  readonly settings: GamesSettings;
  /** Chosen with the challenge (Rhythm Rain: colors, difficulty and song) */
  readonly options: MatchOptions;
  /** The Rhythm Rain song picked with the challenge, loaded (url: where the TV gets the audio) */
  readonly song: (Song & { url: string }) | null;
  /** Show a color on the lights (and on the TV). null: dark. */
  light(color: GameColor | null): void;
  readonly lightColor: GameColor | null;
  /** Deadline shown as a countdown on every screen (null: none) */
  deadline(ms: number | null): void;
  /** setTimeout that is cancelled when the match ends */
  later(ms: number, fn: () => void): void;
  /** setInterval, stopped when the match closes or by calling the returned function */
  every(ms: number, fn: () => void): () => void;
  /** A WLED light to draw live pixels on (null: unknown or offline) */
  strip(deviceId: string): { leds: number; send(rgb: Uint8Array): void } | null;
  /** Every WLED light online, to draw live pixels on */
  strips(): { id: string; leds: number; send(rgb: Uint8Array): void }[];
  /** One-off event to the TV that plays the sound */
  sound(name: string, data: unknown): void;
  publish(): void;
  finish(outcome: Outcome): void;
  /** Earn rule amount (0 when the economy is off) */
  reward(key: string): number;
}

export interface GameRuntime {
  start(): void;
  /** A player acts. Throw HbError to refuse. The return value goes back to that phone. */
  input(playerId: string, args: any): unknown;
  /** The TV answers something (Rhythm Rain: the song is ready to play) */
  tvInput?(args: any): void;
  /** Public game state; the TV may see more than the phones */
  view(role: Role): unknown;
}

export type GameFactory = (m: MatchApi) => GameRuntime;

export function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ids of the best players by a score (ties included). Empty when nobody has a score. */
export function best(players: GamePlayer[], score: (id: string) => number | null, higherIsBetter = true): string[] {
  const scored = players.map((p) => ({ id: p.id, s: score(p.id) })).filter((x): x is { id: string; s: number } => x.s !== null);
  if (!scored.length) return [];
  const top = higherIsBetter ? Math.max(...scored.map((x) => x.s)) : Math.min(...scored.map((x) => x.s));
  return scored.filter((x) => x.s === top).map((x) => x.id);
}
