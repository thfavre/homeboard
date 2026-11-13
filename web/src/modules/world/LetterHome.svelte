<script lang="ts">
  import { Mail } from '@lucide/svelte';
  import { hb } from '$lib/client.svelte.ts';
  import LetterPaper from './LetterPaper.svelte';
  import { loadMail, mail, openLetter, unread, watchMail } from './mail.svelte.ts';

  /**
   * On the home screen: a letter the courier brought and not opened yet. A letter handed over
   * while the guest is here opens by itself, sealed.
   */
  watchMail();
  $effect(() => {
    if (hb.connected) void loadMail();
  });
  const waiting = $derived(unread());
</script>

{#if waiting.length}
  <button type="button" class="card letter" onclick={() => openLetter(waiting[0])}>
    <span class="icon"><Mail size={22} /></span>
    <span class="text">
      <span class="eyebrow">{waiting.length === 1 ? 'A letter for you' : `${waiting.length} letters for you`}</span>
      <span class="title truncate">From {waiting[0].fromName}{waiting.length > 1 ? ' and more' : ''}</span>
    </span>
    <span class="open">Open</span>
  </button>
{/if}

{#if mail.open}
  <LetterPaper letter={mail.open} onclose={() => (mail.open = null)} />
{/if}

<style>
  .letter {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    width: 100%;
    padding: 0.8rem 0.9rem;
    text-align: left;
    color: inherit;
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    animation: nudge 2.4s ease-in-out infinite;
  }
  @keyframes nudge {
    0%,
    86%,
    100% {
      transform: none;
    }
    90% {
      transform: rotate(-1deg);
    }
    94% {
      transform: rotate(1deg);
    }
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--accent);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .title {
    font-weight: 600;
  }
  .open {
    color: var(--accent);
    font-weight: 600;
    font-size: 0.9rem;
  }
</style>
