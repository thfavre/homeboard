<script lang="ts">
  import { onMount } from 'svelte';
  import { Coins, Search, Send } from '@lucide/svelte';
  import { attempt, hb, onEvent, rpc } from '$lib/client.svelte.ts';
  import { LETTER_LINES, LETTER_MAX, PAPERS, SEALS, paperPrice, type Letter, type PaperId, type SealId } from '$shared/worldActions.ts';
  import type { WardrobeMine, WorldState } from '$shared/world.ts';
  import Portrait from './Portrait.svelte';
  import WaxSeal from './WaxSeal.svelte';
  import { loadMail } from './mail.svelte.ts';
  import { HAND, paperStyle } from './papers.ts';

  /**
   * Write a letter and send it by courier: who it is for (their character's face, found by name),
   * the paper (the fancier ones cost extra), the words (written on the page itself, in a hand, as
   * many lines as the page holds), and money added as a gift. Sent, the page folds into its
   * envelope, the seal is pressed on and it flies off; on the TV the courier walks it to the other
   * one's character, and it opens on their phone.
   */
  let { onsent }: { onsent: () => void } = $props();

  const world = $derived(hb.modules.world as WorldState | undefined);
  const info = $derived(world?.actions?.courier);
  const currency = $derived(world?.shop?.currencyName ?? '');
  const others = $derived((world?.characters ?? []).filter((c) => c.id !== hb.me?.id).sort((a, b) => a.name.localeCompare(b.name)));

  let to = $state<string | null>(null);
  let paper = $state<PaperId>('parchment');
  // The seal is always the red one for now (its picker is kept below, commented out)
  const seal: SealId = 'crimson';
  let text = $state('');
  /** The name typed to find someone */
  let query = $state('');
  let coins = $state(0);
  let error = $state('');
  /** writing, then sending (the server is asked), then folding (the envelope flies off) */
  let stage = $state<'writing' | 'sending' | 'folding'>('writing');
  /** The town money in the wallet (null: not known yet) */
  let balance = $state<number | null>(null);

  onMount(() => {
    rpc<WardrobeMine>('world', 'wardrobe').then(
      (w) => (balance = w.balance),
      () => {},
    );
    return onEvent<{ balance: number }>('world', 'wallet', (w) => (balance = w.balance));
  });

  const toName = $derived(others.find((c) => c.id === to)?.name ?? '');
  /** The people shown: the ones whose name has what is typed (the one picked always stays) */
  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? others.filter((c) => c.id === to || c.name.toLowerCase().includes(q)) : others;
  });
  const papers = $derived(info?.papers ?? { fancy: 0, luxe: 0 });
  /** The courier, and the paper when it is not a plain one */
  const fee = $derived((info?.fee ?? 0) + paperPrice(paper, papers));
  const cost = $derived(fee + coins);
  const sealColor = $derived(SEALS.find((s) => s.id === seal)?.color ?? SEALS[0].color);
  const initial = $derived((hb.me?.name ?? '?').charAt(0).toUpperCase());

  /** The coins to slip in: the usual amounts up to the most a letter takes (and that most) */
  const COIN_STEPS = [5, 10, 25, 50, 100];
  const steps = $derived.by(() => {
    const max = info?.maxCoins ?? 0;
    const out = COIN_STEPS.filter((v) => v <= max);
    return max > 0 && !out.includes(max) ? [...out, max] : out;
  });
  /** Can be afforded with the courier's fee on top (all of them while the wallet is not known) */
  const affordable = (v: number) => balance === null || v + fee <= balance;

  /**
   * The page holds LETTER_LINES lines and no more: what would run past its last line (a new line,
   * or words wrapping onto one) is not taken
   */
  function write(e: Event & { currentTarget: HTMLTextAreaElement }) {
    const el = e.currentTarget;
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || 28;
    if (el.value.split('\n').length > LETTER_LINES || el.scrollHeight > lineH * LETTER_LINES + 2) {
      const at = Math.max(0, el.selectionStart - (el.value.length - text.length));
      el.value = text;
      el.setSelectionRange(at, at);
      full = true;
      return;
    }
    full = false;
    text = el.value;
  }
  /** The last thing typed did not fit on the page */
  let full = $state(false);

  async function send(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!to) return void (error = 'Pick who the letter is for');
    if (!text.trim()) return void (error = 'Write something on the paper first');
    stage = 'sending';
    const r = await attempt(() => rpc<{ letter: Letter }>('world', 'send', { to, text, coins, paper, seal }));
    if (!r) {
      stage = 'writing';
      return;
    }
    // Folded, sealed, off it goes
    stage = 'folding';
    void loadMail();
    setTimeout(onsent, 1900);
  }
</script>

<form novalidate class="courier" onsubmit={send}>
  <section class="group">
    <span class="label">To</span>
    {#if others.length > 6}
      <label class="search">
        <Search size={16} />
        <input type="search" bind:value={query} placeholder="Find someone" aria-label="Find someone" />
      </label>
    {/if}
    {#if others.length}
      <div class="people">
        {#each shown as c (c.id)}
          <button type="button" class="person" class:on={to === c.id} style:--who={c.color} onclick={() => (to = c.id)} disabled={stage !== 'writing'}>
            <span class="face"><Portrait url={c.url} sheet={c.sheet} size={46} /></span>
            <span class="truncate">{c.name}</span>
          </button>
        {:else}
          <p class="faint small none-found">Nobody by that name.</p>
        {/each}
      </div>
    {:else}
      <p class="faint small">Nobody else has a character in the town yet.</p>
    {/if}
  </section>

  <section class="group">
    <span class="label">Paper</span>
    <div class="papers">
      {#each PAPERS as p (p.id)}
        <button type="button" class="paper-pick" class:on={paper === p.id} style={paperStyle(p.id)} onclick={() => (paper = p.id)}>
          <span class="swatch"></span>
          <span class="pname">{p.name}</span>
          {#if paperPrice(p.id, papers)}<span class="extra"><Coins size={11} />+{paperPrice(p.id, papers)}</span>{/if}
        </button>
      {/each}
    </div>
  </section>

  <!-- Written on the paper itself, in the hand of the letter; folds into its envelope once sent -->
  <div class="desk" class:folding={stage === 'folding'}>
    <div class="sheet" style={paperStyle(paper)} style:--hand={HAND}>
      <span class="dear">Dear {toName || '...'},</span>
      <textarea value={text} oninput={write} maxlength={LETTER_MAX} rows={LETTER_LINES} placeholder="Write your letter here" disabled={stage !== 'writing'}></textarea>
      <div class="foot">
        <span class="count" class:near={full || text.length > LETTER_MAX - 30}>{full ? 'The page is full' : `${text.length}/${LETTER_MAX}`}</span>
        <span class="sign">{hb.me?.name}</span>
      </div>
      {#if coins}
        <span class="clip" aria-hidden="true"><Coins size={15} />{coins}</span>
      {/if}
    </div>
    <div class="envelope" style={paperStyle(paper)} aria-hidden="true">
      <span class="flap"></span>
      <span class="env-to" style:--hand={HAND}>For {toName}</span>
      <span class="env-seal"><WaxSeal color={sealColor} letter={initial} size={52} /></span>
    </div>
  </div>

  <!-- The seal's color, put aside for now (always the red one):
  <section class="group">
    <span class="label">Seal</span>
    <div class="seals">
      {#each SEALS as s (s.id)}
        <button type="button" class="seal-pick" class:on={seal === s.id} aria-label="{s.name} seal" onclick={() => (seal = s.id)}>
          <WaxSeal color={s.color} letter={initial} size={40} />
        </button>
      {/each}
    </div>
  </section>
  -->

  {#if steps.length}
    <section class="group">
      <span class="label">Add {currency} as a gift</span>
      <div class="coins">
        <button type="button" class="coin none" class:on={coins === 0} onclick={() => (coins = 0)}>None</button>
        {#each steps as v (v)}
          <button type="button" class="coin" class:on={coins === v} disabled={!affordable(v)} onclick={() => (coins = v)}>{v}</button>
        {/each}
      </div>
    </section>
  {/if}

  {#if error}<p class="error small">{error}</p>{/if}
  <button type="submit" class="btn primary block go" disabled={stage !== 'writing' || !info?.on}>
    <Send size={18} />{stage === 'folding' ? 'On its way' : 'Send'}
    <span class="price"><Coins size={15} />{cost}</span>
  </button>
</form>

<style>
  .courier {
    display: flex;
    flex-direction: column;
    gap: 1.05rem;
    padding-bottom: 1.5rem;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  /* Everyone in rows; past two rows the list scrolls up and down */
  .people {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4.4rem, 1fr));
    gap: 0.5rem;
    max-height: 13.2rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.25rem 0.15rem;
  }
  .none-found {
    grid-column: 1 / -1;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--input-bg);
    color: var(--text-dim);
  }
  .search input {
    flex: 1;
    min-width: 0;
    padding: 0.6rem 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
  }
  .person {
    min-width: 0;
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    padding: 0.5rem 0.3rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.8rem;
    font-weight: 600;
    transition: transform 0.15s;
  }
  .person span.truncate {
    max-width: 100%;
  }
  .face {
    display: grid;
    place-items: center;
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 50%;
    overflow: hidden;
    background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--who) 45%, transparent), color-mix(in srgb, var(--who) 12%, var(--surface-2)));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--who) 55%, transparent);
  }
  .person.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
    transform: translateY(-2px);
  }
  .papers {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.4rem;
  }
  .paper-pick {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    padding: 0.4rem 0.2rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .paper-pick.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  }
  .swatch {
    width: 100%;
    height: 1.8rem;
    border-radius: 3px;
    background: var(--lines, none), radial-gradient(130% 120% at 50% 40%, transparent 50%, var(--edge) 100%), var(--paper);
    box-shadow: 0 3px 8px -4px rgba(0, 0, 0, 0.6);
  }
  .pname {
    font-size: 0.72rem;
    color: var(--text-dim);
  }
  /* What a fancier paper costs on top, on its corner */
  .extra {
    position: absolute;
    top: -0.45rem;
    right: -0.3rem;
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
    padding: 0.05rem 0.3rem;
    border-radius: 999px;
    background: linear-gradient(160deg, var(--coin), var(--coin-2));
    color: #3a2400;
    font-size: 0.66rem;
    font-weight: 800;
  }
  /* The seal's picker, put aside with it:
  .seals {
    display: flex;
    justify-content: space-between;
    gap: 0.3rem;
  }
  .seal-pick {
    padding: 0.2rem;
    border: 2px solid transparent;
    border-radius: 50%;
    background: none;
    line-height: 0;
    transition: transform 0.15s;
  }
  .seal-pick.on {
    border-color: var(--accent);
    transform: scale(1.08);
  }
  */

  /* ---------------------------------------------------------- the paper (colors from papers.ts) */

  .desk {
    position: relative;
    perspective: 900px;
  }
  .sheet {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 1.1rem 1.15rem 0.85rem;
    border-radius: 4px;
    color: var(--ink);
    font-family: var(--hand);
    background:
      var(--lines, none),
      radial-gradient(130% 100% at 50% 40%, transparent 55%, var(--edge) 100%),
      var(--paper);
    box-shadow: 0 16px 32px -18px rgba(0, 0, 0, 0.8);
    transform-origin: top center;
  }
  .dear {
    font-size: 1.2rem;
  }
  /* As tall as its lines (LETTER_LINES), no more */
  textarea {
    width: 100%;
    padding: 0;
    border: 0;
    outline: none;
    resize: none;
    overflow: hidden;
    background: transparent;
    color: var(--ink);
    font-family: var(--hand);
    font-size: 1.15rem;
    line-height: 1.6;
  }
  textarea::placeholder {
    color: var(--ink);
    opacity: 0.4;
  }
  .foot {
    display: flex;
    align-items: flex-end;
    gap: 0.6rem;
  }
  .count {
    font-family: var(--font-body);
    font-size: 0.72rem;
    opacity: 0.5;
  }
  .count.near {
    opacity: 0.9;
    color: #b3262e;
  }
  .sign {
    flex: 1;
    display: grid;
    justify-items: end;
    font-size: 1.3rem;
    line-height: 1.2;
  }
  /* The coins slipped in: clipped to the corner of the page */
  .clip {
    position: absolute;
    top: -0.55rem;
    right: 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    background: linear-gradient(160deg, var(--coin), var(--coin-2));
    color: #3a2400;
    font-family: var(--font-body);
    font-size: 0.82rem;
    font-weight: 700;
    box-shadow: 0 4px 10px -4px rgba(0, 0, 0, 0.6);
    animation: drop 0.35s cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  @keyframes drop {
    from {
      transform: translateY(-10px) scale(0.6);
      opacity: 0;
    }
  }

  /* Sent: the page folds up into its envelope, the seal is pressed on, and it flies off */
  .envelope {
    position: absolute;
    left: 50%;
    top: 0;
    width: min(18rem, 86%);
    aspect-ratio: 1.6;
    translate: -50% 0;
    border-radius: 6px;
    background: linear-gradient(170deg, var(--env-2), var(--env) 60%, var(--env-shade));
    box-shadow: 0 18px 36px -16px rgba(0, 0, 0, 0.85);
    opacity: 0;
    pointer-events: none;
  }
  .flap {
    position: absolute;
    inset: 0 0 45% 0;
    background: linear-gradient(var(--env-2), var(--env-shade));
    clip-path: polygon(0 0, 100% 0, 50% 100%);
  }
  .env-to {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 12%;
    text-align: center;
    color: var(--ink);
    font-family: var(--hand);
    font-size: 1.15rem;
  }
  .env-seal {
    position: absolute;
    left: 50%;
    top: 55%;
    translate: -50% -50%;
    line-height: 0;
    opacity: 0;
    filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.45));
  }
  .folding .sheet {
    animation: fold 0.55s cubic-bezier(0.5, 0, 0.7, 1) forwards;
  }
  .folding .envelope {
    animation: fly 1.9s ease-in forwards;
  }
  .folding .env-seal {
    animation: press 0.35s cubic-bezier(0.3, 1.6, 0.5, 1) 0.75s forwards;
  }
  @keyframes fold {
    60% {
      transform: rotateX(70deg) scaleY(0.5);
      opacity: 1;
    }
    to {
      transform: rotateX(90deg) scaleY(0.3);
      opacity: 0;
    }
  }
  @keyframes fly {
    0%,
    24% {
      opacity: 0;
      transform: scale(0.9);
    }
    32%,
    62% {
      opacity: 1;
      transform: none;
    }
    to {
      opacity: 0;
      transform: translate(140%, -260%) rotate(-18deg) scale(0.5);
    }
  }
  @keyframes press {
    from {
      opacity: 0;
      transform: scale(2.2);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  /* ---------------------------------------------------------- the coins */

  /* One row that slides sideways (room for the lifted, outlined coin above and below) */
  .coins {
    display: flex;
    gap: 0.45rem;
    overflow-x: auto;
    margin: -0.3rem -0.25rem 0;
    padding: 0.75rem 0.25rem 0.5rem;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
  }
  .coins::-webkit-scrollbar {
    display: none;
  }
  .coin {
    flex: none;
    scroll-snap-align: start;
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--coin) 60%, #fff), var(--coin) 45%, var(--coin-2));
    box-shadow:
      inset 0 0 0 3px color-mix(in srgb, var(--coin-2) 70%, transparent),
      0 4px 10px -5px rgba(0, 0, 0, 0.7);
    color: #3a2400;
    font-weight: 800;
    font-size: 0.95rem;
    transition: transform 0.15s;
  }
  .coin.none {
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--border);
    color: var(--text-dim);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .coin.on {
    transform: translateY(-3px) scale(1.06);
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .coin:disabled {
    opacity: 0.3;
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
  .error {
    color: var(--danger);
  }
</style>
