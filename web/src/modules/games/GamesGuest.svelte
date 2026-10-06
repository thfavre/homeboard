<script lang="ts">
  import { ChevronRight, Swords, Users } from '@lucide/svelte';
  import { GAMES, type GameInfo, type GameMode } from '$shared/games.ts';
  import { formatAmount, parseAmount } from '$shared/money.ts';
  import { hb, rpc, attempt, price } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { GAME_ICONS, gamesState } from './store.svelte.ts';

  let mode = $state<GameMode>('duel');
  let picked = $state<GameInfo | null>(null);
  let opponent = $state<string | null>(null);
  let stakeText = $state('');
  let side = $state<'heads' | 'tails'>('heads');
  let busy = $state(false);
  let error = $state('');

  const s = $derived(gamesState());
  const economy = $derived(!!hb.core?.economyEnabled);
  const list = $derived(GAMES.filter((g) => g.modes.includes(mode) && s?.settings.enabled.includes(g.id)));
  const others = $derived((s?.online ?? []).filter((p) => p.id !== hb.me?.id));
  const stake = $derived(economy ? Math.max(0, parseAmount(stakeText || '0')) : 0);
  const fee = $derived(price(mode === 'duel' ? 'games.duel' : 'games.room'));
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
    if (maxStake > 0 && stake > maxStake) {
      error = `The stake is limited to ${formatAmount(maxStake)}`;
      return;
    }
    busy = true;
    const ok =
      mode === 'duel'
        ? await attempt(() => rpc('games', 'invite', { game: picked!.id, to: opponent, stake, side }))
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
      <button class="tile card" onclick={() => open(g)}>
        <span class="icon"><Icon size={22} /></span>
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
  {@const Icon = GAME_ICONS[picked.id]}
  <Sheet title={picked.name} onclose={() => (picked = null)}>
    <div class="head">
      <span class="icon"><Icon size={22} /></span>
      <p class="dim rules">{picked.rules}</p>
    </div>

    {#if mode === 'duel'}
      <div class="field">
        <span class="label">Who do you challenge?</span>
        <div class="people">
          {#each others as p (p.id)}
            <button class="person" class:active={opponent === p.id} onclick={() => (opponent = p.id)}>
              <Avatar name={p.name} color={p.color} id={p.id} size="2rem" />
              <span class="truncate">{p.name}</span>
            </button>
          {:else}
            <p class="faint small">Nobody else is online right now.</p>
          {/each}
        </div>
      </div>
      {#if picked.id === 'coin'}
        <div class="field">
          <span class="label">Your side</span>
          <div class="sides">
            <button class:active={side === 'heads'} onclick={() => (side = 'heads')}>Heads</button>
            <button class:active={side === 'tails'} onclick={() => (side = 'tails')}>Tails</button>
          </div>
        </div>
      {/if}
    {/if}

    {#if economy}
      <label class="field">
        <span class="label">{mode === 'duel' ? 'Your stake (they put in the same)' : 'Entry for each player'}</span>
        <input class="input mono" inputmode="decimal" placeholder="0" bind:value={stakeText} />
        {#if maxStake > 0}<span class="faint small">Up to {formatAmount(maxStake)}</span>{/if}
      </label>
      <div class="sum">
        <span>{mode === 'duel' ? 'Challenge fee' : 'Start fee'}</span><Money amount={fee} free />
        <span>{mode === 'duel' ? 'Your stake' : 'Your entry'}</span><Money amount={stake} />
        <span class="total">You pay now</span><span class="total"><Money amount={fee + stake} /></span>
      </div>
      <p class="faint small">
        {mode === 'duel'
          ? 'Everything comes back if they decline or do not answer within a minute.'
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
  .tabs,
  .sides {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
    padding: 0.3rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .tabs button,
  .sides button {
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
  .tabs button.active,
  .sides button.active {
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
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
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
  .head {
    display: flex;
    gap: 0.8rem;
    align-items: flex-start;
  }
  .rules {
    font-size: 0.9rem;
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
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 0.45rem;
    max-height: 13rem;
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
  .small {
    font-size: 0.8rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.88rem;
  }
  .go {
    min-height: 3.2rem;
    font-size: 1.02rem;
  }
</style>
