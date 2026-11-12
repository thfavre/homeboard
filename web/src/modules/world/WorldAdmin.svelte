<script lang="ts">
  import { attempt, hb, rpc } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import { SLOTS, TIERS, TIER_NAMES } from '$shared/wardrobe.ts';
  import { LOOK_PARTS, LOOK_PART_NAMES, type WorldState } from '$shared/world.ts';

  const mod = $derived(hb.modules.world as WorldState | undefined);
  const kingName = $derived(mod?.king?.id ? (mod.characters.find((c) => c.id === mod.king!.id)?.name ?? null) : null);

  function setSeconds(key: string, value: string) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) setOption(key, n);
  }

  function setOption(key: string, value: string | number | boolean) {
    attempt(() => rpc('world', 'setOptions', { [key]: value }));
  }

  function setMinutes(key: 'sleepAfterMin' | 'fadeAfterMin', value: string) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) setOption(key, n);
  }

  function setAmount(key: string, value: string) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) setOption(key, Math.round(n));
  }

  const priceKey = (tier: string) => `price${tier[0].toUpperCase()}${tier.slice(1)}`;
  const lookKey = (part: string) => `look${part[0].toUpperCase()}${part.slice(1)}`;

  /** Amount typed per guest row (give takes it, take negates it) */
  let amounts = $state<Record<string, string>>({});

  function grant(guestId: string, sign: 1 | -1) {
    const amount = Math.round(Number(amounts[guestId]));
    if (!Number.isFinite(amount) || amount <= 0) return;
    attempt(() => rpc('world', 'grant', { guestId, amount: amount * sign }), 'Done');
  }
</script>

{#if mod}
  <Section title="Settings">
    <label class="field">
      <span>Money name</span>
      <input class="input" type="text" maxlength="24" value={mod.shop?.currencyName ?? ''} onchange={(e) => setOption('currencyName', e.currentTarget.value)} />
    </label>
    <label class="field">
      <span>Starting money</span>
      <input class="input" type="number" min="0" value={mod.startMoney} onchange={(e) => setAmount('startMoney', e.currentTarget.value)} />
    </label>
    <p class="faint small">Pocket money a newly created character starts with.</p>
    <label class="field">
      <span>Earned per minute in the town</span>
      <input class="input" type="number" min="0" value={mod.earnPerMin} onchange={(e) => setAmount('earnPerMin', e.currentTarget.value)} />
    </label>
    <p class="faint small">Guests earn while their phone is connected and their avatar lives in the town. Nothing moves while the module is off.</p>
    <div class="prices">
      {#each TIERS as tier (tier)}
        <label class="field">
          <span>{TIER_NAMES[tier]}</span>
          <input class="input" type="number" min="0" value={mod.shop?.prices[tier] ?? 0} onchange={(e) => setAmount(priceKey(tier), e.currentTarget.value)} />
        </label>
      {/each}
    </div>
    <p class="faint small">What the shop charges per price tier.</p>
    <label class="field">
      <span>Pieces to unlock {SLOTS.filter((s) => 'locked' in s).map((s) => s.name).join(' and ')}</span>
      <input class="input" type="number" min="0" max="1000" value={mod.shop?.unlockPieces ?? 0} onchange={(e) => setAmount('unlockPieces', e.currentTarget.value)} />
    </label>
    <p class="faint small">The locked slots open once a guest owns at least this many pieces, with one in every other slot their body can wear.</p>
    <div class="prices">
      {#each LOOK_PARTS as part (part)}
        <label class="field">
          <span>{LOOK_PART_NAMES[part]}</span>
          <input class="input" type="number" min="0" value={mod.shop?.look[part] ?? 0} onchange={(e) => setAmount(lookKey(part), e.currentTarget.value)} />
        </label>
      {/each}
    </div>
    <p class="faint small">What changing each part of a look costs once the character exists (creating it is free).</p>
    <label class="field">
      <span>Fall asleep after (minutes away)</span>
      <input class="input" type="number" min="1" max="240" value={mod.sleepAfterMin} onchange={(e) => setMinutes('sleepAfterMin', e.currentTarget.value)} />
    </label>
    <p class="faint small">A guest who closes the page walks to the edge of the town and lies down to sleep.</p>
    <label class="field">
      <span>Fade out after (more minutes)</span>
      <input class="input" type="number" min="1" max="480" value={mod.fadeAfterMin} onchange={(e) => setMinutes('fadeAfterMin', e.currentTarget.value)} />
    </label>
    <p class="faint small">A sleeper gone for this much longer fades away, so the town never clutters up.</p>
  </Section>

  <Section title="Shop visits">
    <div class="line">
      <div>
        <strong>Walk to the shops</strong>
        <p class="faint small">
          A guest who changes clothes on the phone sees the new look at once; their character walks to the clothes shop, tries it on behind the window and
          comes out in it. Hair and beard go to the barber. Eye color shows at once. Off: the town changes on the spot.
        </p>
      </div>
      <Toggle checked={!!mod.shopVisits} label="Walk to the shops" onchange={(v) => setOption('shopVisits', v)} />
    </div>
    <div class="pair">
      <label class="field">
        <span>Inside from (seconds)</span>
        <input class="input" type="number" min="0" max="60" step="0.5" value={mod.visitMinSec} onchange={(e) => setSeconds('visitMinSec', e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>to (seconds)</span>
        <input class="input" type="number" min="0" max="60" step="0.5" value={mod.visitMaxSec} onchange={(e) => setSeconds('visitMaxSec', e.currentTarget.value)} />
      </label>
    </div>
    <p class="faint small">How long a character stays in the shop, a random time in this range.</p>
    <div class="pair">
      <label class="field">
        <span>Stop wandering or a bench within (seconds)</span>
        <input class="input" type="number" min="0" max="30" step="0.5" value={mod.quickMinSec} onchange={(e) => setSeconds('quickMinSec', e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>to (seconds)</span>
        <input class="input" type="number" min="0" max="30" step="0.5" value={mod.quickMaxSec} onchange={(e) => setSeconds('quickMaxSec', e.currentTarget.value)} />
      </label>
    </div>
    <p class="faint small">A character just walking around or sitting on a bench drops it within this range and heads to the shop.</p>
    <label class="field">
      <span>Other activities: finish first if they end within (seconds)</span>
      <input class="input" type="number" min="0" max="300" value={mod.finishWithinSec} onchange={(e) => setSeconds('finishWithinSec', e.currentTarget.value)} />
    </label>
    <div class="pair">
      <label class="field">
        <span>Else wrap up within (seconds)</span>
        <input class="input" type="number" min="0" max="120" value={mod.wrapMinSec} onchange={(e) => setSeconds('wrapMinSec', e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>to (seconds)</span>
        <input class="input" type="number" min="0" max="120" value={mod.wrapMaxSec} onchange={(e) => setSeconds('wrapMaxSec', e.currentTarget.value)} />
      </label>
    </div>
    <p class="faint small">
      Any other activity (petting the cat, walking to it) is finished first if it ends soon, otherwise it ends early within this range. A visit or a cheer
      is never cut short, and a sleeper goes once the guest is back.
    </p>
  </Section>

  <Section title="The King">
    <div class="line">
      <div>
        <strong>King's title</strong>
        <p class="faint small">
          One guest at a time is the King: their character wears a crown and a gold nametag, now and then sits on the throne below the fountain, and the
          others come to pray before it. Anyone can take the title from the shop on their phone.
        </p>
      </div>
      <Toggle checked={!!mod.king?.on} label="King's title" onchange={(v) => setOption('king', v)} />
    </div>
    <div class="current">
      <span class="who">
        {#if kingName}
          <strong>{kingName}</strong> is the King
        {:else}
          Nobody is the King
        {/if}
      </span>
      <span class="bal">Next price {mod.king?.price ?? 0} {mod.shop?.currencyName}</span>
    </div>
    <div class="buttons">
      <TwoStepButton class="small" disabled={!mod.king?.id} onconfirm={() => attempt(() => rpc('world', 'removeKing'), 'Title removed')}>
        Remove the title
        {#snippet armed()}Tap again to remove{/snippet}
      </TwoStepButton>
      <TwoStepButton class="small" disabled={!mod.kingSales} onconfirm={() => attempt(() => rpc('world', 'resetKingPrice'), 'Price reset')}>
        Reset the price
        {#snippet armed()}Tap again to reset{/snippet}
      </TwoStepButton>
    </div>
    <p class="faint small">
      The title changed hands {mod.kingSales ?? 0} {mod.kingSales === 1 ? 'time' : 'times'}. Removing it leaves the price as it is; resetting brings it back to
      the first price.
    </p>
    <div class="pair">
      <label class="field">
        <span>First price</span>
        <input class="input" type="number" min="0" value={mod.kingBase} onchange={(e) => setAmount('kingBase', e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>More each time</span>
        <input class="input" type="number" min="0" value={mod.kingStep} onchange={(e) => setAmount('kingStep', e.currentTarget.value)} />
      </label>
    </div>
    <label class="field">
      <span>The old King gets back (percent of what they paid)</span>
      <input class="input" type="number" min="0" max="100" value={mod.kingRefundPct} onchange={(e) => setAmount('kingRefundPct', e.currentTarget.value)} />
    </label>
    <label class="field">
      <span>Sits on the throne about every (minutes)</span>
      <input class="input" type="number" min="0.5" max="120" step="0.5" value={mod.throneEveryMin} onchange={(e) => setSeconds('throneEveryMin', e.currentTarget.value)} />
    </label>
    <div class="pair">
      <label class="field">
        <span>Sits from (seconds)</span>
        <input class="input" type="number" min="0" max="900" value={mod.throneMinSec} onchange={(e) => setSeconds('throneMinSec', e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>to (seconds)</span>
        <input class="input" type="number" min="0" max="900" value={mod.throneMaxSec} onchange={(e) => setSeconds('throneMaxSec', e.currentTarget.value)} />
      </label>
    </div>
    <div class="pair">
      <label class="field">
        <span>Others pray from (seconds)</span>
        <input class="input" type="number" min="0" max="300" value={mod.prayMinSec} onchange={(e) => setSeconds('prayMinSec', e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>to (seconds)</span>
        <input class="input" type="number" min="0" max="300" value={mod.prayMaxSec} onchange={(e) => setSeconds('prayMaxSec', e.currentTarget.value)} />
      </label>
    </div>
    <p class="faint small">
      While the King sits, characters nearby may come and kneel before the throne (eight at most), then get up and leave; all get up when the King does.
      Walking around or a bench is dropped for the King's turn on the throne, other activities are finished first.
    </p>
  </Section>

  <Section title="Money">
    {#if !mod.wallets?.length}
      <p class="faint small">Nobody has joined yet.</p>
    {:else}
      <div class="wallets">
        {#each mod.wallets as w (w.id)}
          <div class="wallet" style:border-left-color={w.color}>
            <span class="who">{w.name}</span>
            <span class="bal">{w.balance} {mod.shop?.currencyName}</span>
            <input class="input amount" type="number" min="1" placeholder="0" bind:value={amounts[w.id]} />
            <button type="button" class="btn" onclick={() => grant(w.id, 1)}>Give</button>
            <button type="button" class="btn" onclick={() => grant(w.id, -1)}>Take</button>
          </div>
        {/each}
      </div>
      <p class="faint small">Give or take the typed amount of {mod.shop?.currencyName}. Guests see a note when you do.</p>
    {/if}
  </Section>

  <Section title="Town">
    <p class="faint small">
      {mod.characters.length === 0 ? 'Nobody lives in the town yet.' : `${mod.characters.length} ${mod.characters.length === 1 ? 'guest lives' : 'guests live'} in the town.`}
      Guests create their avatar from the Avatar tile on their phone.
    </p>
    {#if mod.characters.length}
      <div class="people">
        {#each mod.characters as c (c.id)}
          <span class="person" style:border-color={c.color}>{c.name}</span>
        {/each}
      </div>
    {/if}
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
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .line p {
    margin: 0.2rem 0 0;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .current {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border));
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .wallets {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .wallet {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border);
    border-left-width: 3px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .who {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
  }
  .bal {
    font-size: 0.88rem;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .amount {
    width: 4.6rem;
  }
  .people {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .person {
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--border);
    border-left-width: 3px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.88rem;
  }
</style>
