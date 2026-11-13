<script lang="ts">
  import { Coins, Send } from '@lucide/svelte';
  import { attempt, hb, rpc } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { LETTER_MAX, PAPERS, SEALS, type Letter, type PaperId, type SealId } from '$shared/worldActions.ts';
  import type { WorldState } from '$shared/world.ts';
  import WaxSeal from './WaxSeal.svelte';
  import { loadMail } from './mail.svelte.ts';
  import { HAND, paperStyle } from './papers.ts';

  /**
   * Write a letter and send it by courier: who it is for, the paper and the seal, the words (written
   * on the paper itself), and a little money to slip in. The courier walks it across the town on the
   * TV to the other one's character, and it opens on their phone.
   */
  let { onsent }: { onsent: () => void } = $props();

  const world = $derived(hb.modules.world as WorldState | undefined);
  const info = $derived(world?.actions?.courier);
  const currency = $derived(world?.shop?.currencyName ?? '');
  const others = $derived((world?.characters ?? []).filter((c) => c.id !== hb.me?.id).sort((a, b) => a.name.localeCompare(b.name)));

  let to = $state<string | null>(null);
  let paper = $state<PaperId>('parchment');
  let seal = $state<SealId>('crimson');
  let text = $state('');
  let coins = $state(0);
  let error = $state('');
  let sending = $state(false);

  const toName = $derived(others.find((c) => c.id === to)?.name ?? '');
  const cost = $derived((info?.fee ?? 0) + coins);
  /** The amounts to pick from: the usual ones up to the most a letter takes, and that most */
  const COIN_STEPS = [0, 5, 10, 25, 50, 100];
  const steps = $derived.by(() => {
    const max = info?.maxCoins ?? 0;
    const out = COIN_STEPS.filter((v) => v <= max);
    return max > 0 && !out.includes(max) ? [...out, max] : out;
  });

  function setCoins(v: number) {
    coins = Math.max(0, Math.min(info?.maxCoins ?? 0, Math.round(v) || 0));
  }

  async function send(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!to) return void (error = 'Pick who the letter is for');
    if (!text.trim()) return void (error = 'Write something on the paper');
    sending = true;
    const r = await attempt(() => rpc<{ letter: Letter }>('world', 'send', { to, text, coins, paper, seal }), 'Sent');
    sending = false;
    if (!r) return;
    void loadMail();
    onsent();
  }
</script>

<form novalidate class="courier" onsubmit={send}>
  <section class="group">
    <span class="label">To</span>
    {#if others.length}
      <div class="people">
        {#each others as c (c.id)}
          <button type="button" class="person" class:on={to === c.id} onclick={() => (to = c.id)}>
            <Avatar id={c.id} name={c.name} color={c.color} size="2.6rem" />
            <span class="truncate">{c.name}</span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="faint small">Nobody else has a character in the town yet.</p>
    {/if}
  </section>

  <section class="group">
    <span class="label">Paper and seal</span>
    <div class="row">
      {#each PAPERS as p (p.id)}
        <button type="button" class="paper-pick" style={paperStyle(p.id)} class:on={paper === p.id} aria-label={p.name} onclick={() => (paper = p.id)}></button>
      {/each}
    </div>
    <div class="row">
      {#each SEALS as s (s.id)}
        <button type="button" class="seal-pick" class:on={seal === s.id} aria-label="{s.name} seal" onclick={() => (seal = s.id)}>
          <WaxSeal color={s.color} letter="" size={30} />
        </button>
      {/each}
    </div>
  </section>

  <!-- Written on the paper itself, in the hand of the letter -->
  <div class="sheet" style={paperStyle(paper)} style:--hand={HAND}>
    <span class="dear">Dear {toName || '...'},</span>
    <textarea bind:value={text} maxlength={LETTER_MAX} rows="5" placeholder="Write your letter here"></textarea>
    <div class="foot">
      <span class="count">{text.length}/{LETTER_MAX}</span>
      <span class="sign">{hb.me?.name}</span>
      <span class="stamp"><WaxSeal color={SEALS.find((s) => s.id === seal)?.color ?? '#a3242c'} letter={(hb.me?.name ?? '?').charAt(0).toUpperCase()} size={38} /></span>
    </div>
  </div>

  {#if (info?.maxCoins ?? 0) > 0}
    <section class="group">
      <span class="label">Slip in some {currency}</span>
      <div class="row wrap">
        {#each steps as v (v)}
          <button type="button" class="chip" class:on={coins === v} onclick={() => setCoins(v)}>{v === 0 ? 'None' : v}</button>
        {/each}
      </div>
    </section>
  {/if}

  {#if error}<p class="error small">{error}</p>{/if}
  <button type="submit" class="btn primary block go" disabled={sending || !info?.on}>
    <Send size={18} />Send by courier
    <span class="price"><Coins size={16} />{cost}</span>
  </button>
  <p class="faint small center">
    The courier costs {info?.fee ?? 0} {currency}{coins ? `, plus the ${coins} inside` : ''}. Watch the TV: the courier walks your letter to {toName || 'them'}.
  </p>
</form>

<style>
  .courier {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .people {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
    scrollbar-width: none;
  }
  .person {
    flex: none;
    width: 4.6rem;
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    padding: 0.55rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.8rem;
  }
  .person span {
    max-width: 100%;
  }
  .person.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .row.wrap {
    flex-wrap: wrap;
  }
  .paper-pick {
    width: 2.6rem;
    height: 2.2rem;
    padding: 0;
    border: 2px solid var(--border);
    border-radius: 4px;
    background: var(--paper);
  }
  .paper-pick.on,
  .seal-pick.on {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .seal-pick {
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    line-height: 0;
  }
  .chip {
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.9rem;
  }
  .chip.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  }
  .go {
    justify-content: center;
  }
  .price {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.4rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.18);
    font-size: 0.9rem;
  }
  .center {
    text-align: center;
  }
  .error {
    color: var(--danger);
  }

  /* ---------------------------------------------------------- the paper (colors from papers.ts) */

  .sheet {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 1rem 1.1rem 0.8rem;
    border-radius: 4px;
    color: var(--ink);
    font-family: var(--hand);
    background:
      var(--lines, none),
      radial-gradient(130% 100% at 50% 40%, transparent 55%, var(--edge) 100%),
      var(--paper);
    box-shadow: 0 14px 30px -16px rgba(0, 0, 0, 0.7);
  }
  .dear {
    font-size: 1.15rem;
  }
  textarea {
    width: 100%;
    min-height: 8.5rem;
    padding: 0;
    border: 0;
    outline: none;
    resize: none;
    background: transparent;
    color: var(--ink);
    font-family: var(--hand);
    font-size: 1.15rem;
    line-height: 1.55;
  }
  textarea::placeholder {
    color: var(--ink);
    opacity: 0.4;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .count {
    font-family: var(--font-body);
    font-size: 0.75rem;
    opacity: 0.55;
  }
  .sign {
    flex: 1;
    text-align: right;
    font-size: 1.25rem;
  }
  .stamp {
    line-height: 0;
    transform: rotate(-10deg);
  }
</style>
