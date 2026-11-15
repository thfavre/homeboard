<script lang="ts">
  import { Check, Hand, Heart, MousePointerClick, MoveHorizontal, RotateCcw, Shuffle, Swords, Timer, Wand, X, Zap } from '@lucide/svelte';
  import { fly, scale } from 'svelte/transition';
  import { ARCADE_INVITE_MS, ARCADE_UNIT, arcadeOffered, ARCADE_READY_MS, ARCADE_ROUND_MS, arcadeFormat, arcadeGame, type ArcadePlayer } from '$shared/arcade.ts';
  import { attempt, hb, rpc } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import Versus from '../games/ui/Versus.svelte';
  import PotPanel from '../games/ui/PotPanel.svelte';
  import Fuse from '../games/ui/Fuse.svelte';
  import MoneyFlow from '../games/ui/MoneyFlow.svelte';
  import GameView from './GameView.svelte';
  import Reveal from './Reveal.svelte';
  import Face from './Face.svelte';
  import PixelText from '$lib/ui/PixelText.svelte';
  import { arcadeLocal, arcadeState, myArcadeMatch, needsCharacter } from './store.svelte.ts';

  /** The Arcade on a phone, full screen: a challenge sent or received, then the match round by round */

  /** How each game is played, shown on its rules */
  const CONTROLS = { tap: MousePointerClick, hold: Hand, swipe: Wand, slide: MoveHorizontal };
  const CONTROL_NAMES = { tap: 'Tap', hold: 'Hold', swipe: 'Swipe', slide: 'Slide' };
  const firstName = (name: string) => name.trim().split(' ')[0] ?? name;
  const s = $derived(arcadeState());
  const me = $derived(hb.me?.id ?? '');
  const meAsPlayer = $derived<ArcadePlayer>({ id: me, name: hb.me?.name ?? '', color: hb.me?.color ?? '#888' });
  const m = $derived(myArcadeMatch());
  const received = $derived(s?.invites.find((i) => i.to.id === me));
  const sent = $derived(s?.invites.find((i) => i.from.id === me));
  const economy = $derived(!!hb.core?.economyEnabled);
  let busy = $state(false);

  // The game and its sounds load while the challenge and the rules are up, so Ready starts at once
  type Sfx = typeof import('./engine/sfx.ts');
  let sfx: Sfx | null = null;
  $effect(() => {
    void import('./engine/sfx.ts').then((x) => (sfx = x));
    void import('./engine/run.ts').catch(() => {});
  });

  async function act(method: string, args: unknown) {
    busy = true;
    await attempt(() => rpc('arcade', method, args));
    busy = false;
  }

  function ready() {
    // A tap: the phone now lets the game make sound
    sfx?.wakeSound();
    void act('ready', { match: m!.id });
  }

  /** The games the draw picks from (the reveal flashes through them) */
  const pool = $derived(arcadeOffered(s?.settings).map((g) => g.id));
  const other = $derived(m?.players.find((p) => p.id !== me));
  const round = $derived(m ? m.rounds[m.rounds.length - 1] : null);
  const info = $derived(round ? arcadeGame(round.game)! : null);
  /** The match is won (or all its games played): no more games after this round */
  const decided = $derived(!!m && (m.rounds.length >= m.count || Object.values(m.wins).some((w) => w > m.count / 2)));
</script>

{#snippet format(count: number)}
  <div class="format">
    <span class="format-name"><Shuffle size={16} /> {arcadeFormat(count)}</span>
    <div class="mystery">
      {#each Array.from({ length: count }) as _, i (i)}<span class="card-back" style:animation-delay="{i * 0.15}s">?</span>{/each}
    </div>
    <span class="dim small">{count === 1 ? 'A game drawn at random' : `${count} games drawn at random, first to ${Math.floor(count / 2) + 1} wins`}: you find out each one when it starts.</span>
  </div>
{/snippet}

{#snippet marquee(title: string, sub: string)}
  <div class="marquee">
    <span class="bulbs" aria-hidden="true">{#each Array.from({ length: 12 }) as _, i (i)}<span class="bulb" style:animation-delay="{i * 0.1}s"></span>{/each}</span>
    <PixelText text={title} size={9} color="#ffd23d" />
    <PixelText text={sub} size={7} color="#c9c2ff" />
  </div>
{/snippet}

{#snippet crown()}
  <svg viewBox="0 0 9 7" aria-hidden="true"><path fill="#120c26" d="M0 1h1v1h1v1h1V1h1V0h1v1h1v2h1V2h1V1h1v6H0z" /><path fill="#ffd23d" d="M1 3h1v1h1V2h1V1h1v1h1v2h1V3h1v3H1z" /><path fill="#fff3b0" d="M1 5h7v1H1z" /><path fill="#ff4fb0" d="M4 4h1v1H4z" /></svg>
{/snippet}

{#snippet pips()}
  {@const need = Math.floor(m!.count / 2) + 1}
  <div class="pips">
    {#each [meAsPlayer, other!] as p (p.id)}
      <span class="pip-row">
        <PixelText text={p.id === me ? 'You' : firstName(p.name).slice(0, 9)} size={7} color={p.id === me ? '#c9c2ff' : p.color} />
        <span class="pip-set">{#each Array.from({ length: need }) as _, i (i)}<span class="pip" class:on={i < (m!.wins[p.id] ?? 0)}></span>{/each}</span>
      </span>
    {/each}
    <span class="faint small">First to {need} wins</span>
  </div>
{/snippet}
{#if m && other && round && info}
  {#if m.phase === 'play'}
    {#key m.rounds.length}<GameView match={m} />{/key}
  {:else if m.phase === 'ready'}
    {@const iAmReady = m.ready.includes(me)}
    {@const Control = CONTROLS[info.control]}
    <div class="screen">
      <div class="col" in:fly={{ y: 24, duration: 300 }}>
        <div class="cabinet" style:--a={info.colors[0]} style:--b={info.colors[1]}>
          <div class="marquee">
            <span class="bulbs" aria-hidden="true">{#each Array.from({ length: 12 }) as _, i (i)}<span class="bulb" style:animation-delay="{i * 0.1}s"></span>{/each}</span>
            <PixelText text={m.count > 1 ? `Game ${m.rounds.length} of ${m.count}` : 'One game'} size={9} color="#ffd23d" />
            {#if m.count > 1}<PixelText text={`You ${m.wins[me] ?? 0} - ${m.wins[other.id] ?? 0} ${firstName(other.name)}`} size={7} color="#c9c2ff" />{/if}
          </div>
          {#key m.rounds.length}<Reveal game={info.id} {pool} onstep={() => sfx?.play('turn', 0.6)} onland={() => sfx?.play('level')} />{/key}
          <div class="chips">
            <span class="chip"><Control size={16} strokeWidth={2.4} /><PixelText text={CONTROL_NAMES[info.control]} size={7} /></span>
            {#if info.lives}
              <span class="chip"><Heart size={15} strokeWidth={2.6} /><PixelText text={`${info.lives} lives`} size={7} /></span>
            {:else}
              <span class="chip"><Timer size={15} strokeWidth={2.6} /><PixelText text={`${info.seconds} s`} size={7} /></span>
            {/if}
            <span class="chip gold"><Zap size={15} strokeWidth={2.6} /><PixelText text="Fever x2" size={7} color="#ffd23d" /></span>
          </div>
          <div class="howto">
            <PixelText text="How to play" size={8} color="#c9c2ff" />
            <ol class="steps">
              {#each info.steps as step, i (i)}<li><span class="n"><PixelText text={i + 1} size={9} shadow={false} color="#140c28" /></span><span>{step}</span></li>{/each}
            </ol>
            <p class="fever-tip">Good moves fill your fever bar: once full, every point counts double for a few seconds.</p>
          </div>
          <div class="lineup">
            {#each [meAsPlayer, other] as p (p.id)}
              {@const on = m.ready.includes(p.id)}
              <div class="player" class:on>
                <Face player={p} size={42} />
                <span class="p-name truncate">{p.id === me ? 'You' : p.name}</span>
                <span class="led-row"><span class="led" class:on></span><PixelText text={on ? 'Ready' : p.id === me ? 'Press start' : 'Reading'} size={7} color={on ? '#4dff9e' : '#8a80b0'} /></span>
              </div>
            {/each}
          </div>
          {#if iAmReady}
            <div class="ready-note"><Check size={18} /> Ready. Waiting for {other.name}...</div>
          {:else}
            <button class="start" disabled={busy} onclick={ready}><PixelText text="I'm ready" size={16} color="#ffffff" /></button>
          {/if}
          {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={ARCADE_READY_MS} label="Starts anyway in" />{/if}
        </div>
      </div>
    </div>
  {:else if m.phase === 'round'}
    {@const won = round.winner === me}
    {@const tie = round.winner === null}
    <div class="screen">
      <div class="cabinet" style:--a={info.colors[0]} style:--b={info.colors[1]} in:scale={{ start: 0.9, duration: 260 }}>
        {@render marquee(info.name, m.count > 1 ? `Game ${m.rounds.length} of ${m.count}` : 'Game over')}
        <div class="verdict" class:won class:tie>
          <PixelText text={tie ? 'A tie' : won ? 'You win this one' : `${firstName(other.name)} wins this one`} size={13} color={tie ? '#ffd23d' : won ? '#4dff9e' : '#ff8a96'} />
        </div>
        <div class="lineup">
          {#each [meAsPlayer, other] as p (p.id)}
            {@const best = round.winner === p.id}
            <div class="player" class:on={best}>
              {#if best}<span class="crown small-crown">{@render crown()}</span>{/if}
              <Face player={p} size={48} />
              <span class="p-name truncate">{p.id === me ? 'You' : p.name}</span>
              <PixelText text={round.scores[p.id] ?? 0} size={26} color={best ? '#ffd23d' : '#ffffff'} />
              <span class="faint small">{(round.scores[p.id] ?? 0) === 1 ? ARCADE_UNIT.one : ARCADE_UNIT.many}</span>
            </div>
          {/each}
        </div>
        {#if m.count > 1}{@render pips()}{/if}
        {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={ARCADE_ROUND_MS} label={decided ? 'Result in' : 'Next game in'} />{/if}
      </div>
    </div>
  {:else}
    {@const won = m.winner === me}
    {@const tie = m.winner === null}
    {@const gain = (m.payouts?.[me] ?? 0) - m.stake}
    {@const last = m.rounds[m.rounds.length - 1]}
    <div class="screen">
      <div class="cabinet result" class:won style:--a={won ? '#ffd23d' : info.colors[0]} style:--b={won ? '#ff8a3d' : info.colors[1]} in:scale={{ start: 0.85, duration: 320 }}>
        {@render marquee(m.count === 1 ? info.name : `Best of ${m.count}`, won ? 'Champion' : tie ? 'Draw' : 'Final')}
        {#if won}
          <span class="confetti" aria-hidden="true">
            {#each Array.from({ length: 18 }) as _, i (i)}<span style:left="{(i * 37) % 100}%" style:animation-delay="{(i % 6) * 0.25}s" style:background={['#ffd23d', '#ff4fb0', '#4fe8ff', '#4dff9e'][i % 4]}></span>{/each}
          </span>
        {/if}
        <div class="champion">
          {#if !tie}<span class="crown">{@render crown()}</span>{/if}
          <Face player={tie ? meAsPlayer : won ? meAsPlayer : other} size={92} />
        </div>
        <PixelText text={won ? 'You win' : tie ? 'Draw' : 'Game over'} size={30} color={won ? '#ffd23d' : tie ? '#ffffff' : '#ff6b7d'} />
        <span class="dim">{won ? `You beat ${other.name}` : tie ? 'Nobody takes it this time' : `${other.name} wins`}</span>
        <div class="final-score">
          <span class="fs-side"><PixelText text="You" size={8} color="#c9c2ff" /><PixelText text={m.count > 1 ? (m.wins[me] ?? 0) : (last.scores[me] ?? 0)} size={22} /></span>
          <PixelText text="-" size={16} color="#8a80b0" />
          <span class="fs-side"><PixelText text={firstName(other.name).slice(0, 9)} size={8} color={other.color} /><PixelText text={m.count > 1 ? (m.wins[other.id] ?? 0) : (last.scores[other.id] ?? 0)} size={22} /></span>
        </div>
        {#if economy && m.stake > 0}<MoneyFlow amount={gain} delay={300} />{/if}
        <div class="answer">
          <button class="quit" onclick={() => (arcadeLocal.closed = m.id)}><PixelText text="Close" size={10} color="#c9c2ff" /></button>
          <button class="start" disabled={busy} onclick={() => act('rematch', { match: m.id })}>
            <span class="start-in"><RotateCcw size={18} strokeWidth={2.6} /><PixelText text={won || tie ? 'Rematch' : 'Continue?'} size={12} /></span>
          </button>
        </div>
        <span class="faint small">A rematch: {arcadeFormat(m.count).toLowerCase()}, new games drawn{#if economy && m.stake > 0}, the same bet of <Money amount={m.stake} />{/if}</span>
      </div>
    </div>
  {/if}
{:else if received}
  <div class="screen">
    <div class="col" in:fly={{ y: 24, duration: 300 }}>
      <span class="eyebrow center"><Swords size={14} /> Arcade challenge</span>
      <Versus left={received.from} right={meAsPlayer} leftLabel="Challenger" rightLabel="You" />
      {@render format(received.count)}
      {#if economy && received.stake > 0}<PotPanel inLabel="You put in" stake={received.stake} outLabel="Winner takes" pot={received.stake * 2} />{/if}
      {#if needsCharacter()}
        <p class="dim small">To play, make your character in the Avatar first. Decline this one, make it, then challenge {received.from.name} back.</p>
        <button class="btn decline block" disabled={busy} onclick={() => act('respond', { id: received.id, accept: false })}><X size={20} /> Decline</button>
      {:else}
        <div class="answer">
          <button class="btn decline" disabled={busy} onclick={() => act('respond', { id: received.id, accept: false })}><X size={20} /> Decline</button>
          <button class="btn primary accept" disabled={busy} onclick={() => act('respond', { id: received.id, accept: true })}><Check size={20} /> Accept</button>
        </div>
      {/if}
      <Fuse endsAt={received.expiresAt} totalMs={ARCADE_INVITE_MS} label="Expires in" />
    </div>
  </div>
{:else if sent}
  <div class="screen">
    <div class="col" in:fly={{ y: 24, duration: 300 }}>
      <span class="eyebrow center"><Swords size={14} /> Challenge sent</span>
      <Versus left={meAsPlayer} right={sent.to} leftLabel="You" rightLabel="Thinking..." waiting />
      {@render format(sent.count)}
      {#if economy && sent.stake > 0}<PotPanel inLabel="You put in" stake={sent.stake} outLabel="Winner takes" pot={sent.stake * 2} />{/if}
      <Fuse endsAt={sent.expiresAt} totalMs={ARCADE_INVITE_MS} label={`Waiting for ${sent.to.name}`} />
      <button class="btn ghost block" disabled={busy} onclick={() => act('cancelInvite', { id: sent.id })}>Cancel the challenge</button>
    </div>
  </div>
{/if}

<style>
  .screen {
    display: grid;
    align-content: center;
    gap: 1rem;
  }
  .col {
    display: grid;
    justify-items: center;
    gap: 1rem;
    padding: 0.5rem 0;
    text-align: center;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .format {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 1rem;
    border-radius: var(--radius);
    background: linear-gradient(135deg, color-mix(in srgb, #ff4fb0 18%, transparent), color-mix(in srgb, #4fe8ff 12%, transparent));
  }
  .format-name {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-display);
    font-size: 1.2rem;
    font-weight: 700;
  }
  .mystery {
    display: flex;
    gap: 0.45rem;
  }
  .card-back {
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 3.3rem;
    border-radius: 10px;
    background: linear-gradient(135deg, #ff4fb0, #8b5bff);
    color: #fff;
    font-family: var(--font-display);
    font-size: 1.4rem;
    font-weight: 800;
    box-shadow: 0 6px 16px -8px #ff4fb0;
    animation: bob 1.6s ease-in-out infinite;
  }
  @keyframes bob {
    50% {
      transform: translateY(-4px);
    }
  }
  .answer {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 0.7rem;
    width: 100%;
  }
  .answer .btn {
    min-height: 3.6rem;
    font-size: 1.05rem;
    border-radius: var(--radius);
  }
  .decline {
    background: transparent;
    color: var(--text-dim);
  }
  .accept {
    background: var(--gradient);
  }
  /* The rules: an arcade cabinet's start screen */
  .cabinet {
    display: grid;
    justify-items: center;
    gap: 0.9rem;
    width: 100%;
    padding: 0 0.9rem 1rem;
    border: 3px solid #0b0718;
    border-radius: 8px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 30%),
      #1a1033;
    color: #fff;
    box-shadow:
      0 0 0 3px #2e2158,
      0 18px 40px -18px rgba(0, 0, 0, 0.9);
  }
  .marquee {
    display: grid;
    justify-items: center;
    gap: 0.35rem;
    width: calc(100% + 1.8rem);
    margin: 0 -0.9rem;
    padding: 0.55rem 0.6rem 0.65rem;
    border-bottom: 3px solid #0b0718;
    border-radius: 5px 5px 0 0;
    background: linear-gradient(180deg, #33265e, #21173f);
  }
  .bulbs {
    display: flex;
    justify-content: space-between;
    width: 100%;
    padding: 0 0.3rem;
  }
  .bulb {
    width: 6px;
    height: 6px;
    background: #5a4a20;
    animation: bulb 1.2s steps(1) infinite;
  }
  @keyframes bulb {
    0%,
    40% {
      background: #ffd23d;
      box-shadow: 0 0 6px #ffd23d;
    }
    50% {
      background: #5a4a20;
      box-shadow: none;
    }
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.45rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.6rem;
    border: 2px solid #0b0718;
    border-radius: 3px;
    background: #2a1f4a;
    color: #e8e4ff;
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.4);
  }
  .chip.gold {
    color: #ffd23d;
  }
  .howto {
    display: grid;
    gap: 0.6rem;
    width: 100%;
    padding: 0.8rem 0.8rem 0.7rem;
    border: 2px solid #2e2158;
    border-radius: 4px;
    background: #140c28;
    text-align: left;
  }
  .steps {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    font-size: 0.95rem;
    line-height: 1.3;
  }
  .n {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 2px solid #0b0718;
    border-radius: 3px;
    background: linear-gradient(135deg, var(--a), var(--b));
    box-shadow:
      inset 0 2px 0 rgba(255, 255, 255, 0.35),
      2px 2px 0 rgba(0, 0, 0, 0.4);
  }
  .fever-tip {
    margin: 0.1rem 0 0;
    color: #a89ed0;
    font-size: 0.8rem;
  }
  .lineup {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
    width: 100%;
  }
  .player {
    display: grid;
    justify-items: center;
    gap: 0.35rem;
    min-width: 0;
    padding: 0.7rem 0.4rem;
    border: 2px solid #2e2158;
    border-radius: 4px;
    background: #140c28;
    transition:
      border-color 0.3s,
      box-shadow 0.3s;
  }
  .player.on {
    border-color: #4dff9e;
    box-shadow: 0 0 14px -4px #4dff9e;
  }
  .p-name {
    max-width: 100%;
    font-size: 0.9rem;
    font-weight: 700;
  }
  .led-row {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .led {
    width: 8px;
    height: 8px;
    background: #4a1f2a;
    box-shadow: inset 0 0 0 1px #0b0718;
  }
  .led.on {
    background: #4dff9e;
    box-shadow: 0 0 8px #4dff9e;
    animation: led 1s steps(2) infinite;
  }
  @keyframes led {
    50% {
      background: #2a9a5e;
    }
  }

  /* The end screens */
  .verdict {
    padding: 0.2rem 0;
  }
  .player {
    position: relative;
  }
  .crown {
    display: block;
    width: 3rem;
    height: 2.4rem;
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.5));
    animation: crown 1.4s ease-in-out infinite;
  }
  .crown :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
    shape-rendering: crispEdges;
  }
  .small-crown {
    position: absolute;
    top: -1.1rem;
    width: 2rem;
    height: 1.6rem;
  }
  @keyframes crown {
    50% {
      transform: translateY(-3px);
    }
  }
  .pips {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
  }
  .pip-row {
    display: grid;
    grid-template-columns: 4.5rem auto;
    align-items: center;
    justify-items: end;
    gap: 0.6rem;
  }
  .pip-set {
    justify-self: start;
  }
  .pip-set {
    display: inline-flex;
    gap: 4px;
  }
  .pip {
    width: 12px;
    height: 12px;
    border: 2px solid #0b0718;
    background: #2a1f4a;
  }
  .pip.on {
    background: #ffd23d;
    box-shadow: 0 0 8px rgba(255, 210, 61, 0.7);
  }
  .result {
    position: relative;
    overflow: hidden;
    padding-bottom: 1.2rem;
  }
  .champion {
    display: grid;
    justify-items: center;
    margin-top: 0.4rem;
  }
  .result.won .champion :global(.face) {
    box-shadow:
      0 0 0 3px #ffd23d,
      0 0 30px rgba(255, 210, 61, 0.6);
  }
  .final-score {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    padding: 0.6rem 1.1rem;
    border: 2px solid #2e2158;
    border-radius: 4px;
    background: #140c28;
  }
  .fs-side {
    display: grid;
    justify-items: center;
    gap: 0.35rem;
  }
  .confetti {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .confetti span {
    position: absolute;
    top: -12px;
    width: 6px;
    height: 6px;
    animation: confetti 1.6s linear infinite;
  }
  @keyframes confetti {
    to {
      transform: translateY(560px) rotate(360deg);
    }
  }
  .answer .quit,
  .answer .start {
    min-height: 3.6rem;
  }
  .quit {
    display: grid;
    place-items: center;
    border: 3px solid #0b0718;
    border-radius: 6px;
    background: #2a1f4a;
    box-shadow:
      inset 0 3px 0 rgba(255, 255, 255, 0.08),
      0 5px 0 #0b0718;
    cursor: pointer;
  }
  .quit:active {
    transform: translateY(4px);
    box-shadow: 0 1px 0 #0b0718;
  }
  .start-in {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: #fff;
  }
  /* The big arcade button */
  .start {
    display: grid;
    place-items: center;
    width: 100%;
    min-height: 3.8rem;
    border: 3px solid #0b0718;
    border-radius: 6px;
    background: linear-gradient(180deg, var(--a), var(--b));
    box-shadow:
      inset 0 4px 0 rgba(255, 255, 255, 0.35),
      inset 0 -5px 0 rgba(0, 0, 0, 0.3),
      0 5px 0 #0b0718;
    cursor: pointer;
    animation: start 1.1s ease-in-out infinite;
    transition: transform 0.08s;
  }
  .start:active {
    transform: translateY(4px);
    box-shadow:
      inset 0 4px 0 rgba(255, 255, 255, 0.35),
      inset 0 -3px 0 rgba(0, 0, 0, 0.3),
      0 1px 0 #0b0718;
  }
  .start:disabled {
    opacity: 0.6;
    animation: none;
  }
  @keyframes start {
    50% {
      filter: brightness(1.18);
    }
  }
  .ready-note {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 3.6rem;
    padding: 0 1.4rem;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--success) 14%, transparent);
    color: var(--success);
    font-weight: 700;
  }
</style>
