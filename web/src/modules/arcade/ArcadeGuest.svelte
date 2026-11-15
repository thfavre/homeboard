<script lang="ts">
  import { tick } from 'svelte';
  import { Check, Shuffle, Swords, Trophy } from '@lucide/svelte';
  import { ARCADE_GAMES, ARCADE_MIX_ROUNDS, arcadeGame, type ArcadeGameId } from '$shared/arcade.ts';
  import { formatAmount, parseAmount } from '$shared/money.ts';
  import { attempt, hb, price, rpc } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { ARCADE_ICONS, arcadeState, gradient } from './store.svelte.ts';

  /** The Arcade's panel: pick a game (or a Mix), someone to play, a bet, and send the challenge */
  const s = $derived(arcadeState());
  const economy = $derived(!!hb.core?.economyEnabled);
  const games = $derived(ARCADE_GAMES.filter((g) => s?.settings.games.includes(g.id)));
  const canMix = $derived(games.length >= 2);

  let picked = $state<ArcadeGameId | 'mix' | null>(null);
  let opponent = $state<string | null>(null);
  let stakeText = $state('');
  let busy = $state(false);
  let error = $state('');
  let form = $state<HTMLElement | null>(null);

  const others = $derived((s?.online ?? []).filter((p) => p.id !== hb.me?.id).sort((a, b) => a.name.localeCompare(b.name)));
  const opponentName = $derived(others.find((p) => p.id === opponent)?.name);
  const stake = $derived(economy ? Math.max(0, parseAmount(stakeText || '0')) : 0);
  const fee = $derived(price('arcade.challenge'));
  const maxStake = $derived(s?.settings.maxStake ?? 0);
  const records = $derived(games.filter((g) => s?.records[g.id]).map((g) => ({ g, r: s!.records[g.id]! })));

  async function pick(id: ArcadeGameId | 'mix') {
    picked = id;
    error = '';
    await tick();
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function send() {
    error = '';
    if (!picked) return;
    if (!opponent) {
      error = 'Pick someone to challenge.';
      return;
    }
    const target = others.find((p) => p.id === opponent);
    if (economy && target && stake > target.balance) {
      error = `${target.name} cannot match that bet.`;
      return;
    }
    if (maxStake > 0 && stake > maxStake) {
      error = `Bets are limited to ${formatAmount(maxStake)}.`;
      return;
    }
    busy = true;
    const ok = await attempt(() => rpc('arcade', 'invite', { game: picked, to: opponent, stake }));
    busy = false;
    if (ok) {
      picked = null;
      opponent = null;
      stakeText = '';
    }
  }
</script>

<div class="arcade">
  <header class="hero">
    <div class="marquee" aria-hidden="true">
      {#each Array.from({ length: 14 }) as _, i (i)}<span class="bulb" style:animation-delay="{i * 0.12}s"></span>{/each}
    </div>
    <h1>Arcade</h1>
    <p class="dim">Challenge someone to a quick game on your phones. Same run for both of you, best score wins.</p>
  </header>

  <div class="grid">
    {#each games as g (g.id)}
      {@const Icon = ARCADE_ICONS[g.id]}
      <button class="game" class:active={picked === g.id} style:--g={gradient(g.colors)} onclick={() => pick(g.id)}>
        <span class="icon"><Icon size={30} strokeWidth={2.2} /></span>
        <strong>{g.name}</strong>
        <span class="tag">{g.tagline}</span>
        {#if picked === g.id}<span class="tick"><Check size={16} strokeWidth={3} /></span>{/if}
      </button>
    {/each}
    {#if canMix}
      <button class="game mix" class:active={picked === 'mix'} onclick={() => pick('mix')}>
        <span class="icon"><Shuffle size={28} strokeWidth={2.2} /></span>
        <span class="mix-text">
          <strong>Mix</strong>
          <span class="tag">{Math.min(ARCADE_MIX_ROUNDS, games.length)} different games drawn at random. Win most of them to take it all.</span>
        </span>
        {#if picked === 'mix'}<span class="tick"><Check size={16} strokeWidth={3} /></span>{/if}
      </button>
    {/if}
  </div>

  {#if picked}
    {@const info = picked === 'mix' ? null : arcadeGame(picked)}
    <section class="card form" bind:this={form}>
      <span class="eyebrow">{info ? info.name : 'Mix'}</span>
      {#if info}
        <ol class="steps">
          {#each info.steps as step, i (i)}<li><span class="n">{i + 1}</span>{step}</li>{/each}
        </ol>
      {/if}

      <div class="field">
        <span class="label">Who do you challenge?</span>
        <div class="people">
          {#each others as p (p.id)}
            {@const short = economy && stake > p.balance}
            {@const playing = s?.busy.includes(p.id)}
            <button class="person" class:active={opponent === p.id} disabled={short || playing} onclick={() => (opponent = p.id)}>
              <Avatar name={p.name} color={p.color} id={p.id} size="2.2rem" />
              <span class="who">
                <span class="truncate">{p.name}</span>
                <span class="bal">
                  {#if playing}Playing{:else if short}Can't match{:else if economy}<Money amount={p.balance} whole />{/if}
                </span>
              </span>
            </button>
          {:else}
            <p class="faint small">Nobody else is online right now.</p>
          {/each}
        </div>
      </div>

      {#if economy}
        <label class="field">
          <span class="label">Your bet</span>
          <input class="input mono" inputmode="decimal" placeholder="0" bind:value={stakeText} />
          <span class="faint small">
            {#if stake > 0}{opponentName ?? 'Your opponent'} has to match it. Winner takes {formatAmount(stake * 2)}.{:else}No bet: just for the glory.{/if}
            {#if maxStake > 0}{` Up to ${formatAmount(maxStake)}.`}{/if}
          </span>
        </label>
        <div class="sum">
          <span>Challenge fee</span><Money amount={fee} free />
          <span>Your bet</span><Money amount={stake} />
          <span class="total">You pay now</span><span class="total"><Money amount={fee + stake} /></span>
        </div>
        <p class="faint small">Everything comes back if they decline, do not answer within a minute, or you cancel.</p>
      {/if}

      {#if error}<p class="error">{error}</p>{/if}
      <button class="btn primary block go" disabled={busy} onclick={send}><Swords size={18} /> Send the challenge</button>
    </section>
  {/if}

  {#if records.length}
    <section class="card records">
      <span class="eyebrow"><Trophy size={14} /> Best scores this party</span>
      {#each records as { g, r } (g.id)}
        {@const Icon = ARCADE_ICONS[g.id]}
        <div class="record">
          <span class="mini" style:--g={gradient(g.colors)}><Icon size={16} /></span>
          <span class="truncate">{g.name}</span>
          <span class="holder truncate" style:color={r.color}>{r.name}</span>
          <strong class="mono">{r.score}</strong>
        </div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .arcade {
    display: grid;
    gap: 1rem;
  }
  .hero {
    position: relative;
    display: grid;
    gap: 0.35rem;
    padding: 1.4rem 1.2rem 1.2rem;
    border-radius: var(--radius);
    background:
      radial-gradient(80% 120% at 100% 0%, rgba(255, 61, 139, 0.35), transparent 60%),
      radial-gradient(80% 120% at 0% 100%, rgba(61, 214, 255, 0.3), transparent 60%),
      #120a24;
    overflow: hidden;
    color: #fff;
  }
  .hero h1 {
    margin: 0.4rem 0 0;
    font-family: var(--font-display);
    font-size: 2.1rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-shadow:
      0 0 12px rgba(255, 79, 163, 0.9),
      0 0 30px rgba(255, 79, 163, 0.5);
  }
  .hero p {
    margin: 0;
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.9rem;
  }
  .marquee {
    display: flex;
    justify-content: space-between;
  }
  .bulb {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ffd23d;
    box-shadow: 0 0 8px #ffd23d;
    animation: blink 1.7s infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.25;
      box-shadow: none;
    }
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
  }
  .game {
    position: relative;
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 0.3rem;
    min-height: 9.2rem;
    padding: 0.9rem;
    border: 0;
    border-radius: var(--radius);
    background: var(--g);
    color: #fff;
    text-align: left;
    box-shadow: 0 10px 24px -14px rgba(0, 0, 0, 0.8);
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }
  .game:active {
    transform: scale(0.97);
  }
  .game.active {
    box-shadow:
      0 0 0 3px var(--bg),
      0 0 0 6px #fff;
  }
  .game strong {
    font-family: var(--font-display);
    font-size: 1.05rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .tag {
    font-size: 0.78rem;
    line-height: 1.25;
    color: rgba(255, 255, 255, 0.88);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    margin-bottom: 0.2rem;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.2);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }
  .tick {
    position: absolute;
    top: 0.7rem;
    right: 0.7rem;
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: #fff;
    color: #1a1030;
  }
  .mix {
    grid-column: 1 / -1;
    min-height: 0;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.9rem;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent),
      conic-gradient(from 200deg at 20% 50%, #ff8a3d, #3dd6c6, #ffd23d, #c879ff, #4fd1a5, #ff5f6d, #ff8a3d);
  }
  .mix .icon {
    margin: 0;
  }
  .mix-text {
    display: grid;
    gap: 0.2rem;
  }
  .form {
    display: grid;
    gap: 1rem;
    scroll-margin-top: calc(var(--header-h, 0px) + 0.8rem);
  }
  .steps {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.9rem;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .n {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--surface-3);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .field {
    display: grid;
    gap: 0.45rem;
  }
  .label {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .people {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .person {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
    padding: 0.55rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    text-align: left;
  }
  .person.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .person:disabled {
    opacity: 0.45;
  }
  .who {
    display: grid;
    min-width: 0;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .bal {
    color: var(--text-faint);
    font-size: 0.75rem;
    font-weight: 500;
  }
  .sum {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.35rem 1rem;
    font-size: 0.9rem;
    color: var(--text-dim);
  }
  .total {
    padding-top: 0.35rem;
    border-top: 1px solid var(--border);
    color: var(--text);
    font-weight: 700;
  }
  .go {
    min-height: 3.4rem;
    font-size: 1.05rem;
  }
  .records {
    display: grid;
    gap: 0.6rem;
  }
  .record {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.9rem;
  }
  .mini {
    display: grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 9px;
    background: var(--g);
    color: #fff;
  }
  .holder {
    max-width: 7rem;
    font-weight: 600;
  }
</style>
