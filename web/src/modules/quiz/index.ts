import { Trophy } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import QuizTv from './QuizTv.svelte';
import QuizGuest from './QuizGuest.svelte';
import QuizStart from './QuizStart.svelte';
import QuizAdmin from './QuizAdmin.svelte';
import QuizCollectTv from './QuizCollectTv.svelte';
import type { QuizState } from '$shared/quiz.ts';
import { hb } from '$lib/client.svelte.ts';
import { showQuizScreen } from './result.svelte.ts';

export default {
  id: 'quiz',
  // Participative quiz: who has written their questions
  tv: [{ slot: 'above', order: 20, component: QuizCollectTv, visible: () => !!(hb.modules.quiz as QuizState | undefined)?.collect }],
  tvTakeover: QuizTv,
  guestTakeover: QuizGuest,
  showGuestTakeover: showQuizScreen,
  guest: { title: 'Quiz', tagline: 'Start a quiz on the TV, make your own, or have everyone write one', icon: Trophy, order: 70, component: QuizStart, priceKey: 'quiz.start' },
  admin: { title: 'Quiz', icon: Trophy, order: 20, group: 'play', keywords: 'trivia questions custom scores', component: QuizAdmin },
} satisfies ClientModule;
