<script lang="ts">
  import { Play, SkipForward, Square } from '@lucide/svelte';
  import type { QuizState } from '$shared/quiz.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';

  const q = $derived(hb.modules.quiz as QuizState | undefined);
  const s = hb.modules.quiz?.settings ?? { questions: 10, timeSec: 20, category: 0, difficulty: '' };
  let questions = $state(s.questions);
  let timeSec = $state(s.timeSec);
  let category = $state(s.category);
  let difficulty = $state(s.difficulty);
  let categories = $state<{ id: number; name: string }[]>([]);
  let starting = $state(false);

  rpc<{ id: number; name: string }[]>('quiz', 'categories')
    .then((c) => (categories = c))
    .catch(() => {});

  async function start() {
    starting = true;
    await attempt(() => rpc('quiz', 'start', { questions, timeSec, category, difficulty }));
    starting = false;
  }

  const PHASES: Record<string, string> = {
    loading: 'Getting questions',
    lobby: 'Lobby, starting soon',
    question: 'Question on screen',
    reveal: 'Showing the answer',
    scores: 'Leaderboard',
    final: 'Podium',
  };
</script>

{#if q}
  {#if q.phase === 'idle'}
    <Section title="New quiz" hint="Questions come from Open Trivia DB (in English). The quiz takes over the TV and every phone.">
      <div class="grid2">
        <label class="field">
          <span>Questions</span>
          <input class="input" type="number" min="3" max="30" bind:value={questions} />
        </label>
        <label class="field">
          <span>Seconds per question</span>
          <input class="input" type="number" min="5" max="60" bind:value={timeSec} />
        </label>
        <label class="field">
          <span>Category</span>
          <select class="input" bind:value={category}>
            <option value={0}>Any category</option>
            {#each categories as c}<option value={c.id}>{c.name}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Difficulty</span>
          <select class="input" bind:value={difficulty}>
            <option value="">Any</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
      </div>
      {#if q.error}<p class="error">{q.error}</p>{/if}
      <div>
        <button class="btn primary" disabled={starting} onclick={start}><Play size={18} /> {starting ? 'Loading questions...' : 'Start quiz'}</button>
      </div>
      <p class="faint small">Rewards for right answers and the podium are set in Economy.</p>
    </Section>
  {:else}
    <Section title="Quiz running">
      <div class="status">
        <span class="pill accent">{PHASES[q.phase]}</span>
        {#if q.total}<span class="dim">Question {q.index + 1} of {q.total}</span>{/if}
        {#if q.phase === 'question'}<span class="dim">{q.answered.length} / {q.playerCount} answered</span>{/if}
      </div>
      {#if q.question}<p class="question">{q.question.text}</p>{/if}
      <div class="row">
        <button class="btn" onclick={() => attempt(() => rpc('quiz', 'next'))}><SkipForward size={18} /> {q.phase === 'final' ? 'Close' : 'Next step'}</button>
        <button class="btn danger" onclick={() => confirm('Stop the quiz? No rewards are given.') && attempt(() => rpc('quiz', 'stop'))}>
          <Square size={18} /> Stop
        </button>
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
{/if}

<style>
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
    flex-wrap: wrap;
    align-items: center;
    gap: 0.8rem;
  }
  .question {
    font-weight: 600;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .grow {
    flex: 1;
  }
  @media (max-width: 600px) {
    .grid2 {
      grid-template-columns: 1fr;
    }
  }
</style>
