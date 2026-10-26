import { timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, statSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import express, { type Request } from 'express';
import { Server, type Socket } from 'socket.io';
import type {
  ActivityItem,
  Currency,
  BoardKind,
  BoardMode,
  PrivacySettings,
  Role,
  RpcRequest,
  RpcResponse,
  ToastMessage,
  NeedJoin,
  VisitorState,
} from '../../shared/protocol.ts';
import { BOARD_KINDS } from '../../shared/protocol.ts';
import { Economy } from './economy.ts';
import type { GuestHandler, Handler, ModuleContext, ModuleDef, Target } from './module.ts';
import { DATA_DIR, MEDIA_DIR, WEB_DIST, ensureDir } from './paths.ts';
import { Session, type Guest } from './session.ts';
import { Settings } from './settings.ts';
import { TunnelManager } from './tunnel.ts';
import { Attempts, HbError, log, readablePassword, throttle, uid } from './util.ts';

export interface CoreSettings {
  appName: string;
  theme: string;
  currency: Currency;
  economyEnabled: boolean;
  /** When the economy was last switched on: time away before that does not pay */
  economyOnSince: number;
  features: Record<string, boolean>;
  prices: Record<string, number>;
  earn: Record<string, number>;
  passiveMinutes: number;
  /** Passive income keeps going this many minutes while a guest is away (0 = only while online) */
  passiveAwayMinutes: number;
  /** The TV leaderboard: one board, or several taking turns (or none) */
  boardMode: BoardMode;
  boardOne: BoardKind;
  boardRotate: BoardKind[];
  /** Seconds each board stays on the TV */
  boardSeconds: number;
  /** A Rhythm Rain song gets its own board once this many guests played it (same difficulty and colors) */
  songBoardPlayers: number;
  privacy: PrivacySettings;
  qrIncludesCode: boolean;
  requireCode: boolean;
  adminPassword: string;
  adminTokens: string[];
  tunnel: boolean;
  /** Own domain: a named Cloudflare tunnel routed to it (empty: a quick tunnel with a random URL) */
  tunnelName: string;
  tunnelDomain: string;
}

const CORE_DEFAULTS: CoreSettings = {
  appName: 'Homeboard',
  theme: 'midnight',
  currency: { name: 'Sparks', symbol: 'SP' },
  economyEnabled: true,
  economyOnSince: 0,
  features: {},
  prices: {},
  earn: {},
  passiveMinutes: 5,
  passiveAwayMinutes: 60,
  boardMode: 'rotate',
  boardOne: 'balance',
  boardRotate: BOARD_KINDS.map((b) => b.kind),
  boardSeconds: 15,
  songBoardPlayers: 6,
  privacy: { activity: 'names', photoNames: true, stickerNames: true, songNames: true, effectNames: true },
  qrIncludesCode: true,
  requireCode: true,
  adminPassword: '',
  adminTokens: [],
  tunnel: true,
  tunnelName: '',
  tunnelDomain: '',
};

type VisitorHandler = (args: any, socket: Socket, bind: (guest: Guest) => void) => unknown | Promise<unknown>;

interface LoadedModule {
  def: ModuleDef<any>;
  ctx: ModuleContext<any>;
  provider?: (role: Role) => unknown;
  guest: Map<string, GuestHandler>;
  admin: Map<string, Handler>;
  tv: Map<string, Handler>;
  publish: () => void;
}

const ROLES: Role[] = ['guest', 'tv', 'admin'];

/** An activity line as stored: `{name}` is filled in for each audience */
interface StoredActivity {
  id: number;
  at: number;
  module: string;
  template: string;
  guest?: { id: string; name: string; color: string };
  amount?: number;
  sensitive?: boolean;
}
const RPC_PER_SECOND = 40;
const ACTIVITY_SIZE = 40;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The PC itself: a loopback connection asking for localhost, that no proxy forwarded.
 * cloudflared and Vite connect from loopback too: Cloudflare adds cf-connecting-ip, and the
 * Host header still names the public domain or the LAN address, so neither counts as local.
 */
function isLocal(address: string | undefined, headers: IncomingHttpHeaders): boolean {
  const host = String(headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  return (
    LOOPBACK.has(address ?? '') &&
    LOCAL_HOSTS.has(host) &&
    !headers['cf-connecting-ip'] &&
    !headers['x-forwarded-for']
  );
}

/** Who is really connecting: behind the tunnel (a loopback connection) the IP comes from Cloudflare */
export function clientIp(address: string | undefined, headers: IncomingHttpHeaders): string {
  if (!LOOPBACK.has(address ?? '')) return address ?? '';
  const cf = headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  const xff = headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || (address ?? '');
}

function samePassword(a: unknown, b: string): boolean {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The heart of Homeboard: owns the HTTP server, sockets, session, economy and modules,
 * and wires modules to clients through their ModuleContext.
 */
export class Hub {
  readonly settings = new Settings();
  readonly session = new Session();
  readonly economy: Economy;
  readonly bus = new EventEmitter();
  readonly tunnel = new TunnelManager();
  readonly app = express();
  readonly server = createServer(this.app);
  readonly io: Server;
  /** Wrong admin passwords by IP: 5 tries, then a lock that grows (1 min, 2 min, 3 min...) */
  private loginFails = new Attempts(5, 60_000);

  readonly activity: StoredActivity[] = [];
  takeover: string | null = null;

  private modules = new Map<string, LoadedModule>();
  private services = new Map<string, unknown>();
  private visitorHandlers = new Map<string, VisitorHandler>();
  private guestSockets = new Map<string, Set<Socket>>();
  private activitySeq = 0;
  /** Open TV windows, oldest first */
  private tvSockets: Socket[] = [];
  private shutdownHooks: { id: string; fn: () => void | Promise<void> }[] = [];

  constructor(readonly port: number) {
    this.bus.setMaxListeners(100);
    this.settings.register('core', CORE_DEFAULTS);
    if (!this.core.adminPassword) {
      this.settings.update<CoreSettings>('core', { adminPassword: readablePassword() });
    }
    this.economy = new Economy(this.settings, this.session);
    this.io = new Server(this.server, { maxHttpBufferSize: 2e6, pingInterval: 10000, pingTimeout: 8000 });

    this.app.disable('x-powered-by');
    // No other site may show these pages in a frame (and trick a click on the admin)
    this.app.use((_req, res, next) => {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    });
    // Avatars are sent as two small JPEGs in JSON
    this.app.use('/api', express.json({ limit: '4mb' }));
    this.app.post('/api/admin/login', (req, res) => {
      const ip = clientIp(req.socket.remoteAddress, req.headers);
      const wait = this.loginFails.wait(ip);
      if (wait > 0) {
        res.status(429).json({ error: `Too many wrong passwords. Try again in ${Math.ceil(wait / 1000)} s.` });
        return;
      }
      if (!samePassword(req.body?.password, this.core.adminPassword)) {
        this.loginFails.fail(ip);
        log.warn('hub', `Wrong admin password from ${ip}`);
        res.status(401).json({ error: 'Wrong password' });
        return;
      }
      this.loginFails.succeed(ip);
      res.json({ token: this.issueAdminToken() });
    });
    this.app.use(
      '/media',
      express.static(MEDIA_DIR, {
        maxAge: '1h',
        fallthrough: false,
        // Uploaded files (SVG included) can never run scripts
        setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"),
      }),
    );
    // A removed upload is a plain 404, not an error in the console
    this.app.use('/media', (_err: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
      res.status(404).end();
    });

    this.io.use((socket, next) => this.authenticate(socket, next));
    this.io.on('connection', (socket) => this.onConnection(socket));

    this.session.on('guest-changed', (g: Guest) => {
      this.io.to(`guest:${g.id}`).emit('me', this.session.me(g));
      this.publish('core');
    });
    this.session.on('guests-changed', () => this.publish('core'));
    this.session.on('reset', () => this.onSessionReset());
    this.tunnel.on('change', () => this.publish('core'));
  }

  get core(): CoreSettings {
    return this.settings.get<CoreSettings>('core');
  }

  // ---------------------------------------------------------------- modules

  async load(defs: ModuleDef<any>[]): Promise<void> {
    for (const def of defs) {
      if (this.modules.has(def.id)) throw new Error(`Duplicate module id "${def.id}"`);
      const loaded = this.createModule(def);
      this.modules.set(def.id, loaded);
      try {
        await def.setup(loaded.ctx);
      } catch (err) {
        log.error(def.id, 'setup failed', err);
      }
    }
  }

  moduleList(): ModuleDef<any>[] {
    return [...this.modules.values()].map((m) => m.def);
  }

  isEnabled(id: string): boolean {
    const m = this.modules.get(id);
    if (!m) return false;
    if (m.def.toggleable === false) return true;
    return this.core.features[id] ?? m.def.defaultEnabled ?? true;
  }

  setEnabled(id: string, enabled: boolean): void {
    const m = this.modules.get(id);
    if (!m || m.def.toggleable === false) throw new HbError('This feature cannot be toggled');
    this.settings.update<CoreSettings>('core', { features: { ...this.core.features, [id]: enabled } });
    if (!enabled && this.takeover === id) this.setTakeover(null);
    this.bus.emit(`toggle:${id}`, enabled);
    this.publishAll();
  }

  publish(id: string): void {
    this.modules.get(id)?.publish();
  }

  publishAll(): void {
    for (const m of this.modules.values()) m.publish();
  }

  private createModule(def: ModuleDef<any>): LoadedModule {
    const id = def.id;
    const hub = this;
    if (def.settings) this.settings.register(id, def.settings);
    const router = express.Router();
    this.app.use(`/api/m/${id}`, router);
    const dataDir = join(DATA_DIR, 'modules', id);

    const loaded: LoadedModule = {
      def,
      ctx: null as unknown as ModuleContext<any>,
      guest: new Map(),
      admin: new Map(),
      tv: new Map(),
      publish: throttle(() => this.sendState(loaded), 60),
    };

    const ctx: ModuleContext<any> = {
      id,
      hub,
      log: {
        info: (...a) => log.info(id, ...a),
        warn: (...a) => log.warn(id, ...a),
        error: (...a) => log.error(id, ...a),
      },
      session: this.session,
      economy: this.economy,
      bus: this.bus,
      settings: {
        get: () => this.settings.get(id),
        update: (patch) => this.settings.update(id, patch),
      },
      enabled: () => this.isEnabled(id),
      get dataDir() {
        return ensureDir(dataDir);
      },
      mediaDir: (sub = '') => ensureDir(join(MEDIA_DIR, id, sub)),
      mediaUrl: (file) => `/media/${id}/${file}`,
      http: router,
      guestFromRequest: (req) => {
        const guest = this.session.byToken(req.get('x-guest-token'));
        return guest && this.hasCode(guest) ? guest : undefined;
      },
      isAdminRequest: (req) => this.isAdminRequest(req),
      state: (provider) => {
        loaded.provider = provider;
      },
      publish: () => loaded.publish(),
      emit: (to, name, data) => this.emitEvent(to, id, name, data),
      onGuest: (method, handler) => loaded.guest.set(method, handler),
      onAdmin: (method, handler) => loaded.admin.set(method, handler),
      onTv: (method, handler) => loaded.tv.set(method, handler),
      price: (p) => this.economy.registerPrice(id, p),
      earn: (e) => this.economy.registerEarn(id, e),
      activity: (text, opts) => this.addActivity(id, text, opts),
      toast: (guest, msg) => this.toast(guest, msg),
      onSessionReset: (fn) => this.bus.on('session-reset', fn),
      onToggle: (fn) => this.bus.on(`toggle:${id}`, fn),
      onGuestJoined: (fn) => this.bus.on('guest-joined', fn),
      onShutdown: (fn) => this.shutdownHooks.push({ id, fn }),
      provide: (name, api) => this.services.set(name, api),
      use: <T>(name: string) => this.services.get(name) as T | undefined,
      takeover: {
        start: () => {
          if (hub.takeover && hub.takeover !== id) throw new HbError(`Stop "${hub.modules.get(hub.takeover)?.def.name}" first`);
          hub.setTakeover(id);
        },
        stop: () => {
          if (hub.takeover === id) hub.setTakeover(null);
        },
        get active() {
          return hub.takeover === id;
        },
      },
    };
    loaded.ctx = ctx;
    return loaded;
  }

  setTakeover(id: string | null): void {
    this.takeover = id;
    this.publish('core');
  }

  /** Register an RPC callable before joining (only used by the core module) */
  onVisitor(method: string, handler: VisitorHandler): void {
    this.visitorHandlers.set(method, handler);
  }

  // ---------------------------------------------------------------- state & events

  private sendState(m: LoadedModule): void {
    if (!m.provider) return;
    for (const role of ROLES) {
      const data = m.provider(role);
      if (data !== undefined) this.io.to(`role:${role}`).emit('state', { module: m.def.id, data });
    }
  }

  /** Changes every time the web app is rebuilt */
  private buildId(): string {
    try {
      return String(statSync(join(WEB_DIST, 'index.html')).mtimeMs);
    } catch {
      return '';
    }
  }

  private sendSnapshot(socket: Socket, role: Role): void {
    for (const m of this.modules.values()) {
      if (!m.provider) continue;
      const data = m.provider(role);
      if (data !== undefined) socket.emit('state', { module: m.def.id, data });
    }
  }

  private emitEvent(to: Target, module: string, name: string, data: unknown): void {
    const msg = { module, name, data };
    if (to === 'tv-audio') this.tvSockets.at(-1)?.emit('event', msg);
    else if (to === 'all') this.io.to(['role:guest', 'role:tv', 'role:admin']).emit('event', msg);
    else if (typeof to === 'string') this.io.to(`role:${to}`).emit('event', msg);
    else this.io.to(`guest:${to.guest}`).emit('event', msg);
  }

  addActivity(module: string, text: string, opts: { guest?: Guest; amount?: number; sensitive?: boolean } = {}): void {
    const item: StoredActivity = {
      id: ++this.activitySeq,
      at: Date.now(),
      module,
      template: text,
      guest: opts.guest ? { id: opts.guest.id, name: opts.guest.name, color: opts.guest.color } : undefined,
      amount: opts.amount,
      sensitive: opts.sensitive,
    };
    this.activity.unshift(item);
    if (this.activity.length > ACTIVITY_SIZE) this.activity.length = ACTIVITY_SIZE;
    for (const role of ROLES) {
      const line = this.renderActivity(item, role);
      if (line) this.io.to(`role:${role}`).emit('activity', line);
    }
  }

  /** The activity feed as a role may see it (the host always sees names) */
  activityFor(role: Role, limit = 15): ActivityItem[] {
    const out: ActivityItem[] = [];
    for (const item of this.activity) {
      if (out.length >= limit) break;
      const line = this.renderActivity(item, role);
      if (line) out.push(line);
    }
    return out;
  }

  private renderActivity(item: StoredActivity, role: Role): ActivityItem | null {
    const mode = role === 'admin' ? 'names' : this.core.privacy.activity;
    if (mode === 'off') return null;
    const base = { id: item.id, at: item.at, module: item.module, amount: item.amount };
    if (mode === 'names' || !item.guest) {
      return { ...base, text: item.template.replaceAll('{name}', item.guest?.name ?? 'Someone'), guest: item.guest };
    }
    if (item.sensitive) return null;
    return { ...base, text: item.template.replace(/^\{name\}/, 'Someone').replaceAll('{name}', 'someone') };
  }

  toast(guest: Guest, msg: ToastMessage): void {
    this.io.to(`guest:${guest.id}`).emit('toast', msg);
  }

  // ---------------------------------------------------------------- auth

  issueAdminToken(): string {
    const token = uid(24);
    const tokens = [...this.core.adminTokens, token].slice(-20);
    this.settings.update<CoreSettings>('core', { adminTokens: tokens });
    return token;
  }

  isAdminToken(token: unknown): boolean {
    return typeof token === 'string' && this.core.adminTokens.includes(token);
  }

  isAdminRequest(req: Request): boolean {
    return isLocal(req.socket.remoteAddress, req.headers) || this.isAdminToken(req.get('x-admin-token'));
  }

  private authenticate(socket: Socket, next: (err?: Error) => void): void {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const local = isLocal(socket.handshake.address, socket.handshake.headers);
    socket.data.local = local;
    socket.data.ip = clientIp(socket.handshake.address, socket.handshake.headers);
    if (auth.role === 'admin' || auth.role === 'tv') {
      if (!local && !this.isAdminToken(auth.adminToken)) return next(new Error('ADMIN_AUTH'));
      socket.data.role = auth.role;
      return next();
    }
    socket.data.role = 'guest';
    socket.data.guestId = this.session.byToken(auth.token)?.id;
    next();
  }

  // ---------------------------------------------------------------- sockets

  private onConnection(socket: Socket): void {
    const role = socket.data.role as Role;
    let calls = 0;
    const resetCalls = setInterval(() => (calls = 0), 1000);

    if (role === 'guest') {
      const guest = socket.data.guestId ? this.session.guests.get(socket.data.guestId) : undefined;
      if (guest && this.hasCode(guest)) this.bindGuest(socket, guest);
      else this.makeVisitor(socket, guest);
    } else {
      socket.join(`role:${role}`);
      if (role === 'tv') this.tvSockets.push(socket);
      this.sendSnapshot(socket, role);
    }
    // Screens stay open for hours (the TV for days): each one reloads itself when it reconnects
    // and the web app was rebuilt meanwhile, so it never runs old screens against a new server
    socket.emit('build', this.buildId());

    socket.on('rpc', async (req: RpcRequest, ack: (r: RpcResponse) => void) => {
      if (typeof ack !== 'function') return;
      if (++calls > RPC_PER_SECOND) return ack({ ok: false, error: 'Slow down a little' });
      try {
        ack({ ok: true, data: await this.handleRpc(socket, req) });
      } catch (err) {
        if (err instanceof HbError) ack({ ok: false, error: err.message, ...(err.code ? { code: err.code } : {}) });
        else {
          log.error('rpc', `${req?.module}.${req?.method}`, err);
          ack({ ok: false, error: 'Something went wrong' });
        }
      }
    });

    // Phones measure the difference between their clock and this PC's clock
    socket.on('clock', (ack: (now: number) => void) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    socket.on('disconnect', () => {
      clearInterval(resetCalls);
      this.tvSockets = this.tvSockets.filter((s) => s !== socket);
      this.unbindGuest(socket);
    });
  }

  private async handleRpc(socket: Socket, req: RpcRequest): Promise<unknown> {
    const role = socket.data.role as Role;
    const m = this.modules.get(req?.module);
    if (!m) throw new HbError('Unknown feature');
    const method = String(req.method);

    if (role === 'admin') {
      const h = m.admin.get(method);
      if (!h) throw new HbError(`Unknown admin action ${m.def.id}.${method}`);
      return h(req.args ?? {}, { local: !!socket.data.local });
    }
    if (role === 'tv') {
      const h = m.tv.get(method);
      if (!h) throw new HbError('Unknown action');
      return h(req.args ?? {}, { local: !!socket.data.local });
    }

    const guest = socket.data.guestId ? this.session.guests.get(socket.data.guestId) : undefined;
    if (!guest) {
      const h = m.def.id === 'core' ? this.visitorHandlers.get(method) : undefined;
      if (!h) throw new HbError('Please join the session first');
      return h(req.args ?? {}, socket, (g) => this.bindGuest(socket, g));
    }
    const h = m.guest.get(method);
    if (!h) throw new HbError('Unknown action');
    if (!this.isEnabled(m.def.id)) throw new HbError(`${m.def.name} is turned off right now`);
    return h(req.args ?? {}, guest);
  }

  /** `guest`: the account behind this phone, which only has to enter the current code again */
  private makeVisitor(socket: Socket, guest?: Guest): void {
    socket.join('role:visitor');
    socket.data.codeGuestId = guest?.id;
    const c = this.core;
    const state: VisitorState = { appName: c.appName, theme: c.theme, currency: c.currency };
    socket.emit('visitor', state);
    const need: NeedJoin = { codeRequired: c.requireCode };
    if (guest) need.guest = { name: guest.name, color: guest.color, ...(guest.avatar ? { avatar: guest.avatar.url } : {}) };
    socket.emit('need-join', need);
  }

  /** With the code required, only guests who entered the current one are in (the people in the room) */
  hasCode(guest: Guest): boolean {
    return !this.core.requireCode || guest.code === this.session.code;
  }

  /** After a new code, or the code turned on: everyone else goes back to the code screen, their account kept */
  checkCodes(): void {
    for (const [id, sockets] of this.guestSockets) {
      const guest = this.session.guests.get(id);
      if (!guest || this.hasCode(guest)) continue;
      for (const socket of [...sockets]) {
        this.unbindGuest(socket);
        this.makeVisitor(socket, guest);
      }
      this.guestSockets.delete(id);
    }
  }

  private bindGuest(socket: Socket, guest: Guest): void {
    this.unbindGuest(socket);
    socket.leave('role:visitor');
    socket.data.codeGuestId = undefined;
    socket.data.guestId = guest.id;
    socket.join(['role:guest', `guest:${guest.id}`]);
    let set = this.guestSockets.get(guest.id);
    if (!set) this.guestSockets.set(guest.id, (set = new Set()));
    set.add(socket);
    this.session.setOnline(guest, 1);
    socket.emit('me', this.session.me(guest));
    this.sendSnapshot(socket, 'guest');
  }

  private unbindGuest(socket: Socket): void {
    const id = socket.data.guestId as string | undefined;
    if (!id) return;
    socket.data.guestId = undefined;
    socket.leave('role:guest');
    socket.leave(`guest:${id}`);
    const set = this.guestSockets.get(id);
    if (set?.delete(socket)) {
      const guest = this.session.guests.get(id);
      if (guest) this.session.setOnline(guest, -1);
    }
  }

  /** Disconnect a guest from their account and send them back to the join screen */
  kickGuest(guest: Guest, reason: string): void {
    for (const socket of this.guestSockets.get(guest.id) ?? []) {
      this.unbindGuest(socket);
      socket.emit('kicked', { reason });
      this.makeVisitor(socket);
    }
    this.guestSockets.delete(guest.id);
  }

  private onSessionReset(): void {
    for (const sockets of this.guestSockets.values()) {
      for (const socket of sockets) {
        socket.data.guestId = undefined;
        socket.leave('role:guest');
        socket.rooms.forEach((r) => r.startsWith('guest:') && socket.leave(r));
        socket.emit('kicked', { reason: 'A new session has started' });
        this.makeVisitor(socket);
      }
    }
    this.guestSockets.clear();
    this.activity.length = 0;
    this.takeover = null;
    this.bus.emit('session-reset');
    this.publishAll();
  }

  // ---------------------------------------------------------------- urls & lifecycle

  get lanUrl(): string {
    const all = Object.values(networkInterfaces()).flat();
    const ip =
      all.find((i) => i && i.family === 'IPv4' && !i.internal && i.address.startsWith('192.168.'))?.address ??
      all.find((i) => i && i.family === 'IPv4' && !i.internal)?.address ??
      'localhost';
    return `http://${ip}:${this.port}`;
  }

  /** Number of TV windows currently connected */
  get tvCount(): number {
    return this.tvSockets.length;
  }

  get baseUrl(): string {
    return this.tunnel.url ?? this.lanUrl;
  }

  /** Where the tunnel forwards to (the Vite dev server in development) */
  get tunnelTarget(): string {
    if (process.env.HB_TUNNEL_TARGET) return process.env.HB_TUNNEL_TARGET;
    return process.argv.includes('--dev') ? 'http://localhost:5173' : `http://localhost:${this.port}`;
  }

  /** Start the public tunnel: on the own domain when one is set, else a quick tunnel */
  startTunnel(): Promise<void> {
    const { tunnelName, tunnelDomain } = this.core;
    const named = tunnelName && tunnelDomain ? { name: tunnelName, domain: tunnelDomain } : null;
    return this.tunnel.start(this.tunnelTarget, named);
  }

  /** Serve the built web apps (production). In development Vite serves them. */
  serveWeb(): void {
    if (!existsSync(WEB_DIST)) {
      log.warn('web', 'No build found in dist/web: run "npm run build" (or use "npm run dev")');
      return;
    }
    this.app.use(express.static(WEB_DIST, { index: 'index.html', maxAge: '1h' }));
    this.app.get('/tv', (_req, res) => res.sendFile(join(WEB_DIST, 'tv.html')));
    this.app.get('/admin', (_req, res) => res.sendFile(join(WEB_DIST, 'admin.html')));
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(this.port, '0.0.0.0', resolve));
    log.info('hub', `Listening on http://localhost:${this.port} and ${this.lanUrl}`);
  }

  async stop(): Promise<void> {
    this.tunnel.stop();
    await Promise.all(
      this.shutdownHooks.map(async (h) => {
        try {
          await h.fn();
        } catch (err) {
          log.error(h.id, 'shutdown failed', err);
        }
      }),
    );
    this.session.flush();
    this.settings.flush();
  }
}
