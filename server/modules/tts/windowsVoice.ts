import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ttsLang, type TtsLang } from '../../../shared/tts.ts';

/**
 * Shoutouts spoken by the Windows voices on the server, saved as WAV files.
 * The TV plays the file through its own amplifier, so it can be louder than
 * the browser's speech, which stops at 100%. Other systems: the TV speaks instead.
 */
const SCRIPT = fileURLToPath(new URL('./speak.ps1', import.meta.url));

const run = (args: string[], timeout: number) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, ...args],
      { timeout, windowsHide: true },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });

/** Languages the server has voices for (empty when it cannot speak) */
export async function serverLangs(): Promise<TtsLang[]> {
  if (process.platform !== 'win32') return [];
  try {
    const out = await run(['-List'], 15_000);
    const langs = out.split(/\r?\n/).map((l) => ttsLang(l.trim().slice(0, 2).toLowerCase())?.id);
    return [...new Set(langs.filter((l): l is TtsLang => !!l))];
  } catch {
    return [];
  }
}

/** Speak the text into a WAV file */
export async function speakToFile(text: string, lang: TtsLang, out: string): Promise<void> {
  await run(['-Lang', lang, '-Text', Buffer.from(text, 'utf8').toString('base64'), '-Out', out], 15_000);
}
