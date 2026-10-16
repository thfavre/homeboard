<script lang="ts">
  import { fade } from 'svelte/transition';
  import { TTS_LANGS, ttsLang, ttsSpeechMs, type TtsEvent, type TtsMention } from '$shared/tts.ts';
  import { hb, onEvent, rpc } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { audioContext } from '../soundboard/player.ts';
  import { detectEggs, detectFood, type EggFx } from './eggs.ts';
  import EggOverlay from './EggOverlay.svelte';

  type Crumb = { x: number; delay: number; dur: number; drift: number; spin: number; size: number };
  type Part = { text: string; who?: TtsMention; food?: { emoji: string; crumbs: Crumb[] } };
  let current = $state<(TtsEvent & { key: number; durationMs: number; fx: EggFx; parts: Part[] }) | null>(null);

  const rnd = (min: number, max: number) => min + Math.random() * (max - min);

  /** Food words get their emoji falling from them in a cascade, drawn once per shoutout */
  function splitFood(parts: Part[]): Part[] {
    return parts.flatMap((part) => {
      if (part.who) return [part];
      const out: Part[] = [];
      let at = 0;
      for (const f of detectFood(part.text)) {
        if (f.start > at) out.push({ text: part.text.slice(at, f.start) });
        const crumbs = Array.from({ length: 8 }, (_, i) => ({
          x: rnd(15, 85),
          delay: i * 0.28 + rnd(0, 0.15),
          dur: rnd(1.7, 2.4),
          drift: rnd(-6, 6),
          spin: rnd(-260, 260),
          size: rnd(2.2, 3.2),
        }));
        out.push({ text: part.text.slice(f.start, f.end), food: { emoji: f.emoji, crumbs } });
        at = f.end;
      }
      if (at < part.text.length) out.push({ text: part.text.slice(at) });
      return out;
    });
  }

  /** The text cut around the guests' names, so their pictures can hop above them */
  function splitNames(text: string, mentions: TtsMention[] = []): Part[] {
    const spots = mentions
      .flatMap((who) => who.ranges.map(([start, end]) => ({ start, end, who })))
      .filter((r) => r.start >= 0 && r.end <= text.length && r.start < r.end)
      .sort((a, b) => a.start - b.start);
    const parts: Part[] = [];
    let at = 0;
    for (const r of spots) {
      if (r.start < at) continue;
      if (r.start > at) parts.push({ text: text.slice(at, r.start) });
      parts.push({ text: text.slice(r.start, r.end), who: r.who });
      at = r.end;
    }
    if (at < text.length) parts.push({ text: text.slice(at) });
    return parts;
  }
  let queue: TtsEvent[] = [];
  let seq = 0;
  let processing = false;
  let destroyed = false;
  let activeUtterance: SpeechSynthesisUtterance | null = null;
  let activeSource: AudioBufferSourceNode | null = null;
  /** Evens out the voice and keeps it from crackling when the volume goes above 100% */
  let limiter: DynamicsCompressorNode | null = null;

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

  /** Play the voice file made by the server, amplified. False if it could not be played. */
  async function playVoiceFile(item: TtsEvent): Promise<boolean> {
    try {
      const ac = audioContext();
      if (ac.state !== 'running') await ac.resume().catch(() => {});
      const res = await fetch(item.audio!);
      if (!res.ok) return false;
      const buffer = await ac.decodeAudioData(await res.arrayBuffer());
      if (destroyed) return true;
      if (!limiter) {
        limiter = ac.createDynamicsCompressor();
        limiter.threshold.value = -6;
        limiter.knee.value = 3;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.15;
        limiter.connect(ac.destination);
      }
      const gain = ac.createGain();
      // Above 1, the limiter flattens the peaks so the whole voice gets louder without clipping
      gain.gain.value = Math.max(0, item.volume);
      gain.connect(limiter);
      const source = ac.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      activeSource = source;
      await new Promise<void>((resolve) => {
        const stall = setTimeout(resolve, buffer.duration * 1000 + 3000);
        source.onended = () => {
          clearTimeout(stall);
          resolve();
        };
        source.start();
      });
      activeSource = null;
      gain.disconnect();
      return true;
    } catch {
      activeSource = null;
      return false;
    }
  }

  async function speak(item: TtsEvent): Promise<void> {
    if (item.audio && (await playVoiceFile(item))) return;
    return speakInBrowser(item);
  }

  /** The browser's own speech: used when the server could not make a voice file */
  function speakInBrowser(item: TtsEvent): Promise<void> {
    const { text, volume } = item;
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
        const estimatedSpeechMs = Math.max(5000, ttsSpeechMs(item.text) + 1500);
        const durationMs = Math.max(6500, estimatedSpeechMs + 2000);

        current = {
          ...item,
          key,
          durationMs,
          fx: detectEggs(item.text),
          parts: splitFood(splitNames(item.text, item.mentions)),
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
      try {
        activeSource?.stop();
      } catch {
        // already stopped
      }
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
    {#each current.fx.overlays as kind (kind)}
      <EggOverlay {kind} />
    {/each}
    <div
      class="tts-strip"
      transition:fade={{ duration: 350 }}
    >
      <div class="marquee-viewport" class:shout={current.fx.shout}>
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

            <span class="marquee-text {current.fx.text ? `fx-${current.fx.text}` : ''}" class:shout={current.fx.shout} data-text={current.text}
              >{#each current.parts as part, i}{#if part.who?.avatar}<span class="name"
                    ><span class="name-pic" style:--i={i}
                      ><Avatar name={part.who.name} color={part.who.color} id={part.who.id} src={part.who.avatar} size="4.6rem" /></span
                    >{part.text}</span
                  >{:else if part.food}<span class="food"
                    >{#each part.food.crumbs as c}<span
                        class="crumb"
                        aria-hidden="true"
                        style:left="{c.x}%"
                        style:--d="{c.dur}s"
                        style:--delay="{c.delay}s"
                        style:--drift="{c.drift}rem"
                        style:--spin="{c.spin}deg"
                        style:font-size="{c.size}rem">{part.food.emoji}</span
                      >{/each}{part.text}</span
                  >{:else}{part.text}{/if}{/each}</span
            >

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
    /* Pictures of named guests stand on the top border */
    overflow: visible;
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  .marquee-viewport {
    width: 100%;
    overflow: hidden;
    /* Room above the banner for the pictures of named guests, without making the banner taller */
    padding-top: 8rem;
    margin-top: -8rem;
    /* And room below it for the food falling from the words */
    padding-bottom: 60vh;
    margin-bottom: -60vh;
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
    line-height: 1.2;
  }

  /* Same height with or without the sender's picture, so named guests always land on the border */
  .marquee-content {
    min-height: 7rem;
  }

  /* ------------------------------------------------ easter eggs */

  .marquee-viewport.shout {
    animation: shake 0.35s linear infinite;
  }
  .marquee-text.shout {
    font-size: 5rem;
    font-weight: 900;
  }
  /* Red only when no other text effect colors it */
  .marquee-text.shout:not([class*='fx-']) {
    color: #ff3b3b;
    text-shadow: 0 0 30px rgba(255, 40, 40, 0.6);
  }
  @keyframes shake {
    0%,
    100% {
      transform: translate(0, 0);
    }
    25% {
      transform: translate(-6px, 3px) rotate(-0.4deg);
    }
    50% {
      transform: translate(5px, -4px);
    }
    75% {
      transform: translate(-3px, -2px) rotate(0.4deg);
    }
  }

  .name {
    position: relative;
    display: inline-block;
    white-space: pre;
  }
  /* The banner is 7rem tall plus 0.35rem padding: its top border is 3.85rem above the middle of the text */
  .name-pic {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 3.85rem - 0.6em);
    translate: -50% 0;
    display: grid;
    border-radius: 50%;
    background: var(--bg);
    text-shadow: none;
    transform-origin: 50% 100%;
    animation: hop 0.9s ease-in-out calc(var(--i) * 0.13s) infinite;
  }
  @keyframes hop {
    0%,
    100% {
      transform: translateY(0);
    }
    35% {
      transform: translateY(-1.8rem) rotate(-6deg);
    }
    55% {
      transform: translateY(0) scale(1.12, 0.88);
    }
  }

  /* Food: its emoji pours out of the word and falls down the screen, all along the scroll */
  .food {
    position: relative;
    display: inline-block;
    white-space: pre;
  }
  .crumb {
    position: absolute;
    top: 0.3em;
    line-height: 1;
    font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
    font-weight: 400;
    /* Text effects can make the text transparent, which would hide the emoji too */
    color: #fff;
    -webkit-text-fill-color: #fff;
    text-shadow: none;
    opacity: 0;
    translate: -50% 0;
    animation: crumb-fall var(--d) cubic-bezier(0.5, 0, 0.9, 0.55) var(--delay) infinite;
  }
  @keyframes crumb-fall {
    0% {
      transform: translate(0, 0) rotate(0) scale(0.3);
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    20% {
      transform: translate(calc(var(--drift) * 0.2), 2vh) rotate(calc(var(--spin) * 0.2)) scale(1);
    }
    85% {
      opacity: 1;
    }
    100% {
      transform: translate(var(--drift), 55vh) rotate(var(--spin)) scale(1);
      opacity: 0;
    }
  }

  /* Gradient-filled text: shared by several effects */
  .fx-rainbow,
  .fx-gold,
  .fx-disco {
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    text-shadow: none;
    background-size: 200% 100%;
    animation: flow 3s linear infinite;
  }
  .fx-rainbow {
    background-image: linear-gradient(90deg, #e40303, #ff8c00, #ffed00, #008026, #24408e, #732982, #e40303);
    filter: drop-shadow(0 0 18px rgba(255, 255, 255, 0.25));
  }
  .fx-gold {
    background-image: linear-gradient(100deg, #a66d00 0%, #ffd700 30%, #fff8d0 45%, #ffd700 60%, #a66d00 100%);
    filter: drop-shadow(0 0 12px rgba(255, 200, 0, 0.55));
    animation-duration: 2.2s;
  }
  .fx-disco {
    background-image: linear-gradient(90deg, #ff2e88, #00e5ff, #ffe600, #7c4dff, #00ff85, #ff2e88);
    animation-duration: 0.9s;
    filter: drop-shadow(0 0 16px rgba(255, 255, 255, 0.4));
  }
  @keyframes flow {
    to {
      background-position: -200% 0;
    }
  }

  /* Fire: white-hot letters with flames licking up from them (stacked shadows, each higher, redder and wider) */
  .fx-fire {
    color: #fff4d6;
    transform-origin: 50% 100%;
    animation:
      flames 0.9s linear infinite,
      heat 2.6s ease-in-out infinite;
  }
  @keyframes flames {
    0%,
    100% {
      text-shadow:
        0 0 4px #fff,
        0 -4px 6px #ffef5a,
        2px -10px 10px #ffc21a,
        -3px -18px 14px #ff8a00,
        3px -28px 20px #ff4d00,
        -2px -40px 28px #e01800,
        0 0 60px rgba(255, 90, 0, 0.55);
    }
    25% {
      text-shadow:
        0 0 4px #fff,
        1px -5px 6px #ffef5a,
        -2px -12px 10px #ffc21a,
        3px -21px 15px #ff8a00,
        -3px -32px 22px #ff4d00,
        2px -46px 30px #e01800,
        0 0 70px rgba(255, 90, 0, 0.65);
    }
    50% {
      text-shadow:
        0 0 4px #fff,
        -1px -4px 5px #ffef5a,
        1px -9px 9px #ffc21a,
        -2px -16px 13px #ff8a00,
        2px -25px 18px #ff4d00,
        -3px -35px 24px #e01800,
        0 0 55px rgba(255, 90, 0, 0.5);
    }
    75% {
      text-shadow:
        0 0 4px #fff,
        0 -6px 7px #ffef5a,
        3px -13px 11px #ffc21a,
        -1px -22px 16px #ff8a00,
        -2px -34px 24px #ff4d00,
        3px -48px 32px #e01800,
        0 0 75px rgba(255, 90, 0, 0.7);
    }
  }
  /* The air above the fire shimmers */
  @keyframes heat {
    0%,
    100% {
      transform: skewX(0) scaleY(1);
    }
    30% {
      transform: skewX(-1.5deg) scaleY(1.02);
    }
    70% {
      transform: skewX(1.5deg) scaleY(0.99);
    }
  }

  .fx-matrix {
    font-family: ui-monospace, Consolas, monospace;
    color: #3dff6e;
    text-shadow:
      0 0 10px #3dff6e,
      0 0 30px rgba(61, 255, 110, 0.5);
  }

  .fx-spooky {
    color: #9dff5c;
    text-shadow:
      0 4px 0 #5c9e2a,
      0 10px 6px rgba(92, 158, 42, 0.7),
      0 22px 14px rgba(92, 158, 42, 0.35);
    animation: wobble 2.4s ease-in-out infinite;
  }
  @keyframes wobble {
    0%,
    100% {
      transform: skewX(0) translateY(0);
    }
    50% {
      transform: skewX(-4deg) translateY(4px);
    }
  }

  .fx-sad {
    color: #9bb8d8;
    text-shadow: 0 0 18px rgba(120, 160, 220, 0.45);
    animation: droop 3s ease-in-out infinite;
  }
  @keyframes droop {
    50% {
      transform: translateY(8px) rotate(1deg);
    }
  }

  .fx-love {
    color: #ff6b9d;
    text-shadow: 0 0 24px rgba(255, 60, 130, 0.65);
    animation: beat 1s ease-in-out infinite;
  }
  @keyframes beat {
    0%,
    100% {
      transform: scale(1);
    }
    15% {
      transform: scale(1.06);
    }
    30% {
      transform: scale(1);
    }
    45% {
      transform: scale(1.04);
    }
  }

  /* Glitch: two colored copies of the text jitter over it */
  .fx-glitch {
    position: relative;
    animation: jitter 1.6s steps(1) infinite;
  }
  .fx-glitch::before,
  .fx-glitch::after {
    content: attr(data-text);
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .fx-glitch::before {
    color: #ff004c;
    mix-blend-mode: screen;
    animation: slice-a 0.9s steps(1) infinite;
  }
  .fx-glitch::after {
    color: #00e5ff;
    mix-blend-mode: screen;
    animation: slice-b 0.7s steps(1) infinite;
  }
  @keyframes jitter {
    0%,
    100% {
      transform: none;
    }
    20% {
      transform: translate(3px, -2px) skewX(6deg);
    }
    23% {
      transform: none;
    }
    60% {
      transform: translate(-4px, 1px);
    }
    62% {
      transform: none;
    }
  }
  @keyframes slice-a {
    0% {
      clip-path: inset(10% 0 60% 0);
      transform: translate(-6px, 0);
    }
    33% {
      clip-path: inset(55% 0 20% 0);
      transform: translate(5px, 0);
    }
    66% {
      clip-path: inset(30% 0 45% 0);
      transform: translate(-3px, 0);
    }
  }
  @keyframes slice-b {
    0% {
      clip-path: inset(65% 0 5% 0);
      transform: translate(6px, 0);
    }
    40% {
      clip-path: inset(5% 0 75% 0);
      transform: translate(-5px, 0);
    }
    70% {
      clip-path: inset(40% 0 35% 0);
      transform: translate(4px, 0);
    }
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
