import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './paths.ts';
import { log } from './util.ts';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

/**
 * Open the TV page full screen in its own Chrome window, with sound allowed
 * without a click. HB_TV_POSITION="1920,0" moves it to a second screen.
 */
export function openTvKiosk(url: string): void {
  const browser = process.env.HB_BROWSER ?? BROWSERS.find((b) => existsSync(b));
  if (!browser) {
    log.warn('kiosk', `No Chrome or Edge found. Open ${url} yourself.`);
    return;
  }
  const args = [
    '--kiosk',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--disable-features=Translate',
    `--user-data-dir=${join(DATA_DIR, 'tv-browser')}`,
  ];
  if (process.env.HB_TV_POSITION) args.push(`--window-position=${process.env.HB_TV_POSITION}`);
  args.push(url);
  spawn(browser, args, { detached: true, stdio: 'ignore' }).unref();
  log.info('kiosk', 'TV window opened (Alt+F4 to close it)');
}
