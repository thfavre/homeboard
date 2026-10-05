<script lang="ts">
  import { EyeOff, Megaphone, Volume2 } from '@lucide/svelte';
  import type { TtsState } from '$shared/tts.ts';
  import { hb, rpc, attempt, price } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';

  const mod = $derived(hb.modules.tts as TtsState | undefined);

  let text = $state('');
  let anonymous = $state(false);
  let busy = $state(false);
  let now = $state(Date.now());

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });

  const wait = $derived(mod ? Math.max(0, Math.ceil((mod.cooldownUntil - now) / 1000)) : 0);

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
    const ok = await attempt(() => rpc('tts', 'say', { text: trimmed, anonymous }), 'Announced on TV!');
    busy = false;
    if (ok) {
      text = '';
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
            {#if isPerChar && cleanLen > 0 && hb.core?.economyEnabled}
              <span class="cost-hint">{cleanLen} chars · <Money amount={totalCost} /></span>
            {:else}
              <span></span>
            {/if}
            <span class="counter" class:warn={text.length >= maxLen - 10}>
              {text.length}/{maxLen}
            </span>
          </div>
        </div>

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
            <span class="anon-sub">Only display text, hide your head picture</span>
          </div>
          <Toggle checked={anonymous} label="Anonymous" onchange={(v) => (anonymous = v)} />
        </div>

        <!-- Status / Cooldown / Warning messages -->
        {#if wait > 0}
          <div class="alert warn-alert">
            <span>Another announcement is playing. Ready in <strong>{wait}s</strong></span>
          </div>
        {:else if !canAfford && cleanLen > 0}
          <div class="alert danger-alert">
            <span>Not enough {hb.core?.currency.name ?? 'coins'}: need <Money amount={totalCost - (hb.me?.balance ?? 0)} /> more</span>
          </div>
        {/if}

        <!-- Submit Button -->
        <button
          type="submit"
          class="btn primary block submit-btn"
          disabled={busy || wait > 0 || !cleanLen || !canAfford}
        >
          <Megaphone size={19} />
          <span>
            {#if busy}
              Broadcasting...
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
    justify-content: space-between;
    align-items: center;
    padding: 0 0.2rem;
    font-size: 0.78rem;
    color: var(--text-dim);
  }
  .cost-hint {
    font-weight: 600;
    color: var(--accent);
  }
  .counter {
    font-family: var(--font-mono, monospace);
  }
  .counter.warn {
    color: var(--warning, #eab308);
    font-weight: 700;
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
    background: color-mix(in srgb, var(--accent) 10%, var(--card));
  }
  .anon-card.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--card));
  }
  .anon-icon {
    display: grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 0.6rem;
    background: color-mix(in srgb, var(--card) 80%, transparent);
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
  .alert {
    padding: 0.65rem 0.85rem;
    border-radius: 0.65rem;
    font-size: 0.85rem;
    text-align: center;
    line-height: 1.35;
  }
  .warn-alert {
    background: color-mix(in srgb, var(--warning, #eab308) 15%, transparent);
    color: var(--warning, #eab308);
    border: 1px solid color-mix(in srgb, var(--warning, #eab308) 35%, transparent);
  }
  .danger-alert {
    background: color-mix(in srgb, var(--danger, #ef4444) 15%, transparent);
    color: var(--danger, #ef4444);
    border: 1px solid color-mix(in srgb, var(--danger, #ef4444) 35%, transparent);
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
