<script lang="ts">
  import { PenLine, Trophy } from '@lucide/svelte';
  import { scale } from 'svelte/transition';
  import type { QuizState } from '$shared/quiz.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  /** Participative quiz: a small card above the main widget while guests write their questions */
  const c = $derived((hb.modules.quiz as QuizState | undefined)?.collect ?? null);
  const status = $derived.by(() => {
    if (!c) return '';
    if (c.phase === 'ready') return `${c.title} is ready: ${c.total} questions`;
    const total = c.done.length + c.waiting.length;
    if (c.extend) {
      const names = [...c.done, ...c.waiting].map((p) => p.name);
      const who = names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
      return `${who || 'Someone'} ${names.length === 1 ? 'is' : 'are'} adding questions to ${c.title}`;
    }
    return `Write your questions on your phone · ${c.done.length} of ${total} done`;
  });
</script>

{#if c}
  <div class="card collect" in:scale={{ start: 0.95 }}>
    <span class="icon">{#if c.phase === 'ready'}<Trophy size="1.1rem" />{:else}<PenLine size="1.1rem" />{/if}</span>
    <span class="what">
      <span class="eyebrow truncate">Participative quiz · {c.title}</span>
      {#key status}<strong class="truncate" in:scale={{ start: 0.9, duration: 250 }}>{status}</strong>{/key}
    </span>
    {#if c.phase === 'writing'}
      <span class="faces">
        {#each c.done as p (p.id)}
          <span class="face done" in:scale><Avatar name={p.name} color={p.color} id={p.id} size="1.8rem" /></span>
        {/each}
        {#each c.waiting as p (p.id)}
          <span class="face"><Avatar name={p.name} color={p.color} id={p.id} size="1.8rem" /></span>
        {/each}
      </span>
    {/if}
  </div>
{/if}

<style>
  .collect {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 1rem;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    flex: none;
    border-radius: 0.6rem;
    background: var(--gradient);
    color: #fff;
  }
  .what {
    flex: 1;
    display: grid;
    min-width: 0;
  }
  .what .eyebrow {
    font-size: 0.65rem;
  }
  .what strong {
    font-size: 1rem;
  }
  .faces {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.25rem;
    overflow: hidden;
    max-width: 50%;
  }
  .face {
    flex: none;
    display: grid;
    border-radius: 50%;
    opacity: 0.35;
  }
  .face.done {
    opacity: 1;
    box-shadow: 0 0 0 0.15rem var(--success);
  }
</style>
