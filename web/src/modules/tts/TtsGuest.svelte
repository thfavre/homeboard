<script lang="ts">
  import { Megaphone, Sparkles } from '@lucide/svelte';
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

  const PROMPTS = [
    'Cheers everyone! 🍻',
    'What a party! 🎉',
    'DJ, turn up the bass! 🎵',
    'Who is winning the quiz? 🏆',
    'Next round is on me! 🥂',
  ];

  function pickPrompt(p: string) {
    text = p;
  }

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
    <p class="dim intro">
      Write something: the TV will read it out loud for the whole room and scroll it across the screen!
    </p>

    <div class="card pricing-box">
      <div class="rate">
        {#if !hb.core?.economyEnabled}
          <span class="pill success">Free</span>
          <span class="dim small">Unlimited announcements</span>
        {:else if isPerChar}
          <div class="rate-info">
            <span class="eyebrow">Price</span>
            <span class="rate-val"><Money amount={charCost} /> <span class="dim small">/ character</span></span>
          </div>
          {#if cleanLen > 0}
            <div class="rate-info right">
              <span class="eyebrow">Total ({cleanLen} chars)</span>
              <span class="rate-val font-display"><Money amount={totalCost} /></span>
            </div>
          {/if}
        {:else}
          <div class="rate-info">
            <span class="eyebrow">Fixed Price</span>
            <span class="rate-val"><Money amount={flatCost} /> <span class="dim small">per message</span></span>
          </div>
        {/if}
      </div>
    </div>

    <form
      class="card form"
      onsubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div class="field">
        <div class="field-head">
          <label for="tts-text">Your message</label>
          <span class="counter" class:warn={text.length >= maxLen - 10}>{text.length} / {maxLen}</span>
        </div>
        <textarea
          id="tts-text"
          class="input textarea"
          bind:value={text}
          maxlength={maxLen}
          rows="3"
          placeholder="Type what you want the TV to say..."
        ></textarea>
      </div>

      <div class="anon-row">
        <div>
          <span class="anon-label">Send anonymously</span>
          <p class="faint small">Only show the text without your face or name</p>
        </div>
        <Toggle checked={anonymous} label="Anonymous" onchange={(v) => (anonymous = v)} />
      </div>

      {#if PROMPTS.length}
        <div class="prompts">
          <span class="faint small"><Sparkles size={13} /> Quick ideas:</span>
          <div class="chips">
            {#each PROMPTS as p}
              <button type="button" class="chip" onclick={() => pickPrompt(p)}>{p}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#if wait > 0}
        <p class="faint wait-msg">Wait {wait}s before next announcement</p>
      {:else if !canAfford && cleanLen > 0}
        <p class="danger-msg">
          Need <Money amount={totalCost - (hb.me?.balance ?? 0)} /> more (you have <Money amount={hb.me?.balance ?? 0} />)
        </p>
      {/if}

      <button
        type="submit"
        class="btn primary block send-btn"
        disabled={busy || wait > 0 || !cleanLen || !canAfford}
      >
        <Megaphone size={18} />
        {#if busy}
          Sending...
        {:else if hb.core?.economyEnabled && totalCost > 0}
          Say it on TV · <Money amount={totalCost} />
        {:else}
          Say it on TV
        {/if}
      </button>
    </form>
  </div>
{/if}

<style>
  .tts {
    display: grid;
    gap: 0.9rem;
  }
  .intro {
    font-size: 0.92rem;
    line-height: 1.4;
  }
  .pricing-box {
    padding: 0.75rem 1rem;
  }
  .rate {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }
  .rate-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .rate-info.right {
    text-align: right;
  }
  .rate-val {
    font-size: 1.1rem;
    font-weight: 600;
  }
  .eyebrow {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
  }
  .form {
    display: grid;
    gap: 1rem;
    padding: 1.1rem;
  }
  .field {
    display: grid;
    gap: 0.4rem;
  }
  .field-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .counter {
    font-family: var(--font-mono, monospace);
    font-size: 0.8rem;
  }
  .counter.warn {
    color: var(--warning, #eab308);
  }
  .textarea {
    resize: none;
    font-family: inherit;
    font-size: 1.05rem;
    line-height: 1.4;
    padding: 0.75rem 0.85rem;
  }
  .anon-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.8rem;
    padding: 0.4rem 0.1rem;
    border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }
  .anon-label {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .prompts {
    display: grid;
    gap: 0.4rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    font-size: 0.82rem;
    background: color-mix(in srgb, var(--card) 60%, transparent);
    border: 1px solid var(--border);
    color: var(--text-dim);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
  }
  .chip:active {
    transform: scale(0.96);
  }
  .chip:hover {
    color: var(--text);
    background: var(--card);
  }
  .wait-msg {
    font-size: 0.85rem;
    text-align: center;
  }
  .danger-msg {
    font-size: 0.85rem;
    color: var(--danger, #ef4444);
    text-align: center;
  }
  .send-btn {
    font-size: 1.05rem;
    padding: 0.85rem 1rem;
  }
</style>
