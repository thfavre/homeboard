<script lang="ts">
  import { Crown } from '@lucide/svelte';
  import { attempt, hb, rpc, serverNow } from '$lib/client.svelte.ts';
  import { day } from '$lib/time.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import { SLOTS, TIERS, TIER_NAMES } from '$shared/wardrobe.ts';
  import { LOOK_PARTS, LOOK_PART_NAMES, kingPriceAt, type CeremonyHold, type WorldState } from '$shared/world.ts';
  import Monarchy from './Monarchy.svelte';

  const mod = $derived(hb.modules.world as WorldState | undefined);
  const kingName = $derived(mod?.king?.id ? (mod.characters.find((c) => c.id === mod.king!.id)?.name ?? null) : null);

  // The clock, for when the next ceremony is and for the crown's price as it drops
  let now = $state(serverNow());
  const crownPrice = $derived(mod?.king ? kingPriceAt(mod.king.pricing, now) : 0);
  $effect(() => {
    const t = setInterval(() => (now = serverNow()), 15_000);
    return () => clearInterval(t);
  });

  const HOLDS: Record<CeremonyHold, string> = {
    king: 'the King to be in the town',
    game: 'the game on the TV to end',
    tv: 'a TV to be open',
  };

  /** Where the ceremony is at: on right now, when the next one comes on its own, or what it is waiting for */
  const ceremonyStatus = $derived.by(() => {
    if (!mod) return '';
    if (mod.ceremonyPhase === 'gather') return 'A ceremony is on: everyone is on the way to the throne room';
    if (mod.ceremonyPhase === 'court') return 'A ceremony is on: the King holds court';
    if (mod.ceremonyPhase === 'leave') return 'The ceremony is over: everyone goes back to town';
    const next = mod.ceremonyNext;
    if (!mod.ceremonyAuto || !next) return 'Held only when you start it';
    if (next <= now) return mod.ceremonyHold ? `Due now, waiting for ${HOLDS[mod.ceremonyHold]}` : 'Due now: about to start';
    const days = Math.round((new Date(next).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
    return `Next on its own: ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : day(next, now)} at ${mod.ceremonyTime}`;
  });

  function setDays(value: string) {
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && n >= 1) setOption('ceremonyEveryDays', n);
  }

  /** Said under the field when what was typed is not a time of day */
  let timeError = $state('');

  function setTime(input: HTMLInputElement) {
    const m = /^(\d{1,2})[:.h ]?(\d{2})$/.exec(input.value.trim());
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
      timeError = 'Write the time as hours and minutes, like 21:00';
      return;
    }
    timeError = '';
    input.value = `${m[1].padStart(2, '0')}:${m[2]}`;
    setOption('ceremonyTime', input.value);
  }

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
    <label class="field">
      <span>Pieces to find the secret {SLOTS.filter((s) => 'secret' in s).map((s) => s.name).join(' and ')}</span>
      <input class="input" type="number" min="0" max="1000" value={mod.shop?.secretPieces ?? 0} onchange={(e) => setAmount('secretPieces', e.currentTarget.value)} />
    </label>
    <p class="faint small">A secret slot shows nowhere, not even locked, until a guest owns at least this many pieces with one in every slot, the locked ones too.</p>
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

  <Section title="Town life">
    <div class="line">
      <div>
        <strong>Chats</strong>
        <p class="faint small">
          Now and then a character walks up to someone standing around or wandering nearby. They meet halfway, turn to each other and take turns talking,
          with small speech bubbles over their heads.
        </p>
      </div>
      <Toggle checked={!!mod.chat} label="Chats" onchange={(v) => setOption('chat', v)} />
    </div>
    <label class="field">
      <span>Chance to start a chat (percent)</span>
      <input class="input" type="number" min="0" max="100" value={mod.chatChancePct} onchange={(e) => setAmount('chatChancePct', e.currentTarget.value)} />
    </label>
    <p class="faint small">Each time a character picks something new to do. Higher: more chats in a busy town.</p>
    <div class="pair">
      <label class="field">
        <span>A chat lasts from (seconds)</span>
        <input class="input" type="number" min="2" max="120" value={mod.chatMinSec} onchange={(e) => setSeconds('chatMinSec', e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>to (seconds)</span>
        <input class="input" type="number" min="2" max="120" value={mod.chatMaxSec} onchange={(e) => setSeconds('chatMaxSec', e.currentTarget.value)} />
      </label>
    </div>
  </Section>

  <Section title="The King">
    <div class="line">
      <div>
        <strong>King's title</strong>
        <p class="faint small">
          One guest at a time is the King: their character wears a crown and a gold nametag, and the town gathers before them in the throne room. Anyone can
          take the title from the shop on their phone.
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
      <span class="bal">The crown costs {crownPrice} {mod.shop?.currencyName}</span>
    </div>
    <div class="buttons">
      <TwoStepButton class="small" disabled={!mod.king?.id} onconfirm={() => attempt(() => rpc('world', 'removeKing'), 'Title removed')}>
        Remove the title
        {#snippet armed()}Tap again to remove{/snippet}
      </TwoStepButton>
      <TwoStepButton class="small" disabled={crownPrice <= (mod.kingBase ?? 0)} onconfirm={() => attempt(() => rpc('world', 'resetKingPrice'), 'Price reset')}>
        Reset the price
        {#snippet armed()}Tap again to reset{/snippet}
      </TwoStepButton>
    </div>
    <p class="faint small">
      The title changed hands {mod.kingSales ?? 0} {mod.kingSales === 1 ? 'time' : 'times'}. Removing it leaves the price where it is; resetting brings it back
      to the starting price at once.
    </p>
    <Monarchy />
    <label class="field">
      <span>Starting price</span>
      <input class="input" type="number" min="0" value={mod.kingBase} onchange={(e) => setAmount('kingBase', e.currentTarget.value)} />
    </label>
    <div class="pair">
      <label class="field">
        <span>Then times the price paid</span>
        <input class="input" type="number" min="1" max="10" step="0.1" value={mod.kingRise} onchange={(e) => setSeconds('kingRise', e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>Dropping each minute by</span>
        <input class="input" type="number" min="0" value={mod.kingDropPerMin} onchange={(e) => setAmount('kingDropPerMin', e.currentTarget.value)} />
      </label>
    </div>
    <p class="faint small">
      When someone takes the crown, its price goes up to what they paid times this, then drops every minute, never below the starting price.
    </p>
    <label class="field">
      <span>The old King gets back (percent of what they paid)</span>
      <input class="input" type="number" min="0" max="100" value={mod.kingRefundPct} onchange={(e) => setAmount('kingRefundPct', e.currentTarget.value)} />
    </label>

    <div class="line">
      <div>
        <strong>Ceremony in the throne room</strong>
        <p class="faint small">
          The TV's camera moves a third of the screen to the right, over to the throne room. The King walks up the red carpet to the throne; once he is
          in the room the others follow and line up along the carpet. When all are there the King raises his hands, everyone kneels and he sits. Then all go
          back to town. On: it is held on its own, on the days and at the time below.
        </p>
      </div>
      <Toggle checked={!!mod.ceremonyAuto} label="Hold the ceremony on its own" onchange={(v) => setOption('ceremony', v)} />
    </div>
    <div class="pair">
      <label class="field">
        <span>Every (days)</span>
        <input class="input" type="number" min="1" max="365" value={mod.ceremonyEveryDays} onchange={(e) => setDays(e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>At (hours:minutes)</span>
        <input class="input" type="text" inputmode="numeric" maxlength="5" placeholder="21:00" value={mod.ceremonyTime} onchange={(e) => setTime(e.currentTarget)} />
      </label>
    </div>
    {#if timeError}<p class="error small">{timeError}</p>{/if}
    <div class="pair">
      <label class="field">
        <span>The King holds court for (seconds)</span>
        <input class="input" type="number" min="10" max="600" value={mod.ceremonySec} onchange={(e) => setSeconds('ceremonySec', e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>Time to get going (seconds)</span>
        <input class="input" type="number" min="0" max="120" value={mod.ceremonyGraceSec} onchange={(e) => setSeconds('ceremonyGraceSec', e.currentTarget.value)} />
      </label>
    </div>
    <p class="faint small">
      The court lasts from the moment everyone kneels. Once called, everyone has the time to get going to finish what they are doing: what ends within it
      is finished, the rest is cut short. Sleepers wake up for it; only a trip to a shop is finished first.
    </p>
    <div class="current">
      <span class="status">{ceremonyStatus}</span>
    </div>
    <div class="buttons">
      <button type="button" class="btn small" disabled={!!mod.ceremonyPhase} onclick={() => attempt(() => rpc('world', 'startCeremony'), 'The ceremony begins')}>
        <Crown size={16} />Start the ceremony now
      </button>
      {#if mod.ceremonyPhase}
        <button type="button" class="btn small" disabled={mod.ceremonyPhase === 'leave'} onclick={() => attempt(() => rpc('world', 'endCeremony'))}>
          End it
        </button>
      {/if}
    </div>
    <p class="faint small">
      Starting it yourself works at any time, to see it or for the fun of it, and does not count for the days above. Without a King the throne stays empty.
    </p>
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
  .error {
    margin: 0;
    color: var(--danger);
  }
  .status {
    flex: 1;
    font-size: 0.9rem;
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
