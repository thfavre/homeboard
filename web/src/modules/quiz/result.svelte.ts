import type { QuizState } from '$shared/quiz.ts';
import { hb } from '$lib/client.svelte.ts';

/**
 * The end screen stays on each phone after the quiz is over, until the guest closes it.
 * snapshot: the last final state seen; closed: the run the guest closed.
 */
export const quizResult = $state({
  snapshot: null as QuizState | null,
  /** When the final screen started (server time) */
  finalAt: 0,
  closed: '',
  /** Participative quiz screens this phone closed: `${id}:writing` or `${id}:ready` */
  collectClosed: [] as string[],
  /** Participative quiz this phone opened on purpose (shown even after skipping) */
  collectOpened: '',
  /** Opened to change the questions sent: the editor opens straight away */
  collectEdit: false,
});

/** Which screen of the participative quiz this phone shows, if any */
export function collectScreen(): 'writing' | 'ready' | null {
  const c = (hb.modules.quiz as QuizState | undefined)?.collect;
  const me = hb.me?.id;
  if (!c || !me) return null;
  // Changing their questions (and reloaded meanwhile)
  if (c.phase === 'writing' && c.editing.includes(me)) return 'writing';
  if (quizResult.collectClosed.includes(`${c.id}:${c.phase}`)) return null;
  if (c.phase === 'writing') return c.skipped.includes(me) && quizResult.collectOpened !== c.id ? null : 'writing';
  // Once written, only the guest who asked for it is offered to play it (the host plays it from the admin)
  return c.by?.id === me ? 'ready' : null;
}

export function closeCollectScreen(): void {
  const c = (hb.modules.quiz as QuizState | undefined)?.collect;
  if (c) quizResult.collectClosed.push(`${c.id}:${c.phase}`);
  quizResult.collectOpened = '';
}

/** edit: go straight to changing the questions already sent */
export function openCollectScreen(edit = false): void {
  const c = (hb.modules.quiz as QuizState | undefined)?.collect;
  if (!c) return;
  quizResult.collectClosed = quizResult.collectClosed.filter((k) => k !== `${c.id}:${c.phase}`);
  quizResult.collectOpened = c.id;
  quizResult.collectEdit = edit;
}

export function showQuizScreen(live: boolean): boolean {
  const q = hb.modules.quiz as QuizState | undefined;
  // A quiz is running and this phone did not close its results
  if (live && q && !(q.phase === 'final' && quizResult.closed === q.runId)) return true;
  // The quiz is over on the server, but the results stay until closed
  if (quizResult.snapshot && quizResult.closed !== quizResult.snapshot.runId) return true;
  return !!collectScreen();
}

export function closeQuizScreen(): void {
  quizResult.closed = quizResult.snapshot?.runId ?? (hb.modules.quiz as QuizState | undefined)?.runId ?? '';
  quizResult.snapshot = null;
}
