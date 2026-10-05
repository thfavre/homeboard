<script lang="ts">
  import { CircleCheck, CircleX, Pause, Play, Sparkles, Zap } from '@lucide/svelte';
  import { fade, scale } from 'svelte/transition';
  import { ANSWER_STYLES, type QuizState } from '$shared/quiz.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Shape from './Shape.svelte';
  import Joystick from './Joystick.svelte';

  const q = $derived(hb.modules.quiz as QuizState | undefined);
  const meId = $derived(hb.me?.id);
  const me = $derived(q?.players.find((p) => p.id === meId));
  const rank = $derived(me ? (q?.players.indexOf(me) ?? -1) + 1 : 0);
  const podiumRank = $derived(meId && q ? q.podium.indexOf(meId) : -1);
  const isOwner = $derived(!!meId && q?.owner?.id === meId);
  const isReady = $derived(!!meId && !!q?.ready.includes(meId));

  // The answer this phone gave for the current question
  let mine = $state<{ index: number; choice: number } | null>(null);
  const myChoice = $derived(mine && q && mine.index === q.index ? mine.choice : null);
  const answered = $derived(myChoice !== null || (!!meId && !!q?.answered.includes(meId)));

  // Seconds left in the current phase
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });
  const left = $derived(q ? Math.max(0, Math.ceil(((q.endsAt ?? now + q.pausedLeft) - now) / 1000)) : 0);

  async function answer(choice: number) {
    if (!q || answered || q.paused) return;
    const index = q.index;
    mine = { index, choice };
    const ok = await attempt(() => rpc('quiz', 'answer', { choice }));
    if (!ok) mine = null;
  }

  const move = (x: number, y: number) => void rpc('quiz', 'move', { x, y }).catch(() => {});
  const celebrate = () => void rpc('quiz', 'celebrate').catch(() => {});
</script>

{#if q}
  <div class="quiz">
    {#if q.paused}
      <div class="paused" transition:fade>
        <Pause size={22} /> Paused by the host
      </div>
    {/if}

    {#if q.phase === 'loading'}
      <div class="center" in:fade>
        <span class="eyebrow">Quiz</span>
        <h1>Getting questions...</h1>
      </div>
    {:else if q.phase === 'lobby'}
      <div class="center" in:fade>
        <span class="eyebrow">{q.title}</span>
        {#if isOwner}
          <h1>Everyone in?</h1>
          <p class="dim">Start when your friends have joined. It starts by itself in {left}s.</p>
          <button class="btn primary big" onclick={() => attempt(() => rpc('quiz', 'begin'))}><Play size={22} /> Start now</button>
        {:else if q.lobbyMode === 'owner'}
          <h1>Get ready, {hb.me?.name}</h1>
          <p class="dim">Waiting for {q.owner?.name} to start (at most {left}s).</p>
        {:else}
          <h1>Get ready, {hb.me?.name}</h1>
          <p class="dim">Press Ready to start sooner. Starts in {left}s.</p>
          <button class="btn primary big" disabled={isReady} onclick={() => attempt(() => rpc('quiz', 'ready'))}>
            <Zap size={22} />
            {isReady ? 'Ready' : "I'm ready"}
          </button>
          <p class="faint">{q.ready.length} of {q.playerCount} ready</p>
        {/if}
      </div>
    {:else if q.phase === 'countdown'}
      <div class="center" in:fade>
        <span class="eyebrow">Get ready</span>
        <h1 class="count mono">{left}</h1>
        <p class="dim">Look at the TV.</p>
      </div>
    {:else if q.phase === 'question' && q.question}
      {#if answered}
        <div class="center" in:scale={{ start: 0.9 }}>
          {#if myChoice !== null}<Shape shape={ANSWER_STYLES[myChoice].shape} color={ANSWER_STYLES[myChoice].color} size="5rem" />{/if}
          <h1>Answer locked</h1>
          <p class="dim">{q.answered.length} of {q.playerCount} answered</p>
        </div>
      {:else}
        {#if q.question.image}<img class="qimg" src={q.question.image} alt="" />{/if}
        <p class="qtext">{q.question.text}</p>
        <div class="pad" class:two={q.question.answers.length === 2}>
          {#each q.question.answers as a, i}
            {@const st = ANSWER_STYLES[i]}
            <button class="choice" style:--c={st.color} disabled={q.paused} onclick={() => answer(i)}>
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
      <div class="final" in:fade>
        <div class="me">
          <Avatar name={hb.me?.name ?? ''} color={hb.me?.color ?? '#888'} src={hb.me?.avatar} size="3.2rem" />
          <div>
            <strong>{podiumRank === 0 ? 'You won!' : rank ? `Rank #${rank}` : 'Thanks for playing'}</strong>
            <p class="dim small">
              {me?.score ?? 0} points{#if me?.reward && hb.core?.economyEnabled}<span>{' · won '}</span><Money amount={me.reward} />{/if}
            </p>
          </div>
        </div>

        {#if podiumRank === 0}
          <p class="dim center-text">Move your picture on the TV and make it spin!</p>
          <Joystick onmove={move} />
          <button class="btn primary spin" onclick={celebrate}><Sparkles size={26} /> Spin</button>
        {:else if podiumRank === 1}
          <button class="btn primary medium" onclick={celebrate}><Sparkles size={20} /> Show off</button>
        {:else if podiumRank === 2}
          <button class="btn primary" onclick={celebrate}><Sparkles size={18} /> Wave</button>
        {:else if me}
          <button class="btn small-fx" onclick={celebrate}>Say hi on the TV</button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .quiz {
    position: relative;
    min-height: calc(100dvh - 6rem);
    display: grid;
    align-content: center;
    gap: 1rem;
    padding-bottom: 1rem;
  }
  .paused {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.7rem;
    border-radius: var(--radius-sm);
    background: var(--warning);
    color: #1d1500;
    font-weight: 700;
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
  .big {
    min-height: 3.6rem;
    padding: 0 2rem;
    font-size: 1.15rem;
    margin-top: 0.5rem;
  }
  .count {
    font-size: 6rem;
    line-height: 1;
  }
  .qimg {
    width: 100%;
    max-height: 30dvh;
    object-fit: contain;
    border-radius: var(--radius-sm);
    background: #000;
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
  .choice:disabled {
    opacity: 0.5;
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
  .final {
    display: grid;
    justify-items: center;
    gap: 1.2rem;
  }
  .me {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    align-self: stretch;
    padding: 0.8rem 1rem;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .small {
    font-size: 0.85rem;
  }
  .center-text {
    text-align: center;
    font-size: 0.9rem;
  }
  .spin {
    width: min(16rem, 80vw);
    min-height: 4.4rem;
    font-size: 1.4rem;
    border-radius: 999px;
  }
  .medium {
    min-height: 3.4rem;
    padding: 0 2rem;
    font-size: 1.1rem;
  }
  .small-fx {
    font-size: 0.9rem;
  }
</style>
