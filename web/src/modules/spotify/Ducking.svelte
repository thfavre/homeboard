<script lang="ts">
  import type { DuckSource, SpotifyState } from '$shared/spotify.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import { Synced } from '$lib/synced.svelte.ts';
  import Toggle from '$lib/ui/Toggle.svelte';

  /**
   * Music level while soundboard sounds or shoutouts play. The same setting is shown on the
   * Music page and on the page of the source, and stays in sync everywhere.
   */
  let { source, title, hint }: { source: DuckSource; title: string; hint: string } = $props();

  const mod = $derived(hb.modules.spotify as SpotifyState | undefined);
  const setting = $derived(mod?.admin?.ducking[source]);
  const percent = new Synced(() => (hb.modules.spotify as SpotifyState | undefined)?.admin?.ducking[source]?.percent, 30);
  const set = (args: { on?: boolean; percent?: number }) => attempt(() => rpc('spotify', 'setDucking', { source, ...args }));
</script>

{#if setting}
  <div class="ducking">
    <div class="line">
      <div>
        <strong>{title}</strong>
        <p class="faint small">{hint}</p>
      </div>
      <Toggle checked={setting.on} label={title} onchange={(v) => set({ on: v })} />
    </div>
    <label class="field" class:muted={!setting.on}>
      <span>Music volume: {percent.value}% of normal</span>
      <input
        type="range"
        min="0"
        max="95"
        step="5"
        bind:value={percent.value}
        disabled={!setting.on}
        onpointerdown={percent.start}
        onchange={() => {
          set({ percent: percent.value });
          percent.end();
        }}
      />
      <span class="scale faint"><span>Silent</span><span>Barely lower</span></span>
    </label>
    {#if !mod?.connected}<p class="faint small">Spotify is not connected (Music page), so there is no music to lower yet.</p>{/if}
  </div>
{/if}

<style>
  .ducking {
    display: grid;
    gap: 0.6rem;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .small {
    font-size: 0.82rem;
  }
  .muted {
    opacity: 0.45;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  .scale {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    font-weight: 400;
  }
</style>
