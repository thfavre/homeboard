<script lang="ts">
  import { CircleCheck, Flag, PenLine, Play, Timer, X } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { type CustomQuestion, type QuizDraft, type QuizState } from '$shared/quiz.ts';
  import { hb, rpc, attempt, price, serverNow } from '$lib/client.svelte.ts';
  import { ask } from '$lib/dialog.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import QuizEditor from './QuizEditor.svelte';
  import { closeCollectScreen, quizResult } from './result.svelte.ts';
  import { clearDraft, draftKey } from './drafts.svelte.ts';

  /** Participative quiz on the phone: write 1 to 3 questions (or skip), then play the result */
  const quizState = $derived(hb.modules.quiz as QuizState | undefined);
  const c = $derived(quizState?.collect ?? null);
  const meId = $derived(hb.me?.id);
  const mine = $derived(c?.done.find((d) => d.id === meId));
  const isBy = $derived(!!meId && c?.by?.id === meId);
  const cost = $derived(price('quiz.start'));
  const running = $derived((hb.modules.quiz as QuizState | undefined)?.phase !== 'idle');

  // Changing sent questions: the server lists us as still writing, so the quiz waits
  let editing = $state(false);
  let initial = $state<{ title: string; questions: CustomQuestion[] } | null>(null);
  let busy = $state(false);
  /** This writing round we sent questions in (the state can lag a moment behind) */
  let sentIn = $state<string | null>(null);
  const sent = $derived(!!mine || editing || (!!c && sentIn === c.id));

  // Left the screen while changing them: the questions sent stay, nobody waits for us
  const stopEditing = () => rpc('quiz', 'collectBack').catch(() => {});
  $effect(() => () => {
    if (untrack(() => editing)) stopEditing();
  });

  // Opened from the home card to change the questions sent
  $effect(() => {
    if (!quizResult.collectEdit) return;
    quizResult.collectEdit = false;
    if (untrack(() => mine && !editing)) untrack(change);
  });

  // The server lists us as changing our questions (we reloaded meanwhile): open the editor again
  let asked = false;
  let changing = false;
  $effect(() => {
    const again = !!meId && c?.phase === 'writing' && c.editing.includes(meId);
    if (again && !asked && !untrack(() => editing)) untrack(change);
    asked = again;
  });

  let now = $state(serverNow());
  $effect(() => {
    const t = setInterval(() => (now = serverNow()), 1000);
    return () => clearInterval(t);
  });
  // Adding to a saved quiz: each guest given time has their own deadline
  const endsAt = $derived((meId && c?.extend?.until[meId]) || c?.endsAt || 0);
  const left = $derived(Math.max(0, Math.ceil((endsAt - now) / 1000)));
  const clock = $derived(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);

  // The editor tells how many questions it has and what stops them from being sent
  let editor = $state<QuizEditor>();
  let count = $state(0);
  let issues = $state<{ index: number; text: string }[]>([]);
  const writing = $derived(editing || !sent);
  const written = $derived(writing ? count : (mine?.count ?? 0));

  // The banner flashes once at 30, 20 and 10 seconds left, then on 3, 2, 1
  const FLASH_AT = [30, 20, 10, 3, 2, 1];
  let flashes = $state(0);
  let lastFlash = -1;
  $effect(() => {
    if (c?.phase !== 'writing' || !FLASH_AT.includes(left) || left === lastFlash) return;
    lastFlash = left;
    flashes++;
    if (left === 30 || left === 10) navigator.vibrate?.([120, 80, 120]);
  });

  // 2 seconds before the end, whatever is complete in the editor is sent (the rest would be lost anyway)
  let autoSent = '';
  $effect(() => {
    if (c?.phase !== 'writing' || left > 2 || left === 0 || !writing || busy || autoSent === c.id) return;
    const draft = untrack(() => editor?.complete());
    if (!draft) return;
    autoSent = c.id;
    untrack(() => send(draft));
  });

  // From 30 seconds left: what is wrong in the questions not sent yet, highlighted in the editor
  const late = $derived(c?.phase === 'writing' && left <= 30);
  const warning = $derived.by(() => {
    if (!late || !writing) return '';
    if (issues.length) {
      const [first] = issues;
      return `Question ${first.index + 1}: ${first.text.toLowerCase()}${issues.length > 1 ? ` (and ${issues.length - 1} more)` : ''}`;
    }
    return editing ? 'Tap Update to keep your changes' : 'Tap Send before the time is up';
  });

  async function send(draft: QuizDraft) {
    busy = true;
    const ok = await attempt(() => rpc('quiz', 'collectSubmit', { questions: draft.questions }), 'Questions sent');
    busy = false;
    if (ok) {
      if (c) {
        clearDraft(draftKey(`collect.${c.id}`));
        sentIn = c.id;
      }
      editing = false;
    }
  }

  async function change() {
    if (changing) return;
    changing = true;
    const qs = await attempt(() => rpc<CustomQuestion[]>('quiz', 'collectMine'));
    changing = false;
    if (!qs) return;
    initial = qs.length ? { title: '', questions: qs } : null;
    editing = true;
  }

  function back() {
    if (c) sentIn = c.id;
    editing = false;
    stopEditing();
  }

  async function skip() {
    if (sent && !(await ask({ title: 'Take back your questions?', message: 'They will not be in the quiz.', confirm: 'Take back', danger: true }))) return;
    if (await attempt(() => rpc('quiz', 'collectSkip'))) {
      sentIn = null;
      closeCollectScreen();
    }
  }

  async function end() {
    const writing = c?.waiting.length ? `${c.waiting.map((p) => p.name).join(', ')} ${c.waiting.length === 1 ? 'is' : 'are'} still writing. ` : '';
    if (await ask({ title: 'Stop the writing now?', message: `${writing}The questions sent so far make the quiz.`, confirm: 'Make the quiz' })) attempt(() => rpc('quiz', 'collectEnd'));
  }

  async function cancel() {
    if (await ask({ title: 'Cancel the participative quiz?', message: 'Every question sent is thrown away.', confirm: 'Cancel it', danger: true })) attempt(() => rpc('quiz', 'collectCancel'));
  }

  async function play() {
    if (!c?.quizId) return;
    busy = true;
    await attempt(() => rpc('quiz', 'start', { source: 'custom', quizId: c.quizId, timeSec: quizState?.settings.timeSec ?? 20 }));
    busy = false;
  }
</script>

{#if c}
  <div class="collect" class:top={c.phase === 'writing'} in:fade>
    {#if c.phase === 'writing'}
      <div class="timer" class:low={left <= 30}>
        {#key flashes}<span class="flash" class:on={flashes > 0}></span>{/key}
        <Timer size={18} />
        <span><span class="mono strong">{clock}</span> left</span>
        <span class="spacer"></span>
        <span><span class="mono strong">{written}/{c.max}</span> questions</span>
      </div>
      {#if warning}
        <button class="warning" transition:fade={{ duration: 150 }} onclick={() => issues[0] && editor?.scrollToQuestion(issues[0].index)}>{warning}</button>
      {/if}

      <header>
        <span class="eyebrow">{c.extend ? 'Adding questions to' : `Participative quiz${c.by ? ` · asked by ${c.by.name}` : ''}`}</span>
        <h1>{c.title}</h1>
        {#if !c.extend}
          <p class="dim">{c.done.length} sent{c.waiting.length ? ` · ${c.waiting.length} still writing` : ''}</p>
        {/if}
      </header>

      {#if editing || !sent}
        <p class="dim intro">Write up to {c.max} {c.max === 1 ? 'question' : 'questions'}.</p>
        {#key initial}
          <QuizEditor
            bind:this={editor}
            bind:count
            bind:issues
            showIssues={late}
            initial={editing ? initial : null}
            draft={draftKey(`collect.${c.id}`)}
            withTitle={false}
            maxQuestions={c.max}
            saveLabel={editing && initial ? 'Update' : 'Send my questions'}
            cancelLabel={editing ? 'Back' : 'Skip'}
            {busy}
            onsave={send}
            oncancel={() => (editing ? back() : skip())}
          />
        {/key}
        {#if !sent}
          <button class="btn ghost block" onclick={closeCollectScreen}><X size={16} /> Later (open it again from the home screen)</button>
        {/if}
      {:else}
        <div class="thanks card">
          <span class="ok"><CircleCheck size={44} /></span>
          <h2>Thanks, {hb.me?.name}!</h2>
          <p class="dim">Your {mine?.count === 1 ? 'question is' : mine ? `${mine.count} questions are` : 'questions are'} in. The quiz is made when everyone is done.</p>
          <button class="btn" onclick={change}><PenLine size={16} /> Change my questions</button>
        </div>
      {/if}

      {#if !editing && sent}
        <div class="people">
          {#each c.done as p (p.id)}
            <span class="person done"><Avatar name={p.name} color={p.color} id={p.id} size="1.6rem" />{p.name}</span>
          {/each}
          {#each c.waiting as p (p.id)}
            <span class="person"><Avatar name={p.name} color={p.color} id={p.id} size="1.6rem" />{p.name}</span>
          {/each}
        </div>
      {/if}

      {#if isBy && !editing}
        <div class="row owner">
          <button class="btn primary" disabled={!c.done.length} onclick={end}><Flag size={16} /> Make the quiz now</button>
          <button class="btn ghost" onclick={cancel}>Cancel it</button>
        </div>
      {/if}
      {#if sent && !editing}
        <button class="btn block" onclick={closeCollectScreen}>Close</button>
      {/if}
    {:else}
      <div class="ready">
        <span class="eyebrow">Participative quiz</span>
        <h1>{c.title} is ready!</h1>
        <p class="dim">{c.total} questions from {c.done.length} {c.done.length === 1 ? 'player' : 'players'}. It is saved with the custom quizzes.</p>
        <button class="btn primary big" disabled={busy || running} onclick={play}>
          <Play size={20} />
          {running ? 'A quiz is running' : 'Play it now'}
          {#if hb.core?.economyEnabled && cost}<span>&middot;</span><Money amount={cost} />{/if}
        </button>
        <button class="btn ghost" onclick={closeCollectScreen}>Later</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .collect {
    display: grid;
    align-content: center;
    gap: 1rem;
  }
  .collect.top {
    align-content: start;
  }
  header {
    display: grid;
    gap: 0.3rem;
    text-align: center;
  }
  h1 {
    font-size: 1.6rem;
  }
  .intro {
    font-size: 0.9rem;
  }
  /* Always in sight while writing: sticks right under the app header */
  .timer {
    position: sticky;
    top: var(--header-h, 0px);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.9rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    overflow: hidden;
    font-size: 0.9rem;
  }
  .timer.low {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 50%, transparent);
  }
  .timer .strong {
    font-weight: 700;
  }
  .flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--danger);
    opacity: 0;
  }
  .flash.on {
    animation: flash 0.7s ease-out;
  }
  @keyframes flash {
    15% {
      opacity: 0.55;
    }
    100% {
      opacity: 0;
    }
  }
  .warning {
    padding: 0.6rem 0.9rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    color: var(--danger);
    font: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .thanks {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    padding: 1.4rem 1rem;
    text-align: center;
  }
  .ok {
    color: var(--success);
  }
  .people {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: center;
  }
  .person {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.6rem 0.2rem 0.2rem;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.8rem;
    opacity: 0.5;
  }
  .person.done {
    opacity: 1;
    box-shadow: inset 0 0 0 1px var(--success);
  }
  .owner {
    justify-content: center;
    flex-wrap: wrap;
  }
  .ready {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.8rem;
    padding: 2rem 0.5rem;
    text-align: center;
  }
  .big {
    min-height: 3.4rem;
    padding: 0 1.6rem;
    font-size: 1.1rem;
  }
</style>
