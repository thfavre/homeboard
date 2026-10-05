export type QuizPhase = 'idle' | 'loading' | 'lobby' | 'question' | 'reveal' | 'scores' | 'final';

export const ANSWER_STYLES = [
  { shape: 'triangle', color: '#ff4d6d' },
  { shape: 'diamond', color: '#4d96ff' },
  { shape: 'circle', color: '#f5b83d' },
  { shape: 'square', color: '#2ec4a0' },
] as const;

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

export interface QuizState {
  phase: QuizPhase;
  index: number;
  total: number;
  category: string;
  difficulty: string;
  question: { text: string; answers: string[] } | null;
  /** When the current phase ends (ms timestamp), or null when it waits for the host */
  endsAt: number | null;
  answered: string[];
  playerCount: number;
  reveal: { correct: number; counts: number[] } | null;
  players: QuizPlayer[];
  error: string | null;
  /** Admin only */
  settings?: QuizSettings;
}

export interface QuizSettings {
  questions: number;
  timeSec: number;
  category: number;
  difficulty: '' | 'easy' | 'medium' | 'hard';
}
