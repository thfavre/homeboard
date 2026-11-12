<script lang="ts">
  import { Coins, Crown } from '@lucide/svelte';
  import { attempt, hb, rpc } from '$lib/client.svelte.ts';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import type { WorldState } from '$shared/world.ts';
  import Monarchy from './Monarchy.svelte';

  /**
   * The King's title in the shop: who holds it, one line, and the button to take it. Anyone can,
   * and its price rises each time it changes hands. Below it, the monarchy: every King so far.
   */

  let { balance }: { balance: number | null } = $props();

  const mod = $derived(hb.modules.world as WorldState | undefined);
  const king = $derived(mod?.king);
  const kingName = $derived(king?.id ? (mod?.characters.find((c) => c.id === king.id)?.name ?? null) : null);
  const mine = $derived(!!king?.id && king.id === hb.me?.id);
  const short = $derived(!!king && balance !== null && balance < king.price);
  const money = $derived(mod?.shop?.currencyName ?? '');

  async function take() {
    if (!king) return;
    // The price seen here goes along: if someone was quicker, nothing is paid
    await attempt(() => rpc('world', 'buyKing', { price: king.price }), 'Long live the King');
  }
</script>

{#if king}
  <div class="card" class:mine>
    <div class="head">
      <span class="badge"><Crown size={22} /></span>
      <div class="who">
        <span class="title">{mine ? 'You are the King' : kingName ? `${kingName} is the King` : 'The throne is empty'}</span>
        <span class="faint small">
          {mine ? `Anyone can take your crown for ${king.price} ${money}.` : short ? `The crown costs ${king.price} ${money}: you have ${balance}.` : 'One crown, and it can be yours.'}
        </span>
      </div>
    </div>
    {#if !mine}
      <TwoStepButton class="primary take" disabled={short} onconfirm={take}>
        <Crown size={18} />Take the crown for {king.price} {money}
        {#snippet armed()}<Coins size={18} />Tap again to pay {king.price}{/snippet}
      </TwoStepButton>
    {/if}
  </div>
  <Monarchy />
{/if}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    margin-bottom: 0.7rem;
    padding: 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .card.mine {
    border-color: color-mix(in srgb, var(--warning) 60%, var(--border));
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  .badge {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--warning) 22%, var(--surface));
    color: var(--warning);
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .title {
    font-weight: 700;
    font-size: 1.02rem;
  }
  .small {
    font-size: 0.84rem;
  }
  .card :global(.take) {
    justify-content: center;
  }
</style>
