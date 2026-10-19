<script lang="ts">
  import { untrack } from 'svelte';
  import { PenLine, Pencil, Play, Plus, Search, Trash2, Users } from '@lucide/svelte';
  import { COLLECT_DEFAULT_MIN, COLLECT_MAX_QUESTIONS } from '$shared/quiz.ts';
  import { openCollectScreen } from './result.svelte.ts';
  import { clearDraft, draftKey, hasDraft } from './drafts.svelte.ts';
  import type { CustomQuiz, QuizDraft, QuizState, QuizTopic } from '$shared/quiz.ts';
  import { hb, rpc, attempt, price } from '$lib/client.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import QuizEditor from './QuizEditor.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';

  /** Guest panel: start a quiz (random trivia or a custom one) or create a custom quiz */
  const q = $derived(hb.modules.quiz as QuizState | undefined);
  const cost = $derived(price('quiz.start'));

  let tab = $state<'trivia' | 'custom'>('trivia');
  // Start from the host's last settings
  const initial = untrack(() => q?.settings);
  const maxQuestions = $derived(q?.settings.maxQuestions ?? 15);
  let questions = $state(Math.min(initial?.questions ?? 10, initial?.maxQuestions ?? 15));
  let timeSec = $state(initial?.timeSec ?? 20);
  let difficulty = $state<string>('');
  let category = $state(0);
  let search = $state('');
  // Trivia: pick a category, or search a topic
  let mode = $state<'category' | 'topic'>('category');
  let topicQuery = $state('');
  let topicResults = $state<QuizTopic[]>([]);
  let topic = $state<QuizTopic | null>(null);
  let searching = $state(false);
  let topicTimer: ReturnType<typeof setTimeout> | null = null;
  let topicSeq = 0;

  function onTopicInput() {
    if (topicTimer) clearTimeout(topicTimer);
    topicTimer = setTimeout(async () => {
      const q = topicQuery.trim();
      if (q.length < 2) {
        topicResults = [];
        return;
      }
      const mine = ++topicSeq;
      searching = true;
      const r = await rpc<QuizTopic[]>('quiz', 'topics', { q }).catch(() => []);
      if (mine === topicSeq) {
        topicResults = r;
        searching = false;
      }
    }, 300);
  }
  let categories = $state<{ id: number; name: string }[]>([]);
  let chosen = $state<string | null>(null);
  let editing = $state<CustomQuiz | null | 'new'>(null);
  const editorDraft = $derived(editing === 'new' ? draftKey('new') : editing ? draftKey(`edit.${editing.id}`) : undefined);
  // Checked again each time the editor closes
  const newDraft = $derived(editing === null && hasDraft(draftKey('new')));
  let busy = $state(false);
  // Participative quiz
  let collectTitle = $state('');
  let collectMinutes = $state(COLLECT_DEFAULT_MIN);
  const collect = $derived(q?.collect ?? null);

  async function askEveryone() {
    busy = true;
    const ok = await attempt(() => rpc('quiz', 'collectStart', { title: collectTitle, minutes: collectMinutes }));
    busy = false;
    if (ok) {
      collectTitle = '';
      openCollectScreen();
    }
  }

  rpc<{ id: number; name: string }[]>('quiz', 'categories')
    .then((c) => (categories = c))
    .catch(() => {});

  const shown = $derived(categories.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())));
  const categoryName = $derived(category ? (categories.find((c) => c.id === category)?.name ?? '') : 'Any category');

  async function start() {
    busy = true;
    const args =
      tab === 'custom'
        ? { source: 'custom', quizId: chosen, timeSec }
        : mode === 'topic'
          ? { source: 'topic', topic, questions, timeSec, difficulty }
          : { source: 'trivia', questions, timeSec, category, difficulty };
    await attempt(() => rpc('quiz', 'start', args));
    busy = false;
  }

  async function edit(id: string) {
    const quiz = await attempt(() => rpc<CustomQuiz>('quiz', 'getCustom', { id }));
    if (quiz) {
      editing = quiz;
    }
  }

  async function remove(id: string, title: string) {
    if (await ask({ title: `Delete "${title}"?`, confirm: 'Delete', danger: true })) attempt(() => rpc('quiz', 'deleteCustom', { id }), 'Quiz deleted');
  }

  async function saved(quiz: QuizDraft) {
    busy = true;
    const item = await attempt(() => rpc<{ id: string }>('quiz', 'saveCustom', { quiz }), 'Quiz saved');
    busy = false;
    if (item) {
      if (editorDraft) clearDraft(editorDraft);
      editing = null;
      chosen = item.id;
      tab = 'custom';
    }
  }

  const DIFFICULTIES = [
    { id: '', label: 'Any' },
    { id: 'easy', label: 'Easy' },
    { id: 'medium', label: 'Medium' },
    { id: 'hard', label: 'Hard' },
  ];
</script>

{#if q}
  <div class="start">
    <div class="tabs">
      <button class:active={tab === 'trivia'} onclick={() => (tab = 'trivia')}>Trivia</button>
      <button class:active={tab === 'custom'} onclick={() => (tab = 'custom')}>Custom</button>
    </div>

    {#if editing}
      <Sheet title={editing === 'new' ? 'Create a quiz' : `Edit ${editing.title}`} onclose={() => (editing = null)}>
        <QuizEditor initial={editing === 'new' ? null : editing} draft={editorDraft} {busy} onsave={saved} oncancel={() => (editing = null)} />
      </Sheet>
    {/if}

      {#if tab === 'trivia'}
        <div class="modes">
          <button class:active={mode === 'category'} onclick={() => (mode = 'category')}>By category</button>
          <button class:active={mode === 'topic'} onclick={() => (mode = 'topic')}>Search a topic</button>
        </div>
        <div class="card box">
          {#if mode === 'category'}
            <label class="field">
              <span>Category: <strong>{categoryName}</strong></span>
              <div class="search">
                <Search size={16} />
                <input class="input" bind:value={search} placeholder="Filter categories" />
              </div>
            </label>
            <div class="cats">
              <button class="chip" class:active={category === 0} onclick={() => (category = 0)}>Any</button>
              {#each shown as c (c.id)}
                <button class="chip" class:active={category === c.id} onclick={() => (category = c.id)}>{c.name.replace(/^(Entertainment|Science): /, '')}</button>
              {/each}
            </div>
            <p class="faint small">Questions from Open Trivia DB (in English).</p>
          {:else}
            <label class="field">
              <span>Topic: <strong>{topic ? topic.label : 'none yet'}</strong></span>
              <div class="search">
                <Search size={16} />
                <input class="input" bind:value={topicQuery} oninput={onTopicInput} placeholder="Harry Potter, football, cats, Switzerland..." />
              </div>
            </label>
            <div class="cats">
              {#each topicResults as t (t.label)}
                <button class="chip" class:active={topic?.label === t.label} onclick={() => (topic = t)}>{t.label}</button>
              {:else}
                <p class="faint small hint">{searching ? 'Searching...' : topicQuery.trim().length < 2 ? 'Type at least 2 letters' : 'No topic found'}</p>
              {/each}
            </div>
            <p class="faint small">Questions from The Trivia API (in English). Small topics may have fewer questions.</p>
          {/if}
          <div class="field">
            <span class="label">Difficulty</span>
            <div class="row wrap">
              {#each DIFFICULTIES as d}
                <button class="chip" class:active={difficulty === d.id} onclick={() => (difficulty = d.id)}>{d.label}</button>
              {/each}
            </div>
          </div>
          <label class="field">
            <span>Questions: {questions}</span>
            <input type="range" min="3" max={maxQuestions} bind:value={questions} />
          </label>
        </div>
      {:else}
        <div class="card box">
          <div class="together">
            <span class="icon"><Users size={18} /></span>
            <div>
              <strong>Participative quiz</strong>
              <p class="faint small">Everyone writes 1 to {COLLECT_MAX_QUESTIONS} questions on their phone, then you all play them. Nobody sees the answers.</p>
            </div>
          </div>
          {#if collect?.phase === 'writing'}
            <p class="small">
              <strong>{collect.title}</strong> is being written: {collect.done.length} sent, {collect.waiting.length} still writing.
            </p>
            <button class="btn block" onclick={() => openCollectScreen()}><PenLine size={16} /> {collect.done.some((d) => d.id === hb.me?.id) ? 'See or change my questions' : 'Write my questions'}</button>
          {:else}
            <input class="input" bind:value={collectTitle} maxlength="60" placeholder="Title (optional)" />
            <label class="field">
              <span>Time to write: {collectMinutes} min</span>
              <input type="range" min="1" max="15" bind:value={collectMinutes} />
            </label>
            <button class="btn block" disabled={busy || q.phase !== 'idle'} onclick={askEveryone}><Users size={16} /> Ask everyone for questions</button>
          {/if}
        </div>
        <button class="btn block create" onclick={() => (editing = 'new')}><Plus size={18} /> {newDraft ? 'Continue my quiz draft' : 'Create a quiz'}</button>
        <div class="card list">
          {#each q.library as item (item.id)}
            <div class="item" class:active={chosen === item.id}>
              <button class="pick" onclick={() => (chosen = item.id)}>
                <span class="radio"></span>
                <span class="text">
                  <strong class="truncate">{item.title}</strong>
                  <span class="faint small">{item.count} {item.count === 1 ? 'question' : 'questions'} &middot; {item.collective ? 'written by' : 'by'} {item.author}</span>
                </span>
              </button>
              {#if item.authorId === hb.me?.id}
                <button class="btn ghost small" aria-label="Edit" onclick={() => edit(item.id)}><Pencil size={15} /></button>
                <button class="btn ghost small" aria-label="Delete" onclick={() => remove(item.id, item.title)}><Trash2 size={15} /></button>
              {/if}
            </div>
          {:else}
            <p class="empty">No custom quiz yet. Create the first one!</p>
          {/each}
        </div>
      {/if}

      <div class="card box">
        <label class="field">
          <span>Seconds per question: {timeSec}</span>
          <input type="range" min="5" max="60" step="5" bind:value={timeSec} />
        </label>
        <button
          class="btn primary block"
          disabled={busy || q.phase !== 'idle' || (tab === 'custom' && !chosen) || (tab === 'trivia' && mode === 'topic' && !topic)}
          onclick={start}
        >
          <Play size={18} />
          {q.phase !== 'idle' ? 'A quiz is running' : 'Start the quiz'}
          {#if hb.core?.economyEnabled && cost}<span class="sep">&middot;</span><Money amount={cost} />{/if}
        </button>
        <p class="faint small center">You start it when everyone is in (60 seconds at most).</p>
      </div>
  </div>
{/if}

<style>
  .start {
    display: grid;
    gap: 0.9rem;
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 0.25rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .tabs button {
    padding: 0.55rem;
    border: 0;
    border-radius: calc(var(--radius-sm) - 3px);
    background: none;
    color: var(--text-dim);
    font-weight: 600;
  }
  .tabs button.active {
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }
  .modes button {
    padding: 0.55rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    color: var(--text-dim);
    font-weight: 600;
    font-size: 0.88rem;
  }
  .modes button.active {
    border-color: var(--accent);
    color: var(--text);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .hint {
    padding: 0.4rem 0.2rem;
  }
  .box {
    padding: 1rem;
    display: grid;
    gap: 0.9rem;
  }
  .search {
    position: relative;
    display: flex;
    align-items: center;
    color: var(--text-faint);
  }
  .search :global(svg) {
    position: absolute;
    left: 0.8rem;
  }
  .search .input {
    padding-left: 2.3rem;
  }
  /* Fixed height so filtering does not move the rest of the page */
  .cats {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 0.35rem;
    height: 9.5rem;
    overflow-y: auto;
  }
  .chip {
    padding: 0.4rem 0.75rem;
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
  .label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  .wrap {
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  .list {
    padding: 0.3rem;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    border-radius: var(--radius-sm);
  }
  .item.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.7rem;
    border: 0;
    background: none;
    text-align: left;
  }
  .radio {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    border: 2px solid var(--border-strong);
  }
  .active .radio {
    border: 5px solid var(--accent);
  }
  .text {
    min-width: 0;
    display: grid;
  }
  .small {
    font-size: 0.8rem;
  }
  .sep {
    margin: 0 0.1rem;
  }
  .center {
    text-align: center;
  }
  .together {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
  }
  .together .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 0.7rem;
    background: var(--gradient);
    color: #fff;
  }
</style>
