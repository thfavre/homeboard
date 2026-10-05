<script lang="ts">
  import { Check } from '@lucide/svelte';
  import { THEMES } from '$shared/themes.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';

  let appName = $state(hb.core?.appName ?? '');
  const set = (args: Record<string, unknown>) => attempt(() => rpc('core', 'setGeneral', args));
</script>

<Section title="Name" hint="Shown on the TV and on guest phones.">
  <input class="input" bind:value={appName} maxlength="40" onblur={() => set({ appName })} />
</Section>

<Section title="Theme" hint="Applies to the TV, guests and this screen.">
  <div class="themes">
    {#each THEMES as t (t.id)}
      <button class="theme" data-theme={t.id} class:active={hb.core?.theme === t.id} onclick={() => set({ theme: t.id })}>
        <div class="preview">
          <span class="title">{t.name}</span>
          <div class="swatches">
            <span style:background="var(--accent)"></span>
            <span style:background="var(--accent-2)"></span>
            <span style:background="var(--coin)"></span>
          </div>
          <div class="bars">
            <span></span>
            <span></span>
          </div>
        </div>
        {#if hb.core?.theme === t.id}<span class="check"><Check size={16} /></span>{/if}
      </button>
    {/each}
  </div>
</Section>

<style>
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: 0.8rem;
  }
  .theme {
    position: relative;
    padding: 0;
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    background: var(--bg-image, none), var(--bg);
    color: var(--text);
    overflow: hidden;
    text-align: left;
  }
  .theme.active {
    border-color: var(--accent);
  }
  .preview {
    display: grid;
    gap: 0.7rem;
    padding: 1rem;
    font-family: var(--font-display);
  }
  .title {
    font-weight: 700;
    font-size: 1.05rem;
  }
  .swatches {
    display: flex;
    gap: 0.35rem;
  }
  .swatches span {
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 50%;
  }
  .bars {
    display: grid;
    gap: 0.35rem;
  }
  .bars span {
    height: 0.55rem;
    border-radius: 999px;
    background: var(--surface-3);
  }
  .bars span:first-child {
    width: 70%;
    background: var(--gradient);
  }
  .check {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
  }
</style>
