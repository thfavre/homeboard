<script lang="ts">
  import { Dices, Swords } from '@lucide/svelte';
  import { ARCADE_COUNTS, type ArcadeCount } from '$shared/arcade.ts';
  import { formatAmount, parseAmount } from '$shared/money.ts';
  import { attempt, hb, price, rpc } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { arcadeState } from './store.svelte.ts';

  /**
   * A challenge in the Arcade: how many games (drawn at random, each one a surprise when its round
   * starts), who to play, the bet, and the button. Used by the Arcade's panel, the town's actions
   * and the Games' 1 vs 1 list.
   */
  let { onsent }: { onsent?: () => void } = $props();

  const s = $derived(arcadeState());
  const economy = $derived(!!hb.core?.economyEnabled);
  let count = $state<ArcadeCount>(3);
  const COUNT_TEXT: Record<ArcadeCount, string> = { 1: 'One game', 3: 'Best of 3', 5: 'Best of 5' };
  const COUNT_HINT: Record<ArcadeCount, string> = { 1: 'Quick: one random game decides it', 3: 'First to win 2 of 3 random games', 5: 'First to win 3 of 5 random games' };

  let opponent = $state<string | null>(null);
  let stakeText = $state('');
  let busy = $state(false);
  let error = $state('');

  const others = $derived((s?.online ?? []).filter((p) => p.id !== hb.me?.id).sort((a, b) => a.name.localeCompare(b.name)));
  const opponentName = $derived(others.find((p) => p.id === opponent)?.name);
  const stake = $derived(economy ? Math.max(0, parseAmount(stakeText || '0')) : 0);
  const fee = $derived(price('arcade.challenge'));
  const maxStake = $derived(s?.settings.maxStake ?? 0);

  async function send() {
    error = '';
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
    const ok = await attempt(() => rpc('arcade', 'invite', { count, to: opponent, stake }));
    busy = false;
    if (ok) {
      opponent = null;
      stakeText = '';
      onsent?.();
    }
  }
</script>

<div class="challenge">
  <div class="field">
    <span class="label">How many games?</span>
    <div class="counts">
      {#each ARCADE_COUNTS as n (n)}
        <button class="count" class:active={count === n} onclick={() => (count = n)}>
          <span class="dice" aria-hidden="true">{#each Array.from({ length: n }) as _, i (i)}<span class="pip"></span>{/each}</span>
          <strong>{COUNT_TEXT[n]}</strong>
        </button>
      {/each}
    </div>
    <span class="hint dim small"><Dices size={15} /> {COUNT_HINT[count]}. The Arcade picks the games: you find out each one when it starts.</span>
  </div>

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
</div>

<style>
  .challenge {
    display: grid;
    gap: 1rem;
  }
  .counts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .count {
    display: grid;
    justify-items: center;
    gap: 0.45rem;
    padding: 0.8rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.88rem;
  }
  .count.active {
    border-color: transparent;
    background: linear-gradient(135deg, #ff4fb0, #8b5bff);
    color: #fff;
    box-shadow: 0 8px 20px -10px #ff4fb0;
  }
  .dice {
    display: flex;
    gap: 3px;
    height: 0.6rem;
    align-items: center;
  }
  .pip {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 3px;
    background: currentColor;
    opacity: 0.85;
  }
  .hint {
    display: inline-flex;
    align-items: flex-start;
    gap: 0.4rem;
  }
  .hint :global(svg) {
    flex: none;
    margin-top: 0.1rem;
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
  .people p {
    grid-column: 1 / -1;
    margin: 0;
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
</style>
