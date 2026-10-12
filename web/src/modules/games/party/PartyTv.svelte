<script lang="ts">
  import { Check } from '@lucide/svelte';
  import { fade, fly } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import { partyMini, type PartyView } from '$shared/party.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Ring from '../../quiz/Ring.svelte';
  import RulesPoster from '../tv/RulesPoster.svelte';
  import { PARTY_UI, ordinal } from './minis.ts';

  /**
   * Light Party on the TV: the lineup, each mini game's rules with who is ready, the mini game itself (its
   * own screen, see minis.ts), its results with the standings, and the mini games of the party at the bottom.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as PartyView | null);
  const info = $derived(v ? partyMini(v.lineup[v.index]) : undefined);
  const nameOf = (id: string) => m.players.find((p) => p.id === id);
  const standings = $derived(v ? [...m.players].sort((a, b) => (v.totals[b.id] ?? 0) - (v.totals[a.id] ?? 0)) : []);
</script>

{#if v && info}
  {@const ui = PARTY_UI[info.id]}
  <div class="party" style:--g1={info.colors[0]} style:--g2={info.colors[1]}>
    {#if v.step === 'lineup'}
      <div class="lineup" in:fade>
        <span class="kicker">Tonight's lineup</span>
        <div class="cards">
          {#each v.lineup as id, i (id)}
            {@const g = partyMini(id)!}
            {@const GIcon = PARTY_UI[id].icon}
            <div class="card-mini" style:--g1={g.colors[0]} style:--g2={g.colors[1]} in:fly={{ y: 60, delay: 600 + i * 900, duration: 600 }}>
              <span class="num mono">{i + 1}</span>
              <span class="tile"><GIcon size="3.4rem" /></span>
              <strong>{g.name}</strong>
              <span class="dim">{g.tagline}</span>
            </div>
          {/each}
        </div>
      </div>
    {:else if v.step === 'rules'}
      <div class="rules" in:fade>
        <RulesPoster game={info} icon={ui.icon} eyebrow={`Game ${v.index + 1} of ${v.lineup.length}`} />
        <div class="bottom">
          <div class="ready-list">
            <p class="join">{v.ready.length} of {m.players.length} ready: tap <strong>Got it</strong> on your phone</p>
            <div class="chips">
              {#each m.players as p (p.id)}
                {@const ready = v.ready.includes(p.id)}
                <span class="player" class:ready><Avatar name={p.name} color={p.color} id={p.id} size="2.4rem" />{p.name}{#if ready}<Check size="1.2rem" strokeWidth={3} class="tick" />{/if}</span>
              {/each}
            </div>
          </div>
          {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="8rem" />{/if}
        </div>
      </div>
    {:else if v.step === 'play' && v.mini}
      <div class="stage">
        {#key v.index}<ui.tv {m} {v} />{/key}
      </div>
    {:else if v.step === 'score' && v.lines}
      <div class="score-screen" in:fade>
        <div class="col">
          <span class="kicker"><ui.icon size="1.4rem" /> {info.name}: results</span>
          <ol class="lines">
            {#each v.lines as l, i (l.id)}
              {@const p = nameOf(l.id)}
              {#if p}
                <li class="card" class:first={l.place === 1} in:fly={{ x: -40, delay: 200 + i * 150 }}>
                  <span class="rank mono">{l.place ? ordinal(l.place) : '-'}</span>
                  <Avatar name={p.name} color={p.color} id={p.id} size="2.8rem" />
                  <strong class="truncate who">{p.name}</strong>
                  <span class="dim label">{l.label}</span>
                  <span class="gain mono">+{l.points}</span>
                </li>
              {/if}
            {/each}
          </ol>
        </div>
        <div class="col standings">
          <span class="kicker">Standings{v.index + 1 < v.lineup.length ? ` · next: ${partyMini(v.lineup[v.index + 1])?.name}` : ' · final'}</span>
          <ol class="lines">
            {#each standings as p, i (p.id)}
              <li class="card" in:fly={{ x: 40, delay: 800 + i * 120 }}>
                <span class="rank mono">{i + 1}</span>
                <Avatar name={p.name} color={p.color} id={p.id} size="2.4rem" />
                <strong class="truncate who">{p.name}</strong>
                <span class="total mono">{v.totals[p.id] ?? 0} pts</span>
              </li>
            {/each}
          </ol>
        </div>
      </div>
    {/if}

    {#if v.step !== 'lineup'}
      <div class="track">
        {#each v.lineup as id, i (id)}
          {@const g = partyMini(id)!}
          {@const GIcon = PARTY_UI[id].icon}
          <span class="leg" class:on={i === v.index} class:past={i < v.index} style:--g1={g.colors[0]} style:--g2={g.colors[1]}><GIcon size="1.1rem" /> {g.name}</span>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .party {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 1.2rem;
  }
  .kicker {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-display);
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  /* Lineup */
  .lineup {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 2.5rem;
  }
  .cards {
    display: flex;
    gap: 2rem;
    justify-content: center;
  }
  .card-mini {
    position: relative;
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 0.8rem;
    width: 22rem;
    padding: 2.4rem 1.6rem 2rem;
    border-radius: 2rem;
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--g1) 40%, var(--border));
    box-shadow: 0 2.5rem 5rem -3rem var(--g1);
  }
  .card-mini strong {
    font-size: 2rem;
  }
  .card-mini .dim {
    font-size: 1.2rem;
  }
  .num {
    position: absolute;
    top: 1rem;
    left: 1.2rem;
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--text-faint);
  }
  .tile {
    display: grid;
    place-items: center;
    width: 6.5rem;
    height: 6.5rem;
    border-radius: 1.8rem;
    background: linear-gradient(135deg, var(--g1), var(--g2));
    color: #fff;
  }

  /* Rules */
  .rules {
    min-height: 0;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1.6rem;
  }
  .bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 3rem;
  }
  .ready-list {
    display: grid;
    gap: 1rem;
  }
  .join {
    font-size: 1.7rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
  }
  .player {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 1.1rem 0.3rem 0.3rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 1.2rem;
    font-weight: 600;
  }
  .player.ready {
    border-color: var(--success);
  }
  .player :global(.tick) {
    color: var(--success);
  }

  .stage {
    min-height: 0;
    display: grid;
  }

  /* Score */
  .score-screen {
    min-height: 0;
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    gap: 3rem;
    align-items: center;
  }
  .col {
    display: grid;
    gap: 1.2rem;
  }
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.7rem;
  }
  .lines li {
    display: flex;
    align-items: center;
    gap: 1.1rem;
    padding: 0.6rem 1.4rem 0.6rem 0.8rem;
    font-size: 1.4rem;
  }
  .lines li.first {
    border-color: var(--coin);
    box-shadow: 0 0 3rem -1rem var(--coin);
  }
  .rank {
    width: 3rem;
    text-align: center;
    color: var(--text-faint);
    font-weight: 700;
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  .label {
    font-size: 1.2rem;
  }
  .gain {
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--success);
    min-width: 3rem;
    text-align: right;
  }
  .total {
    font-size: 1.6rem;
    font-weight: 700;
  }

  /* The mini games of the party, at the bottom */
  .track {
    display: flex;
    justify-content: center;
    gap: 0.8rem;
  }
  .leg {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 1.1rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--text-faint);
    font-weight: 600;
    font-size: 1.05rem;
  }
  .leg.past {
    color: var(--text-dim);
  }
  .leg.on {
    border-color: transparent;
    background: linear-gradient(120deg, var(--g1), var(--g2));
    color: #fff;
  }
</style>
