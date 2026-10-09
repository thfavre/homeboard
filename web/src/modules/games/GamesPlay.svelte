<script lang="ts">
  import { Check, Crown, Play, Swords, X } from '@lucide/svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { DUEL_INVITE_MS, formationName, gameInfo, rhythmDifficulty, type GamePlayer } from '$shared/games.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { Now, gamesState, local, myMatch, secondsLeft } from './store.svelte.ts';
  import { GAME_UI } from './registry.ts';
  import GameCard from './ui/GameCard.svelte';
  import Versus from './ui/Versus.svelte';
  import PotPanel from './ui/PotPanel.svelte';
  import Fuse from './ui/Fuse.svelte';
  import PerkPanel from './perk/PerkPanel.svelte';

  /** Everything a phone shows for games: challenges, the room lobby, the game itself, the result */
  const s = $derived(gamesState());
  const me = $derived(hb.me?.id ?? '');
  const meAsPlayer = $derived<GamePlayer>({ id: me, name: hb.me?.name ?? '', color: hb.me?.color ?? '#888' });
  const m = $derived(s?.match ?? null);
  const inMatch = $derived(!!myMatch());
  const received = $derived(s?.invites.find((i) => i.to.id === me));
  const sent = $derived(s?.invites.find((i) => i.from.id === me));
  const economy = $derived(!!hb.core?.economyEnabled);
  const myPerk = $derived(s?.perk?.guest.id === me ? s.perk : null);
  const now = new Now(250);
  let busy = $state(false);

  async function act(method: string, args?: unknown) {
    busy = true;
    await attempt(() => rpc('games', method, args));
    busy = false;
  }
</script>

{#snippet faces(players: GamePlayer[])}
  <div class="faces">
    <div class="stack">
      {#each players.slice(0, 7) as p (p.id)}
        <span class="face" in:scale={{ start: 0.5 }}><Avatar name={p.name} color={p.color} id={p.id} size="2.3rem" /></span>
      {/each}
    </div>
    <span class="dim">{players.length === 1 ? '1 player' : `${players.length} players`}{players.length > 7 ? ` (${players.slice(7).length} more)` : ''}</span>
  </div>
{/snippet}

{#if myPerk && !(m && inMatch && m.phase !== 'result')}
  <!-- The winner's prize, from the result on: one place, so it stays put when the game closes (a finger may be on it) -->
  <div class="screen"><div class="col"><PerkPanel perk={myPerk} /></div></div>
{:else if m && inMatch}
  {@const info = gameInfo(m.game)!}
  <div class="screen" class:fill={m.phase === 'play' && GAME_UI[m.game].fill}>
    {#if m.phase === 'lobby'}
      <div class="col" in:fade>
        <GameCard game={info} eyebrow="You are in" />
        {#if economy && (m.stake > 0 || m.prize > 0)}<PotPanel inLabel="Your entry" stake={m.stake} outLabel="Winner takes" pot={m.pot + m.prize} />{/if}
        {@render faces(m.players)}
        {#if m.game === 'pirates' && m.players.length >= 2}<p class="dim note">Crews right now: {formationName(m.players.length)} · up to {info.maxPlayers} players</p>{/if}
        {#if m.endsAt}
          <Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label={m.players.length < 2 ? 'Needs 2 players, cancelled in' : 'Starts in'} />
        {/if}
        {#if m.starter?.id === me}
          <button class="btn primary block big" disabled={busy || m.players.length < 2} onclick={() => act('begin')}><Play size={20} /> Start now</button>
          <button class="btn ghost block" disabled={busy} onclick={() => act('leave')}>Cancel the game</button>
        {:else}
          <button class="btn ghost block" disabled={busy} onclick={() => act('leave')}>Leave</button>
        {/if}
      </div>
    {:else if m.phase === 'intro'}
      {@const allReady = m.ready.length >= m.players.length}
      {@const imReady = m.ready.includes(me)}
      <div class="col" in:fade>
        {#if m.mode === 'duel'}
          <Versus
            left={m.players[0]}
            right={m.players[1]}
            leftLabel={m.ready.includes(m.players[0].id) ? 'Ready' : 'Reading...'}
            rightLabel={m.ready.includes(m.players[1].id) ? 'Ready' : 'Reading...'}
          />
        {/if}
        <GameCard game={info} eyebrow="Read the rules" />
        {#if allReady}
          <div class="count-wrap">
            {#key secondsLeft(m.endsAt, now.value)}
              <span class="count mono" in:scale={{ start: 1.6, duration: 300 }}>{secondsLeft(m.endsAt, now.value)}</span>
            {/key}
          </div>
        {:else}
          {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Starts anyway in" />{/if}
          {#if imReady}
            <div class="ready-note"><Check size={20} /> Ready. Waiting for {m.players.length - m.ready.length === 1 ? m.players.find((p) => !m.ready.includes(p.id))?.name : 'the others'}...</div>
          {:else}
            <button class="btn primary block big" disabled={busy} onclick={() => act('ready')}><Check size={20} /> I'm ready</button>
          {/if}
          {#if m.mode === 'room'}<p class="faint note">{m.ready.length} of {m.players.length} ready</p>{/if}
        {/if}
      </div>
    {:else if m.phase === 'play'}
      {@const Game = GAME_UI[m.game].phone}
      <Game {m} />
    {:else if m.result}
      {@const r = m.result}
      {@const won = r.winners.includes(me)}
      {@const line = r.lines.find((l) => l.id === me)}
      <div class="col result" class:won style:--g1={info.colors[0]} style:--g2={info.colors[1]} in:fade>
        <div class="medal" in:scale={{ start: 0.4, duration: 500 }}>
          {#if won}<Crown size={46} />{:else}<Avatar name={hb.me?.name ?? ''} color={hb.me?.color ?? '#888'} src={hb.me?.avatar} size="5.5rem" />{/if}
        </div>
        <span class="eyebrow">{r.headline}</span>
        <h1>{m.mode === 'solo' ? 'Well played!' : won ? (r.winners.length > 1 ? 'Shared win' : 'You won!') : 'Not this time'}</h1>
        {#if line}
          <div class="stat">
            <span class="mono">{line.label}</span>
            {#if line.detail}<span class="dim">{line.detail}</span>{/if}
          </div>
        {/if}
        {#if economy && r.payouts[me] > 0}<p class="gain" in:fly={{ y: 12, delay: 300 }}><Money amount={r.payouts[me]} sign /></p>{/if}
        <button class="btn block close" onclick={() => (local.closed = m.id)}>Close</button>
      </div>
    {/if}
  </div>

{:else if received}
  {@const info = gameInfo(received.game)!}
  <div class="screen">
    <div class="col" in:fly={{ y: 24, duration: 300 }}>
      <span class="eyebrow center"><Swords size={14} /> You are challenged</span>
      <Versus left={received.from} right={meAsPlayer} leftLabel="Challenger" rightLabel="You" />
      <GameCard game={info} />
      {#if received.chart}
        <p class="dim note">
          {rhythmDifficulty(received.chart).name}, {received.colors === 1 ? '1 color' : `${received.colors} colors`}: {rhythmDifficulty(received.chart).help}
          {#if received.song}Played on {received.song.artist ? `${received.song.artist} - ` : ''}{received.song.title}.{/if}
        </p>
      {/if}
      {#if economy && received.stake > 0}<PotPanel inLabel="You put in" stake={received.stake} outLabel="Winner takes" pot={received.stake * 2} />{/if}
      <div class="answer">
        <button class="btn decline" disabled={busy} onclick={() => act('respond', { id: received.id, accept: false })}><X size={20} /> Decline</button>
        <button class="btn primary accept" disabled={busy} onclick={() => act('respond', { id: received.id, accept: true })}><Check size={20} /> Accept</button>
      </div>
      <Fuse endsAt={received.expiresAt} totalMs={DUEL_INVITE_MS} label="Expires in" />
    </div>
  </div>
{:else if sent}
  {@const info = gameInfo(sent.game)!}
  <div class="screen">
    <div class="col" in:fly={{ y: 24, duration: 300 }}>
      <span class="eyebrow center"><Swords size={14} /> Challenge sent</span>
      <Versus left={meAsPlayer} right={sent.to} leftLabel="You" rightLabel="Thinking..." waiting />
      <GameCard game={info} steps={false} />
      {#if economy && sent.stake > 0}<PotPanel inLabel="You put in" stake={sent.stake} outLabel="Winner takes" pot={sent.stake * 2} />{/if}
      <Fuse endsAt={sent.expiresAt} totalMs={DUEL_INVITE_MS} label={`Waiting for ${sent.to.name}`} />
      {#if m}<p class="faint note">A game is on the TV: your duel starts once it is over.</p>{/if}
      <button class="btn ghost block" disabled={busy} onclick={() => act('cancelInvite', { id: sent.id })}>Cancel the challenge</button>
      {#if economy}<p class="faint note">You get everything back if they decline, do not answer, or you cancel.</p>{/if}
    </div>
  </div>
{:else if m && m.mode === 'room' && m.phase === 'lobby'}
  {@const info = gameInfo(m.game)!}
  <div class="screen">
    <div class="col" in:fly={{ y: 24, duration: 300 }}>
      <GameCard game={info} eyebrow={m.starter ? `${m.starter.name} started a game` : 'Game on the TV'} />
      {#if economy && (m.stake > 0 || m.prize > 0)}<PotPanel inLabel="Entry" stake={m.stake} outLabel="Winner takes" pot={m.pot + m.prize} />{/if}
      {@render faces(m.players)}
      {#if m.game === 'pirates' && m.players.length >= 2}<p class="dim note">Crews right now: {formationName(m.players.length)} · up to {info.maxPlayers} players</p>{/if}
      {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Join closes in" />{/if}
      <button class="btn primary block big" disabled={busy} onclick={() => act('join')}><Play size={20} /> Join</button>
      <button class="btn ghost block" onclick={() => (local.skipped = m.id)}>Not this time</button>
    </div>
  </div>
{/if}

<style>
  .screen {
    display: grid;
    align-content: center;
    gap: 1rem;
  }
  .screen.fill {
    align-content: stretch;
  }
  .col {
    display: grid;
    justify-items: center;
    gap: 1rem;
    padding: 0.5rem 0;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .faces {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  .stack {
    display: flex;
  }
  .face {
    margin-left: -0.55rem;
    border-radius: 50%;
    box-shadow: 0 0 0 3px var(--bg);
  }
  .face:first-child {
    margin-left: 0;
  }
  .faces .dim {
    font-size: 0.9rem;
    font-weight: 600;
  }
  .big {
    min-height: 3.5rem;
    font-size: 1.1rem;
    border-radius: var(--radius);
    background: var(--gradient);
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
  .note {
    font-size: 0.8rem;
    text-align: center;
  }
  .ready-note {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 3.5rem;
    padding: 0 1.4rem;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--success) 14%, transparent);
    color: var(--success);
    font-weight: 700;
  }
  .count-wrap {
    display: grid;
    place-items: center;
    height: 6rem;
  }
  .count {
    grid-area: 1 / 1;
    font-size: 5.5rem;
    font-weight: 700;
    line-height: 1;
  }
  .result {
    text-align: center;
    padding-top: 1.5rem;
  }
  .medal {
    display: grid;
    place-items: center;
    width: 6.5rem;
    height: 6.5rem;
    border-radius: 50%;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
  }
  .won .medal {
    background: linear-gradient(135deg, var(--coin), var(--coin-2));
    border: 0;
    color: #fff;
    box-shadow: 0 18px 50px -14px var(--coin);
  }
  h1 {
    font-size: 2.2rem;
    line-height: 1.1;
  }
  .won h1 {
    background: linear-gradient(135deg, var(--g1), var(--g2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .stat {
    display: grid;
    gap: 0.2rem;
    padding: 0.8rem 1.6rem;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .stat .mono {
    font-size: 1.8rem;
    font-weight: 700;
  }
  .gain {
    font-size: 1.8rem;
    color: var(--success);
  }
  .close {
    margin-top: 0.8rem;
  }
</style>
