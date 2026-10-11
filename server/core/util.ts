import { randomBytes, randomInt } from 'node:crypto';
import type { RpcErrorCode } from '../../shared/protocol.ts';

/** An error whose message is safe to show to the user */
export class HbError extends Error {
  /** Optional machine-readable reason the client can react to (see RpcErrorCode) */
  constructor(
    message: string,
    readonly code?: RpcErrorCode,
  ) {
    super(message);
  }
}

/** Exit code asking server/run.ts (bun run party) to build and start the server again */
export const RESTART_CODE = 75;

export const uid = (bytes = 12) => randomBytes(bytes).toString('base64url');

/** A password easy to read out and type: no 0/o or 1/l/i to mix up */
export function readablePassword(length = 12): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
}

export const sessionCode = () => String(randomInt(0, 10000)).padStart(4, '0');

/** Calls fn at most once per `ms`, always running the trailing call */
export function throttle(fn: () => void, ms: number): () => void {
  let timer: NodeJS.Timeout | null = null;
  let last = 0;
  return () => {
    if (timer) return;
    const wait = Math.max(0, last + ms - Date.now());
    timer = setTimeout(() => {
      timer = null;
      last = Date.now();
      fn();
    }, wait);
  };
}

export function debounce(fn: () => void, ms: number): () => void {
  let timer: NodeJS.Timeout | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

/**
 * Counts wrong guesses by key (an IP address) and locks the key for a while after too many.
 * Each lock lasts longer than the previous one, so guessing through every value takes forever.
 */
export class Attempts {
  private fails = new Map<string, { count: number; until: number; at: number }>();

  constructor(
    private readonly tries: number,
    private readonly lockMs: number,
  ) {}

  /** Milliseconds this key still has to wait (0: it may try) */
  wait(key: string): number {
    return Math.max(0, (this.fails.get(key)?.until ?? 0) - Date.now());
  }

  fail(key: string): void {
    const now = Date.now();
    this.prune(now);
    const count = (this.fails.get(key)?.count ?? 0) + 1;
    const locks = Math.floor(count / this.tries);
    this.fails.set(key, { count, until: count % this.tries === 0 ? now + this.lockMs * locks : 0, at: now });
  }

  succeed(key: string): void {
    this.fails.delete(key);
  }

  /** Forget keys that have been quiet for a day */
  private prune(now: number): void {
    if (this.fails.size < 1000) return;
    for (const [k, v] of this.fails) if (now - v.at > 86_400_000 && v.until < now) this.fails.delete(k);
  }
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recursively merges `override` into a copy of `base` (arrays are replaced, not merged) */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

export function cleanName(input: unknown, max = 20): string {
  return String(input ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const log = {
  info: (scope: string, ...args: unknown[]) => console.log(`[${scope}]`, ...args),
  warn: (scope: string, ...args: unknown[]) => console.warn(`[${scope}]`, ...args),
  error: (scope: string, ...args: unknown[]) => console.error(`[${scope}]`, ...args),
};
