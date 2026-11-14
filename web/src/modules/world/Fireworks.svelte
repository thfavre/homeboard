<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Coins, Moon, Pencil, Plus, Rocket, Sun, Trash2 } from '@lucide/svelte';
  import { attempt, hb, rpc, serverNow } from '$lib/client.svelte.ts';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import { BASIC_FIREWORK, MAX_TOGETHER, fireworkCost, type FwDesign } from '$shared/worldActions.ts';
  import type { WorldState } from '$shared/world.ts';
  import FireworkDesigner from './FireworkDesigner.svelte';
  import ShellThumb from './ShellThumb.svelte';

  /**
   * The guest's fireworks: every show they made, ready to launch again (a basic one to start
   * with), and the designer to make new ones or change them. Up to MAX_TOGETHER are picked and
   * launched together, going up one after the other in the order picked. They go up at night:
   * launched in the day, they wait for nightfall.
   */
  const world = $derived(hb.modules.world as WorldState | undefined);
  const fw = $derived(world?.actions?.fireworks);
  const currency = $derived(world?.shop?.currencyName ?? '');

  let list = $state<FwDesign[] | null>(null);
  /** The show being made or changed (a copy: the saved one stays as it is until saved) */
  let draft = $state<FwDesign | null>(null);
  let busy = $state(false);

  let now = $state(serverNow());
  onMount(() => {
    const t = setInterval(() => (now = serverNow()), 1000);
    void rpc<FwDesign[]>('world', 'fwList').then(
      (l) => (list = l),
      () => (list = []),
    );
    return () => clearInterval(t);
  });

  /** Night now, or in so long (the town has a night to wait for) */
  const night = $derived(!!fw?.night);
  const nightIn = $derived(fw?.nightAt ? `${Math.max(1, Math.round((fw.nightAt - now) / 60_000))} min` : '');
  /** A launch is possible: at night, or in the day for the coming night */
  const canLaunch = $derived(!!fw?.on && (night || !!fw.nightAt));

  function edit(d: FwDesign) {
    draft = structuredClone($state.snapshot(d)) as FwDesign;
  }
  function create() {
    draft = { id: '', ...structuredClone(BASIC_FIREWORK), name: `Show ${(list?.length ?? 0) + 1}` };
  }

  async function save() {
    if (!draft) return;
    busy = true;
    const r = await attempt(() => rpc<{ list: FwDesign[]; id: string }>('world', 'fwSave', { design: $state.snapshot(draft) }), 'Saved');
    busy = false;
    if (!r) return;
    list = r.list;
    draft = null;
  }

  /** The shows picked to launch, in the order picked */
  let picked = $state<string[]>([]);
  function pick(d: FwDesign) {
    if (picked.includes(d.id)) picked = picked.filter((x) => x !== d.id);
    else if (picked.length < MAX_TOGETHER) picked = [...picked, d.id];
  }
  const pickedShows = $derived(picked.map((id) => list?.find((x) => x.id === id)).filter((x): x is FwDesign => !!x));
  const total = $derived(fw ? pickedShows.reduce((n, d) => n + fireworkCost(d, fw), 0) : 0);

  async function launch() {
    if (!fw || !pickedShows.length) return;
    busy = true;
    const done = await attempt(() => rpc('world', 'fwLaunch', { ids: pickedShows.map((d) => d.id), price: total }), 'Launched');
    busy = false;
    if (done) picked = [];
  }

  /** The guest's own show while it waits for the night, is set up, waits its turn or goes up (the TV's state has them all) */
  const mine = $derived(world?.shows?.filter((s) => s.by === hb.me?.id && (!s.at || now < s.ends)) ?? []);
  const status = $derived.by(() => {
    const s = mine[0];
    if (!s) return '';
    // (several launched together are one show, named after them all)
    const together = s.design.id.split('+').length;
    const what = together > 1 ? `Your ${together} shows` : s.design.name;
    const go = together > 1 ? 'go' : 'goes';
    if (s.forNight) return `${what} ${go} up at nightfall`;
    if (!s.at) return 'Your character is setting up the rockets';
    if (s.at > now) return `${what} ${go} up in ${Math.max(1, Math.round((s.at - now) / 1000))} s`;
    return `${what} ${together > 1 ? 'are' : 'is'} in the sky`;
  });
  /** Launched ones not gone up yet: the next launch waits for them */
  const waiting = $derived(mine.some((s) => s.forNight || !s.at || s.at > now));

  async function remove(d: FwDesign) {
    const r = await attempt(() => rpc<FwDesign[]>('world', 'fwDelete', { id: d.id }));
    if (r) list = r;
  }
</script>

{#if draft}
  <FireworkDesigner bind:design={draft} {busy} oncancel={() => (draft = null)} onsave={save} />
{:else}
  <div class="fireworks">
    <div class="sky" class:night>
      {#if night}<Moon size={17} />Night{:else}<Sun size={17} />Night in {nightIn || '...'}{/if}
      {#if status}<span class="status"><Rocket size={15} />{status}</span>{/if}
    </div>

    {#if list === null}
      <p class="faint">Loading...</p>
    {:else}
      <div class="list">
        {#each list as d (d.id)}
          {@const cost = fw ? fireworkCost(d, fw) : 0}
          {@const n = picked.indexOf(d.id)}
          <!-- Its first rocket as drawn on the left (how many more on it), the rest on the right; a tap picks it -->
          <article class="show card" class:on={n >= 0}>
            <button type="button" class="thumb" onclick={() => pick(d)} aria-label="Pick {d.name}" aria-pressed={n >= 0}>
              <ShellThumb shell={d.shells[0]} size={58} />
              {#if d.shells.length > 1}<span class="more">+{d.shells.length - 1}</span>{/if}
              {#if n >= 0}<span class="order">{picked.length > 1 ? n + 1 : ''}{#if picked.length === 1}<Check size={14} strokeWidth={3} />{/if}</span>{/if}
            </button>
            <button type="button" class="info" onclick={() => pick(d)}>
              <strong class="truncate">{d.name}</strong>
              <span class="price"><Coins size={14} />{cost}</span>
            </button>
            <button type="button" class="btn small ghost" onclick={() => edit(d)} aria-label="Edit"><Pencil size={15} /></button>
            {#if list.length > 1}
              <TwoStepButton class="btn small ghost" onconfirm={() => remove(d)}>
                <Trash2 size={15} />
                {#snippet armed()}Delete{/snippet}
              </TwoStepButton>
            {/if}
          </article>
        {/each}
      </div>
      <button type="button" class="btn block new" onclick={create}><Plus size={18} />New firework</button>
      <!-- The ones picked go up together, in the order picked -->
      {#if picked.length}
        <div class="launch-bar">
          <button type="button" class="btn primary block" disabled={busy || !canLaunch || waiting} onclick={launch}>
            {#if night}<Rocket size={18} />{:else}<Moon size={18} />{/if}
            Launch{picked.length > 1 ? ` ${picked.length}` : ''}{night ? '' : ' at nightfall'}
            <span class="total"><Coins size={14} />{total}</span>
          </button>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .fireworks {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .sky {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.45rem;
    padding: 0.55rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .sky.night {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
    color: var(--text);
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-left: auto;
    color: var(--success);
  }
  .list {
    display: grid;
    gap: 0.55rem;
  }
  .show {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem;
    transition: border-color 0.15s;
  }
  .show.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  }
  /* The order it goes up in, when several are picked (a tick for one) */
  .order {
    position: absolute;
    top: -0.35rem;
    left: -0.35rem;
    display: grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 0.8rem;
    font-weight: 800;
  }
  .thumb {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 4.6rem;
    height: 4.6rem;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: radial-gradient(120% 120% at 50% 110%, #232a57, #060818 75%);
  }
  .more {
    position: absolute;
    right: 0.25rem;
    bottom: 0.2rem;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.7rem;
    font-weight: 700;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: grid;
    justify-items: start;
    gap: 0.2rem;
    padding: 0.2rem 0;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
  }
  .info strong {
    max-width: 100%;
  }
  .price {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--coin);
    font-weight: 700;
    white-space: nowrap;
  }
  .new {
    justify-content: center;
  }
  /* Stays at the bottom of the screen, over the nav's top, while some are picked */
  .launch-bar {
    position: sticky;
    bottom: calc(4.6rem + env(safe-area-inset-bottom));
    z-index: 3;
  }
  .launch-bar .btn {
    justify-content: center;
    box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.8);
  }
  .total {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.3rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.18);
    font-size: 0.88rem;
  }
</style>
