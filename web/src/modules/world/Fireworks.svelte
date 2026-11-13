<script lang="ts">
  import { onMount } from 'svelte';
  import { Coins, Copy, Moon, Pencil, Plus, Rocket, Sun, Trash2 } from '@lucide/svelte';
  import { attempt, hb, rpc, serverNow } from '$lib/client.svelte.ts';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import { BASIC_FIREWORK, FW_COLORS, fireworkCost, fwHex, type FwDesign } from '$shared/worldActions.ts';
  import type { WorldState } from '$shared/world.ts';
  import FireworkDesigner from './FireworkDesigner.svelte';
  import FireworkPreview from './FireworkPreview.svelte';

  /**
   * The guest's fireworks: every show they made, ready to launch again (a basic one to start
   * with), and the designer to make new ones or change them. They only go up at night.
   */
  let { ondesigning }: { ondesigning?: (on: boolean) => void } = $props();

  const world = $derived(hb.modules.world as WorldState | undefined);
  const fw = $derived(world?.actions?.fireworks);
  const currency = $derived(world?.shop?.currencyName ?? '');

  let list = $state<FwDesign[] | null>(null);
  /** The show being made or changed (a copy: the saved one stays as it is until saved) */
  let draft = $state<FwDesign | null>(null);
  let busy = $state(false);
  /** The list's preview plays this one */
  let playing = $state<string | null>(null);

  let now = $state(serverNow());
  onMount(() => {
    const t = setInterval(() => (now = serverNow()), 1000);
    void rpc<FwDesign[]>('world', 'fwList').then(
      (l) => (list = l),
      () => (list = []),
    );
    return () => clearInterval(t);
  });

  $effect(() => ondesigning?.(!!draft));

  /** Why a show cannot go up now, or when it would (empty: it goes up at once) */
  const note = $derived.by(() => {
    if (!fw?.on) return 'Fireworks are off for now.';
    if (!fw.night) {
      if (!fw.nightAt) return 'Fireworks only go up at night, and the town has no night right now.';
      const min = Math.max(1, Math.round((fw.nightAt - now) / 60_000));
      return `Fireworks only go up at night. Night falls in about ${min} min.`;
    }
    if (fw.busyUntil > now) return `A show is on: one launched now goes up after it, in about ${Math.max(1, Math.round((fw.busyUntil - now) / 1000))} s.`;
    return '';
  });
  const canLaunch = $derived(!!fw?.on && !!fw.night);

  function edit(d: FwDesign) {
    draft = structuredClone($state.snapshot(d)) as FwDesign;
  }
  function create() {
    draft = { id: '', ...structuredClone(BASIC_FIREWORK), name: `Show ${(list?.length ?? 0) + 1}` };
  }
  function duplicate(d: FwDesign) {
    draft = { ...(structuredClone($state.snapshot(d)) as FwDesign), id: '', name: `${d.name} 2`.slice(0, 32) };
  }

  /** Save the draft; returns its id (null: it failed) */
  async function save(): Promise<string | null> {
    if (!draft) return null;
    busy = true;
    const r = await attempt(() => rpc<{ list: FwDesign[]; id: string }>('world', 'fwSave', { design: $state.snapshot(draft) }));
    busy = false;
    if (!r) return null;
    list = r.list;
    draft.id = r.id;
    return r.id;
  }

  async function launch(d: FwDesign) {
    if (!fw) return;
    busy = true;
    const r = await attempt(() => rpc<{ at: number }>('world', 'fwLaunch', { id: d.id, price: fireworkCost(d, fw) }), 'Launched');
    busy = false;
    if (r) launched = { name: d.name, at: r.at };
  }
  let launched = $state<{ name: string; at: number } | null>(null);

  async function remove(d: FwDesign) {
    const r = await attempt(() => rpc<FwDesign[]>('world', 'fwDelete', { id: d.id }));
    if (r) list = r;
  }

  /** The colors a show uses, for its card */
  const colorsOf = (d: FwDesign) => FW_COLORS.filter((c) => d.shells.some((s) => s.colors.includes(c.id))).map((c) => c.id);
</script>

{#if draft}
  <FireworkDesigner
    bind:design={draft}
    {busy}
    {canLaunch}
    launchNote={note}
    oncancel={() => (draft = null)}
    onsave={async () => {
      if (await save()) draft = null;
    }}
    onlaunch={async () => {
      const id = await save();
      const d = list?.find((x) => x.id === id);
      if (d) {
        await launch(d);
        draft = null;
      }
    }}
  />
{:else}
  <div class="fireworks">
    <div class="sky-status" class:night={fw?.night}>
      {#if fw?.night}<Moon size={18} />{:else}<Sun size={18} />{/if}
      <span>{fw?.night ? (note || 'It is night in the town: the sky is yours.') : note}</span>
    </div>

    {#if launched && launched.at > now - 4000}
      <div class="launched card">
        <Rocket size={18} />
        <span>{launched.at > now ? `${launched.name} goes up in ${Math.max(1, Math.round((launched.at - now) / 1000))} s. Look at the TV!` : `${launched.name} is lighting up the sky!`}</span>
      </div>
    {/if}

    {#if list === null}
      <p class="faint">Loading...</p>
    {:else}
      <div class="list">
        {#each list as d (d.id)}
          {@const cost = fw ? fireworkCost(d, fw) : 0}
          <article class="show card">
            <button type="button" class="poster" onclick={() => (playing = playing === d.id ? null : d.id)} aria-label="Preview {d.name}">
              {#if playing === d.id}
                <FireworkPreview design={d} compact />
              {:else}
                <span class="dots">
                  {#each colorsOf(d) as c (c)}<span style:--c={fwHex(c)}></span>{/each}
                </span>
                <span class="tap faint small">Tap to preview</span>
              {/if}
            </button>
            <div class="info">
              <div class="title">
                <strong class="truncate">{d.name}</strong>
                <span class="faint small">{d.shells.length} {d.shells.length === 1 ? 'shell' : 'shells'}</span>
              </div>
              <span class="price"><Coins size={15} />{cost} {currency}</span>
            </div>
            <div class="buttons">
              <button type="button" class="btn small primary" disabled={busy || !canLaunch} onclick={() => launch(d)}><Rocket size={15} />Launch</button>
              <button type="button" class="btn small" onclick={() => edit(d)}><Pencil size={15} />Edit</button>
              <button type="button" class="btn small ghost" onclick={() => duplicate(d)} aria-label="Copy"><Copy size={15} /></button>
              {#if list.length > 1}
                <TwoStepButton class="btn small ghost" onconfirm={() => remove(d)}>
                  <Trash2 size={15} />
                  {#snippet armed()}Delete it{/snippet}
                </TwoStepButton>
              {/if}
            </div>
          </article>
        {/each}
      </div>
      <button type="button" class="btn block new" onclick={create}><Plus size={18} />New firework</button>
      <p class="faint small">Make your own show: shapes, colors, effects, several at once. The crazier it is, the more it costs. Everything you make stays here to launch again.</p>
    {/if}
  </div>
{/if}

<style>
  .fireworks {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .sky-status {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: 0.92rem;
  }
  .sky-status.night {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
    color: var(--text);
  }
  .launched {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.75rem 0.9rem;
    color: var(--success);
    font-weight: 600;
  }
  .list {
    display: grid;
    gap: 0.7rem;
  }
  .show {
    display: grid;
    gap: 0.6rem;
    padding: 0.7rem;
  }
  .poster {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 4.2rem;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: radial-gradient(120% 140% at 50% 120%, #232a57, #060818 70%);
    overflow: hidden;
  }
  .poster :global(canvas) {
    border: 0;
  }
  .dots {
    display: flex;
    gap: 0.45rem;
  }
  .dots span {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 10px 2px var(--c);
  }
  .tap {
    position: absolute;
    right: 0.6rem;
    bottom: 0.35rem;
    color: rgba(255, 255, 255, 0.5);
  }
  .info {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .title {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .price {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--coin);
    font-weight: 600;
    white-space: nowrap;
  }
  .buttons {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .new {
    justify-content: center;
  }
</style>
