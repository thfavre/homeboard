<script lang="ts">
  import { ChevronDown, Minus, Plus, RotateCcw } from '@lucide/svelte';
  import type { GamesSettings } from '$shared/games.ts';
  import { PARTY_GENERAL, PARTY_MINIS, partyOption, type PartyMiniId, type PartyOption } from '$shared/party.ts';
  import { rpc, attempt } from '$lib/client.svelte.ts';
  import Toggle from '$lib/ui/Toggle.svelte';
  import { PARTY_UI } from './minis.ts';

  /**
   * Light Party settings: the strip and the party, then one card per mini game with its switch and its
   * options. The options come from each mini game's list in shared/party.ts: a new one shows up here by itself.
   */
  let { settings: st, lights }: { settings: GamesSettings; lights: { id: string; name: string; online: boolean }[] } = $props();
  const setSettings = (patch: Partial<GamesSettings>) => attempt(() => rpc('games', 'setSettings', patch));

  type Scope = PartyMiniId | 'general';
  const value = (scope: Scope, key: string) => partyOption(st.partyOptions, scope, key);
  function setOption(scope: Scope, o: PartyOption, v: number) {
    const all = st.partyOptions ?? {};
    setSettings({ partyOptions: { ...all, [scope]: { ...all[scope], [o.key]: Math.min(o.max, Math.max(o.min, v)) } } });
  }
  function reset(scope: Scope) {
    const { [scope]: _, ...rest } = st.partyOptions ?? {};
    setSettings({ partyOptions: rest });
  }
  /** Some options of this mini game are not at their default */
  const changed = (scope: Scope, list: PartyOption[]) => list.some((o) => value(scope, o.key) !== o.default);

  const minis = $derived(st.partyMinis.filter((id) => PARTY_MINIS.some((g) => g.id === id)));
  const rounds = $derived(Math.min(st.partyRounds, Math.max(1, minis.length)));
  let open = $state<PartyMiniId | null>(null);
</script>

{#snippet stepper(label: string, hint: string, n: number, min: number, max: number, unit: string, set: (dir: 1 | -1) => void)}
  <div class="line">
    <span class="label">{label} {#if hint}<span class="faint small">{hint}</span>{/if}</span>
    <span class="stepper">
      <button class="btn small" aria-label="Less" disabled={n <= min} onclick={() => set(-1)}><Minus size={16} /></button>
      <strong class="mono">{n}{unit}</strong>
      <button class="btn small" aria-label="More" disabled={n >= max} onclick={() => set(1)}><Plus size={16} /></button>
    </span>
  </div>
{/snippet}

{#snippet options(scope: Scope, list: PartyOption[])}
  {#each list as o (o.key)}
    {@const n = value(scope, o.key)}
    {@render stepper(o.label, `${o.hint}${o.hint ? '. ' : ''}Default ${o.default}${o.unit ?? ''}`, n, o.min, o.max, o.unit ?? '', (dir) => setOption(scope, o, n + dir * o.step))}
  {/each}
  {#if changed(scope, list)}
    <button class="btn small ghost reset" onclick={() => reset(scope)}><RotateCcw size={14} /> Back to the defaults</button>
  {/if}
{/snippet}

<h4 class="group">Light</h4>
<div class="line">
  <span class="label">Light strip <span class="faint small">The WLED strip the mini games are played on, hung upright. The game can only start when it is reachable</span></span>
  <select class="input light" value={st.partyLight} onchange={(e) => setSettings({ partyLight: e.currentTarget.value })}>
    <option value="">None</option>
    {#each lights as d (d.id)}<option value={d.id}>{d.name}{d.online ? '' : ' (offline)'}</option>{/each}
  </select>
</div>
{#if st.partyLight}
  <div class="line">
    <span class="label">First LED at the top <span class="faint small">Turn it on if the blocks fall upward</span></span>
    <Toggle checked={st.partyReverse} onchange={(v) => setSettings({ partyReverse: v })} label="First LED at the top" />
  </div>
{/if}

<h4 class="group">Party</h4>
{@render stepper('Mini games per party', `Drawn at random from the ones switched on below, 1 to ${Math.max(1, minis.length)}`, rounds, 1, Math.max(1, minis.length), '', (dir) => setSettings({ partyRounds: rounds + dir }))}
{@render options('general', PARTY_GENERAL)}

<h4 class="group">Mini games</h4>
<div class="minis">
  {#each PARTY_MINIS as g (g.id)}
    {@const Icon = PARTY_UI[g.id].icon}
    {@const on = minis.includes(g.id)}
    {@const isOpen = open === g.id}
    <div class="mini" class:off={!on} class:open={isOpen} style:--g1={g.colors[0]} style:--g2={g.colors[1]}>
      <div class="head">
        <button class="name" aria-expanded={isOpen} onclick={() => (open = isOpen ? null : g.id)}>
          <span class="tile"><Icon size={16} /></span>
          <span class="label">
            <strong>{g.name}</strong>
            <span class="faint small truncate">{g.tagline}{changed(g.id, g.options) ? ' · custom settings' : ''}</span>
          </span>
          <span class="chev"><ChevronDown size={16} /></span>
        </button>
        <Toggle
          checked={on}
          onchange={(v) => setSettings({ partyMinis: v ? [...minis, g.id] : minis.filter((x) => x !== g.id) })}
          label={g.name}
        />
      </div>
      {#if isOpen}
        <div class="opts">{@render options(g.id, g.options)}</div>
      {/if}
    </div>
  {/each}
</div>

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
  .label {
    display: grid;
    min-width: 0;
  }
  .line > .label {
    flex: 1 1 12rem;
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
    min-width: 3.2rem;
    text-align: center;
    font-size: 1.05rem;
  }
  .light {
    flex: none;
    width: auto;
    min-width: 9rem;
    max-width: 12rem;
  }
  .reset {
    justify-self: start;
  }

  /* One card per mini game, inside the Light Party card */
  .minis {
    display: grid;
    gap: 0.45rem;
  }
  .mini {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    transition: border-color 0.2s ease;
  }
  .mini.open {
    border-color: color-mix(in srgb, var(--g1) 45%, var(--border));
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.5rem 0.75rem 0.5rem 0.5rem;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .name .label {
    flex: 1;
  }
  .tile {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.6rem;
    background: linear-gradient(135deg, var(--g1), var(--g2));
    color: #fff;
    transition:
      filter 0.2s ease,
      opacity 0.2s ease;
  }
  .off .tile {
    filter: grayscale(0.85);
    opacity: 0.55;
  }
  .off .name strong {
    color: var(--text-dim);
  }
  .chev {
    flex: none;
    display: grid;
    color: var(--text-faint);
    transition: transform 0.2s ease;
  }
  .open .chev {
    transform: rotate(180deg);
  }
  .opts {
    display: grid;
    gap: 0.8rem;
    padding: 0.75rem 0.75rem 0.85rem;
    border-top: 1px solid var(--border);
  }
</style>
