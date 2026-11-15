<script lang="ts">
  import { Check, Crown, RotateCcw, Shuffle, Swords, X } from '@lucide/svelte';
  import { fly, scale } from 'svelte/transition';
  import { ARCADE_INVITE_MS, ARCADE_READY_MS, ARCADE_ROUND_MS, arcadeGame, type ArcadeGameId, type ArcadePlayer } from '$shared/arcade.ts';
  import { attempt, hb, rpc } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Versus from '../games/ui/Versus.svelte';
  import PotPanel from '../games/ui/PotPanel.svelte';
  import Fuse from '../games/ui/Fuse.svelte';
  import MoneyFlow from '../games/ui/MoneyFlow.svelte';
  import GameView from './GameView.svelte';
  import { ARCADE_ICONS, arcadeLocal, arcadeState, gradient, myArcadeMatch } from './store.svelte.ts';

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

  const title = (games: ArcadeGameId[], mix: boolean) => (mix ? 'Mix' : arcadeGame(games[0])!.name);
  const other = $derived(m?.players.find((p) => p.id !== me));
  const round = $derived(m ? m.rounds[m.rounds.length - 1] : null);
  const info = $derived(round ? arcadeGame(round.game)! : null);
</script>

{#snippet gameList(games: ArcadeGameId[], mix: boolean)}
  <div class="games-list">
    {#if mix}<span class="mix-label"><Shuffle size={14} /> Mix, best of {games.length}</span>{/if}
    {#each games as id (id)}
      {@const g = arcadeGame(id)!}
      {@const Icon = ARCADE_ICONS[id]}
      <div class="chip" style:--g={gradient(g.colors)}>
        <span class="chip-icon"><Icon size={18} /></span>
        <span class="chip-text">
          <strong>{g.name}</strong>
          <span>{g.tagline}</span>
        </span>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet tally()}
  {#if m && other && m.games.length > 1}
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
    {@const Icon = ARCADE_ICONS[info.id]}
    {@const iAmReady = m.ready.includes(me)}
    <div class="screen">
      <div class="col" in:fly={{ y: 24, duration: 300 }}>
        {#if m.games.length > 1}<span class="eyebrow center">Game {m.rounds.length} of {m.games.length}</span>{/if}
        {@render tally()}
        <div class="poster" style:--g={gradient(info.colors)}>
          <span class="poster-icon"><Icon size={40} strokeWidth={2.2} /></span>
          <h1>{info.name}</h1>
          <p>{info.tagline}</p>
        </div>
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
        {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={ARCADE_ROUND_MS} label={m.rounds.length < m.games.length ? 'Next game in' : 'Result in'} />{/if}
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
        <span class="dim">{title(m.games, m.mix)}{m.games.length > 1 ? `, ${m.wins[me] ?? 0} - ${m.wins[other.id] ?? 0}` : ''}</span>
        {#if economy && m.stake > 0}<MoneyFlow amount={gain} delay={300} />{/if}
        <div class="answer">
          <button class="btn decline" onclick={() => (arcadeLocal.closed = m.id)}>Close</button>
          <button class="btn primary accept" disabled={busy} onclick={() => act('rematch', { match: m.id })}><RotateCcw size={18} /> Rematch</button>
        </div>
        {#if economy && m.stake > 0}<span class="faint small">A rematch is the same game, the same bet of <Money amount={m.stake} /></span>{/if}
      </div>
    </div>
  {/if}
{:else if received}
  <div class="screen">
    <div class="col" in:fly={{ y: 24, duration: 300 }}>
      <span class="eyebrow center"><Swords size={14} /> Arcade challenge</span>
      <Versus left={received.from} right={meAsPlayer} leftLabel="Challenger" rightLabel="You" />
      {@render gameList(received.games, received.mix)}
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
      {@render gameList(sent.games, sent.mix)}
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
  .games-list {
    display: grid;
    gap: 0.5rem;
    width: 100%;
  }
  .mix-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius-sm);
    background: var(--g);
    color: #fff;
    text-align: left;
  }
  .chip-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.22);
  }
  .chip-text {
    display: grid;
    font-size: 0.8rem;
    line-height: 1.25;
  }
  .chip-text strong {
    font-size: 0.95rem;
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
  .poster {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    width: 100%;
    padding: 1.6rem 1rem 1.3rem;
    border-radius: var(--radius);
    background: var(--g);
    color: #fff;
    box-shadow: 0 16px 40px -20px rgba(0, 0, 0, 0.8);
  }
  .poster-icon {
    display: grid;
    place-items: center;
    width: 4.4rem;
    height: 4.4rem;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.22);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  .poster h1 {
    margin: 0.3rem 0 0;
    font-family: var(--font-display);
    font-size: 1.9rem;
  }
  .poster p {
    margin: 0;
    opacity: 0.9;
    font-size: 0.9rem;
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
