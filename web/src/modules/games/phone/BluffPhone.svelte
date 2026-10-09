<script lang="ts">
  import { Check, Eye, EyeOff, Lock, Tv } from '@lucide/svelte';
  import { fly, scale } from 'svelte/transition';
  import { bluffDeal, bluffGain, type BluffChoice, type BluffView, type MatchState } from '$shared/games.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { local } from '../store.svelte.ts';
  import Fuse from '../ui/Fuse.svelte';
  import MoneyFlow from '../ui/MoneyFlow.svelte';
  import BluffCardFace from '../ui/BluffCardFace.svelte';

  /**
   * Bluff on the phone: two big cards, Share and Steal, each with what it pays whatever the other one
   * picks. Once picked, the choice is hidden behind a face-down card (hold it to peek), so a glance
   * at the screen gives nothing away. Then, with the result, both cards turn over face to face.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as BluffView | null);
  const me = $derived(hb.me?.id ?? '');
  const meP = $derived(m.players.find((p) => p.id === me) ?? m.players[0]);
  const other = $derived(m.players.find((p) => p.id !== me) ?? m.players[1]);
  const deal = $derived(m.bluff ?? bluffDeal(m.stake, 0, 0));
  const economy = $derived(!!hb.core?.economyEnabled);
  const chosen = $derived(v?.chosen ?? []);
  const bothChose = $derived(chosen.length >= m.players.length);
  const theyChose = $derived(chosen.includes(other.id));
  let choice = $state<BluffChoice | null>(null);
  let sending = $state(false);
  /** The choice is behind the face-down card; `peek` while a finger holds it */
  let sealed = $state(false);
  let peek = $state(false);

  async function pick(c: BluffChoice) {
    if (bothChose || sending) return;
    const before = choice;
    choice = c;
    // Hidden at once: the colors of the picked card would give it away
    sealed = true;
    peek = false;
    navigator.vibrate?.(15);
    if (before === c) return;
    sending = true;
    if (!(await attempt(() => rpc('games', 'play', { choice: c })))) {
      choice = before;
      sealed = !!before;
    }
    sending = false;
  }

  // The result
  const r = $derived(m.result);
  const mine = $derived(v?.choices?.[me] ?? choice ?? 'share');
  const theirs = $derived(v?.choices?.[other.id] ?? 'share');
  const gain = $derived(r?.payouts[me] ?? 0);
  const verdict = $derived.by(() => {
    if (mine === 'share' && theirs === 'share') return { title: 'You both shared', tone: 'both' };
    if (mine === 'steal' && theirs === 'share') return { title: 'You stole the pot!', tone: 'win' };
    if (mine === 'share') return { title: `${other.name} betrayed you`, tone: 'lose' };
    return { title: 'You both stole', tone: 'none' };
  });
</script>

{#snippet amount(n: number)}
  {#if !economy}{n > 0 ? 'You win' : 'Nothing'}{:else if n > 0}<Money amount={n} sign />{:else}0{/if}
{/snippet}

{#if m.phase === 'play'}
  <div class="bluff">
    <div class="them" in:fly={{ y: -12 }}>
      <span class="face" class:done={theyChose}>
        <Avatar name={other.name} color={other.color} id={other.id} size="3rem" />
        {#if theyChose}<span class="tick" in:scale={{ start: 0.3 }}><Check size={14} strokeWidth={3} /></span>{/if}
      </span>
      <span class="state">
        {#key theyChose}
          <strong in:fly={{ y: 8, duration: 250 }}>
            {#if bothChose}Both chosen{:else if theyChose}{other.name} has chosen{:else}{other.name} is thinking<span class="dots"><i></i><i></i><i></i></span>{/if}
          </strong>
        {/key}
        <span class="faint small">{bothChose ? 'Turning the cards over...' : choice ? 'Your choice is in' : 'Your move'}</span>
      </span>
    </div>

    {#if m.endsAt && !bothChose}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Choose within" />{/if}

    {#if choice && sealed}
      <div class="sealed" in:scale={{ start: 0.85, duration: 300 }}>
        <button
          class="facedown"
          class:peek
          aria-label="Hold to see your choice"
          onpointerdown={() => (peek = true)}
          onpointerup={() => (peek = false)}
          onpointerleave={() => (peek = false)}
          onpointercancel={() => (peek = false)}
          oncontextmenu={(e) => e.preventDefault()}
        >
          <BluffCardFace kind="back" width="10.5rem" />
          <span class="seal"><Lock size={14} /> Locked in</span>
        </button>
        <!-- Peeking: small and plain, no big color a neighbour would notice -->
        <span class="peek-line faint small">
          {#if peek}You chose <strong>{choice === 'share' ? 'Share' : 'Steal'}</strong>{:else}<Eye size={13} /> Hold the card to peek{/if}
        </span>
        {#if !bothChose}<button class="btn ghost block" onclick={() => (sealed = false)}>Change my mind</button>{/if}
      </div>
    {:else}
      <div class="choices" class:made={!!choice} class:locked={bothChose}>
        {#each ['share', 'steal'] as const as c, i (c)}
          <button class="choice {c}" class:active={choice === c} disabled={bothChose} onclick={() => pick(c)} in:fly={{ y: 30, delay: 80 + i * 110 }}>
            <span class="hold"><BluffCardFace kind={c} width="min(9.5rem, 40vw)" shine /></span>
            <span class="pays">
              <span class="row"><span>If {other.name} shares</span><b class="mono">{@render amount(bluffGain(deal, c, 'share'))}</b></span>
              <span class="row"><span>If {other.name} steals</span><b class="mono">{@render amount(bluffGain(deal, c, 'steal'))}</b></span>
            </span>
          </button>
        {/each}
      </div>
    {/if}

    <p class="hint faint">
      {#if bothChose}<Tv size={14} /> Watch the TV{:else}<EyeOff size={14} /> Keep your screen hidden{/if}
    </p>
  </div>
{:else if r}
  <div class="reveal tone-{verdict.tone}">
    <div class="table">
      {#each [{ p: meP, c: mine, label: 'You' }, { p: other, c: theirs, label: other.name }] as side, i (side.p.id)}
        <div class="seat">
          <div class="flip" style:--delay="{0.25 + i * 0.6}s">
            <span class="card-side"><BluffCardFace kind="back" width="7.5rem" /></span>
            <span class="card-side front"><BluffCardFace kind={side.c} width="7.5rem" /></span>
          </div>
          <span class="who truncate"><Avatar name={side.p.name} color={side.p.color} id={side.p.id} size="1.4rem" /> {side.label}</span>
        </div>
      {/each}
    </div>
    <div class="outcome">
      <h1>{verdict.title}</h1>
      {#if economy}
        {#if gain > 0 || deal.stake > 0}<MoneyFlow amount={gain > 0 ? gain : -deal.stake} delay={1900} />{:else}<p class="gain zero">Nothing for you</p>{/if}
        {#if verdict.tone === 'both' && deal.bonus > 0}<p class="faint small">Your bet back plus a <Money amount={deal.bonus} /> bonus</p>{/if}
        {#if verdict.tone === 'none' && deal.stake > 0}<p class="faint small">Both bets are lost</p>{/if}
      {/if}
    </div>
    <button class="btn block close" onclick={() => (local.closed = m.id)}>Close</button>
  </div>
{/if}

<style>
  .bluff {
    display: grid;
    gap: 1rem;
  }
  .small {
    font-size: 0.8rem;
  }

  /* The other player and where they are */
  .them {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .face {
    position: relative;
    display: grid;
    border-radius: 50%;
    transition: box-shadow 0.3s ease;
  }
  .face.done {
    box-shadow: 0 0 0 3px #ff3b8d;
  }
  .tick {
    position: absolute;
    right: -4px;
    bottom: -4px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #ff3b8d;
    color: #fff;
    box-shadow: 0 0 0 2px var(--surface);
  }
  .state {
    display: grid;
    min-width: 0;
  }
  .dots {
    display: inline-flex;
    gap: 3px;
    margin-left: 4px;
  }
  .dots i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    animation: blink 1.2s ease-in-out infinite;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.2s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.4s;
  }

  /* The two cards, held like a hand: a little fanned out, straight once picked */
  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }
  .choice {
    --c: var(--success);
    display: grid;
    justify-items: center;
    gap: 0.7rem;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    transition: opacity 0.2s ease;
  }
  .choice.steal {
    --c: var(--danger);
  }
  .hold {
    display: grid;
    transform: rotate(-4deg) translateY(4px);
    transition: transform 0.3s cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  .steal .hold {
    transform: rotate(4deg) translateY(4px);
  }
  .choice:active:not(:disabled) .hold {
    transform: rotate(0deg) translateY(-6px) scale(0.97);
  }
  .choice.active .hold {
    transform: rotate(0deg) translateY(-8px) scale(1.03);
    border-radius: 0.9rem;
    box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--c);
  }
  .made .choice:not(.active),
  .locked .choice:not(.active) {
    opacity: 0.5;
  }
  .choice:disabled {
    cursor: default;
  }
  .pays {
    display: grid;
    gap: 0.25rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--c) 8%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--c) 25%, transparent);
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.72rem;
    color: var(--text-dim);
    text-align: left;
  }
  .row b {
    font-size: 0.85rem;
    color: var(--text);
    white-space: nowrap;
  }

  /* The choice made, face down */
  .sealed {
    display: grid;
    justify-items: center;
    gap: 0.7rem;
  }
  .facedown {
    position: relative;
    display: grid;
    padding: 0;
    border: 0;
    background: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
    animation: float 3.2s ease-in-out infinite;
  }
  .facedown.peek {
    animation: none;
    transform: scale(0.97);
  }
  .seal {
    position: absolute;
    left: 50%;
    bottom: 1.1rem;
    translate: -50% 0;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    background: rgba(23, 10, 38, 0.85);
    border: 1px solid rgba(255, 59, 141, 0.5);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .peek-line {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.2rem;
  }
  .hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    font-size: 0.8rem;
  }

  /* The reveal: both cards face down, then turned over one after the other */
  .reveal {
    --tone: var(--text-faint);
    display: grid;
    justify-items: center;
    gap: 1.4rem;
    padding-top: 1rem;
    text-align: center;
  }
  .tone-both {
    --tone: var(--success);
  }
  .tone-win {
    --tone: var(--coin);
  }
  .tone-lose {
    --tone: var(--danger);
  }
  .table {
    display: flex;
    justify-content: center;
    gap: 1.2rem;
  }
  .seat {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 8rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  .flip {
    position: relative;
    display: grid;
    transform-style: preserve-3d;
    animation: turn 0.8s cubic-bezier(0.3, 1.3, 0.5, 1) var(--delay) both;
  }
  .card-side {
    grid-area: 1 / 1;
    display: grid;
    backface-visibility: hidden;
  }
  .front {
    transform: rotateY(180deg);
  }
  .outcome {
    display: grid;
    gap: 0.35rem;
    animation: hb-fade-up 0.5s ease 1.8s both;
  }
  h1 {
    font-size: 2rem;
    line-height: 1.1;
    color: var(--tone);
  }
  .gain {
    font-size: 2rem;
    font-weight: 700;
    color: var(--success);
  }
  .gain.zero {
    font-size: 1.1rem;
    color: var(--text-faint);
  }
  .close {
    margin-top: 0.4rem;
    animation: hb-fade-up 0.4s ease 2.2s both;
  }
  @keyframes turn {
    from {
      transform: perspective(40rem) rotateY(0deg);
    }
    to {
      transform: perspective(40rem) rotateY(180deg);
    }
  }
  @keyframes blink {
    50% {
      opacity: 0.25;
    }
  }
  @keyframes float {
    50% {
      transform: translateY(-6px) rotate(-1deg);
    }
  }
</style>
