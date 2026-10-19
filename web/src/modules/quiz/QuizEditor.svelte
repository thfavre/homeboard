<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { History, ImagePlus, Plus, Trash2, X } from '@lucide/svelte';
  import { ANSWER_STYLES, type CustomQuiz, type QuizDraft } from '$shared/quiz.ts';
  import { toast, upload } from '$lib/client.svelte.ts';
  import { shrinkImage } from '$lib/image.ts';
  import Shape from './Shape.svelte';
  import { clearDraft, loadDraft, openEditors, saveDraft } from './drafts.svelte.ts';

  /** Create or edit a custom quiz: title, questions, 2 to 4 answers each, optional picture */
  let {
    initial,
    busy = false,
    onsave,
    oncancel,
    withTitle = true,
    maxQuestions = 50,
    saveLabel = 'Save quiz',
    cancelLabel = 'Cancel',
    draft,
  }: {
    initial?: (Pick<CustomQuiz, 'title' | 'questions'> & { id?: string }) | null;
    busy?: boolean;
    onsave: (quiz: QuizDraft) => void;
    oncancel: () => void;
    /** Participative quiz: no title, only a few questions */
    withTitle?: boolean;
    maxQuestions?: number;
    saveLabel?: string;
    cancelLabel?: string;
    /** Key the draft is autosaved under on this phone (see drafts.svelte.ts); the parent clears it once saved */
    draft?: string;
  } = $props();

  interface Draft {
    text: string;
    answers: string[];
    correct: number;
    image?: string;
  }

  // No answer is ticked until the author picks the right one (-1 = none yet)
  const blank = (): Draft => ({ text: '', answers: ['', '', '', ''], correct: -1 });
  const start = untrack(() => initial);
  const key = untrack(() => draft);
  const fromInitial = () => ({
    title: start?.title ?? '',
    questions: start?.questions.map((q) => ({ ...q, answers: [...q.answers, '', '', ''].slice(0, 4) })) ?? [blank()],
  });
  const original = JSON.stringify(fromInitial());
  // A draft left on this phone wins over the saved version: it has the changes not sent yet
  const saved = key ? loadDraft(key) : null;
  const restore = saved && JSON.stringify({ title: saved.title, questions: saved.questions }) !== original ? saved : null;
  let title = $state(restore?.title ?? fromInitial().title);
  let questions = $state<Draft[]>((restore?.questions as Draft[] | undefined) ?? fromInitial().questions);
  let restored = $state(!!restore);

  // Autosave every change; nothing is kept while it matches what was opened
  $effect(() => {
    if (!key) return;
    const now = JSON.stringify({ title, questions });
    if (now === original) clearDraft(key);
    else saveDraft(key, title, JSON.parse(now).questions);
  });

  openEditors.count++;
  onDestroy(() => openEditors.count--);

  function discard() {
    const fresh = fromInitial();
    title = fresh.title;
    questions = fresh.questions;
    restored = false;
    if (key) clearDraft(key);
  }
  let uploading = $state<number | null>(null);
  let pickFor = -1;
  let fileInput = $state<HTMLInputElement>();

  function pickImage(i: number) {
    pickFor = i;
    fileInput?.click();
  }

  function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (file && pickFor >= 0) setImage(pickFor, file);
  }

  /** An image pasted anywhere in a question (a screenshot, a copied picture) becomes its picture */
  function onPaste(e: ClipboardEvent, i: number) {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    if (uploading === null) setImage(i, file);
  }

  async function setImage(i: number, file: File) {
    uploading = i;
    try {
      const blob = await shrinkImage(file, 1280, 0.85);
      const r = await upload<{ url: string }>('quiz', 'image', blob);
      questions[i].image = r.url;
    } catch (err) {
      toast({ text: (err as Error).message, kind: 'error' });
    } finally {
      uploading = null;
    }
  }

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (withTitle && !title.trim()) return toast({ text: 'Give your quiz a title', kind: 'error' });
    for (const [i, q] of questions.entries()) {
      if (!q.text.trim()) return toast({ text: `Question ${i + 1} has no text`, kind: 'error' });
      if (q.answers.filter((a) => a.trim()).length < 2) return toast({ text: `Question ${i + 1} needs at least 2 answers`, kind: 'error' });
      if (q.correct < 0) return toast({ text: `Question ${i + 1}: tap the circle next to the right answer`, kind: 'error' });
      if (!q.answers[q.correct]?.trim()) return toast({ text: `Question ${i + 1}: the answer marked as right is empty`, kind: 'error' });
    }
    onsave({ id: start?.id, title, questions: $state.snapshot(questions) });
  }
</script>

<form novalidate class="editor" onsubmit={save}>
  {#if restored}
    <div class="restored">
      <History size={16} />
      <span>Your draft is back, as you left it.</span>
      <button type="button" class="btn ghost small" onclick={discard}>{start ? 'Discard changes' : 'Start over'}</button>
    </div>
  {/if}
  {#if withTitle}
    <label class="field">
      <span>Title</span>
      <input class="input" bind:value={title} maxlength="60" placeholder="Movie night, Our holidays..." />
    </label>
  {/if}

  {#each questions as q, i}
    <div class="question" onpaste={(e) => onPaste(e, i)}>
      <div class="qhead">
        <span class="eyebrow">Question {i + 1}</span>
        <span class="spacer"></span>
        <button type="button" class="btn ghost small" disabled={questions.length === 1} onclick={() => questions.splice(i, 1)} aria-label="Delete question">
          <Trash2 size={16} />
        </button>
      </div>
      <textarea class="input" bind:value={q.text} maxlength="200" rows="2" placeholder="Type the question"></textarea>

      <div class="image-row">
        {#if q.image}
          <img src={q.image} alt="" />
          <button type="button" class="btn ghost small" disabled={uploading !== null} onclick={() => (q.image = undefined)}><X size={16} /> {uploading === i ? 'Uploading...' : 'Remove picture'}</button>
        {:else}
          <button type="button" class="btn small" disabled={uploading !== null} onclick={() => pickImage(i)}>
            <ImagePlus size={16} />
            {uploading === i ? 'Uploading...' : 'Add a picture (optional)'}
          </button>
          <span class="faint small paste-hint">or paste one in the question</span>
        {/if}
      </div>

      <div class="answers">
        {#each q.answers as _, a}
          <label class="answer" class:right={q.correct === a}>
            <input type="radio" name="correct-{i}" checked={q.correct === a} onchange={() => (q.correct = a)} aria-label="Right answer" />
            <Shape shape={ANSWER_STYLES[a].shape} color={ANSWER_STYLES[a].color} size="1.1rem" />
            <input class="input" bind:value={q.answers[a]} maxlength="80" placeholder={a < 2 ? `Answer ${a + 1}` : `Answer ${a + 1} (optional)`} />
          </label>
        {/each}
      </div>
      <p class="faint small">Tap the circle next to the right answer.</p>
    </div>
  {/each}

  <button type="button" class="btn" disabled={questions.length >= maxQuestions} onclick={() => questions.push(blank())}><Plus size={18} /> Add a question{maxQuestions < 50 ? ` (${questions.length}/${maxQuestions})` : ''}</button>

  <div class="actions">
    <button type="button" class="btn ghost" onclick={oncancel}>{cancelLabel}</button>
    <button class="btn primary" disabled={busy}>{busy ? 'Saving...' : saveLabel}</button>
  </div>
  <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onFile} />
</form>

<style>
  .editor {
    display: grid;
    gap: 1rem;
  }
  .restored {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.4rem 0.5rem 0.8rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    font-size: 0.85rem;
  }
  .restored span {
    flex: 1;
  }
  .question {
    display: grid;
    gap: 0.6rem;
    padding: 0.9rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .qhead {
    display: flex;
    align-items: center;
  }
  .image-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  /* Pasting is for a keyboard, not a phone */
  @media (pointer: coarse) {
    .paste-hint {
      display: none;
    }
  }
  .image-row img {
    width: 5rem;
    height: 3.6rem;
    object-fit: cover;
    border-radius: 0.5rem;
  }
  .answers {
    display: grid;
    gap: 0.4rem;
  }
  .answer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0.3rem 0.2rem 0.5rem;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
  }
  .answer.right {
    border-color: var(--success);
    background: color-mix(in srgb, var(--success) 10%, transparent);
  }
  .answer input[type='radio'] {
    accent-color: var(--success);
    width: 1.1rem;
    height: 1.1rem;
  }
  .answer .input {
    min-height: 2.4rem;
  }
  .small {
    font-size: 0.78rem;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
</style>
