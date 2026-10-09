<script lang="ts">
  import { Check, Crown } from '@lucide/svelte';
  import { fade, scale } from 'svelte/transition';
  import { formationName, gameInfo } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Ring from '../quiz/Ring.svelte';
  import { GAME_ICONS, gamesState } from './store.svelte.ts';
  import { GAME_UI } from './registry.ts';
  import RulesPoster from './tv/RulesPoster.svelte';

  const m = $derived(gamesState()?.match ?? null);
  const info = $derived(m ? gameInfo(m.game) : undefined);
  const ui = $derived(m ? GAME_UI[m.game] : undefined);
  const economy = $derived(!!hb.core?.economyEnabled);
  const nameOf = (id: string) => m?.players.find((p) => p.id === id);
</script>

{#if m && info && ui}
  {@const Icon = GAME_ICONS[m.game]}
  {@const Game = ui.tv}
  <div class="games">
    <header>
      <span class="brand">{m.mode === 'duel' ? 'Duel' : 'Party game'}</span>
      <span class="name"><Icon size="1.4rem" /> {info.name}</span>
      <span class="spacer"></span>
      {#if economy && m.pot + m.prize > 0}<span class="pill pot">{m.mode === 'room' ? 'Winner takes' : 'Pot'} <Money amount={m.pot + m.prize} /></span>{/if}
    </header>

    {#if m.phase === 'lobby'}
      <div class="screen" in:fade>
        <RulesPoster game={info} eyebrow={m.starter ? `${m.starter.name} started a game` : 'Game time'} />
        <div class="bottom">
          <div class="join-box">
            <p class="join">
              Tap <strong>Join</strong> on your phone{#if economy && m.stake > 0}<span>{' (entry '}</span><Money amount={m.stake} /><span>)</span>{/if}.
              {#if m.game === 'pirates' && m.players.length >= 2}<span class="prize crews">Crews: {formationName(m.players.length)}</span>{/if}
              {#if economy && m.prize > 0}<span class="prize">Prize <Money amount={m.prize} />{m.stake > 0 ? ' + the pot' : ''}</span>{/if}
            </p>
            <div class="players">
              {#each m.players as p (p.id)}
                <span class="player" in:scale><Avatar name={p.name} color={p.color} id={p.id} size="2.6rem" />{p.name}</span>
              {/each}
            </div>
          </div>
          {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="9rem" />{/if}
        </div>
      </div>
    {:else if m.phase === 'intro'}
      {@const allReady = m.ready.length >= m.players.length}
      <div class="screen" in:fade>
        <RulesPoster game={info} eyebrow={m.mode === 'duel' ? 'Duel' : 'Read the rules on your phone'} />
        <div class="bottom">
          {#if m.mode === 'duel'}
            <div class="versus">
              {#each m.players as p, i (p.id)}
                {@const ready = m.ready.includes(p.id)}
                <div class="fighter" class:ready in:scale={{ delay: i * 300, start: 0.6 }}>
                  <span class="face">
                    <Avatar name={p.name} color={p.color} id={p.id} size="6.5rem" />
                    {#if ready}<span class="check" in:scale={{ start: 0.3 }}><Check size="1.6rem" strokeWidth={3} /></span>{/if}
                  </span>
                  <strong>{p.name}</strong>
                  <span class="state">{ready ? 'Ready' : 'Reading...'}</span>
                </div>
                {#if i === 0}<span class="vs">VS</span>{/if}
              {/each}
            </div>
          {:else}
            <div class="join-box">
              <p class="join">{m.ready.length} of {m.players.length} ready</p>
              <div class="players">
                {#each m.players as p (p.id)}
                  {@const ready = m.ready.includes(p.id)}
                  <span class="player" class:ready>
                    <Avatar name={p.name} color={p.color} id={p.id} size="2.6rem" />{p.name}
                    {#if ready}<Check size="1.3rem" strokeWidth={3} class="tick" />{/if}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
          <div class="timer">
            {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="9rem" />{/if}
            <span class="dim">{allReady ? 'Everyone is ready!' : 'Starts when everyone is ready'}</span>
          </div>
        </div>
      </div>
    {:else if Game && (m.phase === 'play' || (m.result && ui.tvResult))}
      <!-- One block for both, so the game's screen stays mounted into its result instead of replaying its reveal -->
      <div class="stage"><Game {m} /></div>
    {:else if m.result}
      {@const r = m.result}
      <div class="result" in:fade>
        <h1 class="big headline">{r.headline}</h1>
        <ol class="lines">
          {#each r.lines as line, i (line.id)}
            {@const p = nameOf(line.id)}
            {@const won = r.winners.includes(line.id)}
            {#if p}
              <li class="card" class:won in:scale={{ delay: 300 + i * 150, start: 0.9 }}>
                <span class="rank mono">{i + 1}</span>
                <Avatar name={p.name} color={p.color} id={p.id} size="3.2rem" />
                <span class="who">
                  <strong class="truncate">{p.name}</strong>
                  {#if line.detail}<span class="dim">{line.detail}</span>{/if}
                </span>
                {#if won}<Crown size="1.8rem" class="crown" />{/if}
                <span class="mono label">{line.label}</span>
                {#if economy && r.payouts[line.id] > 0}<span class="gain"><Money amount={r.payouts[line.id]} sign /></span>{/if}
              </li>
            {/if}
          {/each}
        </ol>
      </div>
    {/if}
  </div>
{/if}

<style>
  .games {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1.5rem;
    padding: 2rem 2.5rem 2.5rem;
  }
  header {
    display: flex;
    align-items: center;
    gap: 1.2rem;
  }
  .brand {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.6rem;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.3rem;
    color: var(--text-dim);
    font-weight: 600;
  }
  .pot {
    font-size: 1.3rem;
    padding: 0.35em 1em;
  }
  .stage {
    min-height: 0;
    display: grid;
  }
  .big {
    font-size: 5.5rem;
    letter-spacing: -0.04em;
  }
  .screen {
    min-height: 0;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 2rem;
  }
  .bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 3rem;
    min-height: 0;
  }
  .join-box {
    display: grid;
    gap: 1rem;
  }
  .join {
    font-size: 1.8rem;
  }
  .prize {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: 0.6rem;
    padding: 0.2rem 0.9rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--coin) 16%, transparent);
    color: var(--coin);
    font-weight: 700;
  }
  .crews {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
  }
  .player {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 1.1rem 0.35rem 0.35rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 1.25rem;
    font-weight: 600;
    transition: border-color 0.3s ease;
  }
  .player.ready {
    border-color: var(--success);
  }
  .player :global(.tick) {
    color: var(--success);
  }
  .versus {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4rem;
  }
  .fighter {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    font-size: 2rem;
  }
  .face {
    position: relative;
  }
  .check {
    position: absolute;
    right: -0.3rem;
    bottom: -0.3rem;
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
    background: var(--success);
    color: #fff;
    box-shadow: 0 0 0 0.3rem var(--bg);
  }
  .state {
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .ready .state {
    color: var(--success);
  }
  .vs {
    font-family: var(--font-display);
    font-size: 5rem;
    font-weight: 700;
    font-style: italic;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;    /* The gradient only paints inside the box: room for the italic overhang */
    padding: 0 0.15em;
  }
  .timer {
    display: grid;
    justify-items: center;
    gap: 0.8rem;
    font-size: 2.2rem;
  }
  .timer .dim {
    font-size: 1.2rem;
  }
  .result {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 2.5rem;
  }
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.8rem;
    width: min(64rem, 100%);
  }
  .lines li {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 0.8rem 1.6rem 0.8rem 1rem;
    font-size: 1.4rem;
  }
  .lines li.won {
    border-color: var(--coin);
    box-shadow: 0 0 3rem -1rem var(--coin);
  }
  .rank {
    width: 2rem;
    text-align: center;
    color: var(--text-faint);
    font-weight: 700;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .who .dim {
    font-size: 1.05rem;
  }
  .lines :global(.crown) {
    color: var(--coin);
  }
  .label {
    font-size: 2rem;
    font-weight: 700;
  }
  .gain {
    font-size: 1.4rem;
    color: var(--success);
  }
</style>
