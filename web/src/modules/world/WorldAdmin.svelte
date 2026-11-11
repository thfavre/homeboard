<script lang="ts">
  import { Download, HardDrive, Loader2, Trash2 } from '@lucide/svelte';
  import { attempt, hb, rpc } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import type { WorldState } from '$shared/world.ts';

  const mod = $derived(hb.modules.world as WorldState | undefined);
  const pack = $derived(mod?.pack ?? { kind: 'none' as const });

  function setMinutes(key: 'sleepAfterMin' | 'fadeAfterMin', value: string) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) attempt(() => rpc('world', 'setOptions', { [key]: n }));
  }
</script>

{#if mod}
  <Section title="Settings">
    <label class="field">
      <span>Fall asleep after (minutes away)</span>
      <input class="input" type="number" min="1" max="240" value={mod.sleepAfterMin} onchange={(e) => setMinutes('sleepAfterMin', e.currentTarget.value)} />
    </label>
    <p class="faint small">A guest who closes the page walks to the edge of the town and lies down to sleep.</p>
    <label class="field">
      <span>Fade out after (more minutes)</span>
      <input class="input" type="number" min="1" max="480" value={mod.fadeAfterMin} onchange={(e) => setMinutes('fadeAfterMin', e.currentTarget.value)} />
    </label>
    <p class="faint small">A sleeper gone for this much longer fades away, so the town never clutters up.</p>
  </Section>

  <Section title="Art pack">
    <p class="faint small">
      Avatars are built from the Universal LPC sprite collection. Without the pack, each piece of art is fetched from
      GitHub the first time someone uses it (and kept); the full pack (about 1.5 GB) makes the world work with no
      internet at all.
    </p>
    {#if pack.kind === 'ready'}
      <div class="line">
        <span class="status ok"><HardDrive size={17} /> Pack on disk ({pack.mb} MB)</span>
        <TwoStepButton class="btn danger small" onconfirm={() => attempt(() => rpc('world', 'deletePack'), 'Pack deleted')}>
          {#snippet children()}<Trash2 size={16} /> Delete pack{/snippet}
          {#snippet armed()}Really delete it?{/snippet}
        </TwoStepButton>
      </div>
    {:else if pack.kind === 'downloading'}
      <span class="status"><Loader2 size={17} class="spin" /> Downloading... {pack.mb} MB of about 1500 MB</span>
    {:else}
      {#if pack.kind === 'error'}
        <p class="error small">The download failed: {pack.message}</p>
      {/if}
      <div>
        <button type="button" class="btn" onclick={() => attempt(() => rpc('world', 'downloadPack'))}>
          <Download size={17} /> Download the pack (~1.5 GB)
        </button>
      </div>
    {/if}
  </Section>

  <Section title="Town">
    <p class="faint small">
      {mod.characters.length === 0 ? 'Nobody lives in the town yet.' : `${mod.characters.length} ${mod.characters.length === 1 ? 'guest lives' : 'guests live'} in the town.`}
      Guests create their avatar from the Avatar tile on their phone.
    </p>
    {#if mod.characters.length}
      <div class="people">
        {#each mod.characters as c (c.id)}
          <span class="person" style:border-color={c.color}>{c.name}</span>
        {/each}
      </div>
    {/if}
  </Section>
{/if}

<style>
  .small {
    font-size: 0.82rem;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-dim);
  }
  .status.ok {
    color: var(--text);
  }
  .status :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .error {
    color: var(--danger);
  }
  .people {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .person {
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--border);
    border-left-width: 3px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.88rem;
  }
</style>
