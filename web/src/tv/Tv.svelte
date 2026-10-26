<script lang="ts">
  import { fade } from 'svelte/transition';
  import { Lightbulb, RotateCw, X } from '@lucide/svelte';
  import { hb, rpc } from '$lib/client.svelte.ts';
  import { applyTheme } from '../themes/index.ts';
  import { activeModules, moduleById } from '../modules/index.ts';
  import type { TvSlot, TvWidget } from '../modules/types.ts';

  $effect(() => applyTheme(hb.core?.theme));

  // A hidden menu: the name tapped 5 times within 5 s opens it; it closes itself after 10 s untouched.
  // A short note next to the name says how an action went
  let taps: number[] = [];
  let menu = $state(false);
  let menuTimer: ReturnType<typeof setTimeout> | undefined;
  let note = $state<{ text: string; error: boolean } | null>(null);
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  function say(text: string, error = false) {
    clearTimeout(noteTimer);
    note = { text, error };
    noteTimer = setTimeout(() => (note = null), 5000);
  }
  function keepMenu() {
    clearTimeout(menuTimer);
    menuTimer = setTimeout(() => (menu = false), 10_000);
  }
  function closeMenu() {
    clearTimeout(menuTimer);
    menu = false;
  }
  function tapBrand() {
    const now = Date.now();
    taps = [...taps.filter((t) => now - t < 5000), now];
    if (taps.length < 5) return;
    taps = [];
    menu = true;
    keepMenu();
  }
  async function restartLights() {
    closeMenu();
    try {
      const r = await rpc<{ rebooted: number; failed: string[] }>('wled', 'reboot');
      say(r.failed.length ? `${r.failed.join(', ')} did not answer` : `Restarting ${r.rebooted} lights`, r.failed.length > 0);
    } catch (err) {
      say((err as Error).message, true);
    }
  }
  async function restartApp() {
    closeMenu();
    try {
      await rpc('core', 'restart');
      say('Restarting Homeboard');
    } catch (err) {
      say((err as Error).message, true);
    }
  }
  $effect(() => () => clearTimeout(menuTimer));
  $effect(() => () => clearTimeout(noteTimer));

  const widgets = (slot: TvSlot): TvWidget[] =>
    activeModules()
      .flatMap((m) => m.tv ?? [])
      .filter((w) => w.slot === slot && (w.visible?.() ?? true))
      .sort((a, b) => a.order - b.order);

  const main = $derived(widgets('main')[0]);
  const above = $derived(widgets('above'));
  // Widgets sharing a spot take turns there: only the first visible one shows
  const side = $derived.by(() => {
    const taken = new Set<string>();
    return widgets('side').filter((w) => !w.spot || (!taken.has(w.spot) && !!taken.add(w.spot)));
  });
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
    <p class="dim">Open the TV address printed in the Homeboard console, on the computer connected to the TV.</p>
  </div>
{:else if !hb.core}
  <div class="center"><p class="dim">Connecting...</p></div>
{:else}
  <div class="tv">
    <header>
      <div class="brand-wrap">
        <button type="button" class="brand" onclick={tapBrand}>{hb.core.appName}</button>
        {#if menu}
          <div class="menu card" role="menu" tabindex="-1" onpointerdown={keepMenu} transition:fade={{ duration: 150 }}>
            <button type="button" class="btn small" onclick={restartLights}><Lightbulb size={16} /> Restart all lights</button>
            <button type="button" class="btn small" onclick={restartApp}><RotateCw size={16} /> Restart Homeboard</button>
            <button type="button" class="close" aria-label="Close" onclick={closeMenu}><X size={16} /></button>
          </div>
        {/if}
      </div>
      {#if note}<span class="pill" class:danger={note.error} class:success={!note.error} transition:fade={{ duration: 200 }}>{note.text}</span>{/if}
      <span class="spacer"></span>
      {#if !hb.connected}<span class="pill danger">Reconnecting</span>{/if}
      <span class="time mono">{time}</span>
    </header>

    <main>
      <section class="main" class:stacked={above.length > 0}>
        <!-- Cards side by side (several games can be played at once on the lights and the phones) -->
        {#if above.length}
          <div class="above-row">
            {#each above as w (w)}<div class="above" transition:fade={{ duration: 300 }}><w.component /></div>{/each}
          </div>
        {/if}
        {#if main}<div class="main-widget">{#key main}<main.component />{/key}</div>{/if}
      </section>
      <aside>
        {#each side as w (w.spot ?? w)}
          {#if w.spot}
            <div class="spot">
              {#key w}<div class="layer" transition:fade|global={{ duration: 400 }}><w.component /></div>{/key}
            </div>
          {:else}
            <w.component />
          {/if}
        {/each}
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
    /* minmax(0, ...) so a wide footer (many ticker items) can't widen the whole layout */
    grid-template-columns: minmax(0, 1fr);
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
    padding: 0;
    border: 0;
    cursor: default;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.35rem;
    letter-spacing: -0.02em;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .brand-wrap {
    position: relative;
  }
  /* Right of the name, above everything else */
  .menu {
    position: absolute;
    top: 50%;
    left: calc(100% + 0.8rem);
    transform: translateY(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.4rem 0.4rem 0.5rem;
    white-space: nowrap;
  }
  .close {
    display: grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-faint);
  }
  .close:hover {
    color: var(--text);
    background: var(--surface-2);
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
  .main.stacked {
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--tv-gap);
  }
  .above-row {
    display: flex;
    justify-content: center;
    gap: var(--tv-gap);
    min-width: 0;
  }
  /* One card takes half the width, centered; more share the row */
  .above {
    flex: 0 1 50%;
    min-width: 0;
    display: grid;
  }
  .main-widget {
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
  /* Both cards on top of each other while one fades out and the other in */
  .spot {
    display: grid;
  }
  .layer {
    grid-area: 1 / 1;
    min-width: 0;
  }
  footer {
    min-width: 0;
    min-height: 2.6rem;
  }
  .takeover {
    position: absolute;
    inset: 0;
    z-index: 50;
    background: var(--bg-image, none), var(--bg);
  }
</style>
