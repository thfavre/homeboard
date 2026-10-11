import type { CustomQuestion } from '$shared/quiz.ts';
import { hb, storageGet, storageSet } from '$lib/client.svelte.ts';

/**
 * Quiz drafts are saved on the phone as they are typed, so nothing is lost when the editor
 * closes by mistake, the phone reloads, or a game takes over the screen.
 */
export interface QuizDraftSave {
  title: string;
  questions: CustomQuestion[];
  savedAt: number;
}

const PREFIX = 'hb.quizDraft.';
/** Drafts nobody came back to are forgotten after this long */
const MAX_AGE = 3 * 24 * 3600_000;

/** Editors open on this phone: the Quiz panel stays open after a quiz while one is */
export const openEditors = $state({ count: 0 });

/** One draft per guest and per thing being written (a new quiz, a quiz being edited, a participative quiz) */
export const draftKey = (what: string) => `${PREFIX}${hb.me?.id ?? 'anon'}.${what}`;

export function loadDraft(key: string): QuizDraftSave | null {
  try {
    const d = JSON.parse(storageGet(key) ?? 'null') as QuizDraftSave | null;
    if (!d || !Array.isArray(d.questions) || Date.now() - d.savedAt > MAX_AGE) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, title: string, questions: CustomQuestion[]): void {
  storageSet(key, JSON.stringify({ title, questions, savedAt: Date.now() }));
}

export function clearDraft(key: string): void {
  storageSet(key, null);
}

/** Has a draft with something typed in it */
export function hasDraft(key: string): boolean {
  const d = loadDraft(key);
  return !!d && (!!d.title.trim() || d.questions.some((q) => q.text.trim() || q.answers.some((a) => a.trim())));
}

// Forget old drafts (participative quizzes long over, quizzes deleted...)
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX) && !loadDraft(key)) localStorage.removeItem(key);
  }
} catch {
  // No storage: no drafts
}
