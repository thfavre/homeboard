<script lang="ts">
  import { ChevronLeft, House, Sparkles, UserRound } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { hb } from '$lib/client.svelte.ts';
  import Balance from './Balance.svelte';
  import Toasts from '$lib/ui/Toasts.svelte';
  import EdgeFlash from '$lib/ui/EdgeFlash.svelte';
  import DialogHost from '$lib/ui/DialogHost.svelte';
  import { applyTheme } from '../themes/index.ts';
  import { activeModules, clientModules } from '../modules/index.ts';
  import Join from './Join.svelte';
  import Home from './Home.svelte';
  import Earn from './Earn.svelte';
  import Profile from './Profile.svelte';
  import AvatarFlow from './AvatarFlow.svelte';
  import WelcomeBack from './WelcomeBack.svelte';
  import { Camera } from '@lucide/svelte';
  import { avatarFlow } from './avatar.svelte.ts';

  type Tab = 'home' | 'earn' | 'me';
  let tab = $state<Tab>('home');
  let feature = $state<string | null>(null);
  let headerHeight = $state(0);

  $effect(() => applyTheme(hb.core?.theme ?? hb.visitor?.theme));

  const featureModule = $derived(feature ? activeModules().find((m) => m.id === feature && m.guest) : undefined);
  const takeoverModule = $derived(
    clientModules.find((m) => {
      if (!m.guestTakeover) return false;
      const live = hb.core?.takeover === m.id;
      return m.showGuestTakeover ? m.showGuestTakeover(live) : live;
    }),
  );
  const takeover = $derived(takeoverModule?.guestTakeover);

  // When a full-screen view closes, leave that feature's panel too
  // (the guest who started a quiz goes back home, not to the quiz form)
  let lastTakeover: string | null = null;
  $effect(() => {
    const id = takeoverModule?.id ?? null;
    if (lastTakeover && !id && feature === lastTakeover && !featureModule?.guest?.stayAfterTakeover?.()) {
      feature = null;
      tab = 'home';
    }
    lastTakeover = id;
  });

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

<Toasts top={hb.me && hb.core && !hb.needJoin && headerHeight ? headerHeight : undefined} />
<EdgeFlash />
<DialogHost />
<WelcomeBack paused={hb.needJoin || !!takeover || !!avatarFlow.mode || (hb.offerAvatar && !!hb.me && !hb.me.avatar)} />

{#if avatarFlow.mode}
  <AvatarFlow mode={avatarFlow.mode} onclose={() => (avatarFlow.mode = null)} />
{/if}

{#if hb.offerAvatar && hb.me && !hb.me.avatar && !hb.needJoin}
  <div class="offer-wrap">
    <div class="offer card">
      <span class="offer-icon"><Camera size={28} /></span>
      <h2>Add your face?</h2>
      <p class="dim">Take a selfie, give yourself a big head or a swirl, and add an emoji. It shows next to your name on the TV.</p>
      <button
        class="btn primary block"
        onclick={() => {
          hb.offerAvatar = false;
          avatarFlow.mode = 'new';
        }}>Take a selfie</button
      >
      <button class="btn ghost block" onclick={() => (hb.offerAvatar = false)}>Not now</button>
      <p class="faint small">You can do it later from your profile.</p>
    </div>
  </div>
{/if}

{#if hb.needJoin}
  <Join />
{:else if !hb.me || !hb.core}
  <div class="splash"><p class="dim">Connecting...</p></div>
{:else}
  <div class="app">
    <header bind:offsetHeight={headerHeight}>
      {#if featureModule && !takeover}
        <button class="btn ghost back" onclick={() => (feature = null)} aria-label="Back"><ChevronLeft size={22} /></button>
        <h2 class="truncate">{featureModule.guest?.title}</h2>
      {:else}
        <h2 class="truncate brand">{hb.core.appName}</h2>
      {/if}
      <span class="spacer"></span>
      {#if !hb.connected}<span class="pill danger">Offline</span>{/if}
      {#if hb.core.economyEnabled}
        <Balance amount={hb.me.balance} onclick={() => go('earn')} />
      {/if}
    </header>

    <main class:full={!!takeover}>
      {#if takeover}
        {@const Takeover = takeover}
        <div class="takeover"><Takeover /></div>
      {/if}
      {#if featureModule?.guest}
        <!-- Stays mounted (hidden) under a takeover, so a form being filled is not lost -->
        {@const Panel = featureModule.guest.component}
        <div style:display={takeover ? 'none' : null}>
          {#key featureModule.id}
            <div in:fly={{ x: 30, duration: 200 }}><Panel /></div>
          {/key}
        </div>
      {:else if takeover}
        <!-- Home, Earn and Me come back when the takeover ends -->
      {:else if tab === 'home'}
        <Home {open} earn={() => go('earn')} />
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
  .offer-wrap {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
  }
  .offer {
    width: min(24rem, 100%);
    padding: 1.6rem;
    display: grid;
    gap: 0.8rem;
    text-align: center;
    justify-items: center;
    background: var(--bg);
    background-image: linear-gradient(var(--surface), var(--surface));
  }
  .offer-icon {
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    border-radius: 1.3rem;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }
  .offer p {
    font-size: 0.92rem;
  }
  .offer .small {
    font-size: 0.8rem;
  }
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
  main {
    flex: 1;
    padding: 0.5rem 1rem 6.5rem;
  }
  /* Full-screen views (games, quiz): no nav, so they fill exactly what is left under the header */
  main.full {
    display: flex;
    flex-direction: column;
    padding-bottom: calc(1rem + env(safe-area-inset-bottom));
  }
  .takeover {
    flex: 1;
    display: grid;
  }
  nav {
    position: fixed;
    left: 50%;
    bottom: 0;
    transform: translate3d(-50%, 0, 0);
    will-change: transform;
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
  /* The phone's toolbar slides in and out on fast scrolls and the bar can lag a frame behind:
     this skirt fills the gap below it so the page never shows through. */
  nav::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    height: 50vh;
    background: var(--bg);
    pointer-events: none;
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
