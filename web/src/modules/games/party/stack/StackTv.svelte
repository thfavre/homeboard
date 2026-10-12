<script lang="ts">
  import { fly, scale } from 'svelte/transition';
  import type { MatchState } from '$shared/games.ts';
  import type { PartyView, StackView } from '$shared/party.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import TvPrompt from '../ui/TvPrompt.svelte';
  import TvPlayers from '../ui/TvPlayers.svelte';
  import StackColumn from '../ui/StackColumn.svelte';

  /** Stack on the TV: what to do, then the real tower next to every player's */
  let { m, v }: { m: MatchState; v: PartyView } = $props();
  const mini = $derived(v.mini as StackView);
  const status = (id: string) =>
    mini.phase !== 'input' ? null : mini.done.includes(id) ? { done: true } : { text: `${mini.progress[id] ?? 0}/${mini.blocks}` };
</script>

{#if mini.phase === 'reveal' && mini.tower}
  <div class="towers">
    <div class="labeled real"><StackColumn blocks={mini.blocks} list={mini.tower} width="6rem" /><strong>The tower</strong></div>
    {#each m.players as p, i (p.id)}
      <div class="labeled" in:fly={{ y: 30, delay: 400 + i * 200 }}>
        <StackColumn blocks={mini.blocks} list={mini.answers?.[p.id] ?? []} check={mini.tower} width="3.6rem" />
        <Avatar name={p.name} color={p.color} id={p.id} size="2.2rem" />
        <span class="mono">{mini.correct?.[p.id] ?? 0}</span>
      </div>
    {/each}
  </div>
{:else}
  <div class="stage">
    <div class="main">
      {#if mini.phase === 'drop'}
        <TvPrompt {m} title="Watch the blocks fall" sub={`${mini.blocks} blocks stack up to the top`} />
      {:else if mini.phase === 'memo'}
        <TvPrompt {m} title="Remember the tower" sub="From the bottom up, before it falls" />
      {:else if mini.phase === 'fall'}
        <h1 in:scale={{ start: 1.4 }}>It falls!</h1>
      {:else}
        <TvPrompt {m} title="Build it on your phone" sub="From the bottom up" eye={false} />
      {/if}
    </div>
    <TvPlayers players={m.players} {status} />
  </div>
{/if}

<style>
  .stage {
    min-height: 0;
    height: 100%;
    display: grid;
    grid-template-columns: 1fr 22rem;
    gap: 2.5rem;
    align-items: center;
  }
  .main {
    display: grid;
    justify-items: center;
  }
  h1 {
    font-size: 4rem;
  }
  .towers {
    height: 100%;
    max-height: 38rem;
    align-self: center;
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 1.4rem;
  }
  .labeled {
    display: grid;
    grid-template-rows: 1fr auto auto;
    justify-items: center;
    gap: 0.5rem;
    min-height: 0;
    font-size: 1.3rem;
    font-weight: 700;
  }
  .real {
    margin-right: 2rem;
  }
</style>
