<script lang="ts">
  import { HandCoins, Handshake } from '@lucide/svelte';
  import type { BluffView, MatchState } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Ring from '../../quiz/Ring.svelte';

  /** Both players face each other with a hidden card; the cards flip at the end */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as BluffView);
</script>

<div class="bluff">
  {#each m.players as p, i (p.id)}
    {@const choice = v.choices?.[p.id]}
    <div class="side" style:order={i * 2}>
      <Avatar name={p.name} color={p.color} id={p.id} size="8rem" />
      <strong>{p.name}</strong>
      <div class="cardbox">
        <div class="flipper" class:open={!!choice} style:--delay="{i * 0.9}s">
          <div class="face back" class:ready={v.chosen.includes(p.id)}>
            <span>{v.chosen.includes(p.id) ? 'Chosen' : 'Thinking...'}</span>
          </div>
          <div class="face front" class:steal={choice === 'steal'}>
            {#if choice === 'steal'}<HandCoins size="40%" /><span>Steal</span>{:else}<Handshake size="40%" /><span>Share</span>{/if}
          </div>
        </div>
      </div>
    </div>
  {/each}
  <div class="mid" style:order="1">
    <span class="eyebrow">Pot</span>
    <span class="pot"><Money amount={m.pot} /></span>
    {#if m.phase === 'play' && m.endsAt}<Ring endsAt={m.endsAt} totalMs={m.phaseMs} size="7rem" />{/if}
    {#if m.result}<h1 class="headline">{m.result.headline}</h1>{/if}
  </div>
</div>

<style>
  .bluff {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-evenly;
  }
  .side {
    display: grid;
    justify-items: center;
    gap: 1rem;
    font-size: 2rem;
  }
  .mid {
    display: grid;
    justify-items: center;
    gap: 1.2rem;
    max-width: 36rem;
    text-align: center;
  }
  .eyebrow {
    font-size: 1.3rem;
  }
  .pot {
    font-size: 4.5rem;
  }
  .headline {
    font-size: 3.4rem;
    animation: hb-fade-up 0.6s ease 1.8s both;
  }
  .cardbox {
    width: 15rem;
    height: 20rem;
    perspective: 60rem;
    margin-top: 1rem;
  }
  .flipper {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.9s cubic-bezier(0.3, 1.3, 0.5, 1);
    transition-delay: var(--delay);
  }
  .flipper.open {
    transform: rotateY(180deg);
  }
  .face {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 1rem;
    border-radius: 1.5rem;
    backface-visibility: hidden;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 2.2rem;
  }
  .back {
    background: repeating-linear-gradient(45deg, var(--surface-2) 0 1rem, var(--surface-3) 1rem 2rem), var(--surface);
    border: 2px solid var(--border-strong);
    color: var(--text-faint);
    font-size: 1.5rem;
  }
  .back.ready {
    border-color: var(--accent);
    color: var(--accent);
  }
  .front {
    transform: rotateY(180deg);
    background: var(--success);
    color: #fff;
  }
  .front.steal {
    background: var(--danger);
  }
</style>
