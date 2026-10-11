<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, fly, scale } from 'svelte/transition';
  import { ANSWER_STYLES, type QuizState } from '$shared/quiz.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Qr from '$lib/ui/Qr.svelte';
  import Shape from './Shape.svelte';
  import Ring from './Ring.svelte';
  import QuizFinal from './QuizFinal.svelte';
  import { Pause } from '@lucide/svelte';

  const q = $derived(hb.modules.quiz as QuizState | undefined);
  const join = $derived(hb.core?.join);
  const maxCount = $derived(q?.reveal ? Math.max(1, ...q.reveal.counts) : 1);

  const phaseTotal = $derived(Math.max(1, q?.phaseMs ?? 1));
  const readyCount = $derived(q?.ready.length ?? 0);
</script>

{#if q}
  <div class="quiz">
    <header>
      <span class="brand">Quiz</span>
      {#if q.source === 'custom'}<span class="dim category">{q.title}</span>{/if}
      {#if q.total && q.phase !== 'lobby' && q.phase !== 'countdown' && q.phase !== 'final'}
        <span class="pill">Question {q.index + 1} of {q.total}</span>
        <span class="dim category">{q.category}</span>
        {#if q.difficulty}<span class="pill accent cap">{q.difficulty}</span>{/if}
        {#if q.question?.author}<span class="pill accent">Question from {q.question.author.name}</span>{/if}
      {/if}
    </header>

    {#if q.phase === 'loading'}
      <div class="center" in:fade><h1 class="big">Getting questions...</h1></div>
    {:else if q.phase === 'lobby'}
      <div class="lobby" in:fade>
        <div class="intro">
          <span class="eyebrow">{q.owner ? `${q.owner.name} started a quiz` : 'Get your phones ready'}</span>
          <h1 class="big">{q.source === 'trivia' ? 'Quiz time' : q.title}</h1>
          <p class="dim lead">
            {q.total} questions. Answer on your phone, faster right answers score more.
            {q.lobbyMode === 'owner' ? `${q.owner?.name} starts it when everyone is in.` : `Press Ready on your phone to start sooner (${readyCount} of ${q.playerCount} ready).`}
          </p>
          <div class="players">
            {#each q.players as p (p.id)}
              <span class="player" in:scale><Avatar name={p.name} color={p.color} id={p.id} size="2.4rem" />{p.name}</span>
            {/each}
          </div>
        </div>
        <div class="side">
          <Ring endsAt={q.endsAt} totalMs={phaseTotal} pausedLeft={q.pausedLeft} size="9rem" />
          {#if join}
            <div class="late card">
              <Qr svg={join.qrSvg} size="8rem" />
              <span class="dim">Not in yet? Scan to join{#if join.codeRequired}, code <strong class="mono">{join.code}</strong>{/if}</span>
            </div>
          {/if}
        </div>
      </div>
    {:else if q.phase === 'countdown'}
      <div class="center count" in:fade>
        <h1 class="big">Get ready</h1>
        <Ring endsAt={q.endsAt} totalMs={phaseTotal} pausedLeft={q.pausedLeft} size="16rem" />
      </div>
    {:else if (q.phase === 'question' || q.phase === 'reveal') && q.question}
      {#key q.index}
        <div class="round" in:fly={{ y: 30, duration: 400 }}>
          <div class="qline" class:with-image={!!q.question.image}>
            <h1 class="question">{q.question.text}</h1>
            {#if q.question.image}<img class="qimg" src={q.question.image} alt="" />{/if}
            {#if q.phase === 'question'}
              <div class="timer">
                <Ring endsAt={q.endsAt} totalMs={phaseTotal} pausedLeft={q.pausedLeft} size="7rem" />
                <span class="dim">{q.answered.length} / {q.playerCount} answered</span>
              </div>
            {/if}
          </div>
          <div class="answers">
            {#each q.question.answers as a, i}
              {@const st = ANSWER_STYLES[i]}
              {@const wrong = q.reveal && q.reveal.correct !== i}
              <div class="answer" class:wrong class:right={q.reveal?.correct === i} style:--c={st.color}>
                <Shape shape={st.shape} size="2.2rem" color="#fff" />
                <span class="text">{a}</span>
                {#if q.reveal}
                  <span class="count mono" in:fade>{q.reveal.counts[i]}</span>
                  <span class="meter" style:width="{(q.reveal.counts[i] / maxCount) * 100}%"></span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/key}
    {:else if q.phase === 'scores'}
      <div class="scores" in:fade>
        <h1 class="big">Leaderboard</h1>
        <ol>
          {#each q.players.slice(0, 8) as p, i (p.id)}
            <li class="card" animate:flip={{ duration: 600 }}>
              <span class="rank mono">{i + 1}</span>
              <Avatar name={p.name} color={p.color} id={p.id} size="2.6rem" />
              <span class="name truncate">{p.name}</span>
              {#if p.delta}<span class="delta mono">+{p.delta}</span>{/if}
              <span class="score mono">{p.score}</span>
            </li>
          {/each}
        </ol>
      </div>
    {:else if q.phase === 'final'}
      <QuizFinal {q} />
    {/if}

    {#if q.paused}
      <div class="paused" transition:fade><Pause size={64} /> Paused</div>
    {/if}
  </div>
{/if}

<style>
  .quiz {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1.5rem;
    padding: 2rem 2.5rem 2.5rem;
  }
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1.1rem;
  }
  .brand {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.6rem;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .pill {
    font-size: 1rem;
    padding: 0.3em 0.8em;
  }
  .cap {
    text-transform: capitalize;
  }
  .category {
    font-size: 1.1rem;
  }
  .center {
    display: grid;
    place-items: center;
  }
  .big {
    font-size: 5rem;
    letter-spacing: -0.04em;
  }
  .lead {
    font-size: 1.5rem;
    max-width: 50rem;
  }
  .lobby {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3rem;
    align-items: center;
  }
  .intro {
    display: grid;
    gap: 1.2rem;
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    margin-top: 1rem;
  }
  .player {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 1rem 0.35rem 0.35rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 1.15rem;
    font-weight: 600;
  }
  .side {
    display: grid;
    justify-items: center;
    gap: 2rem;
    font-size: 2.2rem;
  }
  .late {
    display: grid;
    justify-items: center;
    gap: 0.7rem;
    padding: 1rem;
    font-size: 0.95rem;
    max-width: 14rem;
    text-align: center;
  }
  .round {
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 2rem;
    min-height: 0;
  }
  .qline {
    display: flex;
    align-items: center;
    gap: 3rem;
  }
  .question {
    flex: 1;
    font-size: clamp(2.4rem, 4.2vw, 4rem);
    line-height: 1.15;
  }
  .timer {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    font-size: 1.8rem;
  }
  .timer .dim {
    font-size: 1rem;
  }
  .answers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.1rem;
  }
  .answer {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    min-height: 7.5rem;
    padding: 1.2rem 1.6rem;
    border-radius: var(--radius);
    background: var(--c);
    color: #fff;
    font-size: 1.9rem;
    font-weight: 700;
    overflow: hidden;
    transition:
      opacity 0.4s ease,
      transform 0.4s ease,
      filter 0.4s ease;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }
  .answer .text {
    flex: 1;
    position: relative;
  }
  .answer.wrong {
    opacity: 0.28;
    filter: saturate(0.4);
  }
  .answer.right {
    transform: scale(1.02);
    box-shadow:
      0 0 0 4px #fff,
      0 20px 60px -20px var(--c);
  }
  .count {
    position: relative;
    font-size: 2.2rem;
  }
  .meter {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 0.5rem;
    background: rgba(255, 255, 255, 0.6);
    transition: width 0.8s ease;
  }
  .scores {
    display: grid;
    align-content: start;
    gap: 2rem;
    max-width: 70rem;
    width: 100%;
    margin: 0 auto;
  }
  .scores ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.7rem;
  }
  .scores li {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 0.8rem 1.4rem;
    font-size: 1.6rem;
  }
  .rank {
    width: 2.5rem;
    color: var(--text-faint);
    font-weight: 700;
  }
  .name {
    flex: 1;
    font-weight: 600;
  }
  .delta {
    color: var(--success);
    font-size: 1.2rem;
  }
  .score {
    font-weight: 700;
    min-width: 6rem;
    text-align: right;
  }
  .count {
    font-size: 6rem;
    gap: 3rem;
    place-content: center;
    justify-items: center;
  }
  .with-image {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
  }
  .qimg {
    max-height: 38vh;
    max-width: 38vw;
    border-radius: var(--radius);
    object-fit: contain;
    box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.8);
  }
  .paused {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 1rem;
    font-family: var(--font-display);
    font-size: 4rem;
    font-weight: 700;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    backdrop-filter: blur(8px);
  }
</style>
