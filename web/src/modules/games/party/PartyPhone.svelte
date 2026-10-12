<script lang="ts">
  import { Check, Eye, Undo2 } from '@lucide/svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import { PARTY_COLORS, STACK_INPUT_SEC, hueSatCss, partyColor, partyMini, type HueSat, type PartyColor, type PartyView } from '$shared/party.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { PARTY_ICONS } from '../store.svelte.ts';
  import GameCard from '../ui/GameCard.svelte';
  import Fuse from '../ui/Fuse.svelte';
  import StackColumn from './StackColumn.svelte';
  import HueSatPicker from './HueSatPicker.svelte';

  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as PartyView | null);
  const me = $derived(hb.me?.id ?? '');
  const info = $derived(v ? partyMini(v.lineup[v.index]) : undefined);
  const mini = $derived(v?.mini ?? null);
  const nameOf = (id: string) => m.players.find((p) => p.id === id);
  const ordinal = (k: number) => `${k}${k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th'}`;
  let busy = $state(false);

  /** What this phone did in the current mini game: reset when the next one starts */
  let round = -1;
  let picked = $state<number | null>(null);
  let tower = $state<PartyColor[]>([]);
  let locked = $state(false);
  let color = $state<HueSat>({ h: 200, s: 0.5 });
  $effect(() => {
    const key = v ? v.index : -1;
    if (key !== round) {
      round = key;
      picked = null;
      tower = [];
      locked = false;
      color = { h: Math.floor(Math.random() * 360), s: 0.5 };
    }
  });

  async function ready() {
    busy = true;
    await attempt(() => rpc('games', 'play', { action: 'ready' }));
    busy = false;
  }

  async function pick(n: number) {
    if (picked !== null) return;
    picked = n;
    const r = await attempt(() => rpc<{ pick: number }>('games', 'play', { pick: n }));
    if (!r) picked = null;
  }

  // Stack: every change goes to the server, so what is built counts even if time runs out
  const sendTower = (done = false) => attempt(() => rpc('games', 'play', { list: tower, done }));
  function place(c: PartyColor) {
    if (locked || mini?.kind !== 'stack' || tower.length >= mini.blocks) return;
    tower = [...tower, c];
    void sendTower();
  }
  function undo() {
    if (locked || !tower.length) return;
    tower = tower.slice(0, -1);
    void sendTower();
  }
  async function lockTower() {
    locked = true;
    const r = await sendTower(true);
    if (!r) locked = false;
  }

  // Color Match: the color goes to the server a few times a second while it moves
  let pending: ReturnType<typeof setTimeout> | null = null;
  function setColor(c: HueSat) {
    if (locked) return;
    color = c;
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      if (!locked) void attempt(() => rpc('games', 'play', { h: color.h, s: color.s }));
    }, 250);
  }
  async function lockColor() {
    locked = true;
    if (pending) clearTimeout(pending);
    pending = null;
    const r = await attempt(() => rpc('games', 'play', { h: color.h, s: color.s, done: true }));
    if (!r) locked = false;
  }
</script>

{#snippet waiting(text: string)}
  <div class="ready-note" in:fade><Check size={20} /> {text}</div>
{/snippet}

{#if v && info}
  {@const Icon = PARTY_ICONS[info.id]}
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
        <h1>{v.lineup.length} mini games</h1>
        <div class="lineup">
          {#each v.lineup as id, i (id)}
            {@const g = partyMini(id)!}
            {@const GIcon = PARTY_ICONS[id]}
            <div class="mini" style:--g1={g.colors[0]} style:--g2={g.colors[1]} in:fly={{ y: 20, delay: 300 + i * 250 }}>
              <span class="tile"><GIcon size={20} /></span>
              <span><strong>{g.name}</strong><span class="dim small">{g.tagline}</span></span>
            </div>
          {/each}
        </div>
        <p class="dim small">Look at the light strip, play on your phone.</p>
      </div>
    {:else if v.step === 'rules'}
      {@const imReady = v.ready.includes(me)}
      <div class="col" in:fade>
        <GameCard game={info} icon={Icon} eyebrow={`Game ${v.index + 1}: the rules`} />
        {#if imReady}
          {@render waiting(v.ready.length >= m.players.length ? 'Everyone is ready' : 'Got it. Waiting for the others...')}
        {:else}
          <button class="btn primary block big" disabled={busy} onclick={ready}><Check size={20} /> Got it</button>
        {/if}
        {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label={v.ready.length >= m.players.length ? 'Starting in' : 'Starts anyway in'} />{/if}
        {#if m.players.length > 2}<p class="faint small">{v.ready.length} of {m.players.length} ready</p>{/if}
      </div>
    {:else if v.step === 'play' && mini?.kind === 'count'}
      {#if mini.phase === 'show'}
        <div class="msg" in:fade>
          <span class="eye"><Eye size={48} /></span>
          <h1>Look at the light</h1>
          <p class="dim">Count the dots of each color:</p>
          <div class="chips">
            {#each mini.colors as c (c)}<span class="chip" style:--c={partyColor(c)!.hex}>{partyColor(c)!.name}</span>{/each}
          </div>
          {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Dots on for" />{/if}
        </div>
      {:else if mini.phase === 'ask' && mini.ask && mini.options}
        {@const c = partyColor(mini.ask)!}
        <div class="col" in:fly={{ y: 20 }}>
          <h1 class="question">How many <span style:color={c.hex}>{c.name.toLowerCase()}</span>?</h1>
          <div class="options">
            {#each mini.options as n (n)}
              <button class="option mono" class:chosen={picked === n} class:faded={picked !== null && picked !== n} style:--c={c.hex} disabled={picked !== null} onclick={() => pick(n)}>{n}</button>
            {/each}
          </div>
          {#if picked !== null}{@render waiting(`Locked in: ${picked}`)}{/if}
          {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Time left" />{/if}
        </div>
      {:else if mini.phase === 'reveal' && mini.ask && mini.counts}
        {@const c = partyColor(mini.ask)!}
        {@const answer = mini.counts[mini.ask] ?? 0}
        {@const mine = mini.picks?.[me] ?? null}
        <div class="msg" in:scale={{ start: 0.9 }}>
          <span class="eyebrow">There were</span>
          <span class="answer mono" style:color={c.hex}>{answer}</span>
          <h2>{c.name.toLowerCase()} dots</h2>
          <p class="dim">{mine === null ? 'You did not answer' : mine === answer ? 'You got it right!' : `You said ${mine}`}</p>
        </div>
      {/if}
    {:else if v.step === 'play' && mini?.kind === 'stack'}
      {#if mini.phase === 'drop' || mini.phase === 'memo'}
        <div class="msg" in:fade>
          <span class="eye"><Eye size={48} /></span>
          <h1>{mini.phase === 'drop' ? 'Watch the blocks fall' : 'Remember the tower'}</h1>
          <p class="dim">{mini.blocks} blocks, from the bottom up.</p>
          {#if mini.phase === 'memo' && m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="It falls in" />{/if}
        </div>
      {:else if mini.phase === 'fall'}
        <div class="msg" in:fade><h1>Now build it!</h1></div>
      {:else if mini.phase === 'input'}
        <div class="build" in:fade>
          <div class="column"><StackColumn blocks={mini.blocks} list={tower} /></div>
          <div class="side">
            <p class="dim small">From the bottom up. {tower.length} of {mini.blocks}</p>
            <div class="keys">
              {#each PARTY_COLORS as c (c.id)}
                <button class="key" style:--c={c.hex} aria-label={c.name} disabled={locked || tower.length >= mini.blocks} onclick={() => place(c.id)}></button>
              {/each}
            </div>
            <button class="btn block" disabled={locked || !tower.length} onclick={undo}><Undo2 size={18} /> Undo</button>
            {#if locked}
              {@render waiting('Locked in')}
            {:else}
              <button class="btn primary block big" disabled={!tower.length} onclick={lockTower}><Check size={20} /> Done</button>
            {/if}
          </div>
          {#if m.endsAt}<div class="fuse"><Fuse endsAt={m.endsAt} totalMs={m.phaseMs || STACK_INPUT_SEC * 1000} label="Time left" /></div>{/if}
        </div>
      {:else if mini.phase === 'reveal' && mini.tower}
        {@const mine = mini.answers?.[me] ?? []}
        <div class="col" in:fade>
          <h1>{mini.correct?.[me] ?? 0} of {mini.blocks} right</h1>
          <div class="compare">
            <div class="labeled"><StackColumn blocks={mini.blocks} list={mini.tower} width="4rem" /><span class="dim small">The tower</span></div>
            <div class="labeled"><StackColumn blocks={mini.blocks} list={mine} check={mini.tower} width="4rem" /><span class="dim small">Yours</span></div>
          </div>
        </div>
      {/if}
    {:else if v.step === 'play' && mini?.kind === 'match'}
      {#if mini.phase === 'show'}
        <div class="msg" in:fade>
          <span class="eye"><Eye size={48} /></span>
          <h1>Remember this color</h1>
          <p class="dim">Look at the light strip.</p>
          {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="On for" />{/if}
        </div>
      {:else if mini.phase === 'input'}
        <div class="col" in:fade>
          <h2>Make the same color</h2>
          <span class="swatch" style:background={hueSatCss(color)}></span>
          <HueSatPicker value={color} onchange={setColor} disabled={locked} />
          {#if locked}
            {@render waiting('Locked in')}
          {:else}
            <button class="btn primary block big" onclick={lockColor}><Check size={20} /> This one</button>
          {/if}
          {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Time left" />{/if}
        </div>
      {:else if mini.phase === 'reveal' && mini.target && mini.order}
        {@const shown = mini.order[mini.showing ?? -1]}
        {@const mine = mini.guesses?.[me] ?? null}
        <div class="col" in:fade>
          <span class="eyebrow">{shown ? `On the light: ${shown === me ? 'yours' : `${nameOf(shown)?.name}'s`}` : 'Look at the light'}</span>
          <div class="pair">
            <div class="labeled"><span class="swatch big-swatch" style:background={hueSatCss(mini.target)}></span><span class="dim small">The color</span></div>
            <div class="labeled">
              {#if mine}<span class="swatch big-swatch" style:background={hueSatCss(mine)}></span>{:else}<span class="swatch big-swatch none"></span>{/if}
              <span class="dim small">Yours</span>
            </div>
          </div>
          {#if mine}<h1 class="mono">{(mini.scores?.[me] ?? 0).toFixed(1)} %</h1>{:else}<p class="dim">No color sent</p>{/if}
        </div>
      {/if}
    {:else if v.step === 'score' && v.lines}
      {@const line = v.lines.find((l) => l.id === me)}
      <div class="col" in:fade>
        <span class="tile big-tile"><Icon size={30} /></span>
        <span class="eyebrow">{info.name}</span>
        <h1>{line?.place ? `${ordinal(line.place)} place` : 'No result'}</h1>
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
  .col,
  .msg {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
    padding: 0.5rem 0;
  }
  .msg {
    padding: 2.5rem 0;
  }
  h1 {
    font-size: 2rem;
    line-height: 1.1;
  }
  h2 {
    font-size: 1.4rem;
  }
  .small {
    font-size: 0.82rem;
  }
  .eye {
    color: var(--g1);
    animation: hb-pulse 1.2s ease-in-out infinite;
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
  .ready-note {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 3.2rem;
    padding: 0 1.4rem;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--success) 14%, transparent);
    color: var(--success);
    font-weight: 700;
  }
  .chips {
    display: flex;
    gap: 0.5rem;
  }
  .chip {
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 20%, transparent);
    color: var(--c);
    font-weight: 700;
  }
  .question {
    font-size: 2.3rem;
  }
  .options {
    display: grid;
    gap: 0.6rem;
    width: 100%;
  }
  .option {
    min-height: 3.6rem;
    border-radius: var(--radius);
    border: 2px solid color-mix(in srgb, var(--c) 40%, var(--border));
    background: var(--surface);
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--text);
    transition:
      opacity 0.2s ease,
      transform 0.1s ease;
  }
  .option:active:not(:disabled) {
    transform: scale(0.97);
  }
  .option.chosen {
    background: color-mix(in srgb, var(--c) 30%, var(--surface));
    border-color: var(--c);
    opacity: 1;
  }
  .option.faded {
    opacity: 0.35;
  }
  .answer {
    font-size: 6rem;
    font-weight: 700;
    line-height: 1;
  }
  .build {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: 1fr auto;
    gap: 1rem;
    height: min(70vh, 34rem);
  }
  .column {
    min-height: 0;
    display: grid;
  }
  .side {
    display: grid;
    align-content: end;
    gap: 0.7rem;
  }
  .fuse {
    grid-column: 1 / -1;
  }
  .keys {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .key {
    aspect-ratio: 1;
    border: 0;
    border-radius: 1.2rem;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 70%, #fff), var(--c) 60%);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--c) 40%, transparent),
      0 12px 26px -14px var(--c);
    touch-action: manipulation;
    transition: transform 0.08s ease;
  }
  .key:active:not(:disabled) {
    transform: scale(0.93);
    filter: brightness(1.3);
  }
  .key:disabled {
    filter: saturate(0.3) brightness(0.6);
  }
  .compare,
  .pair {
    display: flex;
    gap: 1.5rem;
    justify-content: center;
    height: min(55vh, 26rem);
  }
  .pair {
    height: auto;
  }
  .labeled {
    display: grid;
    grid-template-rows: 1fr auto;
    justify-items: center;
    gap: 0.4rem;
    min-height: 0;
  }
  .swatch {
    width: 100%;
    height: 3.5rem;
    border-radius: var(--radius);
    box-shadow: 0 0 0 1px var(--border-strong);
  }
  .big-swatch {
    width: 7.5rem;
    height: 7.5rem;
  }
  .swatch.none {
    background: repeating-linear-gradient(45deg, var(--surface-2) 0 8px, var(--surface-3) 8px 16px);
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
