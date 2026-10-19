<script lang="ts">
  import { AlarmClockPlus, Flag, Minus, Pause, PenLine, Pencil, Play, UserPlus, Plus, SkipForward, Square, Trash2, Users, X } from '@lucide/svelte';
  import { COLLECT_DEFAULT_MIN, COLLECT_LIMIT_MAX, COLLECT_MAX_QUESTIONS, FINAL_MAX_SEC, FINAL_MIN_SEC, MAX_QUESTIONS, MIN_QUESTIONS, type CustomQuiz, type QuizDraft, type QuizSettings, type QuizState, type QuizTopic } from '$shared/quiz.ts';
  import { hb, rpc, attempt, serverNow } from '$lib/client.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import { Synced } from '$lib/synced.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { day } from '$lib/time.ts';
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

  // Play a custom quiz from the list: asks the time per question first
  let playing = $state<{ id: string; title: string; count: number; sec: number } | null>(null);

  async function playCustom() {
    if (!playing) return;
    const { id, sec } = playing;
    starting = true;
    const ok = await attempt(() => rpc('quiz', 'start', { source: 'custom', quizId: id, timeSec: Math.min(120, Math.max(5, Math.round(sec) || 20)) }));
    starting = false;
    if (ok) playing = null;
  }

  async function remove(id: string, title: string) {
    if (await ask({ title: `Delete "${title}"?`, message: 'Its pictures are deleted too.', confirm: 'Delete', danger: true })) {
      attempt(() => rpc('quiz', 'deleteCustom', { id }), 'Quiz deleted');
    }
  }

  // Participative quiz
  let collectTitle = $state('');
  let collectMinutes = $state(COLLECT_DEFAULT_MIN);
  let collectMax = $state(COLLECT_MAX_QUESTIONS);
  const collect = $derived(q?.collect ?? null);
  let now = $state(serverNow());
  $effect(() => {
    const t = setInterval(() => (now = serverNow()), 1000);
    return () => clearInterval(t);
  });
  const collectLeft = $derived(collect ? Math.max(0, Math.ceil((collect.endsAt - now) / 1000)) : 0);

  // A saved participative quiz: who wrote it, and giving someone time to add questions
  let details = $state<string | null>(null);
  const detailItem = $derived(details ? (q?.library.find((x) => x.id === details) ?? null) : null);
  // Time (and how many questions) for one guest, or '*' for everyone online
  let giving = $state<{ id: string; name: string; minutes: number; max: number; min: number } | null>(null);
  function give(id: string, name: string) {
    // Never below what the round already allows, or what they already wrote
    const round = extending?.quizId === details && collect ? collect.max : 1;
    const authors = detailItem?.authors ?? [];
    const own = authors.filter((a) => id === '*' || a.id === id).map((a) => a.count);
    const min = Math.max(1, round, ...own);
    giving = { id, name, minutes: 3, max: Math.max(min, COLLECT_MAX_QUESTIONS), min };
  }
  const guestCount = $derived(hb.core?.admin?.guests.length ?? 0);
  // Questions in it no guest added (the quiz's own author, or the host)
  const ownQuestions = $derived(detailItem ? detailItem.count - (detailItem.authors ?? []).reduce((n, a) => n + a.count, 0) : 0);
  const extending = $derived(collect?.phase === 'writing' && collect.extend ? collect.extend : null);
  const busyElsewhere = $derived(collect?.phase === 'writing' && (!extending || extending.quizId !== details));
  const late = $derived(
    (hb.core?.admin?.guests ?? []).filter((g) => g.online && !detailItem?.authors?.some((a) => a.id === g.id) && !(extending?.quizId === details && g.id in extending.until)),
  );
  const leftFor = (id: string) => Math.max(0, Math.ceil(((extending?.until[id] ?? 0) - now) / 1000));
  const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // Invited to add to the quiz shown: still writing, or done
  const invitedState = (id: string) => {
    if (!extending || extending.quizId !== details || !(id in extending.until)) return null;
    if (leftFor(id) <= 0) return 'time up';
    return collect?.waiting.some((w) => w.id === id) ? 'writing' : 'sent';
  };

  async function giveTime() {
    if (!giving || !details) return;
    const { id, minutes, max } = giving;
    if (await attempt(() => rpc('quiz', 'collectInvite', { quizId: details, guestId: id, minutes, max }))) giving = null;
  }
  const guestTime = (id: string, minutes: number) => attempt(() => rpc('quiz', 'collectGuestTime', { guestId: id, minutes }));

  async function askEveryone() {
    if (await attempt(() => rpc('quiz', 'collectStart', { title: collectTitle, minutes: collectMinutes, max: collectMax }))) collectTitle = '';
  }

  async function playCollected() {
    if (!collect?.quizId) return;
    starting = true;
    await attempt(() => rpc('quiz', 'start', { source: 'custom', quizId: collect.quizId, timeSec: timeSec.value }));
    starting = false;
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

  <Section title="Participative quiz" hint="Every guest writes a few questions on their phone, then you all play them. Nobody scores on their own question.">
    {#if collect?.phase === 'writing'}
      <div class="status">
        <span class="pill accent">Writing</span>
        <span class="dim truncate">{collect.extend ? `Adding to ${collect.title}` : collect.title}{collect.by ? `, asked by ${collect.by.name}` : ''}</span>
        <span class="mono faint">{clockOf(collectLeft)}</span>
      </div>
      {#each collect.done as p (p.id)}
        <div class="line"><span class="grow">{p.name}</span><span class="faint small">{p.count} {p.count === 1 ? 'question' : 'questions'}</span></div>
      {/each}
      {#each collect.waiting as p (p.id)}
        <div class="line"><span class="grow faint">{p.name}</span><span class="faint small">{collect.editing.includes(p.id) ? 'changing...' : 'writing...'}</span></div>
      {/each}
      {#if collect.skipped.length}<p class="faint small">{collect.skipped.length} skipped</p>{/if}
      <div class="line">
        <span class="grow">Up to <strong>{collect.max}</strong> questions each</span>
        <button class="btn small" disabled={collect.max >= COLLECT_LIMIT_MAX} onclick={() => attempt(() => rpc('quiz', 'collectMoreQuestions'))}><Plus size={16} /> 1 question</button>
      </div>
      <div class="row wrap">
        {#if collect.extend}
          <button class="btn primary" onclick={() => attempt(() => rpc('quiz', 'collectEnd'))}><Flag size={18} /> Finish now</button>
          <button class="btn" onclick={() => (details = collect.extend?.quizId ?? null)}>Details</button>
        {:else}
          <button class="btn primary" disabled={!collect.done.length} onclick={() => attempt(() => rpc('quiz', 'collectEnd'))}><Flag size={18} /> Make the quiz now</button>
        {/if}
        <button class="btn" disabled={collectLeft < 90} onclick={() => attempt(() => rpc('quiz', 'collectAddTime', { minutes: -1 }))}><Minus size={18} /> 1 min</button>
        <button class="btn" onclick={() => attempt(() => rpc('quiz', 'collectAddTime', { minutes: 1 }))}><Plus size={18} /> 1 min</button>
        <button class="btn" onclick={() => attempt(() => rpc('quiz', 'collectAddTime', { minutes: 5 }))}><Plus size={18} /> 5 min</button>
        <button class="btn danger" onclick={cancelCollect}><X size={18} /> Cancel</button>
      </div>
    {:else if collect?.phase === 'ready'}
      <div class="status">
        <span class="pill accent">Ready</span>
        <span class="dim truncate">
          {collect.extend
            ? `${collect.title} is updated: ${collect.total} questions`
            : `${collect.title}: ${collect.total} ${collect.total === 1 ? 'question' : 'questions'} from ${collect.done.length} ${collect.done.length === 1 ? 'player' : 'players'}`}
        </span>
      </div>
      <div class="row wrap">
        <button class="btn primary" disabled={starting || q.phase !== 'idle'} onclick={playCollected}><Play size={18} /> Play it now</button>
        <button class="btn" onclick={() => (details = collect.quizId)}><UserPlus size={18} /> Add questions</button>
        <button class="btn" onclick={cancelCollect}>Later</button>
      </div>
      <p class="faint small">It is saved with the custom quizzes below. Add questions gives someone (a writer or a late guest) a few minutes to write more.</p>
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
      <div class="line">
        <div class="grow">
          <strong>Questions per guest</strong>
          <p class="faint small">You can add more while they write, not take some away.</p>
        </div>
        <div class="stepper">
          <button class="btn small" disabled={collectMax <= 1} onclick={() => collectMax--} aria-label="1 question less"><Minus size={16} /></button>
          <span class="mono value">{collectMax}</span>
          <button class="btn small" disabled={collectMax >= COLLECT_LIMIT_MAX} onclick={() => collectMax++} aria-label="1 question more"><Plus size={16} /></button>
        </div>
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
          <button class="link truncate block" onclick={() => (details = item.id)}><strong>{item.title}</strong></button>
          <p class="faint small">
            {item.count} {item.count === 1 ? 'question' : 'questions'} &middot; {item.collective ? 'written by' : 'by'} {item.author}{!item.collective && item.authors?.length
              ? ` and ${item.authors.map((a) => a.name).join(', ')}`
              : ''}{item.hasImages ? ' · with pictures' : ''}{item.createdAt ? ` · ${day(item.createdAt)}` : ''}
          </p>
        </div>
        <button class="btn ghost small" aria-label="Add questions" title="Give someone time to add questions" onclick={() => (details = item.id)}><UserPlus size={15} /></button>
        <button class="btn ghost small" aria-label="Play" title="Play it" disabled={q.phase !== 'idle'} onclick={() => (playing = { id: item.id, title: item.title, count: item.count, sec: timeSec.value })}><Play size={15} /></button>
        <button class="btn ghost small" aria-label="Edit" onclick={() => edit(item.id)}><Pencil size={15} /></button>
        <button class="btn ghost small" aria-label="Delete" onclick={() => remove(item.id, item.title)}><Trash2 size={15} /></button>
      </div>
    {:else}
      <p class="faint">No custom quiz yet.</p>
    {/each}
  </Section>

  {#if detailItem}
    <Sheet
      title={detailItem.title}
      onclose={() => {
        details = null;
        giving = null;
      }}
    >
      <div class="details">
        <p class="dim">{detailItem.count} {detailItem.count === 1 ? 'question' : 'questions'}. Give someone a few minutes to change or add their questions: their phone opens the editor.</p>
        {#if busyElsewhere}
          <p class="error">Questions are being written right now: wait for it to end.</p>
        {/if}

        <div>
          <h3 class="eyebrow">Written by</h3>
          {#if ownQuestions > 0}
            <div class="line">
              <span class="grow truncate">{detailItem.collective ? 'Host' : detailItem.author}</span>
              <span class="faint small">{ownQuestions} {ownQuestions === 1 ? 'question' : 'questions'}</span>
            </div>
          {/if}
          {#each detailItem.authors ?? [] as a (a.id)}
            {@const state = invitedState(a.id)}
            <div class="line">
              <span class="grow truncate">{a.name}</span>
              <span class="faint small">{a.count} {a.count === 1 ? 'question' : 'questions'}</span>
              {@render timeFor(a.id, a.name, state)}
            </div>
          {/each}
          {#if extending?.quizId === details}
            {#each Object.keys(extending.until).filter((id) => id !== '*' && !detailItem.authors?.some((a) => a.id === id)) as id (id)}
              {@const name = hb.core?.admin?.guests.find((g) => g.id === id)?.name ?? 'A guest'}
              <div class="line">
                <span class="grow truncate">{name}</span>
                <span class="faint small">new</span>
                {@render timeFor(id, name, invitedState(id))}
              </div>
            {/each}
          {/if}
        </div>

        <div class="line">
          <div class="grow">
            <strong>Everyone</strong>
            <p class="faint small">Every guest sees it again, also those coming back meanwhile: they change their questions or add some. It stays open until the time is up.</p>
          </div>
          <button class="btn small" disabled={busyElsewhere || !guestCount} onclick={() => give('*', 'everyone')}><AlarmClockPlus size={15} /> Give time</button>
        </div>

        {#if late.length}
          <label class="field">
            <span>Someone else</span>
            <select
              class="input"
              value=""
              onchange={(e) => {
                const g = late.find((x) => x.id === e.currentTarget.value);
                if (g) give(g.id, g.name);
                e.currentTarget.value = '';
              }}
            >
              <option value="" disabled>Choose a guest</option>
              {#each late as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
            </select>
          </label>
        {/if}

        {#if giving}
          <div class="give card">
            <strong>{giving.id === '*' ? 'Everyone writes again' : `Time for ${giving.name} to write`}</strong>
            <div class="line">
              <span class="grow">Questions each</span>
              <div class="stepper">
                <button class="btn small" disabled={giving.max <= giving.min} onclick={() => giving && giving.max--} aria-label="1 question less"><Minus size={16} /></button>
                <span class="mono value">{giving.max}</span>
                <button class="btn small" disabled={giving.max >= COLLECT_LIMIT_MAX} onclick={() => giving && giving.max++} aria-label="1 question more"><Plus size={16} /></button>
              </div>
            </div>
            <div class="line">
              <span class="grow">Time</span>
              <div class="stepper">
                <button class="btn small" disabled={giving.minutes <= 1} onclick={() => giving && giving.minutes--} aria-label="1 minute less"><Minus size={16} /></button>
                <span class="mono value">{giving.minutes} min</span>
                <button class="btn small" disabled={giving.minutes >= 30} onclick={() => giving && giving.minutes++} aria-label="1 minute more"><Plus size={16} /></button>
              </div>
            </div>
            <div class="row wrap">
              <button class="btn primary" disabled={busyElsewhere || q.phase !== 'idle'} onclick={giveTime}><PenLine size={18} /> Let them write</button>
              <button class="btn ghost" onclick={() => (giving = null)}>Cancel</button>
            </div>
          </div>
        {/if}
      </div>
    </Sheet>
  {/if}

  {#snippet timeFor(id: string, name: string, state: string | null)}
    {#if state === 'writing'}
      <span class="mono small">{clockOf(leftFor(id))}</span>
      <button class="btn ghost small" disabled={leftFor(id) < 90} onclick={() => guestTime(id, -1)} aria-label="1 minute less"><Minus size={15} /></button>
      <button class="btn ghost small" onclick={() => guestTime(id, 1)} aria-label="1 minute more"><Plus size={15} /></button>
    {:else}
      {#if state}<span class="faint small">{state}</span>{/if}
      <button class="btn ghost small" disabled={busyElsewhere} onclick={() => give(id, name)} aria-label="Give {name} time to write"><AlarmClockPlus size={15} /> Give time</button>
    {/if}
  {/snippet}

  {#if playing}
    <Sheet title={`Play ${playing.title}`} onclose={() => (playing = null)}>
      <form
        class="play"
        onsubmit={(e) => {
          e.preventDefault();
          playCustom();
        }}
      >
        <p class="dim">
          {playing.count > q.settings.maxQuestions
            ? `Plays the first ${q.settings.maxQuestions} of its ${playing.count} questions (the "Most questions" limit).`
            : `${playing.count} ${playing.count === 1 ? 'question' : 'questions'}.`}
        </p>
        <label class="field">
          <span>Seconds per question</span>
          <input class="input" type="number" min="5" max="120" bind:value={playing.sec} />
        </label>
        <div class="row wrap">
          <button class="btn primary" disabled={starting || q.phase !== 'idle'}><Play size={18} /> Start quiz</button>
          <button type="button" class="btn ghost" onclick={() => (playing = null)}>Cancel</button>
        </div>
      </form>
    </Sheet>
  {/if}

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
  .details {
    display: grid;
    gap: 1.1rem;
  }
  .details h3 {
    margin-bottom: 0.4rem;
  }
  .give {
    display: grid;
    gap: 0.7rem;
    padding: 1rem;
  }
  .link {
    max-width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .link:hover strong {
    text-decoration: underline;
  }
  .play {
    display: grid;
    gap: 1rem;
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
