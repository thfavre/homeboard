<script lang="ts">
  import { Minus, Plus } from '@lucide/svelte';
  import { CROWD_LIMITS, SPY_GADGETS, raceRoundSec, type SpyGadget } from '$shared/crowd.ts';
  import type { GamesSettings } from '$shared/games.ts';
  import { rpc, attempt } from '$lib/client.svelte.ts';
  import Toggle from '$lib/ui/Toggle.svelte';

  /** The options of Crowd Race or Spy Hunt in the admin, with the sound and light flashes they share */
  let { game, settings: st }: { game: 'crowd' | 'spy'; settings: GamesSettings } = $props();
  const set = (patch: Partial<GamesSettings>) => attempt(() => rpc('games', 'setSettings', patch));

  type NumKey = 'crowdShots' | 'crowdReloadSec' | 'crowdRounds' | 'spyShots' | 'spyReloadSec' | 'spyRounds' | 'spyMinutes' | 'spyNeeded' | 'spyCollectMin' | 'spyCollectMax' | 'spyLooks' | 'spyDrawFadeSec';
  type SliderKey = 'crowdNpcs' | 'crowdWalk' | 'crowdRun' | 'spyNpcs' | 'spyWalk' | 'sniperMusic' | 'sniperSounds';
  // A slider shows its value while it moves, and saves when it is let go
  let drag = $state<Partial<Record<SliderKey, number>>>({});
  async function saveSlider(key: SliderKey, v: number) {
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

{#snippet slider(label: string, hint: string, key: SliderKey, min: number, max: number, step: number, show: (v: number) => string)}
  {@const v = drag[key] ?? st[key]}
  <div class="line wrap">
    <span class="label"><span>{label} <strong class="mono value">{show(v)}</strong></span> <span class="faint small">{hint}</span></span>
    <input
      class="range"
      type="range"
      {min}
      {max}
      {step}
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
  {@render slider('Passers-by', 'People in the crowd on top of the players. A big crowd lines up in rows behind the start', 'crowdNpcs', CROWD_LIMITS.raceNpcs[0], CROWD_LIMITS.raceNpcs[1], 5, (v) => `${v}`)}
  {@render slider('Walking speed', 'Everyone walks at this pace, the players and the passers-by', 'crowdWalk', CROWD_LIMITS.walk[0], CROWD_LIMITS.walk[1], 5, (v) => `${v}% · rounds of about ${raceRoundSec(v)}s`)}
  {@render slider('Running speed', 'Times the walking speed. Nobody but the players runs, so it shows', 'crowdRun', CROWD_LIMITS.run[0], CROWD_LIMITS.run[1], 0.1, (v) => `x${v.toFixed(1)}`)}
  <h4 class="group">Sniper</h4>
  {@render stepper('Shots per player', 'Each round, 1 to 5', 'crowdShots', 1, 5)}
  {@render stepper('Reload', 'Seconds between two shots, 0 to 10', 'crowdReloadSec', 0, 10, 1, 's')}
{:else}
  <h4 class="group">Rounds</h4>
  {@render stepper('Rounds', '1 to 10. A new spy each round, every player in turn', 'spyRounds', 1, 10)}
  {@render stepper('Length of a round', 'Minutes the snipers have to find the spy', 'spyMinutes', 1, 10, 1, ' min')}
  {@render slider('Passers-by', 'People wandering on the square', 'spyNpcs', CROWD_LIMITS.spyNpcs[0], CROWD_LIMITS.spyNpcs[1], 5, (v) => `${v}`)}
  {@render slider('Walking speed', 'Everyone walks at this pace, the spy and the passers-by', 'spyWalk', CROWD_LIMITS.walk[0], CROWD_LIMITS.walk[1], 5, (v) => `${v}%`)}
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
<p class="faint small">Shared by Crowd Race and Spy Hunt.</p>
{@render slider('Spotify volume', 'The music keeps playing during the game at this volume, then goes back to how it was. 0: silent', 'sniperMusic', 0, 100, 5, (v) => (v ? `${v}%` : 'off'))}
{@render slider('Sound effects', 'Shots, gadgets, count down... on the TV. 0: silent', 'sniperSounds', 0, 100, 5, (v) => (v ? `${v}%` : 'off'))}
<div class="line">
  <span class="label">Light flashes <span class="faint small">A white flash on each shot, red on a kill, and the gadgets on the WLED lights. They go back to what they were showing right after</span></span>
  <Toggle checked={st.sniperLights} onchange={(v) => set({ sniperLights: v })} label="Light flashes" />
</div>
<p class="faint small">Characters and places: Liberated Pixel Cup style art (OGA-BY, CC-BY and CC0), by their many authors. Credits: <a href="/crowd/CREDITS.txt" target="_blank" rel="noopener">characters</a>, <a href="/crowd/env/CREDITS.txt" target="_blank" rel="noopener">places</a></p>

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
