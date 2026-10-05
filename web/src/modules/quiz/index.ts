import { Trophy } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import QuizTv from './QuizTv.svelte';
import QuizGuest from './QuizGuest.svelte';
import QuizStart from './QuizStart.svelte';
import QuizAdmin from './QuizAdmin.svelte';
import { showQuizScreen } from './result.svelte.ts';

export default {
  id: 'quiz',
  tvTakeover: QuizTv,
  guestTakeover: QuizGuest,
  showGuestTakeover: showQuizScreen,
  guest: { title: 'Quiz', tagline: 'Start a quiz on the TV, or make your own', icon: Trophy, order: 70, component: QuizStart, priceKey: 'quiz.start' },
  admin: { title: 'Quiz', icon: Trophy, order: 70, component: QuizAdmin },
} satisfies ClientModule;
