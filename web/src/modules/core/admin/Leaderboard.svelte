<script lang="ts">
  import { Check, Layers, Medal, EyeOff } from '@lucide/svelte';
  import { Synced } from '$lib/synced.svelte.ts';
  import { BOARD_KINDS, isMoneyBoard, type BoardKind, type BoardMode } from '$shared/protocol.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';

  const core = $derived(hb.core!);
  const admin = $derived(core.admin!);
  const boardSeconds = new Synced(() => hb.core?.admin?.boardSeconds, 15);
  const songBoardPlayers = new Synced(() => hb.core?.admin?.songBoardPlayers, 6);
  const set = (args: Record<string, unknown>) => attempt(() => rpc('core', 'setGeneral', args));

  const MODES: { value: BoardMode; title: string; hint: string; icon: typeof Medal }[] = [
    { value: 'one', title: 'One board', hint: 'Always the same ranking', icon: Medal },
    { value: 'rotate', title: 'Take turns', hint: 'Several boards, one after the other', icon: Layers },
    { value: 'off', title: 'Hidden', hint: 'No leaderboard on the TV', icon: EyeOff },
  ];
  const GROUPS = ['Money', 'Party', 'Games'] as const;

  const live = $derived(new Set(admin.boardsLive));
  const picked = $derived(new Set(admin.boardRotate));
  /** Money boards cannot show while the money system is off */
  const unavailable = (k: BoardKind) => isMoneyBoard(k) && !core.economyEnabled;
  const usesSongs = $derived(admin.boardMode === 'one' ? admin.boardOne === 'rhythm' : admin.boardMode === 'rotate' && picked.has('rhythm'));

  const toggle = (k: BoardKind) => set({ boardRotate: picked.has(k) ? admin.boardRotate.filter((x) => x !== k) : [...admin.boardRotate, k] });
  const status = (k: BoardKind) => (unavailable(k) ? 'Money system is off' : live.has(k) ? 'Has data' : 'Nothing yet');
</script>

<Section title="On the TV" hint="The ranking in the right column of the TV.">
  <div class="modes">
    {#each MODES as mode (mode.value)}
      <button class="mode" class:active={admin.boardMode === mode.value} onclick={() => set({ boardMode: mode.value })}>
        <mode.icon size={22} />
        <strong>{mode.title}</strong>
        <span class="faint">{mode.hint}</span>
      </button>
    {/each}
  </div>
</Section>

{#if admin.boardMode !== 'off'}
  <Section
    title={admin.boardMode === 'one' ? 'Which board' : 'Boards that take turns'}
    hint={admin.boardMode === 'one'
      ? 'Pick the ranking the TV shows.'
      : `Tick the boards to show. A board waits until at least 2 guests are on it; boards with nothing yet are skipped.`}
  >
    {#snippet actions()}
      {#if admin.boardMode === 'rotate'}
        <div class="quick">
          <button class="btn ghost small" onclick={() => set({ boardRotate: BOARD_KINDS.map((b) => b.kind) })}>All</button>
          <button class="btn ghost small" onclick={() => set({ boardRotate: [] })}>None</button>
        </div>
      {/if}
    {/snippet}
    {#each GROUPS as group (group)}
      <span class="eyebrow group">{group}</span>
      <div class="kinds">
        {#each BOARD_KINDS.filter((b) => b.group === group) as b (b.kind)}
          {@const on = admin.boardMode === 'one' ? admin.boardOne === b.kind : picked.has(b.kind)}
          <button
            class="kind"
            class:on
            class:dim={unavailable(b.kind)}
            onclick={() => (admin.boardMode === 'one' ? set({ boardOne: b.kind }) : toggle(b.kind))}
            aria-pressed={on}
          >
            <span class="mark" class:radio={admin.boardMode === 'one'}>{#if on && admin.boardMode === 'rotate'}<Check size={13} strokeWidth={3} />{/if}</span>
            <span class="text">
              <strong>{b.title}</strong>
              <span class="faint">{b.hint}</span>
            </span>
            <span class="state" class:live={live.has(b.kind) && !unavailable(b.kind)}>{status(b.kind)}</span>
          </button>
        {/each}
      </div>
    {/each}
    {#if admin.boardMode === 'rotate' && !admin.boardRotate.length}
      <p class="warn small">No board ticked: the TV shows no leaderboard.</p>
    {/if}
  </Section>

  {#if admin.boardMode === 'rotate' || usesSongs}
    <Section title="Timing">
      {#if admin.boardMode === 'rotate'}
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
      {/if}
      {#if usesSongs}
        <div class="line">
          <div>
            <span>Song boards from</span>
            <p class="faint small">A Rhythm Rain song gets its board once this many guests played it with music, at the same difficulty and number of colors. Several songs take turns.</p>
          </div>
          <span class="unit">
            <input class="input num" type="number" min="1" max="50" bind:value={songBoardPlayers.value} onfocus={songBoardPlayers.start} onblur={() => { set({ songBoardPlayers: Number(songBoardPlayers.value) }); songBoardPlayers.end(); }} />
            <span class="faint">players</span>
          </span>
        </div>
      {/if}
    </Section>
  {/if}
{/if}

<style>
  .modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
  }
  .mode {
    display: grid;
    justify-items: start;
    gap: 0.3rem;
    padding: 0.9rem 1rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-dim);
    text-align: left;
  }
  .mode strong {
    color: var(--text);
  }
  .mode .faint {
    font-size: 0.82rem;
  }
  .mode.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
    color: var(--accent);
  }
  .quick {
    display: flex;
    gap: 0.3rem;
  }
  .group {
    display: block;
    margin: 0.6rem 0 0.4rem;
  }
  .group:first-of-type {
    margin-top: 0;
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
    gap: 0.4rem;
  }
  .kind {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.65rem 0.9rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    text-align: left;
  }
  .kind.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  }
  .kind.dim {
    opacity: 0.55;
  }
  .mark {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.15rem;
    height: 1.15rem;
    border-radius: 0.3rem;
    border: 2px solid var(--border-strong);
    color: #fff;
  }
  .mark.radio {
    border-radius: 50%;
  }
  .on .mark {
    border-color: var(--accent);
    background: var(--accent);
  }
  .on .mark.radio {
    background: none;
    border-width: 5px;
  }
  .text {
    flex: 1;
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }
  .text .faint {
    font-size: 0.82rem;
  }
  .state {
    flex: none;
    font-size: 0.75rem;
    color: var(--text-faint);
  }
  .state.live {
    color: var(--success);
  }
  .warn {
    color: var(--warning);
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
  @media (max-width: 600px) {
    .modes {
      grid-template-columns: 1fr;
    }
    .state {
      display: none;
    }
  }
</style>
