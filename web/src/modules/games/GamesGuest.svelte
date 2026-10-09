<script lang="ts">
  import { ChevronRight, Music, Swords, Users, VolumeX } from '@lucide/svelte';
  import { GAMES, RHYTHM_COLORS, RHYTHM_DEFAULT_LEVEL, rhythmLevel, type GameInfo, type GameMode } from '$shared/games.ts';
  import { formatAmount, parseAmount } from '$shared/money.ts';
  import { hb, rpc, attempt, price } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { GAME_ICONS, gamesState } from './store.svelte.ts';
  import GameCard from './ui/GameCard.svelte';

  let mode = $state<GameMode>('duel');
  let picked = $state<GameInfo | null>(null);
  let opponent = $state<string | null>(null);
  let stakeText = $state('');
  /** Rhythm Rain level, sent with the challenge */
  let difficulty = $state(RHYTHM_DEFAULT_LEVEL);
  const level = $derived(rhythmLevel(difficulty));
  let busy = $state(false);
  let error = $state('');

  const s = $derived(gamesState());
  /** Rhythm Rain on one of the host's songs (its own price) */
  let music = $state(false);
  let songPick = $state('');
  const songs = $derived((s?.rhythmSongs ?? []).filter((x) => x.status === 'ready'));
  const song = $derived(songs.find((x) => x.key === songPick) ?? songs[0] ?? null);
  const withMusic = $derived(picked?.id === 'rhythm' && mode === 'duel' && music && !!song);
  const economy = $derived(!!hb.core?.economyEnabled);
  const list = $derived(GAMES.filter((g) => g.modes.includes(mode) && s?.settings.enabled.includes(g.id)));
  // Richest first: the ones who can match a big bet
  const others = $derived((s?.online ?? []).filter((p) => p.id !== hb.me?.id).sort((a, b) => b.balance - a.balance));
  const opponentName = $derived(others.find((p) => p.id === opponent)?.name);
  const stake = $derived(economy ? Math.max(0, parseAmount(stakeText || '0')) : 0);
  const fee = $derived(price(mode === 'duel' ? (withMusic ? 'games.rhythmMusic' : 'games.duel') : 'games.room'));
  const maxStake = $derived(s?.settings.maxStake ?? 0);
  const tvBusy = $derived(!!s?.match || (!!hb.core?.takeover && hb.core.takeover !== 'games'));

  function open(g: GameInfo) {
    picked = g;
    error = '';
  }

  async function send() {
    if (!picked) return;
    error = '';
    if (mode === 'duel' && !opponent) {
      error = 'Pick someone to challenge';
      return;
    }
    const target = others.find((p) => p.id === opponent);
    if (mode === 'duel' && economy && target && stake > target.balance) {
      error = `${target.name} only has ${formatAmount(target.balance)}: lower your bet or pick someone else`;
      return;
    }
    if (maxStake > 0 && stake > maxStake) {
      error = `Bets are limited to ${formatAmount(maxStake)}`;
      return;
    }
    busy = true;
    const ok =
      mode === 'duel'
        ? await attempt(() => rpc('games', 'invite', { game: picked!.id, to: opponent, stake, ...(picked!.id === 'rhythm' ? { difficulty, ...(withMusic ? { song: song!.key } : {}) } : {}) }))
        : await attempt(() => rpc('games', 'startRoom', { game: picked!.id, stake }));
    busy = false;
    if (ok) picked = null;
  }
</script>

<div class="games">
  <div class="tabs">
    <button class:active={mode === 'duel'} onclick={() => (mode = 'duel')}><Swords size={18} /> 1 vs 1</button>
    <button class:active={mode === 'room'} onclick={() => (mode = 'room')}><Users size={18} /> Everyone</button>
  </div>
  <p class="dim intro">
    {#if mode === 'duel'}
      Challenge someone on the TV. You both put the same amount in the pot, the winner takes it all.
    {:else}
      Start a game on the TV that anyone can join. Everyone puts the same entry in the pot, the winner takes it.
    {/if}
  </p>

  <div class="list">
    {#each list as g (g.id)}
      {@const Icon = GAME_ICONS[g.id]}
      <button class="tile card" style:--g1={g.colors[0]} style:--g2={g.colors[1]} onclick={() => open(g)}>
        <span class="icon"><Icon size={22} strokeWidth={2.2} /></span>
        <span class="text">
          <span class="title">{g.name}</span>
          <span class="tagline">{g.tagline}</span>
        </span>
        <ChevronRight size={18} class="chev" />
      </button>
    {:else}
      <div class="card empty">No game available here right now.</div>
    {/each}
  </div>
</div>

{#if picked}
  <Sheet title={mode === 'duel' ? 'New duel' : 'Game for everyone'} onclose={() => (picked = null)}>
    <GameCard game={picked} />

    {#if picked.id === 'rhythm'}
      <div class="field">
        <span class="label">Difficulty <strong class="mono level">{difficulty}</strong><span class="faint">/ 10</span></span>
        <input class="slider" type="range" min="1" max="10" step="1" bind:value={difficulty} style:--p="{((difficulty - 1) / 9) * 100}%" />
        <div class="helper">
          <span class="keys">
            {#each RHYTHM_COLORS.slice(0, level.lanes) as c (c.id)}<span class="key" style:--c={c.hex}></span>{/each}
          </span>
          <span class="dim small">{level.help}</span>
        </div>
      </div>
      {#if songs.length}
        <div class="field">
          <span class="label">Sound</span>
          <div class="sound">
            <button class="choice" class:active={!music} onclick={() => (music = false)}>
              <VolumeX size={20} />
              <span class="what"><strong>No music</strong><span class="faint small">Just the beat of the lights</span></span>
              {#if economy}<Money amount={price('games.duel')} free />{/if}
            </button>
            <button class="choice" class:active={music} onclick={() => (music = true)}>
              <Music size={20} />
              <span class="what"><strong>With music</strong><span class="faint small truncate">{songs.length === 1 ? `${songs[0].artist ? `${songs[0].artist} - ` : ''}${songs[0].title}` : `${songs.length} songs to pick from`}</span></span>
              {#if economy}<Money amount={price('games.rhythmMusic')} free />{/if}
            </button>
            {#if music && songs.length > 1}
              <div class="songs">
                {#each songs as x (x.key)}
                  <button class="song-pick" class:active={song?.key === x.key} onclick={() => (songPick = x.key)}>
                    <span class="art" style:background-image={x.cover ? `url("${x.cover}")` : undefined}></span>
                    <span class="name">
                      <strong class="truncate">{x.title}</strong>
                      {#if x.artist}<span class="faint small truncate">{x.artist}</span>{/if}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {/if}

    {#if mode === 'duel'}
      <div class="field">
        <span class="label">Who do you challenge?</span>
        <div class="people">
          {#each others as p (p.id)}
            {@const short = economy && stake > p.balance}
            <button class="person" class:active={opponent === p.id} class:short disabled={short} onclick={() => (opponent = p.id)}>
              <Avatar name={p.name} color={p.color} id={p.id} size="2.2rem" />
              <span class="who">
                <span class="truncate">{p.name}</span>
                {#if economy}
                  <span class="bal">{#if short}Can't match{:else}<Money amount={p.balance} />{/if}</span>
                {/if}
              </span>
            </button>
          {:else}
            <p class="faint small">Nobody else is online right now.</p>
          {/each}
        </div>
      </div>
    {/if}

    {#if economy}
      <label class="field">
        <span class="label">{mode === 'duel' ? 'Your bet' : 'Entry for each player'}</span>
        <input class="input mono" inputmode="decimal" placeholder="0" bind:value={stakeText} />
        <span class="faint small">
          {#if mode === 'duel'}
            {opponentName ?? 'Your opponent'} has to match it to accept. Winner takes {formatAmount(stake * 2)}.
          {:else}
            Every player puts this in. Winner takes the pot.
          {/if}
          {#if maxStake > 0}{` Up to ${formatAmount(maxStake)}.`}{/if}
        </span>
      </label>
      <div class="sum">
        <span>{mode === 'duel' ? 'Challenge fee' : 'Start fee'}</span><Money amount={fee} free />
        <span>{mode === 'duel' ? 'Your bet' : 'Your entry'}</span><Money amount={stake} />
        <span class="total">You pay now</span><span class="total"><Money amount={fee + stake} /></span>
      </div>
      <p class="faint small">
        {mode === 'duel'
          ? 'Everything comes back if they decline, do not answer within a minute, or you cancel.'
          : 'Everything comes back if nobody else joins.'}
      </p>
    {/if}

    {#if tvBusy}<p class="faint small">A game is on the TV right now. {mode === 'duel' ? 'They can accept once it is over.' : 'Wait for it to end.'}</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}

    <button class="btn primary block go" disabled={busy || (mode === 'room' && tvBusy)} onclick={send}>
      {#if mode === 'duel'}<Swords size={18} /> Send the challenge{:else}<Users size={18} /> Start for everyone{/if}
    </button>
  </Sheet>
{/if}

<style>
  .games {
    display: grid;
    gap: 0.9rem;
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
    padding: 0.3rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: 2.6rem;
    border: 0;
    border-radius: calc(var(--radius-sm) - 4px);
    background: transparent;
    color: var(--text-dim);
    font-weight: 600;
  }
  .tabs button.active {
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .intro {
    font-size: 0.9rem;
  }
  .list {
    display: grid;
    gap: 0.6rem;
  }
  .tile {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.95rem 1rem;
    text-align: left;
  }
  .tile:active {
    transform: scale(0.985);
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.9rem;
    height: 2.9rem;
    border-radius: 0.95rem;
    background: linear-gradient(135deg, var(--g1), var(--g2));
    color: #fff;
    box-shadow: 0 8px 20px -10px var(--g1);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.1rem;
  }
  .title {
    font-weight: 600;
  }
  .tagline {
    font-size: 0.83rem;
    color: var(--text-dim);
  }
  .tile :global(.chev) {
    color: var(--text-faint);
    flex: none;
  }
  .field {
    display: grid;
    gap: 0.45rem;
  }
  .label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  .people {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.45rem;
    max-height: 15rem;
    overflow-y: auto;
  }
  .person {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.6rem 0.35rem 0.35rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-weight: 600;
    font-size: 0.9rem;
    min-width: 0;
  }
  .person.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .person.short {
    opacity: 0.45;
  }
  .who {
    display: grid;
    min-width: 0;
    text-align: left;
    line-height: 1.2;
  }
  .bal {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  .sum {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.35rem 1rem;
    padding: 0.8rem 1rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.9rem;
    color: var(--text-dim);
  }
  .total {
    color: var(--text);
    font-weight: 700;
    padding-top: 0.35rem;
    border-top: 1px solid var(--border);
  }
  .level {
    margin-left: 0.4rem;
    font-size: 1.1rem;
    color: var(--text);
  }
  .sound {
    display: grid;
    gap: 0.5rem;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    color: var(--text-dim);
    text-align: left;
  }
  .choice.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--text);
  }
  .songs {
    display: grid;
    gap: 0.35rem;
    max-height: 13rem;
    overflow-y: auto;
    padding-left: 0.6rem;
    border-left: 2px solid var(--accent);
  }
  .song-pick .art {
    flex: none;
    width: 2.3rem;
    height: 2.3rem;
    border-radius: 0.4rem;
    background: var(--surface-2) center / cover no-repeat;
  }
  .song-pick .name {
    min-width: 0;
    display: grid;
  }
  .song-pick {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.8rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    text-align: left;
    color: var(--text-dim);
  }
  .song-pick.active {
    border-color: var(--accent);
    color: var(--text);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .choice .what {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .slider {
    width: 100%;
    accent-color: var(--accent);
    height: 1.6rem;
  }
  .helper {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-height: 2.6rem;
    padding: 0.5rem 0.8rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .keys {
    display: grid;
    grid-template-columns: repeat(4, 0.7rem);
    gap: 0.2rem;
    flex: none;
  }
  .key {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 0.2rem;
    background: var(--c);
  }
  .small {
    font-size: 0.8rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.88rem;
  }
  .go {
    min-height: 3.4rem;
    font-size: 1.05rem;
    border-radius: var(--radius);
    background: var(--gradient);
  }
</style>
