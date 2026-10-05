import QRCode from 'qrcode';
import type { CoreState, Currency, JoinResult, LeaderboardMode, PublicGuest } from '../../../shared/protocol.ts';
import { THEMES } from '../../../shared/themes.ts';
import type { CoreSettings } from '../../core/hub.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import { HbError, cleanName, clamp, num } from '../../core/util.ts';

const TICK_SECONDS = 15;
const MAX_JOIN_FAILURES = 8;

/**
 * Core features: joining, profiles, leaderboard, passive income and every
 * session-level admin tool (money, guests, prices, appearance, tunnel).
 */
export default defineModule({
  id: 'core',
  name: 'Core',
  description: 'Session, guests and economy',
  toggleable: false,

  setup(ctx) {
    const { hub, session, economy } = ctx;
    const core = () => hub.core;
    const updateCore = (patch: Partial<CoreSettings>) => {
      hub.settings.update<CoreSettings>('core', patch);
      hub.publishAll();
    };

    // ------------------------------------------------------------ earning

    ctx.earn({
      key: 'core.join',
      label: 'Welcome bonus',
      default: 5000,
      describe: (a) => `You get ${a} when you join`,
    });
    ctx.earn({
      key: 'core.passive',
      label: 'Hanging out',
      default: 200,
      describe: (a) => `${a} every ${core().passiveMinutes} min while this page is open`,
    });

    setInterval(() => {
      const interval = core().passiveMinutes * 60;
      if (interval <= 0) return;
      for (const g of session.guests.values()) {
        if (g.sockets === 0) continue;
        g.onlineAccum += TICK_SECONDS;
        if (g.onlineAccum >= interval) {
          g.onlineAccum -= interval;
          const amount = economy.reward(g, 'core.passive');
          if (amount) ctx.toast(g, { text: 'Thanks for hanging out', amount, kind: 'success' });
        }
      }
    }, TICK_SECONDS * 1000);

    // ------------------------------------------------------------ state

    let qrCache = { url: '', svg: '' };
    const joinInfo = () => {
      const url = hub.baseUrl + (core().qrIncludesCode && core().requireCode ? `/?c=${session.code}` : '/');
      if (qrCache.url !== url) {
        qrCache = { url, svg: '' };
        QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff00' } })
          .then((svg) => {
            if (qrCache.url === url) {
              qrCache.svg = svg;
              ctx.publish();
            }
          })
          .catch((err) => ctx.log.error('QR', err));
      }
      return { url, code: session.code, qrSvg: qrCache.svg, codeRequired: core().requireCode };
    };

    const sortKey: Record<LeaderboardMode, (g: PublicGuest) => number> = {
      balance: (g) => g.balance,
      spent: (g) => g.spent,
      earned: (g) => g.earned,
    };

    ctx.state((role) => {
      const c = core();
      const toggleable = hub.moduleList().filter((m) => m.toggleable !== false);
      const guests = [...session.guests.values()].map((g) => session.publicGuest(g));
      const state: CoreState = {
        appName: c.appName,
        theme: c.theme,
        currency: c.currency,
        economyEnabled: c.economyEnabled,
        features: toggleable.map((m) => ({ id: m.id, name: m.name, description: m.description, enabled: hub.isEnabled(m.id) })),
        prices: economy.priceList((id) => hub.isEnabled(id)),
        earn: economy.earnList((id) => hub.isEnabled(id)),
        leaderboardMode: c.leaderboardMode,
        leaderboard: guests.sort((a, b) => sortKey[c.leaderboardMode](b) - sortKey[c.leaderboardMode](a)).slice(0, 8),
        guestsOnline: guests.filter((g) => g.online).length,
        takeover: hub.takeover,
        activity: hub.activity.slice(0, 15),
      };
      if (role === 'tv' || role === 'admin') state.join = joinInfo();
      if (role === 'admin') {
        state.admin = {
          guests: [...session.guests.values()].map((g) => session.adminGuest(g)).sort((a, b) => a.name.localeCompare(b.name)),
          ledger: session.ledger.slice(-80).reverse(),
          publicUrl: hub.tunnel.url,
          lanUrl: hub.lanUrl,
          tunnel: hub.tunnel.status,
          sessionStartedAt: session.startedAt,
          passiveMinutes: c.passiveMinutes,
          qrIncludesCode: c.qrIncludesCode,
          requireCode: c.requireCode,
          prices: economy.adminPriceList(),
          earnRules: economy.earnList(() => true),
          modules: hub.moduleList().map((m) => ({ id: m.id, name: m.name, toggleable: m.toggleable !== false })),
        };
      }
      return state;
    });

    // ------------------------------------------------------------ joining

    const checkCode = (socketData: Record<string, any>, code: unknown) => {
      if (!core().requireCode) return;
      if ((socketData.joinFailures ?? 0) >= MAX_JOIN_FAILURES) throw new HbError('Too many wrong codes. Ask the host for help.');
      if (String(code ?? '').trim() !== session.code) {
        socketData.joinFailures = (socketData.joinFailures ?? 0) + 1;
        throw new HbError('Wrong session code. Look at the TV.');
      }
    };

    hub.onVisitor('join', (args, socket, bind): JoinResult => {
      checkCode(socket.data, args.code);
      const guest = session.join(args.name);
      economy.reward(guest, 'core.join');
      bind(guest);
      hub.bus.emit('guest-joined', guest);
      ctx.activity(`${guest.name} joined the party`, { guest });
      return { token: guest.token, me: session.me(guest) };
    });

    hub.onVisitor('rejoin', (args, socket, bind): JoinResult => {
      checkCode(socket.data, args.code);
      const guest = session.rejoin(args.name, args.key);
      bind(guest);
      return { token: guest.token, me: session.me(guest) };
    });

    // ------------------------------------------------------------ guest actions

    ctx.onGuest('rename', (args, guest) => {
      const before = guest.name;
      session.rename(guest, args.name);
      ctx.activity(`${before} is now ${guest.name}`, { guest });
    });

    ctx.onGuest('history', (_args, guest) => session.ledger.filter((e) => e.guestId === guest.id).slice(-40).reverse());

    // ------------------------------------------------------------ admin actions

    ctx.onAdmin('setGeneral', (args) => {
      const c = core();
      const patch: Partial<CoreSettings> = {};
      if (args.appName !== undefined) patch.appName = cleanName(args.appName, 40) || 'Homeboard';
      if (args.theme !== undefined) {
        if (!THEMES.some((t) => t.id === args.theme)) throw new HbError('Unknown theme');
        patch.theme = args.theme;
      }
      if (args.currency !== undefined) {
        const cur = args.currency as Partial<Currency>;
        patch.currency = {
          name: cleanName(cur.name ?? c.currency.name, 24) || 'Sparks',
          symbol: cleanName(cur.symbol ?? c.currency.symbol, 4) || 'SP',
        };
      }
      if (args.economyEnabled !== undefined) patch.economyEnabled = !!args.economyEnabled;
      if (args.passiveMinutes !== undefined) patch.passiveMinutes = clamp(num(args.passiveMinutes, 5), 0, 120);
      if (args.leaderboardMode !== undefined && ['balance', 'spent', 'earned'].includes(args.leaderboardMode)) {
        patch.leaderboardMode = args.leaderboardMode;
      }
      if (args.qrIncludesCode !== undefined) patch.qrIncludesCode = !!args.qrIncludesCode;
      if (args.requireCode !== undefined) patch.requireCode = !!args.requireCode;
      updateCore(patch);
    });

    ctx.onAdmin('setFeature', (args) => hub.setEnabled(String(args.id), !!args.enabled));

    ctx.onAdmin('setPrice', (args) => {
      const key = String(args.key);
      if (!economy.hasPrice(key)) throw new HbError('Unknown price');
      updateCore({ prices: { ...core().prices, [key]: Math.max(0, Math.round(num(args.amount))) } });
    });

    ctx.onAdmin('setEarn', (args) => {
      const key = String(args.key);
      if (!economy.hasEarn(key)) throw new HbError('Unknown rule');
      updateCore({ earn: { ...core().earn, [key]: Math.max(0, Math.round(num(args.amount))) } });
    });

    ctx.onAdmin('give', (args) => {
      const guest = session.byId(args.guestId);
      const amount = Math.round(num(args.amount));
      if (!amount) throw new HbError('Enter an amount');
      const reason = cleanName(args.reason, 60) || (amount > 0 ? 'Gift from the host' : 'Taken by the host');
      economy.credit(guest, amount, reason);
      ctx.toast(guest, { text: reason, amount, kind: amount > 0 ? 'success' : 'info' });
    });

    ctx.onAdmin('moneyRain', (args) => {
      const amount = Math.round(num(args.amount));
      if (amount <= 0) throw new HbError('Enter an amount');
      const online = [...session.guests.values()].filter((g) => g.sockets > 0);
      for (const g of online) {
        economy.credit(g, amount, 'Money rain');
        ctx.toast(g, { text: 'Money rain!', amount, kind: 'success' });
      }
      ctx.activity(`Money rain: everyone online gets a bonus`, { amount });
      ctx.emit('all', 'moneyRain', { amount });
      return online.length;
    });

    ctx.onAdmin('renameGuest', (args) => session.rename(session.byId(args.guestId), args.name));

    ctx.onAdmin('kick', (args) => {
      const guest: Guest = session.byId(args.guestId);
      hub.kickGuest(guest, 'You were removed by the host');
      session.remove(guest);
    });

    ctx.onAdmin('newSession', () => session.reset());

    ctx.onAdmin('newCode', (args) => {
      if (args.code !== undefined && !/^\d{4}$/.test(String(args.code))) throw new HbError('The code must be 4 digits');
      session.newCode(args.code === undefined ? undefined : String(args.code));
      ctx.publish();
    });

    ctx.onAdmin('clearActivity', () => {
      hub.activity.length = 0;
      ctx.publish();
    });

    ctx.onAdmin('pair', async () => {
      const url = `${hub.baseUrl}/admin#pair=${hub.issueAdminToken()}`;
      const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#000000', light: '#ffffff00' } });
      return { url, qrSvg };
    });

    ctx.onAdmin('security', (_args, caller) => {
      if (!caller.local) throw new HbError('Only available on the PC');
      return { password: core().adminPassword };
    });

    ctx.onAdmin('setPassword', (args, caller) => {
      if (!caller.local) throw new HbError('Only available on the PC');
      const password = String(args.password ?? '').trim();
      if (password.length < 4) throw new HbError('At least 4 characters');
      hub.settings.update<CoreSettings>('core', { adminPassword: password, adminTokens: args.logoutAll ? [] : core().adminTokens });
      return true;
    });

    ctx.onAdmin('restartTunnel', () => {
      hub.tunnel.stop();
      void hub.tunnel.start(hub.tunnelTarget);
    });
  },
});
