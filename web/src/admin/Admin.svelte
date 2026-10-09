<script lang="ts">
  import { Activity, Coins, EyeOff, KeyRound, Medal, Menu, Palette, Search, Users, X } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Toasts from '$lib/ui/Toasts.svelte';
  import DialogHost from '$lib/ui/DialogHost.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import { applyTheme } from '../themes/index.ts';
  import { clientModules } from '../modules/index.ts';
  import Login from './Login.svelte';
  import ModulePrices from './ModulePrices.svelte';
  import Live from '../modules/core/admin/Live.svelte';
  import Guests from '../modules/core/admin/Guests.svelte';
  import Economy from '../modules/core/admin/Economy.svelte';
  import Appearance from '../modules/core/admin/Appearance.svelte';
  import Access from '../modules/core/admin/Access.svelte';
  import Privacy from '../modules/core/admin/Privacy.svelte';
  import Leaderboard from '../modules/core/admin/Leaderboard.svelte';
  import type { AdminGroup } from '../modules/types.ts';

  interface Section {
    id: string;
    title: string;
    icon: Component<any>;
    component: Component;
    /** Module id, when the section belongs to a toggleable module */
    module?: string;
    /** The module's own lines in its "Prices and rewards" section */
    prices?: Component;
    /** More words the menu search finds it by */
    keywords?: string;
  }

  /**
   * The side menu, in groups: the party as it goes, the features (play, sound, TV and lights),
   * then the settings you set once.
   */
  const features = (group: AdminGroup): Section[] =>
    clientModules
      .filter((m) => m.admin?.group === group)
      .sort((a, b) => a.admin!.order - b.admin!.order)
      .map((m) => ({ id: m.id, title: m.admin!.title, icon: m.admin!.icon, component: m.admin!.component, module: m.id, prices: m.admin!.prices, keywords: m.admin!.keywords }));

  const groups: { title: string; sections: Section[] }[] = [
    {
      title: 'Party',
      sections: [
        { id: 'live', title: 'Live', icon: Activity, component: Live, keywords: 'now money rain features on off activity stop' },
        { id: 'guests', title: 'Guests', icon: Users, component: Guests, keywords: 'people pin kick rename balance gift give take money selfie avatar picture' },
        { id: 'leaderboard', title: 'Leaderboard', icon: Medal, component: Leaderboard, keywords: 'ranking scores boards rotate richest spenders earners hidden tv' },
      ],
    },
    { title: 'Play', sections: features('play') },
    { title: 'Music and sound', sections: features('sound') },
    { title: 'TV and lights', sections: features('screen') },
    {
      title: 'Settings',
      sections: [
        { id: 'economy', title: 'Economy', icon: Coins, component: Economy, keywords: 'money currency prices price rewards earn earning passive income transactions ledger free' },
        { id: 'appearance', title: 'Appearance', icon: Palette, component: Appearance, keywords: 'theme name colors look' },
        { id: 'privacy', title: 'Privacy', icon: EyeOff, component: Privacy, keywords: 'names anonymous activity feed hide' },
        { id: 'access', title: 'Access', icon: KeyRound, component: Access, keywords: 'password pairing phone remote qr code link url tunnel joining session new reset' },
      ],
    },
  ];
  const sections = groups.flatMap((g) => g.sections);

  // Search: every word typed must be in the title or the keywords
  let query = $state('');
  const matches = (s: Section) => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const text = `${s.title} ${s.keywords ?? ''}`.toLowerCase();
    return words.every((w) => text.includes(w));
  };
  const shown = $derived(groups.map((g) => ({ ...g, sections: g.sections.filter(matches) })).filter((g) => g.sections.length));

  const initial = new URLSearchParams(location.hash.slice(1)).get('s');
  let current = $state(sections.find((s) => s.id === initial)?.id ?? 'live');
  let menuOpen = $state(false);

  const section = $derived(sections.find((s) => s.id === current) ?? sections[0]);
  const feature = $derived(section.module ? hb.core?.features.find((f) => f.id === section.module) : undefined);

  $effect(() => applyTheme(hb.core?.theme));

  function select(id: string) {
    current = id;
    menuOpen = false;
    history.replaceState(null, '', `#s=${id}`);
    window.scrollTo(0, 0);
  }

  const featureOf = (id: string | undefined) => (id ? hb.core?.features.find((f) => f.id === id) : undefined);
  const toggleFeature = (id: string, enabled: boolean) => attempt(() => rpc('core', 'setFeature', { id, enabled }));
</script>

<Toasts />
<DialogHost />

{#if hb.authError}
  <Login />
{:else if !hb.core?.admin}
  <div class="splash"><p class="dim">Connecting...</p></div>
{:else}
  <div class="admin" class:menu-open={menuOpen}>
    <nav>
      <div class="nav-head">
        <span class="brand">{hb.core.appName}</span>
        <span class="pill">Host</span>
      </div>
      <label class="search">
        <Search size={16} />
        <input
          type="search"
          placeholder="Find a setting"
          bind:value={query}
          onkeydown={(e) => {
            if (e.key === 'Enter' && shown[0]) select(shown[0].sections[0].id);
            if (e.key === 'Escape') query = '';
          }}
        />
      </label>
      {#each shown as g (g.title)}
        <span class="group">{g.title}</span>
        {#each g.sections as s (s.id)}
          {@const f = featureOf(s.module)}
          <!-- The name opens the page (even when off); the switch only turns the feature on or off -->
          <div class="nav-row" class:active={s.id === current} class:off={f && !f.enabled}>
            <button class="nav-item" onclick={() => select(s.id)}>
              <s.icon size={18} />
              <span class="truncate">{s.title}</span>
            </button>
            {#if f}
              <span class="nav-toggle"><Toggle checked={f.enabled} label="{f.name} on or off" onchange={(v) => toggleFeature(f.id, v)} /></span>
            {/if}
          </div>
        {/each}
      {:else}
        <p class="faint none">Nothing found. Try another word.</p>
      {/each}
    </nav>
    <button class="scrim" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>

    <div class="content">
      <header>
        <button class="btn ghost menu" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu">
          {#if menuOpen}<X size={22} />{:else}<Menu size={22} />{/if}
        </button>
        <h1 class="truncate">{section.title}</h1>
        <span class="spacer"></span>
        {#if !hb.connected}<span class="pill danger">Offline</span>{/if}
        {#if feature}
          <span class="dim state">{feature.enabled ? 'On' : 'Off, hidden from guests'}</span>
          <Toggle
            checked={feature.enabled}
            label="Enable {feature.name}"
            onchange={(v) => attempt(() => rpc('core', 'setFeature', { id: feature.id, enabled: v }))}
          />
        {/if}
      </header>
      <main>
        {#key section.id}
          {#if section.module}<ModulePrices module={section.module} extra={section.prices} />{/if}
          <section.component />
        {/key}
      </main>
    </div>
  </div>
{/if}

<style>
  .splash {
    min-height: 100dvh;
    display: grid;
    place-items: center;
  }
  .admin {
    min-height: 100dvh;
    display: grid;
    grid-template-columns: 16.5rem 1fr;
  }
  nav {
    position: sticky;
    top: 0;
    height: 100dvh;
    overflow-y: auto;
    padding: 1.2rem 0.8rem;
    border-right: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .nav-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.6rem 1rem;
  }
  .brand {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.15rem;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0.2rem 0.4rem;
    padding: 0 0.7rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-faint);
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  .search input {
    flex: 1;
    min-width: 0;
    padding: 0.55rem 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
  }
  .group {
    padding: 0.9rem 0.7rem 0.3rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .none {
    padding: 0.6rem 0.7rem;
    font-size: 0.88rem;
  }
  .nav-row {
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }
  .nav-row:hover {
    background: var(--surface-2);
  }
  .nav-row.active {
    background: var(--surface-3);
  }
  .nav-item {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.6rem 0.7rem;
    border: 0;
    background: none;
    color: var(--text-dim);
    font-weight: 500;
    text-align: left;
  }
  .active .nav-item {
    color: var(--text);
  }
  .off .nav-item {
    color: var(--text-faint);
  }
  .nav-toggle {
    flex: none;
    display: flex;
    padding-right: 0.45rem;
  }
  .nav-toggle :global(.toggle) {
    width: 2.3rem;
    height: 1.35rem;
  }
  .nav-toggle :global(.knob) {
    width: 0.95rem;
    height: 0.95rem;
    left: 0.17rem;
  }
  .nav-toggle :global(.on .knob) {
    left: calc(100% - 1.12rem);
  }
  .scrim {
    display: none;
  }
  .content {
    min-width: 0;
    padding: 0 1.5rem 3rem;
    max-width: 60rem;
  }
  header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1.1rem 0;
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
  h1 {
    font-size: 1.5rem;
  }
  .menu {
    display: none;
    padding: 0;
    width: 2.4rem;
    min-height: 2.4rem;
  }
  .state {
    font-size: 0.85rem;
  }
  main {
    display: grid;
    gap: 1rem;
  }

  @media (max-width: 860px) {
    .admin {
      grid-template-columns: 1fr;
    }
    nav {
      position: fixed;
      z-index: 30;
      left: 0;
      top: 0;
      width: min(17rem, 80vw);
      background: var(--bg);
      transform: translateX(-100%);
      transition: transform 0.25s ease;
    }
    .menu-open nav {
      transform: none;
    }
    .menu-open .scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 25;
      border: 0;
      background: rgba(0, 0, 0, 0.5);
    }
    .menu {
      display: inline-flex;
      margin-left: -0.5rem;
    }
    .content {
      padding: 0 1rem 3rem;
    }
    header {
      padding: calc(0.8rem + env(safe-area-inset-top)) 0 0.8rem;
    }
    h1 {
      font-size: 1.3rem;
    }
  }
</style>
