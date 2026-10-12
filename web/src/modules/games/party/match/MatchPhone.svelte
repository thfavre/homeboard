<script lang="ts">
  import { Check } from '@lucide/svelte';
  import { fade } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import { hueSatCss, type HueSat, type MatchView, type PartyView } from '$shared/party.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Fuse from '../../ui/Fuse.svelte';
  import Locked from '../ui/Locked.svelte';
  import Watch from '../ui/Watch.svelte';
  import HueSatPicker from '../ui/HueSatPicker.svelte';

  /** Color Match on a phone: remember the color, make it on the wheel, then see it next to the real one */
  let { m, v }: { m: MatchState; v: PartyView } = $props();
  const mini = $derived(v.mini as MatchView);
  const me = $derived(hb.me?.id ?? '');
  const nameOf = (id: string) => m.players.find((p) => p.id === id)?.name;
  // Starts on a random hue, half way to white: no head start
  let color = $state<HueSat>({ h: Math.floor(Math.random() * 360), s: 0.5 });
  let locked = $state(false);

  // The color goes to the server a few times a second while it moves, so it counts even if time runs out
  let pending: ReturnType<typeof setTimeout> | null = null;
  function set(c: HueSat) {
    if (locked) return;
    color = c;
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      if (!locked) void attempt(() => rpc('games', 'play', { h: color.h, s: color.s }));
    }, 250);
  }
  async function lock() {
    locked = true;
    if (pending) clearTimeout(pending);
    pending = null;
    if (!(await attempt(() => rpc('games', 'play', { h: color.h, s: color.s, done: true })))) locked = false;
  }
</script>

{#if mini.phase === 'show'}
  <Watch title="Remember this color">
    <p class="dim">Look at the light strip.</p>
    {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="On for" />{/if}
  </Watch>
{:else if mini.phase === 'input'}
  <div class="col" in:fade>
    <h2>Make the same color</h2>
    <span class="swatch" style:background={hueSatCss(color)}></span>
    <HueSatPicker value={color} onchange={set} disabled={locked} />
    {#if locked}
      <Locked text="Locked in" />
    {:else}
      <button class="btn primary block big" onclick={lock}><Check size={20} /> This one</button>
    {/if}
    {#if m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Time left" />{/if}
  </div>
{:else if mini.phase === 'reveal' && mini.target && mini.order}
  {@const shown = mini.order[mini.showing ?? -1]}
  {@const mine = mini.guesses?.[me] ?? null}
  <div class="col" in:fade>
    <span class="eyebrow">{shown ? `On the light: ${shown === me ? 'yours' : `${nameOf(shown)}'s`}` : 'Look at the light'}</span>
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

<style>
  .col {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 1rem;
    padding: 0.5rem 0;
  }
  h1 {
    font-size: 2rem;
  }
  h2 {
    font-size: 1.4rem;
  }
  .small {
    font-size: 0.82rem;
  }
  .big {
    min-height: 3.5rem;
    font-size: 1.1rem;
    border-radius: var(--radius);
    background: var(--gradient);
  }
  .pair {
    display: flex;
    gap: 1.5rem;
    justify-content: center;
  }
  .labeled {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
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
</style>
