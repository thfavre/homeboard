export type QuizPhase = 'idle' | 'loading' | 'lobby' | 'countdown' | 'question' | 'reveal' | 'scores' | 'final';

export const ANSWER_STYLES = [
  { shape: 'triangle', color: '#ff4d6d' },
  { shape: 'diamond', color: '#4d96ff' },
  { shape: 'circle', color: '#f5b83d' },
  { shape: 'square', color: '#2ec4a0' },
] as const;

/** Longest a lobby waits before the quiz starts by itself */
export const LOBBY_MAX_SEC = 60;
/** Length of the end screen, where the podium can play (the host sets it, within these) */
export const FINAL_SEC = 30;
export const FINAL_MIN_SEC = 10;
export const FINAL_MAX_SEC = 180;
/** Questions per quiz: the host sets the most, within these */
export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 50;
/** Participative quiz: questions each guest can write, and how long they get by default */
export const COLLECT_MAX_QUESTIONS = 3;
export const COLLECT_DEFAULT_MIN = 5;

export interface QuizPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  correct: number;
  /** Points won in the last question */
  delta: number;
  /** Money won at the end */
  reward?: number;
}

export interface QuizSettings {
  questions: number;
  timeSec: number;
  category: number;
  difficulty: '' | 'easy' | 'medium' | 'hard';
  /** Host only: the most questions a quiz can have (a longer custom quiz plays its first ones) */
  maxQuestions: number;
  /** Host only: seconds the end screen with the podium stays on */
  finalSec: number;
}

/** What a guest or the host picks when starting a quiz */
export type QuizPick = Pick<QuizSettings, 'questions' | 'timeSec' | 'category' | 'difficulty'>;

/** Where the questions come from */
export type QuizSource =
  | { kind: 'trivia'; settings: QuizPick }
  | { kind: 'topic'; topic: QuizTopic; settings: QuizPick }
  | { kind: 'custom'; quizId: string; timeSec: number };

/** A topic of The Trivia API (one label can match several spellings of the same tag) */
export interface QuizTopic {
  label: string;
  tags: string[];
}

export interface CustomQuestion {
  text: string;
  /** 2 to 4 answers */
  answers: string[];
  correct: number;
  image?: string;
  /** Participative quiz: the guest who wrote it (they cannot score on it) */
  authorId?: string;
  authorName?: string;
}

export interface CustomQuiz {
  id: string;
  title: string;
  author: string;
  /** Guest who made it (they can edit it during the session); empty for the host */
  authorId: string;
  createdAt: number;
  questions: CustomQuestion[];
  /** Written by several guests (participative quiz): only the host can edit it */
  collective?: boolean;
}

/** A quiz being created or edited */
export interface QuizDraft {
  id?: string;
  title: string;
  questions: CustomQuestion[];
}

/** What everyone sees of the library: no answers */
export interface LibraryItem {
  id: string;
  title: string;
  author: string;
  authorId: string;
  count: number;
  hasImages: boolean;
  collective?: boolean;
}

/** A participative quiz being written: every guest writes 1 to 3 questions, or skips */
export interface QuizCollect {
  id: string;
  title: string;
  /** Guest who asked for it, null for the host */
  by: { id: string; name: string } | null;
  phase: 'writing' | 'ready';
  /** When writing ends by itself (ms timestamp) */
  endsAt: number;
  /** Guests who sent questions, and how many */
  done: { id: string; name: string; color: string; count: number }[];
  skipped: string[];
  /** Guests online who have not answered yet */
  waiting: { id: string; name: string; color: string }[];
  /** Once ready: the saved quiz */
  quizId: string | null;
  total: number;
}

export interface QuizState {
  /** Changes with every quiz, so phones can tell two quizzes apart */
  runId: string;
  phase: QuizPhase;
  title: string;
  source: 'trivia' | 'topic' | 'custom';
  /** Guest who started the quiz: they press Start. Null when the host started it. */
  owner: { id: string; name: string } | null;
  /** 'owner': the owner starts it. 'ready': it starts sooner as players press Ready. */
  lobbyMode: 'owner' | 'ready';
  ready: string[];
  index: number;
  total: number;
  timeSec: number;
  category: string;
  difficulty: string;
  question: { text: string; answers: string[]; image?: string; author?: { id: string; name: string } } | null;
  /** When the current phase ends (ms timestamp), null while paused or waiting */
  endsAt: number | null;
  /** Length of the current phase, for countdown bars */
  phaseMs: number;
  paused: boolean;
  /** Time left in the phase while paused */
  pausedLeft: number;
  answered: string[];
  playerCount: number;
  reveal: { correct: number; counts: number[] } | null;
  players: QuizPlayer[];
  /** Ids of the top 3 at the end */
  podium: string[];
  error: string | null;
  settings: QuizSettings;
  library: LibraryItem[];
  collect: QuizCollect | null;
}

export interface QuizFx {
  id: string;
  kind: 'spin' | 'hop' | 'wiggle' | 'peek';
  /** For peek: the edge it comes from and where along it (0..1) */
  side?: 'left' | 'right' | 'top' | 'bottom';
  pos?: number;
}
