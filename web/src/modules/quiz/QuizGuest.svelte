<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import { fade, scale } from 'svelte/transition';
  import { ANSWER_STYLES, type QuizState } from '$shared/quiz.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import Shape from './Shape.svelte';

  const q = $derived(hb.modules.quiz as QuizState | undefined);
  const meId = $derived(hb.me?.id);
  const me = $derived(q?.players.find((p) => p.id === meId));
  const rank = $derived(me ? (q?.players.indexOf(me) ?? -1) + 1 : 0);

  // The answer this phone gave for the current question
  let mine = $state<{ index: number; choice: number } | null>(null);
  const myChoice = $derived(mine && q && mine.index === q.index ? mine.choice : null);
  const answered = $derived(myChoice !== null || (!!meId && !!q?.answered.includes(meId)));

  async function answer(choice: number) {
    if (!q || answered) return;
    const index = q.index;
    mine = { index, choice };
    const ok = await attempt(() => rpc('quiz', 'answer', { choice }));
    if (!ok) mine = null;
  }
</script>

{#if q}
  <div class="quiz">
    {#if q.phase === 'loading' || q.phase === 'lobby'}
      <div class="center" in:fade>
        <span class="eyebrow">Quiz</span>
        <h1>Get ready, {hb.me?.name}</h1>
        <p class="dim">Questions appear on the TV. Pick your answer here, fast answers score more.</p>
      </div>
    {:else if q.phase === 'question' && q.question}
      {#if answered}
        <div class="center" in:scale={{ start: 0.9 }}>
          {#if myChoice !== null}<Shape shape={ANSWER_STYLES[myChoice].shape} color={ANSWER_STYLES[myChoice].color} size="5rem" />{/if}
          <h1>Answer locked</h1>
          <p class="dim">{q.answered.length} of {q.playerCount} answered</p>
        </div>
      {:else}
        <p class="qtext">{q.question.text}</p>
        <div class="pad">
          {#each q.question.answers as a, i}
            {@const st = ANSWER_STYLES[i]}
            <button class="choice" style:--c={st.color} onclick={() => answer(i)}>
              <Shape shape={st.shape} color="#fff" size="1.8rem" />
              <span>{a}</span>
            </button>
          {/each}
        </div>
      {/if}
    {:else if q.phase === 'reveal' && q.reveal}
      {@const right = myChoice !== null ? myChoice === q.reveal.correct : (me?.delta ?? 0) > 0}
      <div class="center result" class:right in:scale={{ start: 0.85 }}>
        {#if !answered}
          <CircleX size={72} />
          <h1>Too slow</h1>
        {:else if right}
          <CircleCheck size={72} />
          <h1>Correct</h1>
          {#if me?.delta}<p class="points mono">+{me.delta} points</p>{/if}
        {:else}
          <CircleX size={72} />
          <h1>Not this time</h1>
        {/if}
        {#if q.question}<p class="dim">Answer: <strong>{q.question.answers[q.reveal.correct]}</strong></p>{/if}
      </div>
    {:else if q.phase === 'scores'}
      <div class="center" in:fade>
        <span class="eyebrow">Your rank</span>
        <h1 class="rank mono">{rank ? `#${rank}` : '-'}</h1>
        <p class="dim">{me?.score ?? 0} points</p>
      </div>
    {:else if q.phase === 'final'}
      <div class="center" in:fade>
        <span class="eyebrow">Final rank</span>
        <h1 class="rank mono">{rank ? `#${rank}` : '-'}</h1>
        <p class="dim">{me?.score ?? 0} points, {me?.correct ?? 0} right answers</p>
        {#if me?.reward && hb.core?.economyEnabled}<p class="won">You won <Money amount={me.reward} /></p>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .quiz {
    min-height: calc(100dvh - 6rem);
    display: grid;
    align-content: center;
    gap: 1rem;
    padding-bottom: 1rem;
  }
  .center {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 0.8rem;
    padding: 2rem 0.5rem;
  }
  h1 {
    font-size: 2rem;
  }
  .qtext {
    font-weight: 600;
    font-size: 1.05rem;
    line-height: 1.35;
  }
  .pad {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
  }
  .choice {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.6rem;
    min-height: 9.5rem;
    padding: 1rem 0.6rem;
    border: 0;
    border-radius: var(--radius);
    background: var(--c);
    color: #fff;
    font-weight: 700;
    font-size: 0.98rem;
    line-height: 1.2;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    box-shadow: 0 10px 24px -14px var(--c);
    transition: transform 0.1s ease;
  }
  .choice:active {
    transform: scale(0.96);
  }
  .result {
    color: var(--danger);
  }
  .result.right {
    color: var(--success);
  }
  .result h1 {
    color: var(--text);
  }
  .points {
    font-size: 1.4rem;
    font-weight: 700;
  }
  .rank {
    font-size: 4.5rem;
  }
  .won {
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--success);
  }
</style>
