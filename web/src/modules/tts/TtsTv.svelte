<script lang="ts">
  import { fade } from 'svelte/transition';
  import { TTS_LANGS, ttsLang, ttsSpeechMs, ttsStyle, type TtsEvent } from '$shared/tts.ts';
  import { hb, onEvent, rpc } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  let current = $state<(TtsEvent & { key: number; durationMs: number }) | null>(null);
  let queue: TtsEvent[] = [];
  let seq = 0;
  let processing = false;
  let destroyed = false;
  let activeUtterance: SpeechSynthesisUtterance | null = null;

  const voiceLang = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');

  /** Best installed voice for a language: the system default if it fits, then an offline one */
  function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
    const fitting = window.speechSynthesis.getVoices().filter((v) => voiceLang(v).startsWith(lang));
    return fitting.find((v) => v.default) ?? fitting.find((v) => v.localService) ?? fitting[0];
  }

  /** Tell the server which languages this TV can speak, so the host sees a missing French voice */
  function reportVoices() {
    if (!('speechSynthesis' in window) || !hb.connected) return;
    const voices = window.speechSynthesis.getVoices();
    const langs = TTS_LANGS.filter((l) => voices.some((v) => voiceLang(v).startsWith(l.id))).map((l) => l.id);
    void rpc('tts', 'voices', { langs }).catch(() => {});
  }

  function speak(item: TtsEvent): Promise<void> {
    const { text, volume } = item;
    const style = ttsStyle(item.style);
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
      utterance.rate = style.rate;
      utterance.pitch = style.pitch;
      const lang = ttsLang(item.lang) ?? TTS_LANGS[0];
      utterance.lang = lang.bcp47;
      const voice = pickVoice(lang.id);
      if (voice) utterance.voice = voice;

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
      timer = setTimeout(finish, Math.max(6000, (text.length * 150) / style.rate));

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
        const estimatedSpeechMs = Math.max(5000, ttsSpeechMs(item.text, ttsStyle(item.style).rate) + 1500);
        const durationMs = Math.max(6500, estimatedSpeechMs + 2000);

        current = {
          ...item,
          key,
          durationMs,
        };

        // Play audio and wait for both speech & scroll
        // As soon as the voice stops, the music can come back up (the banner may still be scrolling)
        const speechPromise = speak(item).then(() => {
          void rpc('tts', 'spoken', { id: item.id }).catch(() => {});
        });
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

  // Report on every (re)connection, once the voice list had time to load
  $effect(() => {
    if (!hb.connected) return;
    const t = setTimeout(reportVoices, 1500);
    return () => clearTimeout(t);
  });

  $effect(() => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.addEventListener('voiceschanged', reportVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', reportVoices);
  });

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
    animation: scroll-right-to-left var(--dur) linear forwards;
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

  /* Enters from the right and leaves on the left, like reading */
  @keyframes scroll-right-to-left {
    0% {
      transform: translateX(100vw);
    }
    100% {
      transform: translateX(-100%);
    }
  }
</style>
