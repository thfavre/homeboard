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

export const uid = (bytes = 12) => randomBytes(bytes).toString('base64url');

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
