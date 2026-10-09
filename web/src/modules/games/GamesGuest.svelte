<script lang="ts">
  import { ChevronRight, Music, Pause, Play, Swords, User, Users, VolumeX } from '@lucide/svelte';
  import {
    GAMES,
    RHYTHM_COLORS,
    RHYTHM_DEFAULT_COLORS,
    RHYTHM_DEFAULT_DIFFICULTY,
    RHYTHM_DIFFICULTIES,
    RHYTHM_MAX_COLORS,
    rhythmDifficulty,
    type GameInfo,
    type GameMode,
    type RhythmDifficulty,
    type RhythmSongInfo,
  } from '$shared/games.ts';
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
  /** Played alone (games that can be): no opponent, no bet */
  let solo = $state(false);
  let stakeText = $state('');
  /** Rhythm Rain: number of colors (keys) and difficulty, sent with the challenge */
  let colors = $state(RHYTHM_DEFAULT_COLORS);
  let chart = $state<RhythmDifficulty>(RHYTHM_DEFAULT_DIFFICULTY);
  const level = $derived(rhythmDifficulty(chart));
  let busy = $state(false);
  let error = $state('');

  const s = $derived(gamesState());
  /** Rhythm Rain on one of the host's songs (its own price) */
  let music = $state(false);
  let songPick = $state('');
  const songs = $derived((s?.rhythmSongs ?? []).filter((x) => x.status === 'ready'));
  const has = (x: RhythmSongInfo, d: RhythmDifficulty) => !!x.charts?.some((c) => c.id === d);
  // Songs whose map has this difficulty come first; the others show theirs, a tap on one switches to it
  const fits = $derived(songs.filter((x) => has(x, chart)));
  const misses = $derived(songs.filter((x) => !has(x, chart)));
  const song = $derived(fits.find((x) => x.key === songPick) ?? fits[0] ?? null);
  const npsOf = (x: RhythmSongInfo) => x.charts?.find((c) => c.id === chart)?.nps;
  const withMusic = $derived(picked?.id === 'rhythm' && mode === 'duel' && music && !!song);
  const canSolo = $derived(mode === 'duel' && !!picked?.modes.includes('solo'));
  const isSolo = $derived(canSolo && solo);
  const economy = $derived(!!hb.core?.economyEnabled);
  const list = $derived(GAMES.filter((g) => g.modes.includes(mode) && s?.settings.enabled.includes(g.id)));
  // Richest first: the ones who can match a big bet
  const others = $derived((s?.online ?? []).filter((p) => p.id !== hb.me?.id).sort((a, b) => b.balance - a.balance));
  const opponentName = $derived(others.find((p) => p.id === opponent)?.name);
  const stake = $derived(economy ? Math.max(0, parseAmount(stakeText || '0')) : 0);
  const fee = $derived(price(mode === 'duel' ? (withMusic ? 'games.rhythmMusic' : isSolo ? 'games.solo' : 'games.duel') : 'games.room'));
  const maxStake = $derived(s?.settings.maxStake ?? 0);
  const tvBusy = $derived(!!s?.match || (!!hb.core?.takeover && hb.core.takeover !== 'games'));

  function open(g: GameInfo) {
    picked = g;
    error = '';
  }

  // Hear 5 seconds of a song before picking it: BeatSaver's preview, or the best part from the party's copy
  const PREVIEW_MS = 5000;
  let audio: HTMLAudioElement | null = null;
  let previewing = $state<string | null>(null);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  function stopPreview() {
    clearTimeout(previewTimer);
    audio?.pause();
    audio = null;
    previewing = null;
  }
  function listen(x: RhythmSongInfo, local = false) {
    const again = previewing === x.key && !local;
    stopPreview();
    if (again) return;
    const src = local ? x.url : (x.preview ?? x.url);
    if (!src) return;
    const a = new Audio(src);
    audio = a;
    previewing = x.key;
    a.volume = 0.85;
    if (src === x.url && x.previewMs) a.addEventListener('loadedmetadata', () => (a.currentTime = x.previewMs! / 1000), { once: true });
    // The 5 seconds count from when it is heard, then it fades out
    a.addEventListener(
      'playing',
      () => {
        previewTimer = setTimeout(() => {
          const fade = setInterval(() => {
            if (audio !== a || a.volume <= 0.1) {
              clearInterval(fade);
              if (audio === a) stopPreview();
              return;
            }
            a.volume = Math.max(0, a.volume - 0.12);
          }, 60);
        }, PREVIEW_MS - 450);
      },
      { once: true },
    );
    a.onended = () => audio === a && stopPreview();
    // BeatSaver out of reach: the party's own copy
    a.onerror = () => audio === a && (src !== x.url && x.url ? listen(x, true) : stopPreview());
    a.play().catch(() => audio === a && stopPreview());
  }
  $effect(() => () => stopPreview());
  $effect(() => {
    if (!picked || !music) stopPreview();
  });

  async function send() {
    if (!picked) return;
    error = '';
    if (isSolo) {
      busy = true;
      const ok = await attempt(() => rpc('games', 'solo', { game: picked!.id, colors, chart, ...(withMusic ? { song: song!.key } : {}) }));
      busy = false;
      if (ok) picked = null;
      return;
    }
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
        ? await attempt(() => rpc('games', 'invite', { game: picked!.id, to: opponent, stake, ...(picked!.id === 'rhythm' ? { colors, chart, ...(withMusic ? { song: song!.key } : {}) } : {}) }))
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

{#snippet songRow(x: RhythmSongInfo, fit: boolean)}
  <div class="song-pick" class:active={fit && song?.key === x.key} class:miss={!fit}>
    <button
      class="art"
      class:on={previewing === x.key}
      style:background-image={x.cover ? `url("${x.cover}")` : undefined}
      aria-label={previewing === x.key ? 'Stop' : `Listen to ${x.title}`}
      onclick={() => listen(x)}
    >
      <span class="play">{#if previewing === x.key}<Pause size={16} />{:else}<Play size={16} />{/if}</span>
    </button>
    <span class="name">
      <button class="title-btn" disabled={!fit} onclick={() => (songPick = x.key)}>
        <strong class="truncate">{x.title}</strong>
        {#if x.artist}<span class="faint small truncate">{x.artist}</span>{/if}
      </button>
      <span class="diffs">
        {#each RHYTHM_DIFFICULTIES as d (d.id)}
          {#if has(x, d.id)}
            <button
              class="diff"
              class:on={d.id === chart}
              title={d.name}
              onclick={() => {
                chart = d.id;
                songPick = x.key;
              }}>{d.short}</button
            >
          {/if}
        {/each}
        {#if fit && npsOf(x)}<span class="faint tiny">{npsOf(x)!.toFixed(1)} notes/s</span>{/if}
      </span>
    </span>
  </div>
{/snippet}

{#if picked}
  <Sheet title={isSolo ? 'Solo game' : mode === 'duel' ? 'New duel' : 'Game for everyone'} onclose={() => (picked = null)}>
    <GameCard game={picked} />

    {#if picked.id === 'rhythm'}
      <div class="field">
        <span class="label">Colors <span class="faint">one key each on your phone</span></span>
        <div class="seg">
          {#each Array.from({ length: RHYTHM_MAX_COLORS }, (_, i) => i + 1) as n (n)}
            <button class="seg-btn" class:active={colors === n} onclick={() => (colors = n)} aria-label={`${n} colors`}>
              <span class="keys">{#each RHYTHM_COLORS.slice(0, n) as c (c.id)}<span class="key" style:--c={c.hex}></span>{/each}</span>
              <strong class="mono">{n}</strong>
            </button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span class="label">Difficulty</span>
        <div class="seg five">
          {#each RHYTHM_DIFFICULTIES as d (d.id)}
            {@const count = songs.filter((x) => has(x, d.id)).length}
            <button class="seg-btn" class:active={chart === d.id} onclick={() => (chart = d.id)}>
              <strong>{d.name}</strong>
              {#if music && songs.length}<span class="faint tiny">{count === 1 ? '1 song' : `${count} songs`}</span>{/if}
            </button>
          {/each}
        </div>
        <span class="dim small">{level.help}</span>
      </div>

      {#if songs.length}
        <div class="field">
          <span class="label">Sound</span>
          <div class="sound">
            <button class="choice" class:active={!music} onclick={() => (music = false)}>
              <VolumeX size={20} />
              <span class="what"><strong>No music</strong><span class="faint small">Just the beat of the lights</span></span>
              {#if economy}<Money amount={price(isSolo ? 'games.solo' : 'games.duel')} free />{/if}
            </button>
            <button class="choice" class:active={music} onclick={() => (music = true)}>
              <Music size={20} />
              <span class="what"><strong>With music</strong><span class="faint small truncate">{songs.length === 1 ? `${songs[0].artist ? `${songs[0].artist} - ` : ''}${songs[0].title}` : `${songs.length} songs to pick from`}</span></span>
              {#if economy}<Money amount={price('games.rhythmMusic')} free />{/if}
            </button>
            {#if music}
              <div class="songs">
                {#each fits as x (x.key)}
                  {@render songRow(x, true)}
                {:else}
                  <p class="faint small none">No song has a {level.name} chart. Pick one of the difficulties below a song.</p>
                {/each}
                {#if misses.length}
                  <span class="eyebrow other">Not in {level.name}</span>
                  {#each misses as x (x.key)}
                    {@render songRow(x, false)}
                  {/each}
                {/if}
              </div>
              <span class="faint small">Tap a cover to hear 5 seconds of it. The letters are the difficulties a song has.</span>
            {/if}
          </div>
        </div>
      {/if}
    {/if}

    {#if mode === 'duel'}
      <div class="field">
        <span class="label">{canSolo ? 'Who do you play against?' : 'Who do you challenge?'}</span>
        <div class="people">
          {#if canSolo}
            <button class="person" class:active={solo} onclick={() => (solo = true)}>
              <span class="me"><User size={18} /></span>
              <span class="who"><span class="truncate">Nobody</span><span class="bal">Play solo</span></span>
            </button>
          {/if}
          {#each others as p (p.id)}
            {@const short = economy && stake > p.balance}
            <button class="person" class:active={!isSolo && opponent === p.id} class:short disabled={short} onclick={() => ((opponent = p.id), (solo = false))}>
              <Avatar name={p.name} color={p.color} id={p.id} size="2.2rem" />
              <span class="who">
                <span class="truncate">{p.name}</span>
                {#if economy}
                  <span class="bal">{#if short}Can't match{:else}<Money amount={p.balance} />{/if}</span>
                {/if}
              </span>
            </button>
          {:else}
            {#if !canSolo}<p class="faint small">Nobody else is online right now.</p>{/if}
          {/each}
        </div>
      </div>
    {/if}

    {#if economy && isSolo}
      <div class="sum">
        <span class="pay">You pay now</span><span class="pay"><Money amount={fee} free /></span>
      </div>
    {:else if economy}
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

    {#if tvBusy}<p class="faint small">A game is on the TV right now. {mode === 'duel' && !isSolo ? 'They can accept once it is over.' : 'Wait for it to end.'}</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}

    <button class="btn primary block go" disabled={busy || ((mode === 'room' || isSolo) && tvBusy)} onclick={send}>
      {#if isSolo}<Play size={18} /> Play now{:else if mode === 'duel'}<Swords size={18} /> Send the challenge{:else}<Users size={18} /> Start for everyone{/if}
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
  .me {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    background: var(--gradient);
    color: #fff;
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
  .pay {
    color: var(--text);
    font-weight: 700;
  }
  .total {
    color: var(--text);
    font-weight: 700;
    padding-top: 0.35rem;
    border-top: 1px solid var(--border);
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
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    padding: 0;
    border: 0;
    border-radius: 0.5rem;
    background: var(--surface-2) center / cover no-repeat;
    color: #fff;
  }
  .song-pick .play {
    position: relative;
    display: grid;
    place-items: center;
    width: 1.7rem;
    height: 1.7rem;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.5);
  }
  /* A ring fills around the button while the 5 seconds play */
  .song-pick .art.on .play::before {
    content: '';
    position: absolute;
    inset: -0.2rem;
    border-radius: 50%;
    background: conic-gradient(var(--accent) var(--p, 0%), transparent 0);
    -webkit-mask: radial-gradient(circle, transparent 58%, #000 60%);
    mask: radial-gradient(circle, transparent 58%, #000 60%);
    animation: listen 5s linear forwards;
  }
  @property --p {
    syntax: '<percentage>';
    inherits: false;
    initial-value: 0%;
  }
  @keyframes listen {
    to {
      --p: 100%;
    }
  }
  .song-pick .name {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.25rem;
  }
  .title-btn {
    min-width: 0;
    display: grid;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
  }
  .song-pick.miss .title-btn {
    opacity: 0.55;
  }
  .diffs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }
  .diff {
    min-width: 1.7rem;
    padding: 0.05rem 0.35rem;
    border-radius: 0.35rem;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: 0.72rem;
    font-weight: 700;
  }
  .diff.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .other {
    margin-top: 0.4rem;
  }
  .none {
    padding: 0.3rem 0;
  }
  .tiny {
    font-size: 0.72rem;
  }
  .seg {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.35rem;
  }
  .seg.five {
    grid-template-columns: repeat(5, 1fr);
  }
  .seg-btn {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.25rem;
    min-height: 3.2rem;
    padding: 0.4rem 0.2rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: 0.85rem;
  }
  .seg-btn.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--text);
  }
  .song-pick {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.8rem 0.4rem 0.4rem;
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
  .keys {
    display: flex;
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
