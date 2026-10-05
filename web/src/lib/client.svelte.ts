import { io, type Socket } from 'socket.io-client';
import type {
  ActivityItem,
  CoreState,
  EventMessage,
  JoinResult,
  Me,
  Role,
  RpcResponse,
  StateMessage,
  ToastMessage,
  VisitorState,
} from '$shared/protocol.ts';

export interface Toast extends ToastMessage {
  id: number;
}

const STORAGE = {
  guestToken: 'hb.token',
  adminToken: 'hb.adminToken',
  lastName: 'hb.lastName',
};

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode: nothing persisted, the app still works
  }
}

/** Reactive client state shared by every component */
export const hb = $state({
  role: 'guest' as Role,
  connected: false,
  authError: false,
  core: null as CoreState | null,
  modules: {} as Record<string, any>,
  me: null as Me | null,
  visitor: null as VisitorState | null,
  needJoin: false,
  codeRequired: true,
  kickedReason: '',
  activity: [] as ActivityItem[],
  toasts: [] as Toast[],
});

let socket: Socket | null = null;
const listeners = new Map<string, Set<(data: any) => void>>();
let toastSeq = 0;

export function connect(role: Role): void {
  hb.role = role;
  socket = io({
    auth: authFor(role),
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 3000,
  });

  socket.on('connect', () => {
    hb.connected = true;
    hb.authError = false;
  });
  socket.on('disconnect', () => (hb.connected = false));
  socket.on('connect_error', (err) => {
    if (err.message === 'ADMIN_AUTH') hb.authError = true;
  });

  socket.on('state', (msg: StateMessage) => {
    if (msg.module === 'core') {
      hb.core = msg.data as CoreState;
      hb.activity = hb.core.activity;
    } else {
      hb.modules[msg.module] = msg.data;
    }
  });
  socket.on('event', (msg: EventMessage) => {
    listeners.get(`${msg.module}:${msg.name}`)?.forEach((fn) => fn(msg.data));
  });
  socket.on('activity', (item: ActivityItem) => {
    hb.activity = [item, ...hb.activity].slice(0, 40);
    listeners.get('core:activity')?.forEach((fn) => fn(item));
  });
  socket.on('toast', (msg: ToastMessage) => toast(msg));

  socket.on('me', (me: Me) => {
    hb.me = me;
    hb.needJoin = false;
  });
  socket.on('visitor', (v: VisitorState) => (hb.visitor = v));
  socket.on('need-join', (info: { codeRequired: boolean }) => {
    hb.needJoin = true;
    hb.codeRequired = info.codeRequired;
    hb.me = null;
  });
  socket.on('kicked', (info: { reason: string }) => {
    hb.kickedReason = info.reason;
    hb.me = null;
    hb.core = null;
    hb.modules = {};
    storageSet(STORAGE.guestToken, null);
    if (socket) socket.auth = authFor(hb.role);
  });
}

function authFor(role: Role): Record<string, unknown> {
  if (role === 'guest') return { role, token: storageGet(STORAGE.guestToken) };
  return { role, adminToken: storageGet(STORAGE.adminToken) };
}

/** Call a server method of a module. Rejects with a user-readable message. */
export function rpc<T = unknown>(module: string, method: string, args?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Not connected'));
    socket.timeout(15000).emit('rpc', { module, method, args }, (err: Error | null, res: RpcResponse<T>) => {
      if (err) reject(new Error('The server did not answer'));
      else if (res.ok) resolve(res.data);
      else reject(new Error(res.error));
    });
  });
}

/** Listen to a module event. Returns an unsubscribe function. */
export function onEvent<T = any>(module: string, name: string, fn: (data: T) => void): () => void {
  const key = `${module}:${name}`;
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

export function toast(msg: ToastMessage, ms = 3500): void {
  const t = { ...msg, id: ++toastSeq };
  hb.toasts = [...hb.toasts, t].slice(-4);
  setTimeout(() => (hb.toasts = hb.toasts.filter((x) => x.id !== t.id)), ms);
}

/** Run an action and show its error as a toast. Returns undefined on failure. */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const result = await fn();
    if (success) toast({ text: success, kind: 'success' });
    return result;
  } catch (err) {
    toast({ text: (err as Error).message, kind: 'error' }, 5000);
    return undefined;
  }
}

// ------------------------------------------------------------------ guest session

export async function join(args: { code: string; name: string; key?: string }): Promise<void> {
  const result = await rpc<JoinResult>('core', args.key ? 'rejoin' : 'join', args);
  storageSet(STORAGE.guestToken, result.token);
  storageSet(STORAGE.lastName, args.name);
  if (socket) socket.auth = authFor('guest');
  hb.kickedReason = '';
}

export const lastName = () => storageGet(STORAGE.lastName) ?? '';

// ------------------------------------------------------------------ admin session

export async function adminLogin(password: string): Promise<void> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Wrong password');
  setAdminToken((await res.json()).token);
}

export function setAdminToken(token: string): void {
  storageSet(STORAGE.adminToken, token);
  if (socket) {
    socket.auth = authFor(hb.role);
    socket.disconnect().connect();
  }
}

export function adminLogout(): void {
  storageSet(STORAGE.adminToken, null);
  location.reload();
}

// ------------------------------------------------------------------ uploads

/** POST a file to a module endpoint, authenticated as the current guest or admin */
export async function upload<T = unknown>(module: string, path: string, body: Blob, query: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(query).toString();
  const headers: Record<string, string> = { 'content-type': body.type || 'application/octet-stream' };
  const token = storageGet(hb.role === 'guest' ? STORAGE.guestToken : STORAGE.adminToken);
  if (token) headers[hb.role === 'guest' ? 'x-guest-token' : 'x-admin-token'] = token;
  const res = await fetch(`/api/m/${module}/${path}${qs ? `?${qs}` : ''}`, { method: 'POST', headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Upload failed');
  return data as T;
}

/** Shortcuts */
export const enabled = (id: string) => !!hb.core?.features.find((f) => f.id === id)?.enabled;
export const price = (key: string) => hb.core?.prices[key]?.amount ?? 0;
