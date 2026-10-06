<script lang="ts">
  import { Crown } from '@lucide/svelte';
  import { fade, scale } from 'svelte/transition';
  import { gameInfo } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Ring from '../quiz/Ring.svelte';
  import { GAME_ICONS, gamesState } from './store.svelte.ts';
  import { GAME_UI } from './registry.ts';

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
      {#if economy && m.pot > 0}<span class="pill pot">Pot <Money amount={m.pot} /></span>{/if}
    </header>

    {#if m.phase === 'lobby'}
      <div class="lobby" in:fade>
        <div class="intro">
          <span class="eyebrow">{m.starter ? `${m.starter.name} started a game` : 'Game time'}</span>
          <h1 class="big">{info.name}</h1>
          <p class="dim lead">{info.rules}</p>
          <p class="join">
            Tap <strong>Join</strong> on your phone{#if economy && m.stake > 0}<span>{' (entry '}</span><Money amount={m.stake} /><span>, winner takes the pot)</span>{/if}.
          </p>
          <div class="players">
            {#each m.players as p (p.id)}
              <span class="player" in:scale><Avatar name={p.name} color={p.color} id={p.id} size="2.6rem" />{p.name}</span>
            {/each}
          </div>
        </div>
        {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="11rem" />{/if}
      </div>
    {:else if m.phase === 'intro'}
      <div class="intro-screen" in:fade>
        {#if m.mode === 'duel'}
          <div class="versus">
            {#each m.players as p, i (p.id)}
              <div class="fighter" in:scale={{ delay: i * 300, start: 0.6 }}>
                <Avatar name={p.name} color={p.color} id={p.id} size="12rem" />
                <strong>{p.name}</strong>
              </div>
              {#if i === 0}<span class="vs">VS</span>{/if}
            {/each}
          </div>
        {:else}
          <h1 class="big">{info.name}</h1>
          <div class="players center">
            {#each m.players as p (p.id)}
              <span class="player"><Avatar name={p.name} color={p.color} id={p.id} size="2.6rem" />{p.name}</span>
            {/each}
          </div>
        {/if}
        <p class="dim lead rules">{info.rules}</p>
        {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="7rem" />{/if}
      </div>
    {:else if m.phase === 'play'}
      <div class="stage"><Game {m} /></div>
    {:else if m.result}
      {@const r = m.result}
      {#if ui.tvResult}
        <div class="stage"><Game {m} /></div>
      {:else}
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
  .lead {
    font-size: 1.6rem;
    max-width: 60rem;
  }
  .lobby {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3rem;
    align-items: center;
  }
  .intro {
    display: grid;
    gap: 1.2rem;
  }
  .join {
    font-size: 1.6rem;
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    margin-top: 0.8rem;
  }
  .players.center {
    justify-content: center;
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
  }
  .intro-screen {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 2rem;
    text-align: center;
  }
  .versus {
    display: flex;
    align-items: center;
    gap: 5rem;
  }
  .fighter {
    display: grid;
    justify-items: center;
    gap: 1rem;
    font-size: 2.6rem;
  }
  .vs {
    font-family: var(--font-display);
    font-size: 7rem;
    font-weight: 700;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .rules {
    max-width: 56rem;
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
