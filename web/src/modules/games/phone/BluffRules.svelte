<script lang="ts">
  import { EyeOff, MessagesSquare, Timer } from '@lucide/svelte';
  import { bluffDeal, gameInfo, type MatchState } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import GameCard from '../ui/GameCard.svelte';
  import { gamesState } from '../store.svelte.ts';
  import BluffOdds from '../ui/BluffOdds.svelte';

  /** Bluff's rules on the phone, with what each outcome pays in this duel */
  let { m }: { m: MatchState } = $props();
  const me = $derived(hb.me?.id ?? '');
  const other = $derived(m.players.find((p) => p.id !== me)?.name ?? 'They');
  const deal = $derived(m.bluff ?? bluffDeal(m.stake, 0, 0));
  const economy = $derived(!!hb.core?.economyEnabled);
  const chooseSec = $derived(gamesState()?.settings.bluffChooseSec || 30);
</script>

<div class="rules">
  <GameCard game={gameInfo('bluff')!} eyebrow="Read the rules" steps={false} />
  <div class="block">
    <div class="label">
      <span class="eyebrow">What you can win</span>
      {#if economy && deal.stake > 0}<span class="faint small">Your bet <Money amount={deal.stake} /></span>{/if}
    </div>
    <BluffOdds {deal} {other} {economy} />
    {#if economy && deal.bonus > 0}
      <p class="faint small center">Both share: your bet back plus a <Money amount={deal.bonus} /> bonus each. One steals: takes it all, both bonuses included.</p>
    {/if}
  </div>
  <ol class="tips">
    <li style:animation-delay="300ms"><MessagesSquare size={18} /><span>Talk it over with {other}. Promise what you like: nobody has to keep it.</span></li>
    <li style:animation-delay="380ms"><EyeOff size={18} /><span>Choose in secret on your phone. You can change your mind until you have both chosen.</span></li>
    <li style:animation-delay="460ms"><Timer size={18} /><span>{chooseSec} seconds to choose. No choice counts as sharing. The TV turns both cards over.</span></li>
  </ol>
</div>

<style>
  .rules {
    display: grid;
    gap: 1rem;
    width: 100%;
  }
  .block {
    display: grid;
    gap: 0.6rem;
  }
  .label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .small {
    font-size: 0.8rem;
  }
  .center {
    text-align: center;
  }
  .tips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.55rem;
  }
  .tips li {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    font-size: 0.9rem;
    color: var(--text-dim);
    animation: hb-fade-up 0.35s ease both;
  }
  .tips :global(svg) {
    flex: none;
    margin-top: 0.1rem;
    color: #ff3b8d;
  }
</style>
