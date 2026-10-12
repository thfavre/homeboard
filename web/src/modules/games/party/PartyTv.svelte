<script lang="ts">
  import { Check, Eye } from '@lucide/svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import { hueSatCss, partyColor, partyMini, type PartyView } from '$shared/party.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Ring from '../../quiz/Ring.svelte';
  import { PARTY_ICONS } from '../store.svelte.ts';
  import RulesPoster from '../tv/RulesPoster.svelte';
  import StackColumn from './StackColumn.svelte';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as PartyView | null);
  const info = $derived(v ? partyMini(v.lineup[v.index]) : undefined);
  const mini = $derived(v?.mini ?? null);
  const nameOf = (id: string) => m.players.find((p) => p.id === id);
  const ordinal = (k: number) => `${k}${k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th'}`;
  const standings = $derived(v ? [...m.players].sort((a, b) => (v.totals[b.id] ?? 0) - (v.totals[a.id] ?? 0)) : []);

  /** What each player did so far in the current phase, shown next to their name */
  function status(id: string): string | null {
    if (!mini) return null;
    if (mini.kind === 'count') {
      // The reveal shows what each one picked
      if (mini.phase === 'reveal') return mini.picks?.[id] === null || mini.picks?.[id] === undefined ? '-' : String(mini.picks[id]);
      return mini.phase === 'ask' && mini.answered.includes(id) ? 'done' : null;
    }
    if (mini.kind === 'stack') {
      if (mini.phase !== 'input') return null;
      return mini.done.includes(id) ? 'done' : `${mini.progress[id] ?? 0}/${mini.blocks}`;
    }
    return mini.phase === 'input' && mini.done.includes(id) ? 'done' : null;
  }
</script>

{#snippet players()}
  <div class="players">
    {#each m.players as p (p.id)}
      {@const st = status(p.id)}
      {@const hit = mini?.kind === 'count' && mini.phase === 'reveal' && !!mini.ask && mini.picks?.[p.id] === mini.counts?.[mini.ask]}
      <div class="p">
        <Avatar name={p.name} color={p.color} id={p.id} size="2.6rem" />
        <span class="truncate">{p.name}</span>
        {#if st === 'done'}<span class="pill success"><Check size="1rem" strokeWidth={3} /></span>{:else if st}<span class="mono prog" class:hit>{st}</span>{/if}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet prompt(title: string, sub: string)}
  <div class="prompt">
    <span class="eye"><Eye size="4rem" /></span>
    <h1>{title}</h1>
    <p class="dim lead">{sub}</p>
    {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="8rem" />{/if}
  </div>
{/snippet}

{#if v && info}
  {@const Icon = PARTY_ICONS[info.id]}
  <div class="party" style:--g1={info.colors[0]} style:--g2={info.colors[1]}>
    {#if v.step === 'lineup'}
      <div class="lineup" in:fade>
        <span class="kicker">Tonight's lineup</span>
        <div class="cards">
          {#each v.lineup as id, i (id)}
            {@const g = partyMini(id)!}
            {@const GIcon = PARTY_ICONS[id]}
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
        <RulesPoster game={info} icon={Icon} eyebrow={`Game ${v.index + 1} of ${v.lineup.length}`} />
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
    {:else if v.step === 'play' && mini}
      <div class="stage">
        <div class="main">
          {#if mini.kind === 'count'}
            {#if mini.phase === 'show'}
              {@render prompt('Look at the light', 'Count the dots of each color')}
              <div class="chips big-chips">
                {#each mini.colors as c (c)}<span class="chip" style:--c={partyColor(c)!.hex}>{partyColor(c)!.name}</span>{/each}
              </div>
            {:else if mini.phase === 'ask' && mini.ask}
              {@const c = partyColor(mini.ask)!}
              <div class="prompt" in:scale={{ start: 0.9 }}>
                <h1 class="question">How many <span style:color={c.hex}>{c.name.toLowerCase()}</span>?</h1>
                <div class="options">
                  {#each mini.options ?? [] as n (n)}<span class="option mono" style:--c={c.hex}>{n}</span>{/each}
                </div>
                {#if m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="8rem" />{/if}
              </div>
            {:else if mini.phase === 'reveal' && mini.ask && mini.counts}
              {@const c = partyColor(mini.ask)!}
              {@const answer = mini.counts[mini.ask] ?? 0}
              <div class="prompt">
                <span class="kicker">There were</span>
                <span class="answer mono" style:color={c.hex} in:scale={{ start: 0.4, duration: 600 }}>{answer}</span>
                <h2>{c.name.toLowerCase()} dots</h2>
                <div class="counts">
                  {#each mini.colors.filter((x) => x !== mini.ask) as x (x)}
                    <span class="dim">{partyColor(x)!.name}: <strong class="mono">{mini.counts[x]}</strong></span>
                  {/each}
                </div>
              </div>
            {/if}
          {:else if mini.kind === 'stack'}
            {#if mini.phase === 'drop'}
              {@render prompt('Watch the blocks fall', `${mini.blocks} blocks stack up to the top`)}
            {:else if mini.phase === 'memo'}
              {@render prompt('Remember the tower', 'From the bottom up, before it falls')}
            {:else if mini.phase === 'fall'}
              <div class="prompt"><h1 in:scale={{ start: 1.4 }}>It falls!</h1></div>
            {:else if mini.phase === 'input'}
              {@render prompt('Build it on your phone', 'From the bottom up')}
            {:else if mini.phase === 'reveal' && mini.tower}
              <div class="towers">
                <div class="labeled real"><StackColumn blocks={mini.blocks} list={mini.tower} width="6rem" /><strong>The tower</strong></div>
                {#each m.players as p, i (p.id)}
                  <div class="labeled" in:fly={{ y: 30, delay: 400 + i * 200 }}>
                    <StackColumn blocks={mini.blocks} list={mini.answers?.[p.id] ?? []} check={mini.tower} width="3.6rem" />
                    <Avatar name={p.name} color={p.color} id={p.id} size="2.2rem" />
                    <span class="mono">{mini.correct?.[p.id] ?? 0}</span>
                  </div>
                {/each}
              </div>
            {/if}
          {:else if mini.kind === 'match'}
            {#if mini.phase === 'show'}
              {@render prompt('Remember this color', 'Look at the light strip')}
            {:else if mini.phase === 'input'}
              {@render prompt('Make it on your phone', 'Turn the wheel to the same color')}
            {:else if mini.phase === 'reveal' && mini.target && mini.order}
              {@const shown = mini.order[mini.showing ?? -1]}
              {@const p = shown ? nameOf(shown) : undefined}
              <div class="prompt">
                {#if p && mini.guesses?.[p.id]}
                  {#key p.id}
                    <div class="spot" in:fly={{ y: 40, duration: 500 }}>
                      <span class="kicker">On the light, at the top</span>
                      <Avatar name={p.name} color={p.color} id={p.id} size="8rem" />
                      <h1>{p.name}</h1>
                      <div class="pair">
                        <div class="labeled"><span class="swatch" style:background={hueSatCss(mini.target)}></span><span class="dim">The color (bottom)</span></div>
                        <div class="labeled"><span class="swatch" style:background={hueSatCss(mini.guesses[p.id]!)}></span><span class="dim">{p.name} (top)</span></div>
                      </div>
                      <span class="score mono">{(mini.scores?.[p.id] ?? 0).toFixed(1)} %</span>
                    </div>
                  {/key}
                {:else}
                  <span class="kicker">{(mini.showing ?? -1) < 0 ? 'The color, at the bottom of the light' : 'Every guess'}</span>
                  <span class="swatch hero" style:background={hueSatCss(mini.target)}></span>
                  {#if (mini.showing ?? -1) >= mini.order.length}
                    <div class="all">
                      {#each [...mini.order].reverse() as id (id)}
                        {@const q = nameOf(id)}
                        {#if q}<span class="mini-guess"><span class="dot" style:background={hueSatCss(mini.guesses![id]!)}></span>{q.name} <strong class="mono">{(mini.scores?.[id] ?? 0).toFixed(1)} %</strong></span>{/if}
                      {/each}
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}
          {/if}
        </div>
        {#if !(mini.kind === 'stack' && mini.phase === 'reveal')}{@render players()}{/if}
      </div>
    {:else if v.step === 'score' && v.lines}
      <div class="score-screen" in:fade>
        <div class="col">
          <span class="kicker"><Icon size="1.4rem" /> {info.name}: results</span>
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
          {@const GIcon = PARTY_ICONS[id]}
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
  h1 {
    font-size: 4rem;
    line-height: 1.05;
    letter-spacing: -0.03em;
  }
  h2 {
    font-size: 2.4rem;
  }
  .lead {
    font-size: 1.6rem;
  }
  .eye {
    color: var(--g1);
    animation: hb-pulse 1.2s ease-in-out infinite;
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

  /* Play */
  .stage {
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 22rem;
    gap: 2.5rem;
    align-items: center;
  }
  .main {
    min-height: 0;
    height: 100%;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 1.5rem;
  }
  .prompt {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1.2rem;
  }
  .big-chips .chip {
    font-size: 1.6rem;
    padding: 0.5rem 1.4rem;
  }
  .chip {
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 20%, transparent);
    color: var(--c);
    font-weight: 700;
  }
  .question {
    font-size: 4.6rem;
  }
  .options {
    display: flex;
    gap: 1rem;
  }
  .option {
    display: grid;
    place-items: center;
    min-width: 7rem;
    padding: 1rem 1.4rem;
    border-radius: 1.4rem;
    background: var(--surface);
    border: 2px solid color-mix(in srgb, var(--c) 40%, var(--border));
    font-size: 2.6rem;
    font-weight: 700;
  }
  .answer {
    font-size: 12rem;
    font-weight: 700;
    line-height: 1;
  }
  .counts {
    display: flex;
    gap: 2rem;
    font-size: 1.5rem;
  }
  .players {
    display: grid;
    gap: 0.6rem;
    align-content: center;
    max-height: 100%;
    overflow: hidden;
  }
  .p {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.4rem 1rem 0.4rem 0.4rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 1.3rem;
    font-weight: 600;
  }
  .p .truncate {
    flex: 1;
  }
  .prog {
    color: var(--text-dim);
    font-size: 1.5rem;
    font-weight: 700;
  }
  .prog.hit {
    color: var(--success);
  }
  .towers {
    height: 100%;
    max-height: 38rem;
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 1.4rem;
  }
  .labeled {
    display: grid;
    grid-template-rows: 1fr auto auto;
    justify-items: center;
    gap: 0.5rem;
    min-height: 0;
    font-size: 1.3rem;
    font-weight: 700;
  }
  .real {
    margin-right: 2rem;
  }
  .spot {
    display: grid;
    justify-items: center;
    gap: 1rem;
  }
  .pair {
    display: flex;
    gap: 2rem;
  }
  .pair .labeled {
    grid-template-rows: auto auto;
    font-size: 1.1rem;
    font-weight: 500;
  }
  .swatch {
    width: 11rem;
    height: 7rem;
    border-radius: 1.4rem;
    box-shadow: 0 0 0 1px var(--border-strong);
  }
  .swatch.hero {
    width: 22rem;
    height: 12rem;
    border-radius: 2rem;
  }
  .score {
    font-size: 3.4rem;
    font-weight: 700;
  }
  .all {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.7rem 1.6rem;
    font-size: 1.4rem;
  }
  .mini-guess {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .dot {
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
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
