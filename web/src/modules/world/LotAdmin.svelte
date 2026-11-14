<script lang="ts">
  import { attempt, hb, rpc } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import type { WorldState } from '$shared/world.ts';
  import { LOT_TIERS, LOT_TIER_NAMES, type LotSettings, type LotTier } from '$shared/worldBuild.ts';

  /** The build lot's part of the world's admin page: its switch, its prices, the builders' pace, emptying it */

  const mod = $derived(hb.modules.world as WorldState | undefined);
  const s = $derived(mod?.lotSettings);
  const grid = $derived(mod?.lot?.grid);
  const blocks = $derived(grid ? Object.values(grid.blocks).reduce((n, l) => n + l.length, 0) : 0);
  const decorations = $derived(grid?.props.length ?? 0);
  const money = $derived(mod?.shop?.currencyName ?? 'money');

  const TIER_KEY: Record<LotTier, keyof LotSettings> = { block: 'lotBlock', fancy: 'lotFancy', small: 'lotSmall', big: 'lotBig', grand: 'lotGrand' };

  function set(key: keyof LotSettings, value: number | boolean) {
    attempt(() => rpc('world', 'setLot', { [key]: value }));
  }

  function setNumber(key: keyof LotSettings, value: string) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) set(key, n);
  }
</script>

{#if s}
  <Section title="Build lot">
    <div class="line">
      <div>
        <strong>Build lot</strong>
        <p class="faint small">
          The fenced lot in the bottom left of the square. Guests stack blocks into sculptures and set down decorations from their phone (Actions, Build lot); their
          character walks in and puts each piece up. Off: nobody can add or take anything, what stands there stays.
        </p>
      </div>
      <Toggle checked={s.lot} label="Build lot" onchange={(v) => set('lot', v)} />
    </div>
    <div class="prices">
      {#each LOT_TIERS as tier (tier)}
        <label class="field">
          <span>{LOT_TIER_NAMES[tier]}</span>
          <input class="input" type="number" min="0" value={s[TIER_KEY[tier]]} onchange={(e) => setNumber(TIER_KEY[tier], e.currentTarget.value)} />
        </label>
      {/each}
    </div>
    <p class="faint small">What each piece costs, in {money}. Fancy blocks are marble, gold, glass, crystal and lantern blocks; taking a piece away is free.</p>
    <div class="pair">
      <label class="field">
        <span>Pieces on the way per guest</span>
        <input class="input" type="number" min="1" max="200" value={s.lotQueueMax} onchange={(e) => setNumber('lotQueueMax', e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>Seconds to put one up</span>
        <input class="input" type="number" min="0.3" max="20" step="0.1" value={s.lotBuildSec} onchange={(e) => setNumber('lotBuildSec', e.currentTarget.value)} />
      </label>
    </div>
    <p class="faint small">How many pieces a guest can ask for before their character has put them up, and how long it kneels at each one.</p>
    <label class="field">
      <span>Townsfolk stop to look (percent)</span>
      <input class="input" type="number" min="0" max="100" value={s.lotAdmirePct} onchange={(e) => setNumber('lotAdmirePct', e.currentTarget.value)} />
    </label>
    <p class="faint small">The chance a character picking something to do walks to the fence, claps and looks at what was built.</p>
    <div class="line">
      <div>
        <strong>Empty lot for a new party</strong>
        <p class="faint small">A new session clears the lot. Off: what was built stays for the next party.</p>
      </div>
      <Toggle checked={s.lotClearOnNew} label="Empty lot for a new party" onchange={(v) => set('lotClearOnNew', v)} />
    </div>
    <div class="line">
      <p class="faint small">On the lot now: {blocks} {blocks === 1 ? 'block' : 'blocks'}, {decorations} {decorations === 1 ? 'decoration' : 'decorations'}.</p>
      <TwoStepButton class="small" disabled={!blocks && !decorations} onconfirm={() => attempt(() => rpc('world', 'clearLot'), 'The lot is empty')}>
        Clear the lot
        {#snippet armed()}Tap again to clear{/snippet}
      </TwoStepButton>
    </div>
  </Section>
{/if}

<style>
  .small {
    font-size: 0.82rem;
  }
  .prices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    gap: 0.5rem;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .line p {
    margin: 0.2rem 0 0;
  }
</style>
