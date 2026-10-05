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
});

export function showQuizScreen(live: boolean): boolean {
  const q = hb.modules.quiz as QuizState | undefined;
  // A quiz is running and this phone did not close its results
  if (live && q && !(q.phase === 'final' && quizResult.closed === q.runId)) return true;
  // The quiz is over on the server, but the results stay until closed
  return !!quizResult.snapshot && quizResult.closed !== quizResult.snapshot.runId;
}

export function closeQuizScreen(): void {
  quizResult.closed = quizResult.snapshot?.runId ?? (hb.modules.quiz as QuizState | undefined)?.runId ?? '';
  quizResult.snapshot = null;
}
