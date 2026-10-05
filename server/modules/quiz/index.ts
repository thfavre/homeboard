import type { QuizPhase, QuizPlayer, QuizSettings, QuizState } from '../../../shared/quiz.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import { HbError, clamp, num } from '../../core/util.ts';

interface Question {
  text: string;
  answers: string[];
  correct: number;
  category: string;
  difficulty: string;
}

const LOBBY_MS = 12_000;
const REVEAL_MS = 6_000;
const SCORES_MS = 6_000;
const FINAL_MS = 60_000;
const MAX_POINTS = 1000;

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Trivia game: questions from Open Trivia DB on the TV, guests answer on their phone.
 * Faster correct answers score more; the podium wins money.
 */
export default defineModule<QuizSettings>({
  id: 'quiz',
  name: 'Quiz',
  description: 'Trivia game on the TV, guests answer from their phone',
  settings: { questions: 10, timeSec: 20, category: 0, difficulty: '' },

  setup(ctx) {
    let phase: QuizPhase = 'idle';
    let questions: Question[] = [];
    let index = 0;
    let endsAt: number | null = null;
    let timer: NodeJS.Timeout | null = null;
    let error: string | null = null;
    let startedAt = 0;
    let answers = new Map<string, { choice: number; at: number }>();
    let players = new Map<string, QuizPlayer>();
    let reveal: QuizState['reveal'] = null;
    let token = '';
    let categories: { id: number; name: string }[] | null = null;

    ctx.earn({ key: 'quiz.correct', label: 'Quiz: right answer', default: 200, describe: (a) => `${a} for every right answer in a quiz` });
    ctx.earn({ key: 'quiz.first', label: 'Quiz: 1st place', default: 3000, describe: (a) => `${a} for winning a quiz` });
    ctx.earn({ key: 'quiz.second', label: 'Quiz: 2nd place', default: 2000, describe: (a) => `${a} for second place` });
    ctx.earn({ key: 'quiz.third', label: 'Quiz: 3rd place', default: 1000, describe: (a) => `${a} for third place` });

    // ------------------------------------------------------------ questions

    const fetchJson = async (url: string) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Open Trivia DB answered ${res.status}`);
      return res.json() as Promise<any>;
    };

    const loadQuestions = async (s: QuizSettings): Promise<Question[]> => {
      if (!token) token = (await fetchJson('https://opentdb.com/api_token.php?command=request')).token ?? '';
      const params = new URLSearchParams({ amount: String(s.questions), type: 'multiple', encode: 'url3986' });
      if (token) params.set('token', token);
      if (s.category) params.set('category', String(s.category));
      if (s.difficulty) params.set('difficulty', s.difficulty);
      for (let attempt = 0; attempt < 3; attempt++) {
        const data = await fetchJson(`https://opentdb.com/api.php?${params}`);
        if (data.response_code === 0) {
          return data.results.map((r: any) => {
            const correct = decode(r.correct_answer);
            const all = shuffle([correct, ...r.incorrect_answers.map(decode)]);
            return { text: decode(r.question), answers: all, correct: all.indexOf(correct), category: decode(r.category), difficulty: r.difficulty };
          });
        }
        if (data.response_code === 4 && token) {
          // Every question of this category was already asked: start over
          await fetchJson(`https://opentdb.com/api_token.php?command=reset&token=${token}`);
        } else if (data.response_code === 3) {
          token = (await fetchJson('https://opentdb.com/api_token.php?command=request')).token ?? '';
          params.set('token', token);
        } else if (data.response_code === 1) {
          throw new HbError('Not enough questions for this category and difficulty. Try another mix.');
        }
        // Code 5 is the rate limit: one request every 5 seconds
        await new Promise((r) => setTimeout(r, 5200));
      }
      throw new HbError('Could not get questions, try again in a few seconds');
    };

    // ------------------------------------------------------------ game flow

    const player = (g: Guest): QuizPlayer => {
      let p = players.get(g.id);
      if (!p) players.set(g.id, (p = { id: g.id, name: g.name, color: g.color, score: 0, correct: 0, delta: 0 }));
      return p;
    };

    const onlineCount = () => [...ctx.session.guests.values()].filter((g) => g.sockets > 0).length;

    const schedule = (ms: number | null, next: () => void) => {
      if (timer) clearTimeout(timer);
      timer = null;
      endsAt = ms === null ? null : Date.now() + ms;
      if (ms !== null) timer = setTimeout(next, ms);
      ctx.publish();
    };

    const askQuestion = () => {
      phase = 'question';
      answers = new Map();
      reveal = null;
      for (const p of players.values()) p.delta = 0;
      startedAt = Date.now();
      schedule(ctx.settings.get().timeSec * 1000, showReveal);
    };

    const showReveal = () => {
      const q = questions[index];
      const counts = [0, 0, 0, 0];
      const limit = ctx.settings.get().timeSec * 1000;
      for (const [guestId, a] of answers) {
        counts[a.choice] = (counts[a.choice] ?? 0) + 1;
        const p = players.get(guestId);
        if (!p || a.choice !== q.correct) continue;
        const remaining = Math.max(0, limit - (a.at - startedAt));
        p.delta = Math.round(MAX_POINTS / 2 + (MAX_POINTS / 2) * (remaining / limit));
        p.score += p.delta;
        p.correct += 1;
      }
      phase = 'reveal';
      reveal = { correct: q.correct, counts };
      schedule(REVEAL_MS, index + 1 < questions.length ? showScores : finish);
    };

    const showScores = () => {
      phase = 'scores';
      schedule(SCORES_MS, () => {
        index += 1;
        askQuestion();
      });
    };

    const finish = () => {
      phase = 'final';
      const ranked = [...players.values()].filter((p) => p.score > 0).sort((a, b) => b.score - a.score);
      const podium = ['quiz.first', 'quiz.second', 'quiz.third'];
      for (const p of players.values()) {
        const guest = ctx.session.guests.get(p.id);
        if (!guest) continue;
        let reward = ctx.economy.enabled ? Math.round(ctx.economy.earnAmount('quiz.correct') * p.correct) : 0;
        const rank = ranked.indexOf(p);
        if (rank >= 0 && rank < 3 && ctx.economy.enabled) reward += ctx.economy.earnAmount(podium[rank]);
        p.reward = reward;
        if (reward > 0) {
          ctx.economy.credit(guest, reward, rank >= 0 && rank < 3 ? `Quiz: place ${rank + 1}` : 'Quiz: right answers');
          ctx.toast(guest, { text: 'Quiz winnings', amount: reward, kind: 'success' });
        }
      }
      if (ranked[0]) {
        const winner = ctx.session.guests.get(ranked[0].id);
        ctx.activity(winner ? '{name} won the quiz' : `${ranked[0].name} won the quiz`, { guest: winner, sensitive: !winner });
      }
      schedule(FINAL_MS, close);
    };

    const close = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      phase = 'idle';
      questions = [];
      players = new Map();
      answers = new Map();
      reveal = null;
      endsAt = null;
      ctx.takeover.stop();
      ctx.publish();
    };

    // ------------------------------------------------------------ state

    ctx.state((role): QuizState => {
      const q = questions[index];
      const showQuestion = phase === 'question' || phase === 'reveal';
      return {
        phase,
        index,
        total: questions.length,
        category: q?.category ?? '',
        difficulty: q?.difficulty ?? '',
        question: showQuestion && q ? { text: q.text, answers: q.answers } : null,
        endsAt,
        answered: phase === 'question' ? [...answers.keys()] : [],
        playerCount: onlineCount(),
        reveal,
        players: [...players.values()].sort((a, b) => b.score - a.score),
        error,
        ...(role === 'admin' ? { settings: ctx.settings.get() } : {}),
      };
    });

    // ------------------------------------------------------------ actions

    ctx.onGuest('answer', (args, guest) => {
      if (phase !== 'question') throw new HbError('Too late for this question');
      if (answers.has(guest.id)) throw new HbError('You already answered');
      const choice = Math.round(num(args.choice, -1));
      if (choice < 0 || choice >= (questions[index]?.answers.length ?? 0)) throw new HbError('Pick an answer');
      player(guest);
      answers.set(guest.id, { choice, at: Date.now() });
      // Everyone answered: no need to wait for the timer
      if (answers.size >= onlineCount()) showReveal();
      else ctx.publish();
      return true;
    });

    ctx.onAdmin('start', (args) => {
      if (phase !== 'idle') throw new HbError('A quiz is already running');
      const s = ctx.settings.get();
      const settings: QuizSettings = {
        questions: clamp(Math.round(num(args.questions, s.questions)), 3, 30),
        timeSec: clamp(Math.round(num(args.timeSec, s.timeSec)), 5, 60),
        category: Math.round(num(args.category, s.category)),
        difficulty: ['easy', 'medium', 'hard'].includes(args.difficulty) ? args.difficulty : '',
      };
      ctx.settings.update(settings);
      ctx.takeover.start();
      phase = 'loading';
      error = null;
      ctx.publish();
      // Loading can take a while (Open Trivia DB allows one request every 5 seconds)
      loadQuestions(settings)
        .then((list) => {
          if (phase !== 'loading') return;
          questions = list;
          index = 0;
          players = new Map();
          // Everyone online is in the game from the start, so the lobby shows them
          for (const g of ctx.session.guests.values()) if (g.sockets > 0) player(g);
          phase = 'lobby';
          ctx.activity('A quiz is starting, grab your phone');
          schedule(LOBBY_MS, askQuestion);
        })
        .catch((err) => {
          close();
          error = err instanceof HbError ? err.message : `Could not get questions (${(err as Error).message})`;
          ctx.publish();
        });
      return true;
    });

    /** Move to the next step right away */
    ctx.onAdmin('next', () => {
      if (phase === 'lobby' || phase === 'scores') {
        if (phase === 'scores') index += 1;
        askQuestion();
      } else if (phase === 'question') showReveal();
      else if (phase === 'reveal') (index + 1 < questions.length ? showScores : finish)();
      else if (phase === 'final') close();
    });

    ctx.onAdmin('stop', () => close());

    ctx.onAdmin('categories', async () => {
      if (!categories) {
        const data = await fetchJson('https://opentdb.com/api_category.php').catch(() => null);
        if (!data) throw new HbError('Could not reach Open Trivia DB');
        categories = data.trivia_categories;
      }
      return categories;
    });

    ctx.onToggle((on) => {
      if (!on && phase !== 'idle') close();
    });
    ctx.onSessionReset(() => {
      if (phase !== 'idle') close();
    });
  },
});
