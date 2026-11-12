<script lang="ts">
  import { Coins, Crown } from '@lucide/svelte';
  import { attempt, hb, rpc } from '$lib/client.svelte.ts';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import type { WorldState } from '$shared/world.ts';

  /**
   * The King's title in the shop: who holds it and what taking it costs. The King wears the crown
   * in the town and now and then sits on the throne while the others come to pray. Anyone can take
   * the title, and its price rises each time it changes hands.
   */

  let { balance }: { balance: number | null } = $props();

  const mod = $derived(hb.modules.world as WorldState | undefined);
  const king = $derived(mod?.king);
  const kingName = $derived(king?.id ? (mod?.characters.find((c) => c.id === king.id)?.name ?? null) : null);
  const mine = $derived(!!king?.id && king.id === hb.me?.id);
  const short = $derived(!!king && balance !== null && balance < king.price);

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
          {mine ? 'Someone can take the title from you at any time.' : kingName ? 'Take the title and the crown is yours.' : 'Be the first King of the town.'}
        </span>
      </div>
    </div>
    <p class="faint small">
      The King wears the crown in the town and now and then sits on the throne, while the others come to pray. The price rises each time the title
      changes hands.
    </p>
    {#if !mine}
      <TwoStepButton class="primary take" disabled={short} onconfirm={take}>
        <Crown size={18} />Take the title for {king.price} {mod?.shop?.currencyName ?? ''}
        {#snippet armed()}<Coins size={18} />Tap again to pay {king.price}{/snippet}
      </TwoStepButton>
      {#if short}
        <p class="faint small center">You have {balance} {mod?.shop?.currencyName ?? ''}: not enough yet.</p>
      {/if}
    {:else}
      <p class="next small">Taking it from you now costs {king.price} {mod?.shop?.currencyName ?? ''}.</p>
    {/if}
  </div>
{/if}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
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
  .card p {
    margin: 0;
  }
  .small {
    font-size: 0.84rem;
  }
  .center {
    text-align: center;
  }
  .next {
    color: var(--text-dim);
  }
  .card :global(.take) {
    justify-content: center;
  }
</style>
