import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { Tunnel, bin, install } from 'cloudflared';
import { log } from './util.ts';

export type TunnelStatus = 'off' | 'starting' | 'up' | 'error';

/**
 * Cloudflare "quick tunnel": a free public https URL pointing to this PC.
 * The URL is random and changes at every start.
 *
 * Events: 'change' ()
 */
export class TunnelManager extends EventEmitter {
  status: TunnelStatus = 'off';
  url: string | null = null;
  private tunnel: Tunnel | null = null;

  async start(target: string): Promise<void> {
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

    const t = Tunnel.quick(target);
    this.tunnel = t;
    t.on('url', (url) => {
      log.info('tunnel', `Public URL: ${url}`);
      this.set('up', url);
    });
    t.on('error', (err) => log.error('tunnel', err.message));
    t.on('exit', (code) => {
      if (this.tunnel !== t) return;
      this.tunnel = null;
      log.warn('tunnel', `cloudflared exited (${code}), restarting in 5s`);
      this.set('error', null);
      setTimeout(() => this.start(target), 5000);
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
