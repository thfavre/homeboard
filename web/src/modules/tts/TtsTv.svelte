<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { TtsEvent } from '$shared/tts.ts';
  import { onEvent, rpc } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  let current = $state<(TtsEvent & { key: number; fromX: number; toX: number; durationMs: number }) | null>(null);
  let queue: TtsEvent[] = [];
  let seq = 0;
  let processing = false;

  let viewportEl = $state<HTMLDivElement>();
  let contentEl = $state<HTMLDivElement>();
  let activeUtterance: SpeechSynthesisUtterance | null = null;

  function speak(text: string, volume: number): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }

      const utterance = new SpeechSynthesisUtterance(text);
      activeUtterance = utterance;
      utterance.volume = Math.max(0, Math.min(1, volume));
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const preferred = voices.find((v) => v.default) ?? voices.find((v) => v.lang.startsWith('en')) ?? voices[0];
        if (preferred) utterance.voice = preferred;
      }

      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          activeUtterance = null;
          resolve();
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      // Fallback timeout in case speech synthesis stalls
      setTimeout(finish, Math.max(6000, text.length * 150));

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    });
  }

  async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {
      const item = queue.shift()!;
      const key = ++seq;

      const estimatedSpeechMs = Math.max(5000, Math.round((item.text.length / 12) * 1000) + 1500);

      // Measure viewport and content
      const Wc = viewportEl ? viewportEl.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 1920);
      // Rough placeholder width
      const estimatedContentW = Math.max(250, item.text.length * 28 + (item.anonymous ? 0 : 200));
      const totalDist = Wc + estimatedContentW;
      const scrollMs = Math.max(5000, Math.round((totalDist / 180) * 1000));
      const durationMs = Math.max(estimatedSpeechMs, scrollMs);

      // Scroll from left to right: from -contentWidth to +Wc
      current = {
        ...item,
        key,
        fromX: -estimatedContentW,
        toX: Wc,
        durationMs,
      };

      // Allow tick for DOM to measure exact content width
      await new Promise((r) => setTimeout(r, 60));
      if (contentEl && viewportEl && current?.key === key) {
        const exactWc = viewportEl.clientWidth;
        const exactContentW = contentEl.offsetWidth;
        current.fromX = -exactContentW;
        current.toX = exactWc;
      }

      // Play audio and wait for both speech & scroll
      const speechPromise = speak(item.text, item.volume);
      const scrollPromise = new Promise((r) => setTimeout(r, durationMs));

      await Promise.all([speechPromise, scrollPromise]);

      // Brief reading pause after scrolling past
      await new Promise((r) => setTimeout(r, 600));

      // Report ended to server so Spotify restores volume
      void rpc('tts', 'ended', { id: item.id }).catch(() => {});

      if (current?.key === key) {
        current = null;
      }

      // Gap between queued messages
      if (queue.length > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    processing = false;
  }

  $effect(() => {
    const unlock = () => {
      if ('speechSynthesis' in window && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    const off = onEvent<TtsEvent>('tts', 'tts', (e) => {
      queue.push(e);
      void processQueue();
    });

    return () => {
      off();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  });
</script>

{#if current}
  {#key current.key}
    <div
      class="tts-strip"
      transition:fade={{ duration: 350 }}
    >
      <div class="marquee-viewport" bind:this={viewportEl}>
        <div
          class="marquee-track"
          style:--from="{current.fromX}px"
          style:--to="{current.toX}px"
          style:--dur="{current.durationMs}ms"
        >
          <div class="marquee-content" bind:this={contentEl}>
            {#if !current.anonymous && current.guest}
              <Avatar
                name={current.guest.name}
                color={current.guest.color}
                id={current.guest.id}
                size="4.2rem"
              />
            {/if}

            <span class="marquee-text">
              {current.text}
            </span>

            {#if !current.anonymous && current.guest}
              <Avatar
                name={current.guest.name}
                color={current.guest.color}
                id={current.guest.id}
                size="4.2rem"
              />
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/key}
{/if}

<style>
  .tts-strip {
    position: fixed;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 47;
    padding: 1.5rem 0;
    background: color-mix(in srgb, var(--card) 86%, transparent);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    border-top: 2px solid color-mix(in srgb, var(--accent) 45%, var(--border));
    border-bottom: 2px solid color-mix(in srgb, var(--accent) 45%, var(--border));
    box-shadow:
      0 0 60px 15px rgba(0, 0, 0, 0.75),
      0 0 35px -5px color-mix(in srgb, var(--accent) 25%, transparent);
    overflow: hidden;
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  .marquee-viewport {
    width: 100%;
    overflow: hidden;
    position: relative;
    mask-image: linear-gradient(90deg, transparent 0%, black 4%, black 96%, transparent 100%);
    -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 4%, black 96%, transparent 100%);
  }

  .marquee-track {
    display: inline-block;
    white-space: nowrap;
    will-change: transform;
    animation: scroll-left-to-right var(--dur) linear forwards;
  }

  .marquee-content {
    display: inline-flex;
    align-items: center;
    gap: 2.2rem;
    white-space: nowrap;
  }

  .marquee-text {
    font-family: var(--font-display);
    font-size: 2.8rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
    text-shadow: 0 0 30px color-mix(in srgb, var(--accent) 30%, transparent);
    display: inline-block;
  }

  @keyframes scroll-left-to-right {
    0% {
      transform: translateX(var(--from));
    }
    100% {
      transform: translateX(var(--to));
    }
  }
</style>
