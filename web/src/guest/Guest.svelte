<script lang="ts">
  import { ChevronLeft, House, Sparkles, UserRound } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { hb } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import Toasts from '$lib/ui/Toasts.svelte';
  import { applyTheme } from '../themes/index.ts';
  import { activeModules, moduleById } from '../modules/index.ts';
  import Join from './Join.svelte';
  import Home from './Home.svelte';
  import Earn from './Earn.svelte';
  import Profile from './Profile.svelte';

  type Tab = 'home' | 'earn' | 'me';
  let tab = $state<Tab>('home');
  let feature = $state<string | null>(null);

  $effect(() => applyTheme(hb.core?.theme ?? hb.visitor?.theme));

  const featureModule = $derived(feature ? activeModules().find((m) => m.id === feature && m.guest) : undefined);
  const takeover = $derived(moduleById(hb.core?.takeover)?.guestTakeover);

  // Leave a panel when its feature gets turned off
  $effect(() => {
    if (feature && hb.core && !featureModule) feature = null;
  });

  function open(id: string) {
    feature = id;
    window.scrollTo(0, 0);
  }

  function go(t: Tab) {
    tab = t;
    feature = null;
    window.scrollTo(0, 0);
  }
</script>

<Toasts />

{#if hb.needJoin}
  <Join />
{:else if !hb.me || !hb.core}
  <div class="splash"><p class="dim">Connecting...</p></div>
{:else}
  <div class="app">
    <header>
      {#if featureModule && !takeover}
        <button class="btn ghost back" onclick={() => (feature = null)} aria-label="Back"><ChevronLeft size={22} /></button>
        <h2 class="truncate">{featureModule.guest?.title}</h2>
      {:else}
        <h2 class="truncate brand">{hb.core.appName}</h2>
      {/if}
      <span class="spacer"></span>
      {#if !hb.connected}<span class="pill danger">Offline</span>{/if}
      {#if hb.core.economyEnabled}
        <button class="balance" onclick={() => go('earn')}><Money amount={hb.me.balance} /></button>
      {/if}
    </header>

    <main>
      {#if takeover}
        {@const Takeover = takeover}
        <Takeover />
      {:else if featureModule?.guest}
        {@const Panel = featureModule.guest.component}
        {#key featureModule.id}
          <div in:fly={{ x: 30, duration: 200 }}><Panel /></div>
        {/key}
      {:else if tab === 'home'}
        <Home {open} />
      {:else if tab === 'earn'}
        <Earn />
      {:else}
        <Profile />
      {/if}
    </main>

    {#if !takeover}
      <nav>
        <button class:active={tab === 'home' && !feature} onclick={() => go('home')}><House size={22} /><span>Home</span></button>
        {#if hb.core.economyEnabled}
          <button class:active={tab === 'earn' && !feature} onclick={() => go('earn')}><Sparkles size={22} /><span>Earn</span></button>
        {/if}
        <button class:active={tab === 'me' && !feature} onclick={() => go('me')}><UserRound size={22} /><span>Me</span></button>
      </nav>
    {/if}
  </div>
{/if}

<style>
  .splash {
    min-height: 100dvh;
    display: grid;
    place-items: center;
  }
  .app {
    min-height: 100dvh;
    max-width: 34rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
  }
  header {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: calc(0.75rem + env(safe-area-inset-top)) 1rem 0.75rem;
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  header h2 {
    font-size: 1.2rem;
  }
  .brand {
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .back {
    padding: 0;
    min-height: 2.2rem;
    width: 2.2rem;
    margin-left: -0.4rem;
  }
  .balance {
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    border-radius: 999px;
    padding: 0.4rem 0.85rem;
    font-size: 1rem;
  }
  main {
    flex: 1;
    padding: 0.5rem 1rem 6.5rem;
  }
  nav {
    position: fixed;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: min(34rem, 100%);
    display: flex;
    justify-content: space-around;
    padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid var(--border);
    z-index: 20;
  }
  nav button {
    display: grid;
    justify-items: center;
    gap: 0.15rem;
    background: none;
    border: 0;
    padding: 0.3rem 1.2rem;
    color: var(--text-faint);
    font-size: 0.72rem;
    font-weight: 600;
  }
  nav button.active {
    color: var(--accent);
  }
</style>
