<script lang="ts">
  import { Check, Undo2 } from '@lucide/svelte';
  import { fade } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import { partyColor, type PartyColor, type PartyView, type StackView } from '$shared/party.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Fuse from '../../ui/Fuse.svelte';
  import Locked from '../ui/Locked.svelte';
  import Watch from '../ui/Watch.svelte';
  import StackColumn from '../ui/StackColumn.svelte';

  /** Stack on a phone: watch the tower, then rebuild it from the bottom with Undo and Done */
  let { m, v }: { m: MatchState; v: PartyView } = $props();
  const mini = $derived(v.mini as StackView);
  const me = $derived(hb.me?.id ?? '');
  let tower = $state<PartyColor[]>([]);
  let locked = $state(false);

  // Every change goes to the server, so what is built counts even if time runs out
  const send = (done = false) => attempt(() => rpc('games', 'play', { list: tower, done }));
  function place(c: PartyColor) {
    if (locked || tower.length >= mini.blocks) return;
    tower = [...tower, c];
    void send();
  }
  function undo() {
    if (locked || !tower.length) return;
    tower = tower.slice(0, -1);
    void send();
  }
  async function lock() {
    locked = true;
    if (!(await send(true))) locked = false;
  }
</script>

{#if mini.phase === 'drop' || mini.phase === 'memo'}
  <Watch title={mini.phase === 'drop' ? 'Watch the blocks fall' : 'Remember the tower'}>
    <p class="dim">{mini.blocks} blocks, from the bottom up.</p>
    {#if mini.phase === 'memo' && m.endsAt}<Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="It falls in" />{/if}
  </Watch>
{:else if mini.phase === 'fall'}
  <div class="col big-gap" in:fade><h1>Now build it!</h1></div>
{:else if mini.phase === 'input'}
  <div class="build" in:fade>
    <div class="column"><StackColumn blocks={mini.blocks} list={tower} /></div>
    <div class="side">
      <p class="dim small">From the bottom up. {tower.length} of {mini.blocks}</p>
      <div class="keys">
        {#each mini.colors as id (id)}
          {@const c = partyColor(id)!}
          <button class="key" style:--c={c.hex} aria-label={c.name} disabled={locked || tower.length >= mini.blocks} onclick={() => place(id)}></button>
        {/each}
      </div>
      <button class="btn block" disabled={locked || !tower.length} onclick={undo}><Undo2 size={18} /> Undo</button>
      {#if locked}
        <Locked text="Locked in" />
      {:else}
        <button class="btn primary block big" disabled={!tower.length} onclick={lock}><Check size={20} /> Done</button>
      {/if}
    </div>
    {#if m.endsAt}<div class="fuse"><Fuse endsAt={m.endsAt} totalMs={m.phaseMs} label="Time left" /></div>{/if}
  </div>
{:else if mini.phase === 'reveal' && mini.tower}
  <div class="col" in:fade>
    <h1>{mini.correct?.[me] ?? 0} of {mini.blocks} right</h1>
    <div class="compare">
      <div class="labeled"><StackColumn blocks={mini.blocks} list={mini.tower} width="4rem" /><span class="dim small">The tower</span></div>
      <div class="labeled"><StackColumn blocks={mini.blocks} list={mini.answers?.[me] ?? []} check={mini.tower} width="4rem" /><span class="dim small">Yours</span></div>
    </div>
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
  .big-gap {
    padding: 3rem 0;
  }
  h1 {
    font-size: 2rem;
    line-height: 1.1;
  }
  .small {
    font-size: 0.82rem;
  }
  .build {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: 1fr auto;
    gap: 1rem;
    height: min(70vh, 34rem);
  }
  .column {
    min-height: 0;
    display: grid;
  }
  .side {
    display: grid;
    align-content: end;
    gap: 0.7rem;
  }
  .fuse {
    grid-column: 1 / -1;
  }
  .keys {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .key {
    aspect-ratio: 1;
    border: 0;
    border-radius: 1.2rem;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 70%, #fff), var(--c) 60%);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--c) 40%, transparent),
      0 12px 26px -14px var(--c);
    touch-action: manipulation;
    transition: transform 0.08s ease;
  }
  .key:active:not(:disabled) {
    transform: scale(0.93);
    filter: brightness(1.3);
  }
  .key:disabled {
    filter: saturate(0.3) brightness(0.6);
  }
  .big {
    min-height: 3.5rem;
    font-size: 1.1rem;
    border-radius: var(--radius);
    background: var(--gradient);
  }
  .compare {
    display: flex;
    gap: 1.5rem;
    justify-content: center;
    height: min(55vh, 26rem);
  }
  .labeled {
    display: grid;
    grid-template-rows: 1fr auto;
    justify-items: center;
    gap: 0.4rem;
    min-height: 0;
  }
</style>
