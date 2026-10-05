<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { TtsEvent } from '$shared/tts.ts';
  import { onEvent, rpc } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  let current = $state<(TtsEvent & { key: number; durationMs: number }) | null>(null);
  let queue: TtsEvent[] = [];
  let seq = 0;
  let processing = false;
  let destroyed = false;
  let activeUtterance: SpeechSynthesisUtterance | null = null;

  function speak(text: string, volume: number): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }

      const utterance = new SpeechSynthesisUtterance(text);
      activeUtterance = utterance;
      utterance.volume = Math.max(0, Math.min(1, volume));
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = navigator.language || 'en-US';

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const preferred = voices.find((v) => v.default) ?? voices.find((v) => v.lang.startsWith('en')) ?? voices[0];
        if (preferred) utterance.voice = preferred;
      }

      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let resumeInterval: ReturnType<typeof setTimeout> | null = null;

      const finish = () => {
        if (!done) {
          done = true;
          if (timer) clearTimeout(timer);
          if (resumeInterval) clearInterval(resumeInterval);
          activeUtterance = null;
          resolve();
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      // Chrome bug workaround: speech synthesis can pause unexpectedly during speech
      resumeInterval = setInterval(() => {
        if ('speechSynthesis' in window && window.speechSynthesis.speaking && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 1000);

      // Fallback timeout in case speech synthesis stalls
      timer = setTimeout(finish, Math.max(6000, text.length * 150));

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

    try {
      while (!destroyed && queue.length > 0) {
        const item = queue.shift()!;
        const key = ++seq;

        // Estimated reading & speech duration
        const estimatedSpeechMs = Math.max(5000, Math.round((item.text.length / 12) * 1000) + 1500);
        const durationMs = Math.max(6500, estimatedSpeechMs + 2000);

        current = {
          ...item,
          key,
          durationMs,
        };

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
        if (!destroyed && queue.length > 0) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    } finally {
      processing = false;
    }
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
      destroyed = true;
      off();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
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
      <div class="marquee-viewport">
        <div
          class="marquee-track"
          style:--dur="{current.durationMs}ms"
        >
          <div class="marquee-content">
            {#if !current.anonymous && current.guest}
              <Avatar
                name={current.guest.name}
                color={current.guest.color}
                id={current.guest.id}
                src={current.guest.avatar}
                size="7rem"
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
                src={current.guest.avatar}
                size="7rem"
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
    padding: 0.35rem 0;
    background: color-mix(in srgb, var(--bg) 82%, transparent);
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
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    will-change: transform;
    animation: scroll-left-to-right var(--dur) linear forwards;
  }

  .marquee-content {
    display: inline-flex;
    align-items: center;
    gap: 2.2rem;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .marquee-content :global(> *) {
    flex-shrink: 0;
  }

  .marquee-text {
    font-family: var(--font-display);
    font-size: 3.8rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
    text-shadow: 0 0 30px color-mix(in srgb, var(--accent) 30%, transparent);
    display: inline-block;
    flex-shrink: 0;
  }

  @keyframes scroll-left-to-right {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100vw);
    }
  }
</style>
