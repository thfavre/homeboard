<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import { Megaphone, Play, Volume2 } from '@lucide/svelte';
  import type { TtsPricingMode, TtsState } from '$shared/tts.ts';
  import { hb, rpc, attempt, toast } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import Ducking from '../spotify/Ducking.svelte';

  const mod = $derived(hb.modules.tts as TtsState | undefined);

  const volume = new Synced(() => (mod ? Math.round(mod.volume * 100) : undefined), 80);
  const cooldown = new Synced(() => mod?.cooldownSec, 4);
  const maxLength = new Synced(() => mod?.maxLength, 150);

  let testText = $state('Testing text to speech on the TV! Homeboard party sound is working great.');
  let testAnonymous = $state(false);
  let previewing = $state(false);

  const set = (args: Record<string, unknown>) => attempt(() => rpc('tts', 'setOptions', args));

  function setMode(mode: TtsPricingMode) {
    set({ pricingMode: mode });
  }

  function testOnTv() {
    attempt(() => rpc('tts', 'test', { text: testText, anonymous: testAnonymous }), 'Playing on TV');
  }

  function previewLocally() {
    if (!('speechSynthesis' in window)) {
      toast({ text: 'This browser cannot speak text', kind: 'error' });
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(testText);
    u.volume = volume.value / 100;
    previewing = true;
    u.onend = () => (previewing = false);
    u.onerror = () => (previewing = false);
    window.speechSynthesis.speak(u);
  }
</script>

{#if mod}
  <Section title="How guests pay" hint="The price itself is set in Prices and rewards, at the top of this page.">
    <div class="modes">
      <button
        type="button"
        class="mode-card card"
        class:active={mod.pricingMode === 'flat'}
        onclick={() => setMode('flat')}
      >
        <span class="mode-title">Same price for every message</span>
        <span class="dim small">Every shoutout costs the same</span>
      </button>

      <button
        type="button"
        class="mode-card card"
        class:active={mod.pricingMode === 'per_char'}
        onclick={() => setMode('per_char')}
      >
        <span class="mode-title">Price per character</span>
        <span class="dim small">Longer shoutouts cost more</span>
      </button>
    </div>

    <label class="field">
        <span>Maximum message length (characters)</span>
        <input
          class="input"
          type="number"
          min="10"
          max="500"
          bind:value={maxLength.value}
          onfocus={maxLength.start}
          onblur={() => {
            set({ maxLength: Number(maxLength.value) });
            maxLength.end();
          }}
        />
      </label>
  </Section>

  <Section title="Sound" hint="The TV reads shoutouts out loud and scrolls them across the screen.">
    <label class="field">
      <span>Volume {volume.value}%</span>
      <input
        type="range"
        min="0"
        max="100"
        bind:value={volume.value}
        onpointerdown={volume.start}
        onchange={() => {
          set({ volume: volume.value / 100 });
          volume.end();
        }}
      />
    </label>

    <label class="field">
      <span>Pause between two shoutouts (seconds)</span>
      <input
        class="input"
        type="number"
        min="0"
        max="120"
        bind:value={cooldown.value}
        onfocus={cooldown.start}
        onblur={() => {
          set({ cooldownSec: Number(cooldown.value) });
          cooldown.end();
        }}
      />
    </label>
    <Ducking source="tts" title="Lower the music" hint="Spotify gets quieter while a shoutout is read." />
  </Section>

  <Section title="Test announcement" hint="Test the voice and scrolling banner on the TV.">
    <div class="field">
      <input class="input" bind:value={testText} placeholder="Enter a test message..." maxlength="200" />
    </div>
    <div class="line">
      <div>
        <span>Test as anonymous</span>
        <p class="faint small">Only show the text without head pictures</p>
      </div>
      <Toggle checked={testAnonymous} label="Anonymous" onchange={(v) => (testAnonymous = v)} />
    </div>
    <div class="test-actions">
      <button class="btn primary" onclick={testOnTv}>
        <Megaphone size={18} /> Say it on TV
      </button>
      <button class="btn ghost" disabled={previewing} onclick={previewLocally}>
        <Volume2 size={18} /> {previewing ? 'Speaking...' : 'Preview in browser'}
      </button>
    </div>
  </Section>
{/if}

<style>
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  .line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.2rem 0;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.7rem;
    margin-bottom: 0.4rem;
  }
  .mode-card {
    display: grid;
    gap: 0.3rem;
    padding: 0.85rem 0.95rem;
    text-align: left;
    cursor: pointer;
    border: 1.5px solid var(--border);
    background: var(--surface);
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .mode-card.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  }
  .mode-title {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .small {
    font-size: 0.82rem;
  }
  .test-actions {
    display: flex;
    gap: 0.7rem;
    flex-wrap: wrap;
  }
</style>
