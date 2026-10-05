<script lang="ts">
  import { fade } from 'svelte/transition';
  import { hb } from '$lib/client.svelte.ts';
  import { applyTheme } from '../themes/index.ts';
  import { activeModules, moduleById } from '../modules/index.ts';
  import type { TvSlot, TvWidget } from '../modules/types.ts';

  $effect(() => applyTheme(hb.core?.theme));

  const widgets = (slot: TvSlot): TvWidget[] =>
    activeModules()
      .flatMap((m) => m.tv ?? [])
      .filter((w) => w.slot === slot && (w.visible?.() ?? true))
      .sort((a, b) => a.order - b.order);

  const main = $derived(widgets('main')[0]);
  const side = $derived(widgets('side'));
  const footer = $derived(widgets('footer'));
  const overlays = $derived(widgets('overlay'));
  const takeover = $derived(moduleById(hb.core?.takeover)?.tvTakeover);

  let now = $state(new Date());
  $effect(() => {
    const t = setInterval(() => (now = new Date()), 10_000);
    return () => clearInterval(t);
  });
  const time = $derived(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
</script>

{#if hb.authError}
  <div class="center">
    <h2>This screen is only available on the Homeboard PC</h2>
    <p class="dim">Open <span class="mono">http://localhost:4300/tv</span> on the computer connected to the TV.</p>
  </div>
{:else if !hb.core}
  <div class="center"><p class="dim">Connecting...</p></div>
{:else}
  <div class="tv">
    <header>
      <span class="brand">{hb.core.appName}</span>
      <span class="spacer"></span>
      {#if !hb.connected}<span class="pill danger">Reconnecting</span>{/if}
      <span class="time mono">{time}</span>
    </header>

    <main>
      <section class="main">
        {#if main}{#key main}<main.component />{/key}{/if}
      </section>
      <aside>
        {#each side as w}<w.component />{/each}
      </aside>
    </main>

    {#if footer.length}
      <footer>
        {#each footer as w}<w.component />{/each}
      </footer>
    {/if}

    {#each overlays as w}<w.component />{/each}

    {#if takeover}
      {@const Takeover = takeover}
      <div class="takeover" transition:fade={{ duration: 300 }}><Takeover /></div>
    {/if}
  </div>
{/if}

<style>
  :global(html) {
    /* Everything on the TV scales with the screen height: 16px at 1080p */
    font-size: 1.48vh;
    overflow: hidden;
  }
  .center {
    height: 100vh;
    display: grid;
    place-content: center;
    gap: 1rem;
    text-align: center;
  }
  .tv {
    /* Overlays use these to cover only the main area */
    --tv-pad-x: 2rem;
    --tv-side: 27rem;
    --tv-gap: 1.2rem;
    position: relative;
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: var(--tv-gap);
    padding: 1.6rem var(--tv-pad-x) 1.6rem;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .brand {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.35rem;
    letter-spacing: -0.02em;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .time {
    font-size: 1.35rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  main {
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr var(--tv-side);
    gap: var(--tv-gap);
  }
  .main {
    min-height: 0;
    min-width: 0;
    display: grid;
  }
  aside {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
  }
  aside > :global(:last-child) {
    margin-top: auto;
  }
  footer {
    min-height: 2.6rem;
  }
  .takeover {
    position: absolute;
    inset: 0;
    z-index: 50;
    background: var(--bg-image, none), var(--bg);
  }
</style>
