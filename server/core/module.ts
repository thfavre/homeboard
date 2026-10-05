import type { EventEmitter } from 'node:events';
import type { Request, Router } from 'express';
import type { Role, ToastMessage } from '../../shared/protocol.ts';
import type { EarnDef, Economy, PriceDef } from './economy.ts';
import type { Guest, Session } from './session.ts';
import type { Hub } from './hub.ts';

/**
 * 'tv-audio' reaches only one TV window (the most recently opened), so a sound or a
 * shoutout is never played twice when two TV windows are open.
 */
export type Target = Role | 'all' | 'tv-audio' | { guest: string };

export type GuestHandler = (args: any, guest: Guest) => unknown | Promise<unknown>;
export interface Caller {
  /** True when the request comes from this PC (not through the tunnel or LAN) */
  local: boolean;
}

export type Handler = (args: any, caller: Caller) => unknown | Promise<unknown>;

/**
 * Everything a module needs to plug into Homeboard.
 * A module never talks to sockets or the filesystem layout directly: it goes through this context.
 */
export interface ModuleContext<S extends object = Record<string, never>> {
  readonly id: string;
  /** Escape hatch for core-level modules. Feature modules should not need it. */
  readonly hub: Hub;
  readonly log: { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };
  readonly session: Session;
  readonly economy: Economy;
  /** Cross-module event bus */
  readonly bus: EventEmitter;

  /** Persistent settings of this module (defaults come from the module definition) */
  settings: { get(): S; update(patch: Partial<S>): S };
  enabled(): boolean;

  /** Folder for files that survive restarts (data/modules/<id>) */
  dataDir: string;
  /** Folder served publicly under /media/<id>/<sub> */
  mediaDir(sub?: string): string;
  mediaUrl(file: string): string;
  /** Express router mounted at /api/m/<id> */
  http: Router;
  guestFromRequest(req: Request): Guest | undefined;
  isAdminRequest(req: Request): boolean;

  /** Register what each role sees. Return undefined to send nothing to that role. */
  state(provider: (role: Role) => unknown): void;
  /** Re-send this module's state to everyone (throttled) */
  publish(): void;
  /** Send a one-off event */
  emit(to: Target, name: string, data?: unknown): void;

  onGuest(method: string, handler: GuestHandler): void;
  onAdmin(method: string, handler: Handler): void;
  onTv(method: string, handler: Handler): void;

  price(def: PriceDef): void;
  earn(def: EarnDef): void;

  /**
   * Add a line to the activity feed. Write `{name}` where the guest's name goes:
   * it becomes "Someone" when the host hides names. `sensitive` lines are not shown at all then.
   */
  activity(text: string, opts?: { guest?: Guest; amount?: number; sensitive?: boolean }): void;
  toast(guest: Guest, msg: ToastMessage): void;

  onSessionReset(fn: () => void): void;
  onToggle(fn: (enabled: boolean) => void): void;
  onGuestJoined(fn: (guest: Guest) => void): void;
  /** Called (and awaited) when the server stops */
  onShutdown(fn: () => void | Promise<void>): void;

  /** Share an API with other modules, and use theirs */
  provide<T>(name: string, api: T): void;
  use<T>(name: string): T | undefined;

  /** Full-screen takeover of the TV and guest phones (games) */
  takeover: { start(): void; stop(): void; readonly active: boolean };
}

export interface ModuleDef<S extends object = Record<string, never>> {
  id: string;
  name: string;
  description: string;
  /** Can the admin turn it on and off (default true) */
  toggleable?: boolean;
  defaultEnabled?: boolean;
  /** Default persistent settings */
  settings?: S;
  setup(ctx: ModuleContext<S>): void | Promise<void>;
}

export function defineModule<S extends object = Record<string, never>>(def: ModuleDef<S>): ModuleDef<S> {
  return def;
}
