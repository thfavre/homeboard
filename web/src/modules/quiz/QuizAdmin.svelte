<script lang="ts">
  import { Flag, Minus, Pause, PenLine, Pencil, Play, Plus, SkipForward, Square, Trash2, Users, X } from '@lucide/svelte';
  import { COLLECT_DEFAULT_MIN, COLLECT_LIMIT_MAX, COLLECT_MAX_QUESTIONS, FINAL_MAX_SEC, FINAL_MIN_SEC, MAX_QUESTIONS, MIN_QUESTIONS, type CustomQuiz, type QuizDraft, type QuizSettings, type QuizState, type QuizTopic } from '$shared/quiz.ts';
  import { hb, rpc, attempt, serverNow } from '$lib/client.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import { Synced } from '$lib/synced.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import QuizEditor from './QuizEditor.svelte';
  import { clearDraft, draftKey } from './drafts.svelte.ts';

  const q = $derived(hb.modules.quiz as QuizState | undefined);
  const settings = () => (hb.modules.quiz as QuizState | undefined)?.settings;
  const questions = new Synced(() => settings()?.questions, 10);
  const timeSec = new Synced(() => settings()?.timeSec, 20);
  const category = new Synced(() => settings()?.category, 0);
  const difficulty = new Synced(() => settings()?.difficulty, '' as string);

  let source = $state<'trivia' | 'topic' | 'custom'>('trivia');
  let topicQuery = $state('');
  let topicResults = $state<QuizTopic[]>([]);
  let topic = $state<QuizTopic | null>(null);
  let topicTimer: ReturnType<typeof setTimeout> | null = null;

  function onTopicInput() {
    if (topicTimer) clearTimeout(topicTimer);
    topicTimer = setTimeout(async () => {
      topicResults = topicQuery.trim().length < 2 ? [] : await rpc<QuizTopic[]>('quiz', 'topics', { q: topicQuery }).catch(() => []);
    }, 300);
  }
  let chosen = $state<string | null>(null);
  let categories = $state<{ id: number; name: string }[]>([]);
  let starting = $state(false);
  let editing = $state<CustomQuiz | 'new' | null>(null);
  let saving = $state(false);
  const editorDraft = $derived(editing === 'new' ? draftKey('host.new') : editing ? draftKey(`host.edit.${editing.id}`) : undefined);

  rpc<{ id: number; name: string }[]>('quiz', 'categories')
    .then((c) => (categories = c))
    .catch(() => {});

  async function start() {
    starting = true;
    const args =
      source === 'custom'
        ? { source: 'custom', quizId: chosen, timeSec: timeSec.value }
        : source === 'topic'
          ? { source: 'topic', topic, questions: questions.value, timeSec: timeSec.value, difficulty: difficulty.value }
          : { source: 'trivia', questions: questions.value, timeSec: timeSec.value, category: category.value, difficulty: difficulty.value };
    await attempt(() => rpc('quiz', 'start', args));
    starting = false;
  }

  const setSettings = (patch: Partial<Pick<QuizSettings, 'maxQuestions' | 'finalSec'>>) => attempt(() => rpc('quiz', 'setSettings', patch));
  const setTime = (v: number) => attempt(() => rpc('quiz', 'setTime', { timeSec: Math.min(120, Math.max(5, v)) }));

  async function edit(id: string) {
    const quiz = await attempt(() => rpc<CustomQuiz>('quiz', 'getCustom', { id }));
    if (quiz) editing = quiz;
  }

  async function save(quiz: QuizDraft) {
    saving = true;
    const ok = await attempt(() => rpc('quiz', 'saveCustom', { quiz }), 'Quiz saved');
    saving = false;
    if (ok) {
      if (editorDraft) clearDraft(editorDraft);
      editing = null;
    }
  }

  async function remove(id: string, title: string) {
    if (await ask({ title: `Delete "${title}"?`, message: 'Its pictures are deleted too.', confirm: 'Delete', danger: true })) {
      attempt(() => rpc('quiz', 'deleteCustom', { id }), 'Quiz deleted');
    }
  }

  // Participative quiz
  let collectTitle = $state('');
  let collectMinutes = $state(COLLECT_DEFAULT_MIN);
  const collect = $derived(q?.collect ?? null);
  let now = $state(serverNow());
  $effect(() => {
    const t = setInterval(() => (now = serverNow()), 1000);
    return () => clearInterval(t);
  });
  const collectLeft = $derived(collect ? Math.max(0, Math.ceil((collect.endsAt - now) / 1000)) : 0);

  async function askEveryone() {
    if (await attempt(() => rpc('quiz', 'collectStart', { title: collectTitle, minutes: collectMinutes }))) collectTitle = '';
  }

  async function playCollected() {
    if (!collect?.quizId) return;
    starting = true;
    await attempt(() => rpc('quiz', 'start', { source: 'custom', quizId: collect.quizId, timeSec: timeSec.value }));
    starting = false;
  }

  // One guest writing again, with their own question limit
  let reopen = $state<{ id: string; name: string; max: number } | null>(null);
  const limitOf = (id: string) => collect?.limits[id] ?? COLLECT_MAX_QUESTIONS;
  const skippedGuests = $derived((collect?.skipped ?? []).map((id) => ({ id, name: hb.core?.admin?.guests.find((g) => g.id === id)?.name ?? 'A guest' })));

  async function reopenGuest() {
    if (!reopen) return;
    const { id, max } = reopen;
    if (await attempt(() => rpc('quiz', 'collectReopen', { guestId: id, max }))) reopen = null;
  }

  async function cancelCollect() {
    if (collect?.phase === 'ready') return attempt(() => rpc('quiz', 'collectCancel'));
    if (await ask({ title: 'Cancel the participative quiz?', message: 'Every question sent is thrown away.', confirm: 'Cancel it', danger: true })) {
      attempt(() => rpc('quiz', 'collectCancel'));
    }
  }

  const PHASES: Record<string, string> = {
    loading: 'Getting questions',
    lobby: 'Lobby, waiting for players',
    countdown: 'Starting',
    question: 'Question on screen',
    reveal: 'Showing the answer',
    scores: 'Leaderboard',
    final: 'Podium',
  };
</script>

{#if q}
  {#if q.phase === 'idle'}
    <Section title="Start a quiz" hint="The quiz takes over the TV and every phone. Guests can also start one from their phone.">
      <div class="tabs">
        <button class:active={source === 'trivia'} onclick={() => (source = 'trivia')}>By category</button>
        <button class:active={source === 'topic'} onclick={() => (source = 'topic')}>Search a topic</button>
        <button class:active={source === 'custom'} onclick={() => (source = 'custom')}>Custom quiz</button>
      </div>
      {#if source === 'topic'}
        <label class="field">
          <span>Topic: <strong>{topic ? topic.label : 'none yet'}</strong></span>
          <input class="input" bind:value={topicQuery} oninput={onTopicInput} placeholder="Harry Potter, football, cats, Switzerland..." />
        </label>
        <div class="topics">
          {#each topicResults as t (t.label)}
            <button class="chip" class:active={topic?.label === t.label} onclick={() => (topic = t)}>{t.label}</button>
          {:else}
            <p class="faint small">{topicQuery.trim().length < 2 ? 'Type at least 2 letters' : 'No topic found'}</p>
          {/each}
        </div>
      {/if}
      {#if source !== 'custom'}
        <div class="grid2">
          <label class="field">
            <span>Questions</span>
            <input class="input" type="number" min={MIN_QUESTIONS} max={q.settings.maxQuestions} bind:value={questions.value} onfocus={questions.start} />
          </label>
          {#if source === 'trivia'}
            <label class="field">
              <span>Category</span>
              <select class="input" bind:value={category.value} onfocus={category.start}>
                <option value={0}>Any category</option>
                {#each categories as c}<option value={c.id}>{c.name}</option>{/each}
              </select>
            </label>
          {/if}
          <label class="field">
            <span>Difficulty</span>
            <select class="input" bind:value={difficulty.value} onfocus={difficulty.start}>
              <option value="">Any</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>
      {:else}
        <label class="field">
          <span>Quiz</span>
          <select class="input" bind:value={chosen}>
            <option value={null}>Choose a quiz</option>
            {#each q.library as item (item.id)}<option value={item.id}>{item.title} ({item.count})</option>{/each}
          </select>
        </label>
      {/if}
      <label class="field">
        <span>Seconds per question</span>
        <input class="input" type="number" min="5" max="120" bind:value={timeSec.value} onfocus={timeSec.start} />
      </label>
      <div>
        <button class="btn primary" disabled={starting || (source === 'custom' && !chosen) || (source === 'topic' && !topic)} onclick={start}>
          <Play size={18} />
          {starting ? 'Starting...' : 'Start quiz'}
        </button>
      </div>
      <p class="faint small">Players get 60 seconds to join; pressing Ready on their phone makes it start sooner.</p>
      {#if q.error}<p class="error">{q.error}</p>{/if}
    </Section>
  {:else}
    <Section title="Quiz running">
      <div class="status">
        <span class="pill accent">{q.paused ? 'Paused' : PHASES[q.phase]}</span>
        <span class="dim truncate">{q.title}{q.owner ? `, started by ${q.owner.name}` : ''}</span>
      </div>
      <p class="dim small">
        {#if q.phase === 'lobby'}
          {q.lobbyMode === 'ready' ? `${q.ready.length} of ${q.playerCount} ready` : `Waiting for ${q.owner?.name} to start`}
        {:else if q.total}
          Question {q.index + 1} of {q.total}{q.phase === 'question' ? `, ${q.answered.length} of ${q.playerCount} answered` : ''}
        {:else}
          &nbsp;
        {/if}
      </p>
      <div class="row wrap">
        {#if q.paused}
          <button class="btn primary" onclick={() => attempt(() => rpc('quiz', 'resume'))}><Play size={18} /> Resume</button>
        {:else}
          <button class="btn" disabled={q.phase === 'loading'} onclick={() => attempt(() => rpc('quiz', 'pause'))}><Pause size={18} /> Pause</button>
        {/if}
        <button class="btn" onclick={() => attempt(() => rpc('quiz', 'next'))}><SkipForward size={18} /> {q.phase === 'final' ? 'Close' : 'Next step'}</button>
        <button
          class="btn danger"
          onclick={async () => (await ask({ title: 'Stop the quiz?', message: 'No rewards are given.', confirm: 'Stop quiz', danger: true })) && attempt(() => rpc('quiz', 'stop'))}
        >
          <Square size={18} /> Stop
        </button>
      </div>
      <div class="line">
        <div>
          <strong>Seconds per question</strong>
          <p class="faint small">Changes the question on screen too.</p>
        </div>
        <div class="stepper">
          <button class="btn small" onclick={() => setTime(q.timeSec - 5)} aria-label="5 seconds less"><Minus size={16} /></button>
          <span class="mono value">{q.timeSec}s</span>
          <button class="btn small" onclick={() => setTime(q.timeSec + 5)} aria-label="5 seconds more"><Plus size={16} /></button>
        </div>
      </div>
    </Section>

    {#if q.players.length}
      <Section title="Scores">
        {#each q.players as p, i (p.id)}
          <div class="line">
            <span class="mono faint">{i + 1}</span>
            <span class="grow">{p.name}</span>
            <span class="faint small">{p.correct} right</span>
            <strong class="mono">{p.score}</strong>
          </div>
        {/each}
      </Section>
    {/if}
  {/if}

  <Section title="Limits" hint="For every quiz, started by you or by a guest.">
    <div class="line">
      <div class="grow">
        <strong>Most questions</strong>
        <p class="faint small">Guests can't pick more. A longer custom quiz plays its first {q.settings.maxQuestions}.</p>
      </div>
      <div class="stepper">
        <button class="btn small" disabled={q.settings.maxQuestions <= MIN_QUESTIONS} onclick={() => setSettings({ maxQuestions: q.settings.maxQuestions - 1 })} aria-label="1 question less"><Minus size={16} /></button>
        <span class="mono value">{q.settings.maxQuestions}</span>
        <button class="btn small" disabled={q.settings.maxQuestions >= MAX_QUESTIONS} onclick={() => setSettings({ maxQuestions: q.settings.maxQuestions + 1 })} aria-label="1 question more"><Plus size={16} /></button>
      </div>
    </div>
    <div class="line">
      <div class="grow">
        <strong>Victory screen</strong>
        <p class="faint small">How long the podium stays on the TV at the end. Next step on a running quiz closes it sooner.</p>
      </div>
      <div class="stepper">
        <button class="btn small" disabled={q.settings.finalSec <= FINAL_MIN_SEC} onclick={() => setSettings({ finalSec: q.settings.finalSec - 5 })} aria-label="5 seconds less"><Minus size={16} /></button>
        <span class="mono value">{q.settings.finalSec}s</span>
        <button class="btn small" disabled={q.settings.finalSec >= FINAL_MAX_SEC} onclick={() => setSettings({ finalSec: q.settings.finalSec + 5 })} aria-label="5 seconds more"><Plus size={16} /></button>
      </div>
    </div>
  </Section>

  <Section title="Participative quiz" hint={`Every guest writes 1 to ${COLLECT_MAX_QUESTIONS} questions on their phone (or skips). Then the host or anyone can start it; guests never see the answers and nobody scores on their own question.`}>
    {#if collect?.phase === 'writing'}
      <div class="status">
        <span class="pill accent">Writing</span>
        <span class="dim truncate">{collect.title}{collect.by ? `, asked by ${collect.by.name}` : ''}</span>
        <span class="mono faint">{Math.floor(collectLeft / 60)}:{String(collectLeft % 60).padStart(2, '0')}</span>
      </div>
      {#snippet person(p: { id: string; name: string }, state: string, faint: boolean)}
        <div class="line">
          <span class="grow truncate" class:faint>{p.name}</span>
          <span class="faint small">{state}{limitOf(p.id) !== COLLECT_MAX_QUESTIONS ? ` · up to ${limitOf(p.id)}` : ''}</span>
          <button class="btn ghost small" aria-label="Let {p.name} change or add questions" title="Let them change or add questions" onclick={() => (reopen = { id: p.id, name: p.name, max: limitOf(p.id) })}><PenLine size={15} /></button>
        </div>
      {/snippet}
      {#each collect.done as p (p.id)}
        {@render person(p, `${p.count} ${p.count === 1 ? 'question' : 'questions'}`, false)}
      {/each}
      {#each collect.waiting as p (p.id)}
        {@render person(p, collect.editing.includes(p.id) ? 'changing...' : 'writing...', true)}
      {/each}
      {#each skippedGuests as p (p.id)}
        {@render person(p, 'skipped', true)}
      {/each}
      {#if reopen}
        <div class="reopen card">
          <strong>Let {reopen.name} change or add questions</strong>
          <div class="line">
            <div class="grow">
              <span>Questions they can write</span>
              <p class="faint small">Everyone else: {COLLECT_MAX_QUESTIONS}</p>
            </div>
            <div class="stepper">
              <button class="btn small" disabled={reopen.max <= 1} onclick={() => reopen && reopen.max--} aria-label="1 question less"><Minus size={16} /></button>
              <span class="mono value">{reopen.max}</span>
              <button class="btn small" disabled={reopen.max >= COLLECT_LIMIT_MAX} onclick={() => reopen && reopen.max++} aria-label="1 question more"><Plus size={16} /></button>
            </div>
          </div>
          <div class="row wrap">
            <button class="btn primary" onclick={reopenGuest}><PenLine size={18} /> Let them write</button>
            <button class="btn ghost" onclick={() => (reopen = null)}>Cancel</button>
          </div>
        </div>
      {/if}
      <div class="row wrap">
        <button class="btn primary" disabled={!collect.done.length} onclick={() => attempt(() => rpc('quiz', 'collectEnd'))}><Flag size={18} /> Make the quiz now</button>
        <button class="btn" onclick={() => attempt(() => rpc('quiz', 'collectAddTime', { minutes: 1 }))}><Plus size={18} /> 1 min</button>
        <button class="btn" onclick={() => attempt(() => rpc('quiz', 'collectAddTime', { minutes: 5 }))}><Plus size={18} /> 5 min</button>
        <button class="btn danger" onclick={cancelCollect}><X size={18} /> Cancel</button>
      </div>
    {:else if collect?.phase === 'ready'}
      <div class="status">
        <span class="pill accent">Ready</span>
        <span class="dim truncate">{collect.title}: {collect.total} questions from {collect.done.length} {collect.done.length === 1 ? 'player' : 'players'}</span>
      </div>
      <div class="row wrap">
        <button class="btn primary" disabled={starting || q.phase !== 'idle'} onclick={playCollected}><Play size={18} /> Play it now</button>
        <button class="btn" onclick={cancelCollect}>Later</button>
      </div>
      <p class="faint small">It is saved with the custom quizzes below.</p>
    {:else}
      <div class="grid2">
        <label class="field">
          <span>Title (optional)</span>
          <input class="input" bind:value={collectTitle} maxlength="60" placeholder="Party quiz" />
        </label>
        <label class="field">
          <span>Minutes to write</span>
          <input class="input" type="number" min="1" max="30" bind:value={collectMinutes} />
        </label>
      </div>
      <div>
        <button class="btn" disabled={q.phase !== 'idle'} onclick={askEveryone}><Users size={18} /> Ask everyone for questions</button>
      </div>
    {/if}
  </Section>

  <Section title="Custom quizzes" hint="Made by you or by guests. Kept from one party to the next.">
    {#snippet actions()}
      <button class="btn small" onclick={() => (editing = 'new')}><Plus size={16} /> New</button>
    {/snippet}
    {#each q.library as item (item.id)}
      <div class="line">
        <div class="grow">
          <strong class="truncate block">{item.title}</strong>
          <p class="faint small">{item.count} {item.count === 1 ? 'question' : 'questions'} &middot; {item.collective ? 'written by' : 'by'} {item.author}{item.hasImages ? ' · with pictures' : ''}</p>
        </div>
        <button class="btn ghost small" aria-label="Edit" onclick={() => edit(item.id)}><Pencil size={15} /></button>
        <button class="btn ghost small" aria-label="Delete" onclick={() => remove(item.id, item.title)}><Trash2 size={15} /></button>
      </div>
    {:else}
      <p class="faint">No custom quiz yet.</p>
    {/each}
  </Section>

  {#if editing}
    <Sheet title={editing === 'new' ? 'New quiz' : `Edit ${editing.title}`} onclose={() => (editing = null)}>
      <QuizEditor initial={editing === 'new' ? null : editing} draft={editorDraft} busy={saving} onsave={save} oncancel={() => (editing = null)} />
    </Sheet>
  {/if}
{/if}

<style>
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    padding: 0.25rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .tabs button {
    padding: 0.5rem;
    border: 0;
    border-radius: calc(var(--radius-sm) - 3px);
    background: none;
    color: var(--text-dim);
    font-weight: 600;
    font-size: 0.88rem;
  }
  .tabs button.active {
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .topics {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 0.35rem;
    height: 7rem;
    overflow-y: auto;
  }
  .chip {
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-weight: 600;
    font-size: 0.8rem;
  }
  .chip.active {
    background: var(--accent);
    border-color: transparent;
    color: var(--accent-contrast);
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.9rem;
  }
  .small {
    font-size: 0.82rem;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 0;
  }
  .wrap {
    flex-wrap: wrap;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .block {
    display: block;
  }
  .reopen {
    display: grid;
    gap: 0.7rem;
    padding: 1rem;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .stepper .btn {
    width: 2.4rem;
    padding: 0;
  }
  .value {
    min-width: 3rem;
    text-align: center;
    font-weight: 700;
  }
  @media (max-width: 600px) {
    .grid2 {
      grid-template-columns: 1fr;
    }
  }
</style>
