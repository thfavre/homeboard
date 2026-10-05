<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fly, fade } from 'svelte/transition';
  import { Megaphone, Volume2 } from '@lucide/svelte';
  import type { TtsEvent } from '$shared/tts.ts';
  import { onEvent, rpc, showNames } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  let current = $state<(TtsEvent & { key: number; fromX: number; toX: number; durationMs: number }) | null>(null);
  let queue: TtsEvent[] = [];
  let seq = 0;
  let processing = false;

  let viewportEl = $state<HTMLDivElement>();
  let textEl = $state<HTMLSpanElement>();
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

      // Initial measurement placeholder
      const estimatedMs = Math.max(5000, Math.round((item.text.length / 12) * 1000) + 1500);

      // Measure viewport and text after mounting
      const Wc = viewportEl ? viewportEl.clientWidth : 900;
      // Approximate text width: ~18px per character at 2rem display font
      const estimatedWt = Math.max(200, item.text.length * 20);
      const totalDist = Wc + estimatedWt;
      // Scroll speed ~130px per sec
      const scrollDurationMs = Math.max(5000, Math.round((totalDist / 130) * 1000));
      const durationMs = Math.max(estimatedMs, scrollDurationMs);

      current = {
        ...item,
        key,
        fromX: Wc,
        toX: -estimatedWt,
        durationMs,
      };

      // Allow tick for DOM to update and measure exact text width if possible
      await new Promise((r) => setTimeout(r, 60));
      if (textEl && viewportEl && current?.key === key) {
        const exactWc = viewportEl.clientWidth;
        const exactWt = textEl.scrollWidth;
        current.fromX = exactWc;
        current.toX = -exactWt;
      }

      // Play audio and wait for both speech & scroll
      const speechPromise = speak(item.text, item.volume);
      const scrollPromise = new Promise((r) => setTimeout(r, durationMs));

      await Promise.all([speechPromise, scrollPromise]);

      // Small pause after finished
      await new Promise((r) => setTimeout(r, 800));

      // Report ended to server so Spotify restores volume
      void rpc('tts', 'ended', { id: item.id }).catch(() => {});

      if (current?.key === key) {
        current = null;
      }

      // Small gap between queued messages
      if (queue.length > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    processing = false;
  }

  $effect(() => {
    // Unlock speech synthesis if blocked
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
      class="tts-banner"
      transition:fly={{ y: 60, duration: 400, easing: cubicOut }}
    >
      <div class="banner-left">
        {#if current.guest}
          <Avatar
            name={current.guest.name}
            color={current.guest.color}
            id={current.guest.id}
            size="3.2rem"
          />
        {/if}
        <div class="sender-info">
          <div class="pill-row">
            <span class="tts-pill">
              <Megaphone size={13} />
              <span>SHOUTOUT</span>
            </span>
            <span class="bars"><i></i><i></i><i></i><i></i></span>
          </div>
          {#if showNames('effectNames')}
            <span class="sender-name truncate">{current.by}</span>
          {/if}
        </div>
      </div>

      <div class="divider"></div>

      <div class="marquee-viewport" bind:this={viewportEl}>
        <div
          class="marquee-track"
          style:--from="{current.fromX}px"
          style:--to="{current.toX}px"
          style:--dur="{current.durationMs}ms"
        >
          <span class="marquee-text" bind:this={textEl}>
            {current.text}
          </span>
        </div>
      </div>

      <div
        class="progress-line"
        style:--dur="{current.durationMs}ms"
      ></div>
    </div>
  {/key}
{/if}

<style>
  .tts-banner {
    position: fixed;
    left: 2rem;
    right: 2rem;
    bottom: 4.8rem;
    z-index: 47;
    display: flex;
    align-items: center;
    gap: 1.4rem;
    padding: 0.9rem 1.6rem 1.1rem;
    border-radius: 1.4rem;
    background: color-mix(in srgb, var(--card) 90%, transparent);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1.5px solid color-mix(in srgb, var(--accent) 50%, var(--border));
    box-shadow:
      0 20px 60px -15px rgba(0, 0, 0, 0.8),
      0 0 35px -5px color-mix(in srgb, var(--accent) 35%, transparent);
    overflow: hidden;
  }

  .banner-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
  }

  .sender-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    max-width: 14rem;
  }

  .pill-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .tts-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  }

  .sender-name {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.25rem;
    line-height: 1.1;
    color: var(--text);
  }

  .bars {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 1rem;
  }

  .bars i {
    width: 3.5px;
    border-radius: 2px;
    background: var(--accent);
    animation: eq 0.6s ease-in-out infinite alternate;
  }

  .bars i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .bars i:nth-child(3) {
    animation-delay: 0.3s;
  }
  .bars i:nth-child(4) {
    animation-delay: 0.45s;
  }

  @keyframes eq {
    from {
      height: 20%;
    }
    to {
      height: 100%;
    }
  }

  .divider {
    width: 1.5px;
    height: 2.8rem;
    background: color-mix(in srgb, var(--border) 80%, transparent);
    flex-shrink: 0;
  }

  .marquee-viewport {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    position: relative;
    mask-image: linear-gradient(90deg, transparent 0%, black 2.5%, black 97.5%, transparent 100%);
    -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 2.5%, black 97.5%, transparent 100%);
  }

  .marquee-track {
    display: inline-block;
    white-space: nowrap;
    will-change: transform;
    animation: scroll-marquee var(--dur) linear forwards;
  }

  .marquee-text {
    font-family: var(--font-display);
    font-size: 2.1rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
    text-shadow: 0 0 24px color-mix(in srgb, var(--accent) 25%, transparent);
    display: inline-block;
  }

  @keyframes scroll-marquee {
    0% {
      transform: translateX(var(--from));
    }
    100% {
      transform: translateX(var(--to));
    }
  }

  .progress-line {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3.5px;
    width: 100%;
    background: var(--gradient, var(--accent));
    transform-origin: left;
    animation: progress-shrink var(--dur) linear forwards;
  }

  @keyframes progress-shrink {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
</style>
