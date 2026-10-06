<script lang="ts">
  import { EyeOff, Footprints, Megaphone, Mic, Rabbit, Snail, Squirrel, Volume2 } from '@lucide/svelte';
  import { TTS_LANGS, TTS_STYLES, type TtsLang, type TtsState, type TtsStyle } from '$shared/tts.ts';
  import { hb, rpc, attempt, price, toast } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';

  const mod = $derived(hb.modules.tts as TtsState | undefined);

  let text = $state('');
  let anonymous = $state(false);
  let pickedLang = $state<TtsLang | null>(null);
  let style = $state<TtsStyle>('normal');

  const styleIcons = { normal: Mic, chipmunk: Squirrel, giant: Footprints, speedy: Rabbit, sleepy: Snail };

  /** Only the languages the TV can speak (all of them until the TV has reported) */
  const langs = $derived(TTS_LANGS.filter((l) => !mod?.tvLangs?.length || mod.tvLangs.includes(l.id)));
  const lang = $derived(langs.find((l) => l.id === (pickedLang ?? mod?.defaultLang))?.id ?? langs[0]?.id ?? 'en');
  let busy = $state(false);

  const flatCost = $derived(price('tts.message'));
  const charCost = $derived(price('tts.char'));

  const isPerChar = $derived(mod?.pricingMode === 'per_char');
  const cleanLen = $derived(text.trim().length);

  const totalCost = $derived.by(() => {
    if (!hb.core?.economyEnabled || !mod) return 0;
    if (isPerChar) {
      return cleanLen * charCost;
    }
    return flatCost;
  });

  const maxLen = $derived(mod?.maxLength ?? 150);
  const canAfford = $derived(!hb.core?.economyEnabled || (hb.me?.balance ?? 0) >= totalCost);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    busy = true;
    const r = await attempt(() => rpc<{ position: number }>('tts', 'say', { text: trimmed, anonymous, lang, style: mod?.funnyVoices ? style : 'normal' }));
    busy = false;
    if (r) {
      text = '';
      toast({ text: 'Sent to the TV', kind: 'success' });
    }
  }
</script>

{#if mod}
  <div class="tts">
    <div class="card panel">
      <!-- Header row with live price and status -->
      <div class="panel-header">
        <div class="tag-wrap">
          <span class="icon-bubble"><Volume2 size={16} /></span>
          <span class="panel-title">Speak on TV</span>
        </div>
        {#if hb.core?.economyEnabled}
          <div class="price-badge">
            {#if isPerChar}
              <span class="badge-rate"><Money amount={charCost} />/char</span>
              {#if cleanLen > 0}
                <span class="badge-sep">·</span>
                <span class="badge-total"><Money amount={totalCost} /></span>
              {/if}
            {:else}
              <span class="badge-total"><Money amount={flatCost} free /></span>
            {/if}
          </div>
        {:else}
          <span class="pill success">Free</span>
        {/if}
      </div>

      <!-- Text input container -->
      <form
        class="form"
        onsubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div class="input-wrap">
          <textarea
            id="tts-text"
            class="input textarea"
            bind:value={text}
            maxlength={maxLen}
            rows="3"
            placeholder="Type your message to be read out loud on the TV..."
          ></textarea>

          <div class="char-bar">
            <span class="counter" class:warn={text.length >= maxLen - 10}>
              {text.length}/{maxLen}
            </span>
          </div>
        </div>

        {#if langs.length > 1}
          <div class="pick-group">
            <span class="pick-label">Language</span>
            <div class="segmented" role="radiogroup" aria-label="Language">
              {#each langs as l (l.id)}
                <button
                  type="button"
                  role="radio"
                  aria-checked={lang === l.id}
                  class="seg"
                  class:active={lang === l.id}
                  onclick={() => (pickedLang = l.id)}>{l.label}</button
                >
              {/each}
            </div>
          </div>
        {/if}

        {#if mod.funnyVoices}
          <div class="pick-group">
            <span class="pick-label">Voice</span>
            <div class="voices" role="radiogroup" aria-label="Voice">
              {#each TTS_STYLES as v (v.id)}
                {@const Icon = styleIcons[v.id]}
                <button
                  type="button"
                  role="radio"
                  aria-checked={style === v.id}
                  class="voice"
                  class:active={style === v.id}
                  onclick={() => (style = v.id)}
                >
                  <Icon size={20} />
                  <span class="voice-name">{v.label}</span>
                  <span class="voice-hint">{v.hint}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Anonymous option -->
        <div class="anon-card" class:active={anonymous}>
          <div class="anon-icon" class:active={anonymous}>
            <EyeOff size={18} />
          </div>
          <div
            class="anon-meta"
            role="button"
            tabindex="0"
            onclick={() => (anonymous = !anonymous)}
            onkeydown={(e) => (e.key === ' ' || e.key === 'Enter') && (anonymous = !anonymous)}
          >
            <span class="anon-heading">Send anonymously</span>
            <span class="anon-sub">Hides your name and your picture on the TV</span>
          </div>
          <Toggle checked={anonymous} label="Anonymous" onchange={(v) => (anonymous = v)} />
        </div>


        <!-- Submit Button -->
        <button
          type="submit"
          class="btn primary block submit-btn"
          disabled={busy || !cleanLen || !canAfford}
        >
          <Megaphone size={19} />
          <span>
            {#if busy}
              Sending...
            {:else if !canAfford && cleanLen > 0}
              Not enough {hb.core?.currency.name ?? 'coins'}
            {:else if hb.core?.economyEnabled && totalCost > 0}
              Say it on TV · <Money amount={totalCost} />
            {:else}
              Say it on TV
            {/if}
          </span>
        </button>
      </form>
    </div>
  </div>
{/if}

<style>
  .tts {
    display: grid;
    gap: 0.8rem;
  }
  .panel {
    display: grid;
    gap: 0.9rem;
    padding: 1.1rem;
    border-radius: 1rem;
  }
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.6rem;
  }
  .tag-wrap {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .icon-bubble {
    display: grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
  }
  .panel-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text);
  }
  .price-badge {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .badge-rate {
    color: var(--text-dim);
    font-size: 0.82rem;
  }
  .badge-sep {
    color: var(--border);
  }
  .badge-total {
    color: var(--accent);
    font-weight: 700;
  }
  .form {
    display: grid;
    gap: 0.85rem;
  }
  .input-wrap {
    display: grid;
    gap: 0.35rem;
  }
  .textarea {
    resize: none;
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.45;
    padding: 0.85rem;
    min-height: 5.6rem;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--bg) 60%, transparent);
    border: 1.5px solid var(--border);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
    outline: none;
  }
  .char-bar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 0 0.2rem;
    font-size: 0.78rem;
    color: var(--text-dim);
  }
  .counter {
    font-family: var(--font-display);
  }
  .counter.warn {
    color: var(--warning, #eab308);
    font-weight: 700;
  }
  .pick-group {
    display: grid;
    gap: 0.4rem;
  }
  .pick-label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-dim);
    padding: 0 0.2rem;
  }
  .segmented {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 0.3rem;
    padding: 0.25rem;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--bg) 40%, transparent);
    border: 1.5px solid var(--border);
  }
  .seg {
    padding: 0.55rem 0.5rem;
    border-radius: 0.55rem;
    font: inherit;
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--text-dim);
    background: transparent;
    border: 0;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .seg.active {
    background: color-mix(in srgb, var(--accent) 22%, var(--surface));
    color: var(--text);
  }
  .voices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(5.6rem, 1fr));
    gap: 0.45rem;
  }
  .voice {
    display: grid;
    justify-items: center;
    gap: 0.15rem;
    padding: 0.6rem 0.3rem;
    border-radius: 0.75rem;
    font: inherit;
    color: var(--text-dim);
    background: color-mix(in srgb, var(--bg) 40%, transparent);
    border: 1.5px solid var(--border);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .voice.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
    color: var(--accent);
  }
  .voice-name {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text);
  }
  .voice-hint {
    font-size: 0.7rem;
    line-height: 1.2;
    text-align: center;
  }
  .anon-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.85rem;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--bg) 40%, transparent);
    border: 1.5px solid var(--border);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .anon-card:active {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }
  .anon-card.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  }
  .anon-icon {
    display: grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 0.6rem;
    background: color-mix(in srgb, var(--surface) 80%, transparent);
    color: var(--text-dim);
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .anon-icon.active {
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    color: var(--accent);
  }
  .anon-meta {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    flex: 1;
    min-width: 0;
  }
  .anon-heading {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--text);
  }
  .anon-sub {
    font-size: 0.78rem;
    color: var(--text-dim);
    line-height: 1.25;
  }
  .submit-btn {
    min-height: 3.2rem;
    font-size: 1.08rem;
    font-weight: 600;
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    margin-top: 0.2rem;
  }
</style>
