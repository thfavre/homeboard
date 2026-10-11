import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { Tunnel, bin, install } from 'cloudflared';
import { log } from './util.ts';

export type TunnelStatus = 'off' | 'starting' | 'up' | 'error';

/** A tunnel made once with "cloudflared tunnel create", with its DNS route to the domain */
export interface NamedTunnel {
  name: string;
  domain: string;
}

/**
 * Cloudflare tunnel: a free public https URL pointing to this PC.
 * A quick tunnel gets a random URL that changes at every start; a named tunnel
 * (credentials in ~/.cloudflared) always answers on its own domain.
 *
 * Events: 'change' ()
 */
export class TunnelManager extends EventEmitter {
  status: TunnelStatus = 'off';
  url: string | null = null;
  private tunnel: Tunnel | null = null;

  async start(target: string, named?: NamedTunnel | null): Promise<void> {
    if (this.tunnel) return;
    this.set('starting', null);
    try {
      if (!existsSync(bin)) {
        log.info('tunnel', 'Installing cloudflared...');
        await install(bin);
      }
    } catch (err) {
      log.error('tunnel', 'Could not install cloudflared', err);
      this.set('error', null);
      return;
    }

    const t = named
      ? new Tunnel(['tunnel', '--no-autoupdate', 'run', '--url', target, named.name])
      : Tunnel.quick(target);
    this.tunnel = t;
    const up = (url: string) => {
      if (this.tunnel !== t || this.url === url) return;
      log.info('tunnel', `Public URL: ${url}`);
      this.set('up', url);
    };
    if (named) t.on('connected', () => up(`https://${named.domain}`));
    else t.on('url', up);
    t.on('error', (err) => log.error('tunnel', err.message));
    t.on('exit', (code) => {
      if (this.tunnel !== t) return;
      this.tunnel = null;
      log.warn('tunnel', `cloudflared exited (${code}), restarting in 5s`);
      this.set('error', null);
      setTimeout(() => this.start(target, named), 5000);
    });
  }

  stop(): void {
    const t = this.tunnel;
    this.tunnel = null;
    t?.stop();
    this.set('off', null);
  }

  private set(status: TunnelStatus, url: string | null) {
    this.status = status;
    this.url = url;
    this.emit('change');
  }
}
