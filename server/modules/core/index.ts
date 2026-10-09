import { existsSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { AVATAR_EFFECTS, type AvatarParams } from '../../../shared/avatar.ts';
import { ensureDir } from '../../core/paths.ts';
import { BOARD_KINDS, STAT_BOARDS, isMoneyBoard, type Board, type BoardKind, type BoardRow, type CoreState, type Currency, type JoinResult, type LeaderboardMode, type NameCheck, type PassivePaid, type WelcomeBack } from '../../../shared/protocol.ts';
import { THEMES } from '../../../shared/themes.ts';
import type { CoreSettings } from '../../core/hub.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import type { GamesApi } from '../games/index.ts';
import { HbError, cleanName, clamp, num, uid } from '../../core/util.ts';

const TICK_SECONDS = 5;
const MAX_JOIN_FAILURES = 8;
/** Away at least this long: the guest gets a welcome back card instead of the usual toast */
const AWAY_CARD_MS = 60_000;

const BOARD_ROWS = 10;

const minutesText = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`);

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
      describe: (a) => {
        const away = core().passiveAwayMinutes;
        return `${a} every ${core().passiveMinutes} min while this page is open` + (away > 0 ? `, and for up to ${minutesText(away)} while you are away` : '');
      },
    });

    // No toast: the balance badge plays its own small coin animation
    const paid = (g: Guest, amount: number) => ctx.emit({ guest: g.id }, 'passive', { amount } satisfies PassivePaid);

    /** Counts seconds of hanging out and pays every full interval reached. Returns the amount paid. */
    const accrue = (g: Guest, seconds: number, reason?: string): number => {
      const interval = core().passiveMinutes * 60;
      if (interval <= 0) return 0;
      g.onlineAccum += seconds;
      const payouts = Math.floor(g.onlineAccum / interval);
      if (!payouts) return 0;
      g.onlineAccum -= payouts * interval;
      return economy.reward(g, 'core.passive', payouts, reason);
    };

    setInterval(() => {
      for (const g of session.guests.values()) {
        if (g.sockets === 0) continue;
        const amount = accrue(g, TICK_SECONDS);
        if (amount) paid(g, amount);
      }
    }, TICK_SECONDS * 1000);

    // Coming back: the time away counts too, up to the host's limit.
    // A quick reload just carries on; a real absence gets a welcome back card.
    session.on('guest-online', (g: Guest, awayMs: number) => {
      const paidMs = Math.min(awayMs, core().passiveAwayMinutes * 60_000);
      if (paidMs <= 0) return;
      const longAway = awayMs >= AWAY_CARD_MS;
      const amount = accrue(g, paidMs / 1000, longAway ? 'Hanging out (while away)' : undefined);
      if (!amount) return;
      if (longAway) ctx.emit({ guest: g.id }, 'welcomeBack', { awayMs, paidMs, amount } satisfies WelcomeBack);
      else paid(g, amount);
    });

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

    // Settings of an older version: one money board, and a switch to take turns with the others
    {
      const old = core() as CoreSettings & { leaderboardMode?: LeaderboardMode; leaderboardRotate?: boolean };
      if (old.leaderboardMode !== undefined || old.leaderboardRotate !== undefined) {
        const money = old.leaderboardMode && old.leaderboardMode !== 'off' ? old.leaderboardMode : 'balance';
        hub.settings.update<CoreSettings>('core', {
          boardMode: old.leaderboardMode === 'off' ? 'off' : old.leaderboardRotate === false ? 'one' : 'rotate',
          boardOne: money,
          leaderboardMode: undefined,
          leaderboardRotate: undefined,
        } as Partial<CoreSettings>);
      }
    }

    const kindsOn = (): BoardKind[] => {
      const c = core();
      return c.boardMode === 'off' ? [] : c.boardMode === 'one' ? [c.boardOne] : c.boardRotate;
    };

    /**
     * The boards of these kinds that have something to show, in the order of BOARD_KINDS. Money
     * boards need the economy on. A stat needs `minRows` guests on it (2 when boards take turns,
     * so the TV does not show a "ranking" of one). A Rhythm Rain song needs enough guests who
     * played it at the same difficulty and number of colors; each song is its own board.
     */
    const boardsOf = (kinds: BoardKind[], minRows: number): Board[] => {
      const c = core();
      const want = new Set(kinds);
      const guests = [...session.guests.values()];
      const rowsBy = (value: (g: Guest) => number | undefined) =>
        guests
          .map((g) => ({ id: g.id, name: g.name, color: g.color, value: value(g) }))
          .filter((r): r is BoardRow => r.value !== undefined)
          .sort((a, b) => b.value - a.value)
          .slice(0, BOARD_ROWS);
      const list: Board[] = [];
      for (const { kind, title } of BOARD_KINDS) {
        if (!want.has(kind)) continue;
        if (isMoneyBoard(kind)) {
          const rows = c.economyEnabled ? rowsBy((g) => g[kind]) : [];
          if (rows.length) list.push({ id: `money:${kind}`, of: kind, title, kind: 'money', rows });
        } else if (kind === 'rhythm') {
          const games = ctx.use<GamesApi>('games');
          const ids = new Set(guests.flatMap((g) => Object.keys(g.bests ?? {})).filter((k) => k.startsWith('rhythm:')));
          for (const id of ids) {
            const players = guests.filter((g) => g.bests?.[id] !== undefined).length;
            const song = players >= c.songBoardPlayers ? games?.songBoard(id) : null;
            if (song) list.push({ id, of: kind, title: 'Rhythm Rain', kind: 'score', unit: 'pts', rows: rowsBy((g) => g.bests?.[id]), song: { ...song, players } });
          }
        } else {
          const stat = STAT_BOARDS.find((b) => b.stat === kind)!;
          const rows = rowsBy((g) => (g.stats?.[kind] ? g.stats[kind] : undefined));
          if (rows.length >= minRows) list.push({ id: `stat:${kind}`, of: kind, title, kind: 'count', unit: stat.unit, one: stat.one, rows });
        }
      }
      return list;
    };
    const boards = () => boardsOf(kindsOn(), core().boardMode === 'one' ? 1 : 2);

    /** The money ranking guests see their place in: the first money board on the TV */
    const guestRanking = (): LeaderboardMode => {
      if (!core().economyEnabled) return 'off';
      return kindsOn().find(isMoneyBoard) ?? 'off';
    };

    ctx.state((role) => {
      const c = core();
      const toggleable = hub.moduleList().filter((m) => m.toggleable !== false);
      const guests = [...session.guests.values()].map((g) => session.publicGuest(g));
      const ranking = guestRanking();
      const state: CoreState = {
        appName: c.appName,
        theme: c.theme,
        currency: c.currency,
        economyEnabled: c.economyEnabled,
        features: toggleable.map((m) => ({ id: m.id, name: m.name, description: m.description, enabled: hub.isEnabled(m.id) })),
        prices: economy.priceList((id) => hub.isEnabled(id)),
        earn: economy.earnList((id) => hub.isEnabled(id)),
        passiveMs: economy.earnAmount('core.passive') > 0 ? c.passiveMinutes * 60_000 : 0,
        leaderboardMode: ranking,
        leaderboard: ranking === 'off' ? [] : guests.sort((a, b) => b[ranking] - a[ranking]).slice(0, 10),
        guestsOnline: guests.filter((g) => g.online).length,
        takeover: hub.takeover,
        privacy: c.privacy,
        avatars: Object.fromEntries([...session.guests.values()].filter((g) => g.avatar).map((g) => [g.id, g.avatar!.url])),
        activity: hub.activityFor(role),
      };
      if (role === 'tv' || role === 'admin') state.join = joinInfo();
      if (role === 'tv') {
        state.boards = boards();
        state.boardSeconds = c.boardSeconds;
      }
      if (role === 'admin') {
        state.admin = {
          guests: [...session.guests.values()].map((g) => session.adminGuest(g)).sort((a, b) => a.name.localeCompare(b.name)),
          ledger: session.ledger.slice(-80).reverse(),
          publicUrl: hub.tunnel.url,
          lanUrl: hub.lanUrl,
          tunnel: hub.tunnel.status,
          sessionStartedAt: session.startedAt,
          passiveMinutes: c.passiveMinutes,
          passiveAwayMinutes: c.passiveAwayMinutes,
          boardMode: c.boardMode,
          boardOne: c.boardOne,
          boardRotate: c.boardRotate,
          boardsLive: [...new Set(boardsOf(BOARD_KINDS.map((b) => b.kind), c.boardMode === 'one' ? 1 : 2).map((b) => b.of))],
          boardSeconds: c.boardSeconds,
          songBoardPlayers: c.songBoardPlayers,
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

    // The join screen goes step by step: code, then name, then PIN
    hub.onVisitor('checkCode', (args, socket) => {
      checkCode(socket.data, args.code);
      return true;
    });

    hub.onVisitor('checkName', (args, socket): NameCheck => {
      checkCode(socket.data, args.code);
      const name = cleanName(args.name);
      if (name.length < 2) throw new HbError('Please enter a name (at least 2 characters)');
      const g = session.byName(name);
      if (!g) return { returning: false, name };
      return { returning: true, name: g.name, color: g.color, ...(g.avatar ? { avatar: g.avatar.url } : {}) };
    });

    hub.onVisitor('join', (args, socket, bind): JoinResult => {
      checkCode(socket.data, args.code);
      const { guest, returning } = session.join(args.name, args.pin);
      bind(guest);
      if (!returning) {
        economy.reward(guest, 'core.join');
        hub.bus.emit('guest-joined', guest);
        ctx.activity('{name} joined the party', { guest });
      }
      return { token: guest.token, me: session.me(guest), returning };
    });

    // ------------------------------------------------------------ avatars
    //
    // The phone sends the original selfie (kept private, to edit it again later)
    // and the finished picture (public, shown everywhere).

    const avatarMedia = ctx.mediaDir('avatars');
    const originals = ensureDir(join(ctx.dataDir, 'avatars'));

    const decodeJpeg = (dataUrl: unknown, maxBytes: number): Buffer => {
      const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUrl ?? ''));
      if (!m) throw new HbError('Send a picture');
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length < 200 || buf.length > maxBytes) throw new HbError('This picture is too big');
      return buf;
    };

    const cleanParams = (p: any): AvatarParams => ({
      effect: AVATAR_EFFECTS.some((e) => e.id === p?.effect) ? p.effect : 'none',
      strength: clamp(num(p?.strength, 0.6), 0, 1),
      cx: clamp(num(p?.cx, 0.5), 0, 1),
      cy: clamp(num(p?.cy, 0.5), 0, 1),
      emoji: typeof p?.emoji === 'string' && p.emoji.length <= 16 ? p.emoji : null,
      ex: clamp(num(p?.ex, 0.5), 0, 1),
      ey: clamp(num(p?.ey, 0.5), 0, 1),
      esize: clamp(num(p?.esize, 0.3), 0.08, 0.9),
      erot: clamp(num(p?.erot, 0), -Math.PI * 4, Math.PI * 4),
    });

    const deleteAvatar = (g: Guest) => {
      if (!g.avatar) return;
      for (const f of [join(avatarMedia, g.avatar.file), join(originals, g.avatar.original)]) {
        try {
          unlinkSync(f);
        } catch {
          // already gone
        }
      }
      g.avatar = undefined;
    };

    ctx.http.post('/avatar', (req, res) => {
      const guest = ctx.guestFromRequest(req);
      try {
        if (!guest) throw new HbError('Please join the session first');
        const rendered = decodeJpeg(req.body?.rendered, 600_000);
        // A new photo comes with its original; editing effects or emoji keeps the old one
        const original = req.body?.original ? decodeJpeg(req.body.original, 1_500_000) : null;
        if (!original && !guest.avatar) throw new HbError('Take a picture first');
        const params = cleanParams(req.body?.params);

        const file = `${guest.id}-${uid(4)}.jpg`;
        writeFileSync(join(avatarMedia, file), rendered);
        let originalFile = guest.avatar?.original ?? '';
        if (original) {
          originalFile = `${guest.id}-${uid(4)}.jpg`;
          writeFileSync(join(originals, originalFile), original);
        }
        const old = guest.avatar;
        guest.avatar = { url: ctx.mediaUrl(`avatars/${file}`), file, original: originalFile, params };
        // Remove the previous files that are not used anymore
        if (old) {
          try {
            unlinkSync(join(avatarMedia, old.file));
          } catch {
            // already gone
          }
          if (old.original !== originalFile) {
            try {
              unlinkSync(join(originals, old.original));
            } catch {
              // already gone
            }
          }
        }
        session.changed(guest);
        ctx.publish();
        res.json({ url: guest.avatar.url });
      } catch (err) {
        if (err instanceof HbError) res.status(400).json({ error: err.message });
        else {
          ctx.log.error(err);
          res.status(500).json({ error: 'Could not save the picture' });
        }
      }
    });

    /** The original selfie, only for its owner (to change the effect or emoji) */
    ctx.http.get('/avatar/original', (req, res) => {
      const guest = ctx.session.byToken(req.get('x-guest-token'));
      if (!guest?.avatar?.original) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(join(originals, guest.avatar.original));
    });

    ctx.onGuest('removeAvatar', (_args, guest) => {
      deleteAvatar(guest);
      session.changed(guest);
      ctx.publish();
      return true;
    });

    ctx.onAdmin('removeGuestAvatar', (args) => {
      const guest = session.byId(args.guestId);
      deleteAvatar(guest);
      session.changed(guest);
      ctx.publish();
      ctx.toast(guest, { text: 'The host removed your picture', kind: 'info' });
      return true;
    });

    ctx.onSessionReset(() => {
      for (const dir of [avatarMedia, originals]) {
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir)) rmSync(join(dir, f), { force: true });
      }
    });

    // ------------------------------------------------------------ guest actions

    ctx.onGuest('rename', (args, guest) => {
      const before = guest.name;
      session.rename(guest, args.name);
      ctx.activity(`${before} is now {name}`, { guest, sensitive: true });
    });

    ctx.onGuest('setPin', (args, guest) => {
      session.setPin(guest, args.pin);
      return true;
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
      if (args.passiveAwayMinutes !== undefined) patch.passiveAwayMinutes = Math.round(clamp(num(args.passiveAwayMinutes, 60), 0, 1440));
      const isKind = (k: unknown): k is BoardKind => BOARD_KINDS.some((b) => b.kind === k);
      if (['one', 'rotate', 'off'].includes(args.boardMode)) patch.boardMode = args.boardMode;
      if (isKind(args.boardOne)) patch.boardOne = args.boardOne;
      if (Array.isArray(args.boardRotate)) patch.boardRotate = BOARD_KINDS.map((b) => b.kind).filter((k) => args.boardRotate.includes(k));
      if (args.boardSeconds !== undefined) patch.boardSeconds = Math.round(clamp(num(args.boardSeconds, 15), 5, 300));
      if (args.songBoardPlayers !== undefined) patch.songBoardPlayers = Math.round(clamp(num(args.songBoardPlayers, 6), 1, 50));
      if (args.privacy !== undefined) {
        const p = { ...c.privacy };
        if (['names', 'anonymous', 'off'].includes(args.privacy.activity)) p.activity = args.privacy.activity;
        for (const k of ['photoNames', 'stickerNames', 'songNames', 'effectNames'] as const) {
          if (args.privacy[k] !== undefined) p[k] = !!args.privacy[k];
        }
        patch.privacy = p;
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
      let amount = Math.round(num(args.amount));
      if (!amount) throw new HbError('Enter an amount');
      // Take at most what they have: a balance below zero would block every purchase
      if (amount < 0) {
        if (guest.balance <= 0) throw new HbError(`${guest.name} has nothing to take`);
        amount = Math.max(amount, -guest.balance);
      }
      const reason = cleanName(args.reason, 60) || (amount > 0 ? 'Gift from the host' : 'Taken by the host');
      // Off unless the host ticks it: host corrections do not move the earned/spent leaderboard
      economy.credit(guest, amount, reason, args.leaderboard === true);
      ctx.toast(guest, { text: reason, amount, kind: amount > 0 ? 'success' : 'info' });
    });

    /** Set a guest's balance to an exact amount: the difference goes through the ledger like a gift or a take */
    ctx.onAdmin('setBalance', (args) => {
      const guest = session.byId(args.guestId);
      const target = Math.max(0, Math.round(num(args.amount)));
      const diff = target - guest.balance;
      if (!diff) throw new HbError('They already have this amount');
      const reason = cleanName(args.reason, 60) || 'Balance set by the host';
      economy.credit(guest, diff, reason, args.leaderboard === true);
      ctx.toast(guest, { text: reason, amount: diff, kind: diff > 0 ? 'success' : 'info' });
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

    /** For a guest who forgot their PIN */
    ctx.onAdmin('setGuestPin', (args) => {
      session.setPin(session.byId(args.guestId), args.pin);
      return true;
    });

    ctx.onAdmin('kick', (args) => {
      const guest: Guest = session.byId(args.guestId);
      hub.kickGuest(guest, 'You were removed by the host');
      deleteAvatar(guest);
      session.remove(guest);
    });

    ctx.onAdmin('newSession', () => session.reset());

    ctx.onAdmin('newCode', () => {
      session.newCode();
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
