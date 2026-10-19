<script lang="ts">
  import { PenLine } from '@lucide/svelte';
  import type { QuizState } from '$shared/quiz.ts';
  import { hb, serverNow } from '$lib/client.svelte.ts';
  import { openCollectScreen } from './result.svelte.ts';

  /** Home card while a participative quiz is being written: a way back in to write or change your questions */
  const c = $derived((hb.modules.quiz as QuizState | undefined)?.collect ?? null);
  const meId = $derived(hb.me?.id);
  const mine = $derived(c?.done.find((d) => d.id === meId));
  const changing = $derived(!!meId && !!c?.editing.includes(meId));
  const skipped = $derived(!!meId && !!c?.skipped.includes(meId));
  const total = $derived(c ? c.done.length + c.waiting.length : 0);

  let now = $state(serverNow());
  $effect(() => {
    const t = setInterval(() => (now = serverNow()), 1000);
    return () => clearInterval(t);
  });
  const invited = $derived(!c?.extend || '*' in c.extend.until || (!!meId && meId in c.extend.until));
  const endsAt = $derived((meId && c?.extend?.until[meId]) || c?.extend?.until['*'] || c?.endsAt || 0);
  const left = $derived(Math.max(0, Math.ceil((endsAt - now) / 1000)));
  const clock = $derived(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);

  const status = $derived(
    mine ? `You sent ${mine.count === 1 ? '1 question' : `${mine.count} questions`}` : changing ? 'You are changing your questions' : skipped ? 'You skipped this one' : 'Your questions are still missing',
  );
</script>

{#if c?.phase === 'writing' && meId && invited && left > 0}
  <!-- Stands out from the other home cards: the time to write is short -->
  <button class="card mini" class:late={left <= 30} onclick={() => openCollectScreen(!!mine || changing)}>
    <span class="icon"><PenLine size={22} /></span>
    <span class="text">
      <span class="eyebrow truncate">Participative quiz</span>
      <span class="title truncate">{c.title}</span>
      <span class="status truncate">{status}</span>
    </span>
    <span class="side">
      <span class="clock mono">{clock}</span>
      <span class="btn small primary">{mine || changing ? 'Change' : 'Write'}</span>
    </span>
    <span class="bar"><span style:width="{total ? (c.done.length / total) * 100 : 0}%"></span></span>
  </button>
{/if}

<style>
  .mini {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    width: 100%;
    padding: 1rem 1rem 1.15rem;
    overflow: hidden;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 24%, var(--surface)), color-mix(in srgb, var(--accent-2, var(--accent)) 12%, var(--surface)));
    border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
    box-shadow: 0 10px 32px -12px color-mix(in srgb, var(--accent) 70%, transparent);
  }
  .icon {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 2.9rem;
    height: 2.9rem;
    border-radius: 50%;
    color: #fff;
    background: var(--gradient);
  }
  /* A ring that keeps pulsing out of the icon */
  .icon::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid var(--accent);
    animation: ping 1.8s ease-out infinite;
  }
  @keyframes ping {
    0% {
      transform: scale(1);
      opacity: 0.8;
    }
    100% {
      transform: scale(1.7);
      opacity: 0;
    }
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .eyebrow {
    color: var(--accent);
  }
  .title {
    font-size: 1.1rem;
    font-weight: 700;
  }
  .status {
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .side {
    display: grid;
    justify-items: end;
    gap: 0.35rem;
    flex: none;
  }
  .clock {
    font-size: 1.35rem;
    font-weight: 800;
    line-height: 1;
  }
  .late .clock {
    color: var(--danger);
  }
  .late {
    border-color: color-mix(in srgb, var(--danger) 60%, transparent);
  }
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4px;
    background: color-mix(in srgb, var(--text) 10%, transparent);
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--gradient);
    transition: width 0.4s ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .icon::after {
      animation: none;
      opacity: 0;
    }
  }
</style>
