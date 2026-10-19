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
  const left = $derived(c ? Math.max(0, Math.ceil((c.endsAt - now) / 1000)) : 0);
  const clock = $derived(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);

  const status = $derived(
    mine ? `You sent ${mine.count === 1 ? '1 question' : `${mine.count} questions`}` : changing ? 'You are changing your questions' : skipped ? 'You skipped this one' : 'Your questions are still missing',
  );
</script>

{#if c?.phase === 'writing' && meId}
  <div class="card mini">
    <span class="icon"><PenLine size={20} /></span>
    <div class="text">
      <span class="eyebrow truncate">Participative quiz · <span class="mono">{clock}</span> left</span>
      <span class="title truncate">{c.title}</span>
      <span class="status truncate">{status}</span>
    </div>
    <button class="btn small" class:primary={!mine} onclick={() => openCollectScreen(!!mine || changing)}>{mine || changing ? 'Change' : 'Write'}</button>
    <div class="bar"><span style:width="{total ? (c.done.length / total) * 100 : 0}%"></span></div>
  </div>
{/if}

<style>
  .mini {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.75rem 0.9rem 0.9rem;
    overflow: hidden;
  }
  .icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .title {
    font-weight: 600;
  }
  .status {
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--surface-3);
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--gradient);
    transition: width 0.4s ease;
  }
</style>
