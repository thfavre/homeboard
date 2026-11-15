<script lang="ts">
  import { Check, Crown, RotateCcw, Shuffle, Swords, X } from '@lucide/svelte';
  import { fly, scale } from 'svelte/transition';
  import { ARCADE_GAMES, ARCADE_INVITE_MS, ARCADE_READY_MS, ARCADE_ROUND_MS, arcadeFormat, arcadeGame, type ArcadePlayer } from '$shared/arcade.ts';
  import { attempt, hb, rpc } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Versus from '../games/ui/Versus.svelte';
  import PotPanel from '../games/ui/PotPanel.svelte';
  import Fuse from '../games/ui/Fuse.svelte';
  import MoneyFlow from '../games/ui/MoneyFlow.svelte';
  import GameView from './GameView.svelte';
  import Reveal from './Reveal.svelte';
  import { arcadeLocal, arcadeState, gradient, myArcadeMatch } from './store.svelte.ts';

  /** The Arcade on a phone, full screen: a challenge sent or received, then the match round by round */
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
  const pool = $derived(ARCADE_GAMES.filter((g) => s?.settings.games.includes(g.id)).map((g) => g.id));
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

{#snippet tally()}
  {#if m && other && m.count > 1}
    <div class="tally">
      <span class="t-name truncate">You</span>
      <strong class="mono">{m.wins[me] ?? 0}</strong>
      <span class="dash">-</span>
      <strong class="mono">{m.wins[other.id] ?? 0}</strong>
      <span class="t-name truncate">{other.name}</span>
    </div>
  {/if}
{/snippet}

{#if m && other && round && info}
  {#if m.phase === 'play'}
    {#key m.rounds.length}<GameView match={m} />{/key}
  {:else if m.phase === 'ready'}
    {@const iAmReady = m.ready.includes(me)}
    <div class="screen">
      <div class="col" in:fly={{ y: 24, duration: 300 }}>
        {#if m.count > 1}<span class="eyebrow center">Game {m.rounds.length} of up to {m.count}</span>{/if}
        {@render tally()}
        {#key m.rounds.length}<Reveal game={info.id} {pool} onstep={() => sfx?.play('turn', 0.6)} onland={() => sfx?.play('level')} />{/key}
        <ol class="steps">
          {#each info.steps as step, i (i)}<li><span class="n">{i + 1}</span>{step}</li>{/each}
        </ol>
        {#if iAmReady}
          <div class="ready-note"><Check size={18} /> Ready. Waiting for {other.name}...</div>
        {:else}
          <button class="btn primary block big" style:--g={gradient(info.colors)} disabled={busy} onclick={ready}>I'm ready</button>
        {/if}
        <span class="faint small">{m.ready.includes(other.id) ? `${other.name} is ready` : `${other.name} is reading the rules`}</span>
        {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={ARCADE_READY_MS} label="Starts anyway in" />{/if}
      </div>
    </div>
  {:else if m.phase === 'round'}
    {@const won = round.winner === me}
    {@const tie = round.winner === null}
    <div class="screen">
      <div class="col" in:scale={{ start: 0.9, duration: 260 }}>
        <span class="eyebrow center">{info.name}</span>
        <h1 class="headline" class:won>{tie ? 'A tie' : won ? 'You win this one' : `${other.name} wins this one`}</h1>
        <div class="scores">
          {#each [...m.players].sort((x, y) => (x.id === me ? -1 : y.id === me ? 1 : 0)) as p (p.id)}
            <div class="score-card" class:best={round.winner === p.id}>
              <Avatar name={p.name} color={p.color} id={p.id} size="2.6rem" />
              <span class="truncate">{p.id === me ? 'You' : p.name}</span>
              <strong class="mono">{round.scores[p.id] ?? 0}</strong>
              <span class="faint small">{(round.scores[p.id] ?? 0) === 1 ? info.one : info.unit}</span>
            </div>
          {/each}
        </div>
        {@render tally()}
        {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={ARCADE_ROUND_MS} label={decided ? 'Result in' : 'Next game in'} />{/if}
      </div>
    </div>
  {:else}
    {@const won = m.winner === me}
    {@const tie = m.winner === null}
    {@const gain = (m.payouts?.[me] ?? 0) - m.stake}
    <div class="screen">
      <div class="col result" class:won in:scale={{ start: 0.85, duration: 320 }}>
        <span class="medal" class:won>{#if won}<Crown size={40} />{:else if tie}<Swords size={36} />{:else}<X size={38} />{/if}</span>
        <h1>{tie ? 'A tie' : won ? 'You win' : `${other.name} wins`}</h1>
        <span class="dim">{m.count === 1 ? arcadeGame(m.rounds[0].game)?.name : `Best of ${m.count}, ${m.wins[me] ?? 0} - ${m.wins[other.id] ?? 0}`}</span>
        {#if economy && m.stake > 0}<MoneyFlow amount={gain} delay={300} />{/if}
        <div class="answer">
          <button class="btn decline" onclick={() => (arcadeLocal.closed = m.id)}>Close</button>
          <button class="btn primary accept" disabled={busy} onclick={() => act('rematch', { match: m.id })}><RotateCcw size={18} /> Rematch</button>
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
      <div class="answer">
        <button class="btn decline" disabled={busy} onclick={() => act('respond', { id: received.id, accept: false })}><X size={20} /> Decline</button>
        <button class="btn primary accept" disabled={busy} onclick={() => act('respond', { id: received.id, accept: true })}><Check size={20} /> Accept</button>
      </div>
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
  .steps {
    display: grid;
    gap: 0.55rem;
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
    text-align: left;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }
  .n {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: var(--surface-3);
    font-size: 0.8rem;
    font-weight: 700;
  }
  .big {
    min-height: 3.6rem;
    font-size: 1.15rem;
    border-radius: var(--radius);
    background: var(--g);
    color: #fff;
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
  .tally {
    display: grid;
    grid-template-columns: 1fr auto auto auto 1fr;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.6rem 0.9rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .tally strong {
    font-size: 1.5rem;
  }
  .t-name:first-child {
    text-align: right;
  }
  .t-name:last-child {
    text-align: left;
  }
  .dash {
    color: var(--text-faint);
  }
  .headline {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.8rem;
  }
  .headline.won {
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .scores {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
    width: 100%;
  }
  .score-card {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    min-width: 0;
    padding: 1rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  .score-card.best {
    border-color: color-mix(in srgb, var(--success) 60%, transparent);
    background: color-mix(in srgb, var(--success) 12%, transparent);
  }
  .score-card strong {
    font-size: 2.4rem;
    line-height: 1;
  }
  .result h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 2.2rem;
  }
  .result.won h1 {
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .medal {
    display: grid;
    place-items: center;
    width: 5.5rem;
    height: 5.5rem;
    border-radius: 50%;
    background: var(--surface-3);
    color: var(--text-dim);
  }
  .medal.won {
    background: linear-gradient(135deg, var(--coin), var(--coin-2));
    color: #3a2400;
    box-shadow: 0 0 40px -6px var(--coin);
  }
</style>
