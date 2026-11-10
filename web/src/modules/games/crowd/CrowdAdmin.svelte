<script lang="ts">
  import { Minus, Plus } from '@lucide/svelte';
  import { CROWD_SPEEDS, RUN_FACTORS, SPY_GADGETS, type SpyGadget } from '$shared/crowd.ts';
  import type { GamesSettings } from '$shared/games.ts';
  import { rpc, attempt } from '$lib/client.svelte.ts';
  import Toggle from '$lib/ui/Toggle.svelte';

  /** The options of Crowd Race or Spy Hunt in the admin, with the sound and light flashes they share */
  let { game, settings: st }: { game: 'crowd' | 'spy'; settings: GamesSettings } = $props();
  const set = (patch: Partial<GamesSettings>) => attempt(() => rpc('games', 'setSettings', patch));

  type NumKey = 'crowdNpcs' | 'crowdShots' | 'crowdReloadSec' | 'crowdRounds' | 'spyNpcs' | 'spyShots' | 'spyReloadSec' | 'spyRounds' | 'spyMinutes' | 'spyNeeded' | 'spyCollectMin' | 'spyCollectMax' | 'spyLooks' | 'spyDrawFadeSec';
  // A slider shows its value while it moves, and saves when it is let go
  let drag = $state<{ sniperMusic?: number; sniperSounds?: number }>({});
  async function saveSlider(key: 'sniperMusic' | 'sniperSounds', v: number) {
    await set({ [key]: v });
    delete drag[key];
  }
  function toggleGadget(g: SpyGadget, on: boolean) {
    const list = st.spyGadgets ?? [];
    set({ spyGadgets: on ? [...list, g] : list.filter((x) => x !== g) });
  }
</script>

{#snippet stepper(label: string, hint: string, key: NumKey, min: number, max: number, step = 1, unit = '')}
  {@const n = st[key]}
  <div class="line">
    <span class="label">{label} <span class="faint small">{hint}</span></span>
    <span class="stepper">
      <button class="btn small" aria-label="Less" disabled={n <= min} onclick={() => set({ [key]: Math.max(min, n - step) })}><Minus size={16} /></button>
      <strong class="mono">{n}{unit}</strong>
      <button class="btn small" aria-label="More" disabled={n >= max} onclick={() => set({ [key]: Math.min(max, n + step) })}><Plus size={16} /></button>
    </span>
  </div>
{/snippet}

{#snippet speed(key: 'crowdSpeed' | 'spySpeed')}
  <div class="line wrap">
    <span class="label">Walking speed <span class="faint small">Everyone walks at this pace, the players and the passers-by</span></span>
    <div class="choices">
      {#each CROWD_SPEEDS as sp (sp.id)}
        <button class="chip" class:active={st[key] === sp.id} onclick={() => set({ [key]: sp.id })}>{sp.name}</button>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet slider(label: string, hint: string, key: 'sniperMusic' | 'sniperSounds')}
  {@const v = drag[key] ?? st[key]}
  <div class="line wrap">
    <span class="label"><span>{label} <strong class="mono value">{v ? `${v}%` : 'off'}</strong></span> <span class="faint small">{hint}</span></span>
    <input
      class="range"
      type="range"
      min="0"
      max="100"
      step="5"
      value={v}
      aria-label={label}
      oninput={(e) => (drag[key] = Number(e.currentTarget.value))}
      onchange={(e) => saveSlider(key, Number(e.currentTarget.value))}
    />
  </div>
{/snippet}

{#if game === 'crowd'}
  <h4 class="group">Race</h4>
  {@render stepper('Rounds', '1 to 7. Most rounds won wins the game', 'crowdRounds', 1, 7)}
  {@render stepper('Passers-by', 'People in the crowd on top of the players, 10 to 80', 'crowdNpcs', 10, 80, 5)}
  {@render speed('crowdSpeed')}
  <div class="line wrap">
    <span class="label">Running speed <span class="faint small">Times the walking speed. Nobody but the players runs, so it shows</span></span>
    <div class="choices">
      {#each RUN_FACTORS as f (f)}
        <button class="chip" class:active={st.crowdRun === f} onclick={() => set({ crowdRun: f })}>x{f}</button>
      {/each}
    </div>
  </div>
  <h4 class="group">Sniper</h4>
  {@render stepper('Shots per player', 'Each round, 1 to 5', 'crowdShots', 1, 5)}
  {@render stepper('Reload', 'Seconds between two shots, 0 to 10', 'crowdReloadSec', 0, 10, 1, 's')}
{:else}
  <h4 class="group">Rounds</h4>
  {@render stepper('Rounds', '1 to 10. A new spy each round, every player in turn', 'spyRounds', 1, 10)}
  {@render stepper('Length of a round', 'Minutes the snipers have to find the spy', 'spyMinutes', 1, 10, 1, ' min')}
  {@render stepper('Passers-by', 'People wandering on the square, 10 to 80', 'spyNpcs', 10, 80, 5)}
  {@render speed('spySpeed')}
  {@render stepper('Suit colors', '1: everyone looks the same (hardest), up to 6', 'spyLooks', 1, 6)}
  <h4 class="group">Spy</h4>
  {@render stepper('Suitcases to open', 'Of the 4 in the corners', 'spyNeeded', 1, 4)}
  {@render stepper('Opens after at least', 'Seconds between touching a suitcase and it opening', 'spyCollectMin', 0, 15, 1, 's')}
  {@render stepper('Opens after at most', 'The delay is drawn between the two, so nobody sees who touched it', 'spyCollectMax', 0, 15, 1, 's')}
  <div class="line wrap">
    <span class="label">Gadgets <span class="faint small">The spy picks one before each round and can use it once. None on: no gadget</span></span>
    <div class="choices">
      {#each SPY_GADGETS as g (g.id)}
        {@const on = (st.spyGadgets ?? []).includes(g.id)}
        <button class="chip" class:active={on} title={g.help} onclick={() => toggleGadget(g.id, !on)}>{g.name}</button>
      {/each}
    </div>
  </div>
  <h4 class="group">Snipers</h4>
  {@render stepper('Shots per sniper', 'Each round, 1 to 10. All of them wasted: the spy wins', 'spyShots', 1, 10)}
  {@render stepper('Reload', 'Seconds between two shots, 0 to 10', 'spyReloadSec', 0, 10, 1, 's')}
  {@render stepper('Drawings fade after', 'Seconds a sniper drawing stays on the TV', 'spyDrawFadeSec', 1, 15, 1, 's')}
{/if}

<h4 class="group">Sound and lights</h4>
<p class="faint small">Shared by Crowd Race and Spy Hunt. The music pauses Spotify during the game.</p>
{@render slider('Music', 'On the TV, 0 = no music (Spotify keeps playing)', 'sniperMusic')}
{@render slider('Sound effects', 'Shots, gadgets, count down... on the TV, 0 = silent', 'sniperSounds')}
<div class="line">
  <span class="label">Light flashes <span class="faint small">A white flash on each shot, red on a kill, and the gadgets on the WLED lights. They go back to what they were showing right after</span></span>
  <Toggle checked={st.sniperLights} onchange={(v) => set({ sniperLights: v })} label="Light flashes" />
</div>
<p class="faint small">Characters: Liberated Pixel Cup sprites (OGA-BY and CC0), by their many authors. <a href="/crowd/CREDITS.txt" target="_blank" rel="noopener">See the credits</a></p>

<style>
  .group {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-top: 0.3rem;
  }
  .group:first-child {
    margin-top: 0;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .line.wrap {
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
  }
  .label {
    display: grid;
    min-width: 0;
  }
  .line > .label {
    flex: 1 1 12rem;
  }
  .value {
    font-size: 0.9rem;
    color: var(--accent);
    margin-left: 0.25rem;
  }
  .small {
    font-size: 0.78rem;
  }
  .stepper {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .stepper strong {
    min-width: 2.6rem;
    text-align: center;
    font-size: 1.05rem;
  }
  .range {
    flex: 1 1 10rem;
    max-width: 14rem;
    accent-color: var(--accent);
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-weight: 600;
    font-size: 0.88rem;
  }
  .chip.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
  }
</style>
