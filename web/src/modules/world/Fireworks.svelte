<script lang="ts">
  import { onMount } from 'svelte';
  import { Coins, Moon, Pencil, Plus, Rocket, Sun, Trash2 } from '@lucide/svelte';
  import { attempt, hb, rpc, serverNow } from '$lib/client.svelte.ts';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import { BASIC_FIREWORK, fireworkCost, type FwDesign } from '$shared/worldActions.ts';
  import type { WorldState } from '$shared/world.ts';
  import FireworkDesigner from './FireworkDesigner.svelte';
  import ShellThumb from './ShellThumb.svelte';

  /**
   * The guest's fireworks: every show they made, ready to launch again (a basic one to start
   * with), and the designer to make new ones or change them. They go up at night: one launched in
   * the day waits for nightfall.
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

  async function launch(d: FwDesign) {
    if (!fw) return;
    busy = true;
    await attempt(() => rpc('world', 'fwLaunch', { id: d.id, price: fireworkCost(d, fw) }), 'Launched');
    busy = false;
  }

  /** The guest's own show while it waits for the night, is set up, waits its turn or goes up (the TV's state has them all) */
  const mineShow = $derived(world?.shows?.filter((s) => s.by === hb.me?.id).at(-1));
  const status = $derived.by(() => {
    const s = mineShow;
    if (!s) return '';
    if (s.forNight) return `${s.design.name}: up at nightfall`;
    if (!s.at) return `${s.design.name}: setting up, look at the TV`;
    if (s.at > now) return `${s.design.name}: up in ${Math.max(1, Math.round((s.at - now) / 1000))} s`;
    return now < s.ends ? `${s.design.name} is in the sky!` : '';
  });
  /** One show at a time: the next once this one has gone up */
  const waiting = $derived(!!mineShow && (mineShow.forNight || !mineShow.at || mineShow.at > now));

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
          <!-- Its first shell as drawn on the left (how many more on it), the rest on the right -->
          <article class="show card">
            <button type="button" class="thumb" onclick={() => edit(d)} aria-label="Edit {d.name}">
              <ShellThumb shell={d.shells[0]} size={58} />
              {#if d.shells.length > 1}<span class="more">+{d.shells.length - 1}</span>{/if}
            </button>
            <div class="info">
              <div class="top">
                <strong class="truncate">{d.name}</strong>
                <span class="price"><Coins size={14} />{cost}</span>
              </div>
              <div class="buttons">
                <button type="button" class="btn small primary go" disabled={busy || !canLaunch || waiting} onclick={() => launch(d)}>
                  {#if night}<Rocket size={15} />Launch{:else}<Moon size={15} />At nightfall{/if}
                </button>
                <button type="button" class="btn small ghost" onclick={() => edit(d)} aria-label="Edit"><Pencil size={15} /></button>
                {#if list.length > 1}
                  <TwoStepButton class="btn small ghost" onconfirm={() => remove(d)}>
                    <Trash2 size={15} />
                    {#snippet armed()}Delete{/snippet}
                  </TwoStepButton>
                {/if}
              </div>
            </div>
          </article>
        {/each}
      </div>
      <button type="button" class="btn block new" onclick={create}><Plus size={18} />New firework</button>
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
    gap: 0.75rem;
    padding: 0.55rem;
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
    gap: 0.45rem;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .top strong {
    flex: 1;
    min-width: 0;
  }
  .price {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--coin);
    font-weight: 700;
    white-space: nowrap;
  }
  .buttons {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .go {
    flex: 1;
    justify-content: center;
  }
  .new {
    justify-content: center;
  }
</style>
