import { onEvent, rpc } from '$lib/client.svelte.ts';
import type { Letter, Mailbox } from '$shared/worldActions.ts';

/**
 * The guest's letters, shared by the home screen's card and the Actions tab: the mailbox as last
 * loaded, and the letter open on the screen (a new one opens by itself as the courier hands it over).
 */
export const mail = $state<{ box: Mailbox | null; open: Letter | null }>({ box: null, open: null });

let listening = false;

/** Start listening for letters handed over (once for the page) */
export function watchMail(): void {
  if (listening) return;
  listening = true;
  onEvent<Letter>('world', 'letter', (l) => {
    mail.open = l;
    void loadMail();
  });
}

export async function loadMail(): Promise<void> {
  try {
    mail.box = await rpc<Mailbox>('world', 'mail');
  } catch {
    // Loaded again on the next visit
  }
}

/** The letters received and not opened yet */
export const unread = (): Letter[] => mail.box?.inbox.filter((l) => l.readAt === null) ?? [];

/** Show a letter, and mark it read */
export async function openLetter(l: Letter): Promise<void> {
  mail.open = l;
  if (l.readAt !== null) return;
  try {
    mail.box = await rpc<Mailbox>('world', 'readLetter', { id: l.id });
  } catch {
    // Still unread: it shows again next time
  }
}
