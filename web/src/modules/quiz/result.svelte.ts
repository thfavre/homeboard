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
});

/** Which screen of the participative quiz this phone shows, if any */
export function collectScreen(): 'writing' | 'ready' | null {
  const c = (hb.modules.quiz as QuizState | undefined)?.collect;
  const me = hb.me?.id;
  if (!c || !me) return null;
  if (quizResult.collectClosed.includes(`${c.id}:${c.phase}`)) return null;
  if (c.phase === 'writing') return c.skipped.includes(me) ? null : 'writing';
  // Once written, offer to play it to those who took part
  return c.by?.id === me || c.done.some((d) => d.id === me) ? 'ready' : null;
}

export function closeCollectScreen(): void {
  const c = (hb.modules.quiz as QuizState | undefined)?.collect;
  if (c) quizResult.collectClosed.push(`${c.id}:${c.phase}`);
}

export function openCollectScreen(): void {
  const c = (hb.modules.quiz as QuizState | undefined)?.collect;
  if (c) quizResult.collectClosed = quizResult.collectClosed.filter((k) => k !== `${c.id}:${c.phase}`);
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
