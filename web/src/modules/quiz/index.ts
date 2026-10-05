import { Trophy } from '@lucide/svelte';
import type { ClientModule } from '../types.ts';
import QuizTv from './QuizTv.svelte';
import QuizGuest from './QuizGuest.svelte';
import QuizAdmin from './QuizAdmin.svelte';

export default {
  id: 'quiz',
  tvTakeover: QuizTv,
  guestTakeover: QuizGuest,
  admin: { title: 'Quiz', icon: Trophy, order: 70, component: QuizAdmin },
} satisfies ClientModule;
