<script lang="ts">
  import { Check, Swords, Users, X } from '@lucide/svelte';
  import { fade } from 'svelte/transition';
  import { gameInfo } from '$shared/games.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { GAME_ICONS, Now, gamesState, local, myMatch, secondsLeft } from './store.svelte.ts';
  import { GAME_UI } from './registry.ts';

  /** Everything a phone shows for games: challenges, the room lobby, the game itself, the result */
  const s = $derived(gamesState());
  const me = $derived(hb.me?.id ?? '');
  const m = $derived(s?.match ?? null);
  const inMatch = $derived(!!myMatch());
  const received = $derived(s?.invites.find((i) => i.to.id === me));
  const sent = $derived(s?.invites.find((i) => i.from.id === me));
  const economy = $derived(!!hb.core?.economyEnabled);
  const now = new Now(250);
  let busy = $state(false);

  async function act(method: string, args?: unknown) {
    busy = true;
    await attempt(() => rpc('games', method, args));
    busy = false;
  }
</script>

{#if m && inMatch}
  {@const info = gameInfo(m.game)}
  {@const Icon = GAME_ICONS[m.game]}
  <div class="screen">
    <div class="bar">
      <span class="tag"><Icon size={16} /> {info?.name}</span>
      {#if economy && m.pot > 0}<span class="pill">Pot <Money amount={m.pot} /></span>{/if}
    </div>

    {#if m.phase === 'lobby'}
      <div class="center" in:fade>
        <span class="eyebrow">You are in</span>
        <h1>{info?.name}</h1>
        <p class="dim">{m.players.length} {m.players.length === 1 ? 'player' : 'players'} so far. Starts in {secondsLeft(m.endsAt, now.value)}s.</p>
        <div class="faces">
          {#each m.players as p (p.id)}<Avatar name={p.name} color={p.color} id={p.id} size="2.4rem" />{/each}
        </div>
        {#if m.starter?.id === me}
          <button class="btn primary big" disabled={busy || m.players.length < 2} onclick={() => act('begin')}>Start now</button>
          {#if m.players.length < 2}<p class="faint small">Waiting for at least one more player.</p>{/if}
          <button class="btn ghost" disabled={busy} onclick={() => act('leave')}>Cancel the game</button>
        {:else}
          <button class="btn ghost" disabled={busy} onclick={() => act('leave')}>Leave</button>
        {/if}
      </div>
    {:else if m.phase === 'intro'}
      <div class="center" in:fade>
        <span class="eyebrow">Get ready</span>
        <h1>{info?.name}</h1>
        <p class="dim rules">{info?.rules}</p>
        <span class="count mono">{secondsLeft(m.endsAt, now.value)}</span>
      </div>
    {:else if m.phase === 'play'}
      {@const Game = GAME_UI[m.game].phone}
      <Game {m} />
    {:else if m.result}
      {@const r = m.result}
      {@const won = r.winners.includes(me)}
      {@const line = r.lines.find((l) => l.id === me)}
      <div class="center" in:fade>
        <span class="eyebrow">{r.headline}</span>
        <h1 class:won>{won ? (r.winners.length > 1 ? 'Shared win' : 'You won!') : 'Not this time'}</h1>
        {#if line}<p class="mine mono">{line.label}</p>{#if line.detail}<p class="dim">{line.detail}</p>{/if}{/if}
        {#if economy && r.payouts[me] > 0}<p class="gain"><Money amount={r.payouts[me]} sign /></p>{/if}
        <button class="btn block close" onclick={() => (local.closed = m.id)}>Close</button>
      </div>
    {/if}
  </div>
{:else if received}
  {@const info = gameInfo(received.game)}
  {@const Icon = GAME_ICONS[received.game]}
  <div class="screen">
    <div class="center" in:fade>
      <Avatar name={received.from.name} color={received.from.color} id={received.from.id} size="5rem" />
      <span class="eyebrow"><Swords size={14} /> Challenge</span>
      <h1>{received.from.name} challenges you</h1>
      <p class="game"><Icon size={20} /> {info?.name}</p>
      <p class="dim rules">{info?.rules}</p>
      {#if received.side}<p>They picked <strong>{received.side}</strong>, you get <strong>{received.side === 'heads' ? 'tails' : 'heads'}</strong>.</p>{/if}
      {#if economy && received.stake > 0}
        <p class="stake">You both put in <Money amount={received.stake} />, the winner takes <Money amount={received.stake * 2} />.</p>
      {/if}
      <div class="answer">
        <button class="btn" disabled={busy} onclick={() => act('respond', { id: received.id, accept: false })}><X size={18} /> Decline</button>
        <button class="btn primary" disabled={busy} onclick={() => act('respond', { id: received.id, accept: true })}><Check size={18} /> Accept</button>
      </div>
      <p class="faint small">Expires in {secondsLeft(received.expiresAt, now.value)}s</p>
    </div>
  </div>
{:else if sent}
  {@const info = gameInfo(sent.game)}
  <div class="screen">
    <div class="center" in:fade>
      <Avatar name={sent.to.name} color={sent.to.color} id={sent.to.id} size="5rem" />
      <span class="eyebrow">{info?.name}</span>
      <h1>Waiting for {sent.to.name}</h1>
      <p class="dim">They have {secondsLeft(sent.expiresAt, now.value)}s to accept.{#if m}{' A game is on the TV, the duel starts once it is over.'}{/if}</p>
      <button class="btn ghost" disabled={busy} onclick={() => act('cancelInvite', { id: sent.id })}>Cancel the challenge</button>
    </div>
  </div>
{:else if m && m.mode === 'room' && m.phase === 'lobby'}
  {@const info = gameInfo(m.game)}
  {@const Icon = GAME_ICONS[m.game]}
  <div class="screen">
    <div class="center" in:fade>
      <span class="icon"><Icon size={34} /></span>
      <span class="eyebrow"><Users size={14} /> {m.starter ? `${m.starter.name} started a game` : 'Game on the TV'}</span>
      <h1>{info?.name}</h1>
      <p class="dim rules">{info?.rules}</p>
      {#if economy && m.stake > 0}<p class="stake">Entry <Money amount={m.stake} />, the winner takes the pot.</p>{/if}
      <p class="faint">{m.players.length} in so far. Starts in {secondsLeft(m.endsAt, now.value)}s.</p>
      <button class="btn primary big" disabled={busy} onclick={() => act('join')}>Join</button>
      <button class="btn ghost" onclick={() => (local.skipped = m.id)}>Not this time</button>
    </div>
  </div>
{/if}

<style>
  .screen {
    min-height: calc(100dvh - 6rem);
    display: grid;
    align-content: center;
    gap: 1rem;
    padding-bottom: 1rem;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  .center {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 0.8rem;
    padding: 1.5rem 0.25rem;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  h1 {
    font-size: 1.9rem;
    line-height: 1.15;
  }
  h1.won {
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 4.2rem;
    height: 4.2rem;
    border-radius: 1.3rem;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }
  .game {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 700;
    font-size: 1.15rem;
    color: var(--accent);
  }
  .rules {
    font-size: 0.92rem;
    max-width: 24rem;
  }
  .stake {
    font-size: 0.95rem;
  }
  .faces {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.4rem;
  }
  .big {
    min-height: 3.4rem;
    padding: 0 2.4rem;
    font-size: 1.1rem;
    margin-top: 0.4rem;
  }
  .answer {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
    width: 100%;
    margin-top: 0.4rem;
  }
  .answer .btn {
    min-height: 3.3rem;
  }
  .count {
    font-size: 5rem;
    font-weight: 700;
    line-height: 1;
  }
  .mine {
    font-size: 2.2rem;
    font-weight: 700;
  }
  .gain {
    font-size: 1.6rem;
    color: var(--success);
  }
  .close {
    margin-top: 1rem;
  }
  .small {
    font-size: 0.8rem;
  }
</style>
