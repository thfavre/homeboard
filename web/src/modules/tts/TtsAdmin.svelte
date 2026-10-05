<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import { Megaphone, Play, Volume2 } from '@lucide/svelte';
  import type { TtsPricingMode, TtsState } from '$shared/tts.ts';
  import { hb, rpc, attempt, price } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import AmountInput from '$lib/ui/AmountInput.svelte';

  const mod = $derived(hb.modules.tts as TtsState | undefined);

  const volume = new Synced(() => (mod ? Math.round(mod.volume * 100) : undefined), 80);
  const cooldown = new Synced(() => mod?.cooldownSec, 4);
  const maxLength = new Synced(() => mod?.maxLength, 150);

  const flatCost = $derived(price('tts.message'));
  const charCost = $derived(price('tts.char'));

  let testText = $state('Testing text to speech on the TV! Homeboard party sound is working great.');
  let previewing = $state(false);

  const set = (args: Record<string, unknown>) => attempt(() => rpc('tts', 'setOptions', args));
  const setCorePrice = (key: string, amount: number) => attempt(() => rpc('core', 'setPrice', { key, amount }));

  function setMode(mode: TtsPricingMode) {
    set({ pricingMode: mode });
  }

  function testOnTv() {
    attempt(() => rpc('tts', 'test', { text: testText }), 'Playing on TV');
  }

  function previewLocally() {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this browser.');
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
  <Section title="Settings" hint="The TV speaks messages out loud and scrolls the text across the screen.">
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
      <span>Pause between announcements (seconds)</span>
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
  </Section>

  <Section title="Pricing & Length" hint="Choose whether guests pay a flat price per message or pay per character.">
    <div class="modes">
      <button
        type="button"
        class="mode-card card"
        class:active={mod.pricingMode === 'flat'}
        onclick={() => setMode('flat')}
      >
        <span class="mode-title">Fixed price</span>
        <span class="dim small">One set price per message, capped at a maximum length</span>
      </button>

      <button
        type="button"
        class="mode-card card"
        class:active={mod.pricingMode === 'per_char'}
        onclick={() => setMode('per_char')}
      >
        <span class="mode-title">Price per character</span>
        <span class="dim small">Cost scales with length (longer messages cost more)</span>
      </button>
    </div>

    {#if mod.pricingMode === 'flat'}
      <div class="line">
        <div>
          <span>Fixed price per message</span>
          <p class="faint small">Guests pay this amount for any message</p>
        </div>
        <AmountInput value={flatCost} oncommit={(v) => setCorePrice('tts.message', v)} />
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
    {:else}
      <div class="line">
        <div>
          <span>Price per character</span>
          <p class="faint small">E.g. 0.05 or 0.10 per character</p>
        </div>
        <AmountInput value={charCost} oncommit={(v) => setCorePrice('tts.char', v)} />
      </div>
      <label class="field">
        <span>Maximum message length limit (characters)</span>
        <input
          class="input"
          type="number"
          min="10"
          max="1000"
          bind:value={maxLength.value}
          onfocus={maxLength.start}
          onblur={() => {
            set({ maxLength: Number(maxLength.value) });
            maxLength.end();
          }}
        />
      </label>
    {/if}
  </Section>

  <Section title="Test announcement" hint="Test the voice and scrolling banner on the TV.">
    <div class="field">
      <input class="input" bind:value={testText} placeholder="Enter a test message..." maxlength="200" />
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
    background: var(--card);
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .mode-card.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--card));
  }
  .mode-title {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .test-actions {
    display: flex;
    gap: 0.7rem;
    flex-wrap: wrap;
  }
</style>
