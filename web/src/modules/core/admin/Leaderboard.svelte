<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import { STAT_BOARDS } from '$shared/protocol.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';

  const core = $derived(hb.core!);
  const admin = $derived(core.admin!);
  const boardSeconds = new Synced(() => hb.core?.admin?.boardSeconds, 15);
  const songBoardPlayers = new Synced(() => hb.core?.admin?.songBoardPlayers, 6);
  const set = (args: Record<string, unknown>) => attempt(() => rpc('core', 'setGeneral', args));

  const MODES = [
    { value: 'balance', title: 'Richest guests', hint: 'Who has the most money right now' },
    { value: 'spent', title: 'Big spenders', hint: 'Who spent the most this party' },
    { value: 'earned', title: 'Top earners', hint: 'Who earned the most this party' },
    { value: 'off', title: 'Hidden', hint: 'No leaderboard on the TV' },
  ] as const;
</script>

<Section title="On the TV" hint="The leaderboard in the right column of the TV.">
  <div class="choices">
    {#each MODES as mode (mode.value)}
      <button class="choice" class:active={core.leaderboardMode === mode.value} onclick={() => set({ leaderboardMode: mode.value })}>
        <span class="radio"></span>
        <span class="text">
          <strong>{mode.title}</strong>
          <span class="faint">{mode.hint}</span>
        </span>
      </button>
    {/each}
  </div>
  {#if !core.economyEnabled && core.leaderboardMode !== 'off'}
    <p class="faint small">The money system is off: only the other boards show.</p>
  {/if}
</Section>

{#if core.leaderboardMode !== 'off'}
  <Section title="Other boards" hint="The leaderboard takes turns with them, with a fade between each.">
    <div class="line">
      <div>
        <strong>Take turns with other boards</strong>
        <p class="dim small">A board shows once at least 2 guests are on it.</p>
      </div>
      <Toggle checked={admin.leaderboardRotate} label="Rotate boards" onchange={(v) => set({ leaderboardRotate: v })} />
    </div>
    {#if admin.leaderboardRotate}
      <div class="boards">
        {#each STAT_BOARDS as b (b.stat)}<span class="pill">{b.title} <span class="faint">({b.unit})</span></span>{/each}
        <span class="pill">Rhythm Rain, one per song</span>
      </div>
      <div class="line">
        <div>
          <span>Each board stays</span>
          <p class="faint small">Seconds before the next one fades in.</p>
        </div>
        <span class="unit">
          <input class="input num" type="number" min="5" max="300" bind:value={boardSeconds.value} onfocus={boardSeconds.start} onblur={() => { set({ boardSeconds: Number(boardSeconds.value) }); boardSeconds.end(); }} />
          <span class="faint">s</span>
        </span>
      </div>
      <div class="line">
        <div>
          <span>Song boards from</span>
          <p class="faint small">A Rhythm Rain song gets its own board once this many guests played it with music, at the same difficulty and number of colors.</p>
        </div>
        <span class="unit">
          <input class="input num" type="number" min="1" max="50" bind:value={songBoardPlayers.value} onfocus={songBoardPlayers.start} onblur={() => { set({ songBoardPlayers: Number(songBoardPlayers.value) }); songBoardPlayers.end(); }} />
          <span class="faint">players</span>
        </span>
      </div>
    {/if}
  </Section>
{/if}

<style>
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.6rem;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.9rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    text-align: left;
  }
  .choice.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  }
  .radio {
    flex: none;
    width: 1.05rem;
    height: 1.05rem;
    border-radius: 50%;
    border: 2px solid var(--border-strong);
  }
  .active .radio {
    border: 5px solid var(--accent);
  }
  .text {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }
  .text .faint {
    font-size: 0.82rem;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.35rem 0;
  }
  .small {
    font-size: 0.82rem;
  }
  .boards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.2rem 0 0.5rem;
  }
  .boards .pill {
    font-size: 0.8rem;
  }
  .unit {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  .unit > .faint {
    min-width: 1.8rem;
  }
  .num {
    width: 6.5rem;
    text-align: right;
  }
</style>
