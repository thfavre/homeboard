import { unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import express from 'express';
import {
  FINAL_SEC,
  LOBBY_MAX_SEC,
  type CustomQuestion,
  type CustomQuiz,
  type LibraryItem,
  type QuizFx,
  type QuizPhase,
  type QuizPlayer,
  type QuizSettings,
  type QuizSource,
  type QuizTopic,
  type QuizState,
} from '../../../shared/quiz.ts';
import type { Charge } from '../../core/economy.ts';
import { JsonFile } from '../../core/jsonFile.ts';
import { defineModule } from '../../core/module.ts';
import type { Guest } from '../../core/session.ts';
import type { GamesApi } from '../games/index.ts';
import { HbError, clamp, cleanName, num, uid } from '../../core/util.ts';

interface Question {
  text: string;
  answers: string[];
  correct: number;
  category: string;
  difficulty: string;
  image?: string;
}

const COUNTDOWN_MS = 5_000;
const REVEAL_MS = 6_000;
const SCORES_MS = 6_000;
const FINAL_MS = FINAL_SEC * 1000;
const LOBBY_MS = LOBBY_MAX_SEC * 1000;
/** When half the players are ready, the lobby waits at most this long */
const HALF_READY_MS = 15_000;
const MAX_POINTS = 1000;
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
/** Minimum time between two celebrations of the same guest */
const FX_COOLDOWN: Record<QuizFx['kind'], number> = { spin: 1200, hop: 900, wiggle: 900, peek: 2500 };

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
 * Quiz game: questions from Open Trivia DB or from custom quizzes, shown on the TV,
 * answered on phones. The host or a guest (for a fee) starts it. Faster right answers
 * score more; the podium wins money and can play on the TV at the end.
 */
export default defineModule<QuizSettings>({
  id: 'quiz',
  name: 'Quiz',
  description: 'Trivia game on the TV, guests answer from their phone',
  settings: { questions: 10, timeSec: 20, category: 0, difficulty: '' },

  setup(ctx) {
    const media = ctx.mediaDir();
    const library = new JsonFile<{ quizzes: CustomQuiz[] }>(join(ctx.dataDir, 'library.json'), { quizzes: [] });

    // ------------------------------------------------------------ game state
    let phase: QuizPhase = 'idle';
    let runId = '';
    let title = '';
    let source: 'trivia' | 'topic' | 'custom' = 'trivia';
    let owner: { id: string; name: string } | null = null;
    let lobbyMode: 'owner' | 'ready' = 'ready';
    let ready = new Set<string>();
    let questions: Question[] = [];
    let index = 0;
    let timeSec = 20;
    let error: string | null = null;
    let startedAt = 0;
    let answers = new Map<string, { choice: number; at: number }>();
    let players = new Map<string, QuizPlayer>();
    let podium: string[] = [];
    let reveal: QuizState['reveal'] = null;
    let paidBy: Charge | null = null;
    const lastFx = new Map<string, number>();

    // Timer of the current phase (can be paused)
    let timer: NodeJS.Timeout | null = null;
    let endsAt: number | null = null;
    let phaseMs = 0;
    let next: (() => void) | null = null;
    let paused: { left: number; at: number } | null = null;

    let token = '';
    let categories: { id: number; name: string }[] | null = null;

    ctx.price({ key: 'quiz.start', label: 'Start a quiz', default: 10000 });
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

    const loadTrivia = async (s: QuizSettings): Promise<Question[]> => {
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

    // ------------------------------------------------------------ topics (The Trivia API)
    //
    // Open Trivia DB only has broad categories. The Trivia API has about 1400 topics
    // (tags) such as "harry_potter" or "switzerland", which guests can search.

    const TRIVIA_API = 'https://the-trivia-api.com/v2';
    let topics: QuizTopic[] | null = null;

    const prettyTopic = (tag: string) =>
      tag
        .trim()
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/(^|\s)(\S)/g, (_m, space: string, c: string) => space + c.toUpperCase());

    const loadTopics = async (): Promise<QuizTopic[]> => {
      if (topics) return topics;
      const tags: string[] = await fetchJson(`${TRIVIA_API}/tags`).catch(() => {
        throw new HbError('Could not reach the topic list, try again');
      });
      // "harry potter" and "harry_potter" are the same topic: query both spellings
      const byLabel = new Map<string, QuizTopic>();
      for (const tag of tags) {
        if (typeof tag !== 'string' || !tag.trim()) continue;
        const label = prettyTopic(tag);
        const key = label.toLowerCase();
        const t = byLabel.get(key) ?? { label, tags: [] };
        t.tags.push(tag);
        byLabel.set(key, t);
      }
      topics = [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
      return topics;
    };

    const searchTopics = async (q: unknown): Promise<QuizTopic[]> => {
      const text = String(q ?? '').trim().toLowerCase();
      const all = await loadTopics();
      if (!text) return [];
      const starts = all.filter((t) => t.label.toLowerCase().startsWith(text));
      const contains = all.filter((t) => !t.label.toLowerCase().startsWith(text) && t.label.toLowerCase().includes(text));
      return [...starts, ...contains].slice(0, 40);
    };

    const loadTopic = async (topic: QuizTopic, s: QuizSettings): Promise<Question[]> => {
      const ask = async (difficulty: string) => {
        const params = new URLSearchParams({ limit: String(Math.min(50, s.questions)), tags: topic.tags.join(',') });
        if (difficulty) params.set('difficulties', difficulty);
        const list: any[] = await fetchJson(`${TRIVIA_API}/questions?${params}`);
        return list.filter((q) => q?.question?.text && q.correctAnswer && Array.isArray(q.incorrectAnswers));
      };
      let list = await ask(s.difficulty);
      // Small topics often have nothing in one difficulty: take any difficulty then
      if (!list.length && s.difficulty) list = await ask('');
      if (!list.length) throw new HbError(`No questions found about "${topic.label}". Try another topic.`);
      return list.map((q) => {
        const answers = shuffle([q.correctAnswer, ...q.incorrectAnswers.slice(0, 3)]);
        return { text: q.question.text, answers, correct: answers.indexOf(q.correctAnswer), category: topic.label, difficulty: q.difficulty ?? '' };
      });
    };

    const customQuestions = (quiz: CustomQuiz): Question[] =>
      quiz.questions.map((q) => ({ text: q.text, answers: q.answers, correct: q.correct, category: '', difficulty: '', image: q.image }));

    // ------------------------------------------------------------ timer

    const schedule = (ms: number | null, then: (() => void) | null) => {
      if (timer) clearTimeout(timer);
      timer = null;
      paused = null;
      next = then;
      phaseMs = ms ?? 0;
      endsAt = ms === null ? null : Date.now() + ms;
      if (ms !== null && then) timer = setTimeout(then, ms);
      ctx.publish();
    };

    /** Shorten the current wait (never lengthen it) */
    const shortenTo = (ms: number) => {
      if (paused || !endsAt || !next) return;
      if (endsAt - Date.now() <= ms) return;
      if (timer) clearTimeout(timer);
      endsAt = Date.now() + ms;
      timer = setTimeout(next, ms);
      ctx.publish();
    };

    const pause = () => {
      if (paused || phase === 'idle' || phase === 'loading' || !endsAt) return;
      if (timer) clearTimeout(timer);
      timer = null;
      paused = { left: Math.max(0, endsAt - Date.now()), at: Date.now() };
      endsAt = null;
      ctx.publish();
    };

    const resume = () => {
      if (!paused || !next) return;
      const { left, at } = paused;
      // Time spent paused does not count against answers
      startedAt += Date.now() - at;
      paused = null;
      endsAt = Date.now() + left;
      timer = setTimeout(next, left);
      ctx.publish();
    };

    // ------------------------------------------------------------ flow

    const onlineCount = () => [...ctx.session.guests.values()].filter((g) => g.sockets > 0).length;

    const player = (g: Guest): QuizPlayer => {
      let p = players.get(g.id);
      if (!p) players.set(g.id, (p = { id: g.id, name: g.name, color: g.color, score: 0, correct: 0, delta: 0 }));
      return p;
    };

    const openLobby = () => {
      phase = 'lobby';
      index = 0;
      players = new Map();
      ready = new Set();
      podium = [];
      // Everyone online is in the game from the start, so the lobby shows them
      for (const g of ctx.session.guests.values()) if (g.sockets > 0) player(g);
      ctx.activity(owner ? '{name} started a quiz, grab your phone' : 'A quiz is starting, grab your phone', { guest: owner ? ctx.session.guests.get(owner.id) : undefined });
      schedule(LOBBY_MS, countdown);
    };

    const countdown = () => {
      phase = 'countdown';
      schedule(COUNTDOWN_MS, askQuestion);
    };

    const askQuestion = () => {
      phase = 'question';
      answers = new Map();
      reveal = null;
      for (const p of players.values()) p.delta = 0;
      startedAt = Date.now();
      schedule(timeSec * 1000, showReveal);
    };

    const showReveal = () => {
      const q = questions[index];
      const counts = q.answers.map(() => 0);
      const limit = timeSec * 1000;
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
      podium = ranked.slice(0, 3).map((p) => p.id);
      const podiumRewards = ['quiz.first', 'quiz.second', 'quiz.third'];
      for (const p of players.values()) {
        const guest = ctx.session.guests.get(p.id);
        if (!guest) continue;
        let reward = ctx.economy.enabled ? Math.round(ctx.economy.earnAmount('quiz.correct') * p.correct) : 0;
        const rank = podium.indexOf(p.id);
        if (rank >= 0 && ctx.economy.enabled) reward += ctx.economy.earnAmount(podiumRewards[rank]);
        p.reward = reward;
        if (reward > 0) {
          ctx.economy.credit(guest, reward, rank >= 0 ? `Quiz: place ${rank + 1}` : 'Quiz: right answers');
          ctx.toast(guest, { text: 'Quiz winnings', amount: reward, kind: 'success' });
        }
      }
      if (ranked[0]) {
        const winner = ctx.session.guests.get(ranked[0].id);
        ctx.activity(winner ? '{name} won the quiz' : `${ranked[0].name} won the quiz`, { guest: winner, sensitive: !winner });
      }
      lastFx.clear();
      schedule(FINAL_MS, close);
    };

    const close = () => {
      schedule(null, null);
      phase = 'idle';
      questions = [];
      players = new Map();
      answers = new Map();
      ready = new Set();
      podium = [];
      reveal = null;
      owner = null;
      paidBy = null;
      ctx.takeover.stop();
      ctx.publish();
    };

    /** Coin Flip and Rhythm Rain leave the TV free, but a quiz would cover the throw or play over the music */
    const checkNoGame = () => {
      const game = ctx.use<GamesApi>('games')?.playing();
      if (game) throw new HbError(`${game} is being played, wait for it to end`);
    };

    /** Start a quiz: load the questions, then open the lobby */
    const launch = (src: QuizSource, by: Guest | null, charge: Charge | null) => {
      if (!ctx.enabled()) throw new HbError('The quiz is turned off');
      if (phase !== 'idle') throw new HbError('A quiz is already running');
      checkNoGame();
      ctx.takeover.start();
      runId = uid(6);
      phase = 'loading';
      error = null;
      owner = by ? { id: by.id, name: by.name } : null;
      lobbyMode = by ? 'owner' : 'ready';
      paidBy = charge;
      ctx.publish();

      let load: Promise<Question[]>;
      if (src.kind === 'custom') {
        const quiz = library.data.quizzes.find((q) => q.id === src.quizId);
        if (!quiz) {
          close();
          throw new HbError('This quiz does not exist anymore');
        }
        title = quiz.title;
        source = 'custom';
        timeSec = clamp(Math.round(num(src.timeSec, 20)), 5, 120);
        load = Promise.resolve(customQuestions(quiz));
      } else if (src.kind === 'topic') {
        const s = cleanSettings(src.settings);
        title = src.topic.label;
        source = 'topic';
        timeSec = s.timeSec;
        load = loadTopic(src.topic, s);
      } else {
        const s = cleanSettings(src.settings);
        ctx.settings.update(s);
        title = 'Trivia';
        source = 'trivia';
        timeSec = s.timeSec;
        // Loading can take a while (Open Trivia DB allows one request every 5 seconds)
        load = loadTrivia(s);
      }

      load
        .then((list) => {
          if (phase !== 'loading') return;
          questions = list;
          openLobby();
        })
        .catch((err) => {
          const charged = paidBy;
          close();
          error = err instanceof HbError ? err.message : `Could not get questions (${(err as Error).message})`;
          if (charged) {
            ctx.economy.refund(charged);
            ctx.toast(charged.guest, { text: `${error} You got your money back.`, kind: 'error' });
          }
          ctx.publish();
        });
    };

    const cleanSettings = (a: any): QuizSettings => {
      const s = ctx.settings.get();
      return {
        questions: clamp(Math.round(num(a?.questions, s.questions)), 3, 30),
        timeSec: clamp(Math.round(num(a?.timeSec, s.timeSec)), 5, 120),
        category: Math.round(num(a?.category, s.category)),
        difficulty: ['easy', 'medium', 'hard'].includes(a?.difficulty) ? a.difficulty : '',
      };
    };

    const parseSource = (args: any): QuizSource => {
      if (args?.source === 'custom') return { kind: 'custom', quizId: String(args.quizId ?? ''), timeSec: num(args.timeSec, 20) };
      if (args?.source === 'topic') {
        const tags = (Array.isArray(args.topic?.tags) ? args.topic.tags : []).filter((t: unknown) => typeof t === 'string' && t.length <= 60).slice(0, 6);
        if (!tags.length) throw new HbError('Pick a topic');
        return { kind: 'topic', topic: { label: cleanName(args.topic.label, 60) || tags[0], tags }, settings: cleanSettings(args) };
      }
      return { kind: 'trivia', settings: cleanSettings(args) };
    };

    // ------------------------------------------------------------ custom quizzes

    const libraryItem = (q: CustomQuiz): LibraryItem => ({
      id: q.id,
      title: q.title,
      author: q.author,
      authorId: q.authorId,
      count: q.questions.length,
      hasImages: q.questions.some((x) => x.image),
    });

    const cleanQuiz = (raw: any): Pick<CustomQuiz, 'title' | 'questions'> => {
      const titleText = cleanName(raw?.title, 60);
      if (!titleText) throw new HbError('Give your quiz a title');
      const list = Array.isArray(raw?.questions) ? raw.questions : [];
      if (!list.length) throw new HbError('Add at least one question');
      if (list.length > 50) throw new HbError('50 questions at most');
      const qs: CustomQuestion[] = list.map((q: any, i: number) => {
        const text = String(q?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!text) throw new HbError(`Question ${i + 1} has no text`);
        const filled = (Array.isArray(q?.answers) ? q.answers : []).map((a: unknown) => cleanName(a, 80));
        const correctText = filled[num(q?.correct, -1)];
        const answersList = filled.filter(Boolean).slice(0, 4);
        if (answersList.length < 2) throw new HbError(`Question ${i + 1} needs at least 2 answers`);
        if (!correctText) throw new HbError(`Question ${i + 1}: choose the right answer`);
        const image = typeof q?.image === 'string' && q.image.startsWith(ctx.mediaUrl('')) ? q.image : undefined;
        return { text, answers: answersList, correct: answersList.indexOf(correctText), image };
      });
      return { title: titleText, questions: qs };
    };

    const removeImages = (quiz: CustomQuiz, keep: Set<string> = new Set()) => {
      for (const q of quiz.questions) {
        if (!q.image || keep.has(q.image)) continue;
        try {
          unlinkSync(join(media, basename(q.image)));
        } catch {
          // already gone
        }
      }
    };

    const saveQuiz = (raw: any, author: { name: string; id: string } | null) => {
      const clean = cleanQuiz(raw);
      const existing = library.data.quizzes.find((q) => q.id === raw?.id);
      if (existing) {
        if (author && existing.authorId !== author.id) throw new HbError('You can only edit your own quizzes');
        removeImages(existing, new Set(clean.questions.map((q) => q.image ?? '')));
        Object.assign(existing, clean);
        library.save();
        ctx.publish();
        return libraryItem(existing);
      }
      if (library.data.quizzes.length >= 200) throw new HbError('The library is full, delete some quizzes first');
      const quiz: CustomQuiz = { id: uid(6), author: author?.name ?? 'Host', authorId: author?.id ?? '', createdAt: Date.now(), ...clean };
      library.data.quizzes.push(quiz);
      library.save();
      ctx.publish();
      return libraryItem(quiz);
    };

    const deleteQuiz = (id: string, author: Guest | null) => {
      const quiz = library.data.quizzes.find((q) => q.id === id);
      if (!quiz) return;
      if (author && quiz.authorId !== author.id) throw new HbError('You can only delete your own quizzes');
      removeImages(quiz);
      library.data.quizzes = library.data.quizzes.filter((q) => q.id !== id);
      library.save();
      ctx.publish();
    };

    const getQuiz = (id: unknown, author: Guest | null): CustomQuiz => {
      const quiz = library.data.quizzes.find((q) => q.id === id);
      if (!quiz) throw new HbError('Quiz not found');
      if (author && quiz.authorId !== author.id) throw new HbError('You can only edit your own quizzes');
      return quiz;
    };

    // Question pictures, from the host or a guest
    ctx.http.post('/image', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '8mb' }), (req, res) => {
      if (!ctx.guestFromRequest(req) && !ctx.isAdminRequest(req)) {
        res.status(403).json({ error: 'Please join the session first' });
        return;
      }
      const ext = IMAGE_TYPES[req.get('content-type') ?? ''];
      if (!ext || !Buffer.isBuffer(req.body) || req.body.length < 100) {
        res.status(400).json({ error: 'Send a JPG, PNG or WebP image' });
        return;
      }
      const file = `${uid(8)}.${ext}`;
      writeFileSync(join(media, file), req.body);
      res.json({ url: ctx.mediaUrl(file) });
    });

    // ------------------------------------------------------------ state

    ctx.state((): QuizState => {
      const q = questions[index];
      const showQuestion = phase === 'question' || phase === 'reveal';
      return {
        runId,
        phase,
        title,
        source,
        owner,
        lobbyMode,
        ready: [...ready],
        index,
        total: questions.length,
        timeSec,
        category: q?.category ?? '',
        difficulty: q?.difficulty ?? '',
        question: showQuestion && q ? { text: q.text, answers: q.answers, image: q.image } : null,
        endsAt,
        phaseMs,
        paused: !!paused,
        pausedLeft: paused?.left ?? 0,
        answered: phase === 'question' ? [...answers.keys()] : [],
        playerCount: onlineCount(),
        reveal,
        players: [...players.values()].sort((a, b) => b.score - a.score),
        podium,
        error,
        settings: ctx.settings.get(),
        library: library.data.quizzes.map(libraryItem),
      };
    });

    // ------------------------------------------------------------ guests

    ctx.onGuest('start', (args, guest) => {
      if (ctx.hub.takeover) throw new HbError('Something else is on the TV right now');
      if (phase !== 'idle') throw new HbError('A quiz is already running');
      checkNoGame();
      const src = parseSource(args);
      if (src.kind === 'custom' && !library.data.quizzes.some((q) => q.id === src.quizId)) throw new HbError('Pick a quiz');
      const charge = ctx.economy.charge(guest, 'quiz.start', 1, 'Started a quiz');
      try {
        launch(src, guest, charge);
      } catch (err) {
        ctx.economy.refund(charge);
        throw err;
      }
      return true;
    });

    /** The guest who started the quiz begins it */
    ctx.onGuest('begin', (_args, guest) => {
      if (phase !== 'lobby') throw new HbError('Too late');
      if (owner?.id !== guest.id) throw new HbError('Only the person who started the quiz can do that');
      countdown();
      return true;
    });

    /** Host-started quiz: players say they are ready, which shortens the wait */
    ctx.onGuest('ready', (_args, guest) => {
      if (phase !== 'lobby' || lobbyMode !== 'ready') throw new HbError('Not now');
      player(guest);
      ready.add(guest.id);
      const total = Math.max(1, onlineCount());
      if (ready.size >= total) countdown();
      else if (ready.size * 2 >= total) shortenTo(HALF_READY_MS);
      else ctx.publish();
      return true;
    });

    ctx.onGuest('answer', (args, guest) => {
      if (phase !== 'question') throw new HbError('Too late for this question');
      if (paused) throw new HbError('The quiz is paused');
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

    /** End screen: the winner drives their picture with a joystick */
    ctx.onGuest('move', (args, guest) => {
      if (phase !== 'final' || podium[0] !== guest.id) return false;
      ctx.emit('tv', 'move', { id: guest.id, x: clamp(num(args.x), -1, 1), y: clamp(num(args.y), -1, 1) });
      return true;
    });

    /** End screen: each player has a little show depending on their rank */
    ctx.onGuest('celebrate', (_args, guest) => {
      if (phase !== 'final' || !players.has(guest.id)) throw new HbError('Not now');
      const rank = podium.indexOf(guest.id);
      const kind: QuizFx['kind'] = rank === 0 ? 'spin' : rank === 1 ? 'hop' : rank === 2 ? 'wiggle' : 'peek';
      const last = lastFx.get(guest.id) ?? 0;
      if (Date.now() - last < FX_COOLDOWN[kind]) return false;
      lastFx.set(guest.id, Date.now());
      const sides = ['left', 'right', 'top', 'bottom'] as const;
      const fx: QuizFx = { id: guest.id, kind, ...(kind === 'peek' ? { side: sides[Math.floor(Math.random() * 4)], pos: 0.15 + Math.random() * 0.7 } : {}) };
      ctx.emit('tv', 'fx', fx);
      return true;
    });

    ctx.onGuest('categories', () => loadCategories());
    ctx.onGuest('topics', (args) => searchTopics(args.q));
    ctx.onGuest('saveCustom', (args, guest) => saveQuiz(args.quiz, { name: guest.name, id: guest.id }));
    ctx.onGuest('getCustom', (args, guest) => getQuiz(args.id, guest));
    ctx.onGuest('deleteCustom', (args, guest) => {
      deleteQuiz(String(args.id), guest);
      return true;
    });

    // ------------------------------------------------------------ host

    ctx.onAdmin('start', (args) => {
      launch(parseSource(args), null, null);
      return true;
    });

    /** Move to the next step right away */
    ctx.onAdmin('next', () => {
      if (paused) resume();
      if (phase === 'lobby') countdown();
      else if (phase === 'countdown') askQuestion();
      else if (phase === 'scores') {
        index += 1;
        askQuestion();
      } else if (phase === 'question') showReveal();
      else if (phase === 'reveal') (index + 1 < questions.length ? showScores : finish)();
      else if (phase === 'final') close();
    });

    ctx.onAdmin('pause', () => pause());
    ctx.onAdmin('resume', () => resume());

    /** Seconds per question, live: also applies to the question on screen */
    ctx.onAdmin('setTime', (args) => {
      timeSec = clamp(Math.round(num(args.timeSec, timeSec)), 5, 120);
      if (source === 'trivia') ctx.settings.update({ timeSec });
      if (phase === 'question') {
        const left = startedAt + timeSec * 1000 - Date.now();
        if (paused) paused.left = Math.max(1000, left);
        else schedule(Math.max(500, left), showReveal);
        phaseMs = timeSec * 1000;
      }
      ctx.publish();
    });

    ctx.onAdmin('stop', () => {
      const charged = paidBy;
      if (charged && (phase === 'lobby' || phase === 'loading' || phase === 'countdown')) {
        ctx.economy.refund(charged);
        ctx.toast(charged.guest, { text: 'The host stopped your quiz, you got your money back', kind: 'info' });
      }
      close();
    });

    const loadCategories = async () => {
      if (!categories) {
        const data = await fetchJson('https://opentdb.com/api_category.php').catch(() => null);
        if (!data) throw new HbError('Could not reach Open Trivia DB');
        categories = data.trivia_categories;
      }
      return categories;
    };
    ctx.onAdmin('categories', () => loadCategories());
    ctx.onAdmin('topics', (args) => searchTopics(args.q));
    ctx.onAdmin('saveCustom', (args) => saveQuiz(args.quiz, null));
    ctx.onAdmin('getCustom', (args) => getQuiz(args.id, null));
    ctx.onAdmin('deleteCustom', (args) => {
      deleteQuiz(String(args.id), null);
      return true;
    });

    ctx.onToggle((on) => {
      if (!on && phase !== 'idle') close();
    });
    ctx.onSessionReset(() => {
      if (phase !== 'idle') close();
    });
  },
});
