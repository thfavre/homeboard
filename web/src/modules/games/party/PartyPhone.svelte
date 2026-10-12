<script lang="ts">
  import { Check } from '@lucide/svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import { partyMini, type PartyView } from '$shared/party.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import GameCard from '../ui/GameCard.svelte';
  import Fuse from '../ui/Fuse.svelte';
  import Locked from './ui/Locked.svelte';
  import { PARTY_UI, ordinal } from './minis.ts';

  /**
   * Light Party on a phone: the lineup, each mini game's rules with Got it, the mini game itself (its own
   * screen, see minis.ts) and its results with the standings.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as PartyView | null);
  const me = $derived(hb.me?.id ?? '');
  const info = $derived(v ? partyMini(v.lineup[v.index]) : undefined);
  let busy = $state(false);

  async function ready() {
    busy = true;
    await attempt(() => rpc('games', 'play', { action: 'ready' }));
    busy = false;
  }
</script>

{#if v && info}
  {@const ui = PARTY_UI[info.id]}
  <div class="party" style:--g1={info.colors[0]} style:--g2={info.colors[1]}>
    {#if v.step !== 'lineup'}
      <div class="progress">
        {#each v.lineup as id, i (id)}
          <span class="step" class:on={i === v.index} class:past={i < v.index}></span>
        {/each}
        <span class="eyebrow">Game {v.index + 1} of {v.lineup.length}</span>
        <span class="total mono">{v.totals[me] ?? 0} pts</span>
      </div>
    {/if}

    {#if v.step === 'lineup'}
      <div class="col" in:fade>
        <span class="eyebrow">Tonight's lineup</span>
        <h1>{v.lineup.length === 1 ? '1 mini game' : `${v.lineup.length} mini games`}</h1>
        <div class="lineup">
          {#each v.lineup as id, i (id)}
            {@const g = partyMini(id)!}
            {@const GIcon = PARTY_UI[id].icon}
            <div class="mini" style:--g1={g.colors[0]} style:--g2={g.colors[1]} in:fly={{ y: 20, delay: 300 + i * 250 }}>
              <span class="tile"><GIcon size={20} /></span>
              <span><strong>{g.name}</strong><span class="dim small">{g.tagline}</span></span>
            </div>
          {/each}
        </div>
        <p class="dim small">Look at the light strip, play on your phone.</p>
      </div>
    {:else if v.step === 'rules'}
      {@const allReady = v.ready.length >= m.players.length}
      <div class="col" in:fade>
        <GameCard game={info} icon={ui.icon} eyebrow={`Game ${v.index + 1}: the rules`} />
        {#if v.ready.includes(me)}
          <Locked text={allReady ? 'Everyone is ready' : 'Got it. Waiting for the others...'} />
        {:else}
          <button class="btn primary block big" disabled={busy} onclick={ready}><Check size={20} /> Got it</button>
        {/if}
        {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label={allReady ? 'Starting in' : 'Starts anyway in'} />{/if}
        {#if m.players.length > 2}<p class="faint small">{v.ready.length} of {m.players.length} ready</p>{/if}
      </div>
    {:else if v.step === 'play' && v.mini}
      <!-- A fresh screen for each mini game: nothing left over from the one before -->
      {#key v.index}
        <ui.phone {m} {v} />
      {/key}
    {:else if v.step === 'score' && v.lines}
      {@const line = v.lines.find((l) => l.id === me)}
      <div class="col" in:fade>
        <span class="tile big-tile"><ui.icon size={30} /></span>
        <span class="eyebrow">{info.name}</span>
        <h1>{line?.place ? `${ordinal(line.place)} place` : 'No result'}</h1>
        {#if line}<p class="dim">{line.label}</p>{/if}
        {#if line}<p class="gain mono" in:scale={{ start: 0.5, delay: 300 }}>+{line.points} pts</p>{/if}
        <ol class="board">
          {#each [...m.players].sort((a, b) => (v.totals[b.id] ?? 0) - (v.totals[a.id] ?? 0)) as p, i (p.id)}
            <li class:me={p.id === me}>
              <span class="faint mono">{i + 1}</span>
              <Avatar name={p.name} color={p.color} id={p.id} size="1.9rem" />
              <span class="truncate">{p.name}</span>
              <strong class="mono">{v.totals[p.id] ?? 0}</strong>
            </li>
          {/each}
        </ol>
        {#if v.index + 1 < v.lineup.length}<p class="dim small">Next: {partyMini(v.lineup[v.index + 1])?.name}</p>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .party {
    display: grid;
    gap: 1.1rem;
    min-height: 100%;
    align-content: start;
  }
  .progress {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .step {
    width: 1.4rem;
    height: 0.35rem;
    border-radius: 999px;
    background: var(--surface-3);
  }
  .step.past {
    background: var(--text-faint);
  }
  .step.on {
    background: linear-gradient(90deg, var(--g1), var(--g2));
  }
  .progress .eyebrow {
    margin-left: 0.5rem;
    flex: 1;
  }
  .total {
    font-weight: 700;
  }
  .col {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
    padding: 0.5rem 0;
  }
  h1 {
    font-size: 2rem;
    line-height: 1.1;
  }
  .small {
    font-size: 0.82rem;
  }
  .lineup {
    display: grid;
    gap: 0.6rem;
    width: 100%;
  }
  .mini {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.7rem;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--g1) 35%, var(--border));
    text-align: left;
  }
  .mini > span:last-child {
    display: grid;
  }
  .tile {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.8rem;
    background: linear-gradient(135deg, var(--g1), var(--g2));
    color: #fff;
  }
  .big-tile {
    width: 4rem;
    height: 4rem;
    border-radius: 1.2rem;
  }
  .big {
    min-height: 3.5rem;
    font-size: 1.1rem;
    border-radius: var(--radius);
    background: var(--gradient);
  }
  .gain {
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--success);
  }
  .board {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
    width: 100%;
  }
  .board li {
    display: grid;
    grid-template-columns: 1.4rem auto 1fr auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.8rem;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    text-align: left;
  }
  .board li.me {
    border-color: var(--g1);
  }
</style>
